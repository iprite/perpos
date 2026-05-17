import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import crypto from 'crypto';
import { SupabaseService } from '../../supabase/supabase.service';
import { NewsService } from '../../news/news.service';
import { DriveService } from '../../google/drive/drive.service';
import { CalendarService } from '../../google/calendar.service';
import { parseAppointmentText } from './appointment-parser';
import type { SupabaseClient } from '@supabase/supabase-js';

// ─── Types ───────────────────────────────────────────────────────────────────

type Command =
  | { type: 'help' }
  | { type: 'link'; token: string }
  | { type: 'news' }
  | { type: 'news_latest' }
  | { type: 'income'; amountText: string; note: string }
  | { type: 'expense'; amountText: string; note: string }
  | { type: 'task_create'; input: string }
  | { type: 'task_list' }
  | { type: 'task_done'; index: number }
  | { type: 'appt_create'; input: string }
  | { type: 'appt_today' }
  | { type: 'appt_all' }
  | { type: 'appt_cancel'; index: number }
  | { type: 'unknown_slash' }
  | { type: 'unknown' };

interface ApptRow {
  id: string;
  starts_at: string;
  title: string;
  google_event_id: string | null;
}

@Injectable()
export class WebhookService {
  constructor(
    private readonly config: ConfigService,
    private readonly supabase: SupabaseService,
    private readonly news: NewsService,
    private readonly drive: DriveService,
    private readonly calendar: CalendarService,
  ) {}

  // ─── Signature verification ───────────────────────────────────────────────

  verifySignature(body: string, signature: string | null): boolean {
    const secret = this.config.get<string>('LINE_MESSAGING_CHANNEL_SECRET') ?? '';
    if (!secret || !signature) return false;
    const computed = crypto.createHmac('sha256', secret).update(body).digest('base64');
    try {
      return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
    } catch {
      return false;
    }
  }

  // ─── Main dispatcher ──────────────────────────────────────────────────────

  async processEvents(rawBody: string): Promise<void> {
    const payload = JSON.parse(rawBody || '{}') as { events?: unknown[] };
    const events = Array.isArray(payload?.events) ? payload.events : [];

    let admin: SupabaseClient;
    try {
      admin = this.supabase.createAdminClient();
    } catch {
      return;
    }

    await Promise.all(
      events.map(async (ev: unknown) => {
        const event = ev as Record<string, unknown>;
        const replyToken = String(event?.replyToken ?? '');
        const lineUserId = String((event?.source as Record<string, unknown>)?.userId ?? '');
        if (!replyToken || !lineUserId) return;
        if (String(event?.type ?? '') !== 'message') return;

        const message = event?.message as Record<string, unknown>;
        const messageType = String(message?.type ?? '');

        if (messageType !== 'text') {
          await this.handleFileMessage({ admin, event, message, messageType, replyToken, lineUserId });
          return;
        }

        const text = String(message?.text ?? '');
        const cmd = this.parseCommand(text);
        await this.dispatch({ admin, cmd, replyToken, lineUserId });
      }),
    );
  }

  // ─── File/media upload handler ────────────────────────────────────────────

  private async handleFileMessage(args: {
    admin: SupabaseClient;
    event: Record<string, unknown>;
    message: Record<string, unknown>;
    messageType: string;
    replyToken: string;
    lineUserId: string;
  }): Promise<void> {
    const { admin, event, message, messageType, replyToken, lineUserId } = args;
    const supported = new Set(['file', 'image', 'video', 'audio']);
    if (!supported.has(messageType)) {
      await this.replyText(replyToken, 'ตอนนี้รองรับเฉพาะไฟล์/รูป/วิดีโอ/เสียง');
      return;
    }

    const profRes = await admin.from('profiles').select('id,is_active').eq('line_user_id', lineUserId).maybeSingle();
    if (profRes.error || !profRes.data) {
      await this.replyText(replyToken, 'ยังไม่ได้ผูกบัญชี\nพิมพ์: /link <token>');
      return;
    }
    const profileId = String((profRes.data as Record<string, unknown>).id);
    if ((profRes.data as Record<string, unknown>).is_active === false) {
      await this.replyText(replyToken, 'บัญชีถูกปิดใช้งาน');
      return;
    }
    if (!(await this.hasPermission(admin, profileId, 'bot.drive.upload'))) {
      await this.replyText(replyToken, 'คุณไม่มีสิทธิ์อัปโหลดไฟล์ไป Google Drive');
      return;
    }

    const driveRes = await admin.from('google_drive_tokens').select('*').eq('profile_id', profileId).maybeSingle();
    if (driveRes.error || !driveRes.data) {
      await this.replyText(replyToken, 'ยังไม่ได้เชื่อม Google Drive\nไปที่ Settings เพื่อเชื่อมต่อ');
      return;
    }

    const messageId = String(message?.id ?? '');
    if (!messageId) { await this.replyText(replyToken, 'ไม่พบ message id ของไฟล์'); return; }

    try {
      const { mimeType, bytes } = await this.downloadLineContent(messageId);
      const row = driveRes.data as Record<string, unknown>;
      const accessToken = await this.drive.getAccessTokenForRow(row, async (patch) => {
        await admin.from('google_drive_tokens').update({ ...patch, updated_at: new Date().toISOString() }).eq('profile_id', profileId);
      });
      const folderId = await this.drive.ensureFolder(accessToken, 'PERPOS', row.drive_root_folder_id as string | null);
      if (!row.drive_root_folder_id && folderId) {
        await admin.from('google_drive_tokens').update({ drive_root_folder_id: folderId, updated_at: new Date().toISOString() }).eq('profile_id', profileId);
      }

      const suggestedName = String(message?.fileName ?? '').trim();
      const ext = mimeType.includes('pdf') ? 'pdf' : mimeType.includes('png') ? 'png' : mimeType.includes('jpeg') ? 'jpg' : mimeType.includes('gif') ? 'gif' : 'bin';
      const fileName = suggestedName || `line-${messageId}.${ext}`;
      const uploaded = await this.drive.uploadFile({ accessToken, fileName, mimeType, bytes, folderId });
      const link = uploaded.webViewLink ? `\n${uploaded.webViewLink}` : '';
      await this.replyText(replyToken, `อัปโหลดไป Google Drive แล้ว: ${uploaded.name ?? fileName}${link}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.replyText(replyToken, `อัปโหลดไป Google Drive ไม่สำเร็จ (${msg.slice(0, 160)})`);
    }
  }

  // ─── Command dispatcher ───────────────────────────────────────────────────

  private async dispatch(args: {
    admin: SupabaseClient;
    cmd: Command;
    replyToken: string;
    lineUserId: string;
  }): Promise<void> {
    const { admin, cmd, replyToken, lineUserId } = args;

    if (cmd.type === 'help') {
      await this.replyText(
        replyToken,
        'PERPOS — คำสั่งทั้งหมด\n' +
          '════════════════\n' +
          '🔗 /link <token>        ผูกบัญชี LINE\n' +
          '📰 /ข่าว                สรุปข่าว\n' +
          '💰 /รายรับ <จำนวน> <โน้ต>\n' +
          '💸 /รายจ่าย <จำนวน> <โน้ต>\n' +
          '────────────────\n' +
          '✍️ /t <ชื่องาน>          บันทึกงานใหม่\n' +
          '📋 /tk                  รายการงานค้าง\n' +
          '✅ /d <เลข>             ปิดงาน\n' +
          '────────────────\n' +
          '📅 /a <ชื่อ> <วัน> <HH:MM>  บันทึกนัด\n' +
          '🗓 /ap                  นัดวันนี้ + ยกเลิกได้\n' +
          '📋 /ap all              นัดทั้งหมดที่กำลังจะถึง\n' +
          '🗑 /ac <เลข>            ยกเลิกนัดที่ <เลข>\n' +
          '────────────────\n' +
          'ตัวอย่างนัด:\n' +
          '/a ประชุม Q3 พรุ่งนี้ 10:00\n' +
          '/a call client 20/5 14:30',
      );
      return;
    }

    if (cmd.type === 'link') {
      await this.handleLink({ admin, cmd, replyToken, lineUserId });
      return;
    }

    // All remaining commands require a linked profile
    const profRes = await admin.from('profiles').select('id,role,is_active').eq('line_user_id', lineUserId).maybeSingle();
    if (profRes.error || !profRes.data) {
      await this.replyText(replyToken, 'ยังไม่ได้ผูกบัญชี\nพิมพ์ /link <token> เพื่อผูกบัญชี');
      return;
    }
    const profileId = String((profRes.data as Record<string, unknown>).id);
    if ((profRes.data as Record<string, unknown>).is_active === false) {
      await this.replyText(replyToken, 'บัญชีถูกปิดใช้งาน');
      return;
    }

    await this.handleAuthedCommand({ admin, cmd, replyToken, profileId });
  }

  private async handleLink(args: {
    admin: SupabaseClient;
    cmd: { type: 'link'; token: string };
    replyToken: string;
    lineUserId: string;
  }): Promise<void> {
    const { admin, cmd, replyToken, lineUserId } = args;
    const tokRes = await admin.from('line_link_tokens').select('token,profile_id,expires_at,used_at').eq('token', cmd.token).maybeSingle();
    if (tokRes.error || !tokRes.data) { await this.replyText(replyToken, 'ไม่พบโค้ดผูกบัญชี'); return; }

    const row = tokRes.data as Record<string, unknown>;
    if (row.used_at) { await this.replyText(replyToken, 'โค้ดนี้ถูกใช้ไปแล้ว'); return; }
    const expiresAt = new Date(String(row.expires_at ?? ''));
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
      await this.replyText(replyToken, 'โค้ดหมดอายุแล้ว');
      return;
    }
    const profileId = String(row.profile_id ?? '');
    const upd = await admin.from('profiles').update({ line_user_id: lineUserId, line_linked_at: new Date().toISOString() }).eq('id', profileId);
    if (upd.error) { await this.replyText(replyToken, 'ผูกบัญชีไม่สำเร็จ'); return; }
    await admin.from('line_link_tokens').update({ used_at: new Date().toISOString() }).eq('token', cmd.token);
    await this.replyText(replyToken, 'ผูกบัญชีสำเร็จ');
  }

  private async handleAuthedCommand(args: {
    admin: SupabaseClient;
    cmd: Command;
    replyToken: string;
    profileId: string;
  }): Promise<void> {
    const { admin, cmd, replyToken, profileId } = args;

    if (cmd.type === 'news' || cmd.type === 'news_latest') {
      const permKey = cmd.type === 'news' ? 'bot.news.request' : 'bot.news.latest';
      if (!(await this.hasPermission(admin, profileId, permKey))) {
        await this.replyText(replyToken, 'คุณไม่มีสิทธิ์ใช้ฟังก์ชันสรุปข่าว');
        return;
      }
      await this.replyText(replyToken, await this.buildNewsText(admin));
      return;
    }

    if (cmd.type === 'income' || cmd.type === 'expense') {
      const permKey = cmd.type === 'income' ? 'bot.finance.income_add' : 'bot.finance.expense_add';
      if (!(await this.hasPermission(admin, profileId, permKey))) {
        await this.replyText(replyToken, 'คุณไม่มีสิทธิ์บันทึกรายรับ/รายจ่าย');
        return;
      }
      const amount = this.parseMoney(cmd.amountText);
      if (!amount) { await this.replyText(replyToken, 'กรุณาระบุจำนวนเงิน เช่น /รายรับ 1000 ขายของ'); return; }
      const ins = await admin.from('finance_entries').insert({ profile_id: profileId, entry_type: cmd.type, amount, note: cmd.note || null, occurred_at: new Date().toISOString() });
      if (ins.error) { await this.replyText(replyToken, 'บันทึกไม่สำเร็จ'); return; }
      const label = cmd.type === 'income' ? 'รายรับ' : 'รายจ่าย';
      await this.replyText(replyToken, `บันทึก${label} ${amount.toLocaleString('th-TH')} บาทแล้ว`);
      return;
    }

    if (cmd.type === 'task_create') {
      if (!(await this.hasPermission(admin, profileId, 'bot.assistant.tasks'))) {
        await this.replyText(replyToken, 'คุณไม่มีสิทธิ์ใช้ Task Manager');
        return;
      }
      if (!cmd.input) { await this.replyText(replyToken, 'ระบุชื่องานด้วย เช่น /t ประชุม Q3'); return; }
      const ins = await admin.from('tasks').insert({ profile_id: profileId, title: cmd.input, status: 'pending', source: 'line', raw_input: cmd.input });
      if (ins.error) { await this.replyText(replyToken, 'บันทึกงานไม่สำเร็จ'); return; }
      await this.replyFlex(replyToken, `บันทึกงาน: ${cmd.input}`, this.buildTaskConfirmFlex(cmd.input));
      return;
    }

    if (cmd.type === 'task_list') {
      if (!(await this.hasPermission(admin, profileId, 'bot.assistant.tasks'))) {
        await this.replyText(replyToken, 'คุณไม่มีสิทธิ์ใช้ Task Manager');
        return;
      }
      const tasks = await this.getPendingTasks(admin, profileId);
      await this.replyText(replyToken, this.buildTaskListText(tasks));
      return;
    }

    if (cmd.type === 'task_done') {
      if (!(await this.hasPermission(admin, profileId, 'bot.assistant.tasks'))) {
        await this.replyText(replyToken, 'คุณไม่มีสิทธิ์ใช้ Task Manager');
        return;
      }
      const tasks = await this.getPendingTasks(admin, profileId);
      const idx = cmd.index - 1;
      if (idx < 0 || idx >= tasks.length) {
        await this.replyText(replyToken, `ไม่พบงานที่ ${cmd.index} พิมพ์ /tk เพื่อดูรายการใหม่`);
        return;
      }
      await admin.from('tasks').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', tasks[idx].id);
      await this.replyText(replyToken, `✅ ปิดงานแล้ว: "${tasks[idx].title}"`);
      return;
    }

    if (cmd.type === 'appt_create') {
      await this.handleApptCreate({ admin, cmd, replyToken, profileId });
      return;
    }

    if (cmd.type === 'appt_today') {
      if (!(await this.hasPermission(admin, profileId, 'bot.assistant.tasks'))) {
        await this.replyText(replyToken, 'คุณไม่มีสิทธิ์ใช้ Task Manager');
        return;
      }
      const rows = await this.getTodayAppts(admin, profileId);
      if (!rows.length) { await this.replyText(replyToken, 'วันนี้ไม่มีนัด'); return; }
      await this.replyFlex(replyToken, `นัดวันนี้ ${rows.length} รายการ`, this.buildApptTodayFlex(rows));
      return;
    }

    if (cmd.type === 'appt_all') {
      if (!(await this.hasPermission(admin, profileId, 'bot.assistant.tasks'))) {
        await this.replyText(replyToken, 'คุณไม่มีสิทธิ์ใช้ Task Manager');
        return;
      }
      const res = await admin.from('appointments').select('starts_at,title').eq('profile_id', profileId).gte('starts_at', new Date().toISOString()).order('starts_at', { ascending: true }).limit(15);
      if (res.error) { await this.replyText(replyToken, 'โหลดนัดไม่สำเร็จ'); return; }
      const rows = (res.data ?? []) as Array<{ starts_at: string; title: string }>;
      if (!rows.length) { await this.replyText(replyToken, 'ไม่มีนัดที่กำลังจะถึง'); return; }
      const lines = rows.map((r, i) => `${i + 1}. ${this.fmtBangkokDateTime(r.starts_at)}  ${r.title}`);
      await this.replyText(replyToken, `📅 นัดทั้งหมด (${rows.length} รายการ)\n${lines.join('\n')}`);
      return;
    }

    if (cmd.type === 'appt_cancel') {
      await this.handleApptCancel({ admin, cmd, replyToken, profileId });
      return;
    }

    if (cmd.type === 'unknown_slash') {
      await this.replyText(replyToken, 'ไม่รู้จักคำสั่งนี้\nพิมพ์ /help เพื่อดูคำสั่งทั้งหมด');
    }
    // cmd.type === 'unknown' → plain text without / → ignore silently
  }

  private async handleApptCreate(args: {
    admin: SupabaseClient;
    cmd: { type: 'appt_create'; input: string };
    replyToken: string;
    profileId: string;
  }): Promise<void> {
    const { admin, cmd, replyToken, profileId } = args;
    if (!(await this.hasPermission(admin, profileId, 'bot.assistant.tasks'))) {
      await this.replyText(replyToken, 'คุณไม่มีสิทธิ์ใช้ Task Manager');
      return;
    }
    if (!cmd.input) {
      await this.replyText(replyToken, 'ระบุนัดด้วย เช่น /a ประชุม Q3 พรุ่งนี้ 10:00');
      return;
    }
    const parsed = parseAppointmentText(cmd.input);
    if (!parsed) {
      await this.replyText(replyToken, 'รูปแบบไม่ถูกต้อง ต้องระบุชื่อ วัน และเวลา\nเช่น /a ประชุม Q3 พรุ่งนี้ 10:00');
      return;
    }

    let googleEventId: string | null = null;
    let calendarError: string | null = null;
    const driveRes = await admin.from('google_drive_tokens').select('access_token,refresh_token,expires_at,scope,token_type').eq('profile_id', profileId).maybeSingle();
    if (driveRes.data) {
      try {
        const row = driveRes.data as Record<string, unknown>;
        const accessToken = await this.drive.getAccessTokenForRow(row, async (patch) => {
          await admin.from('google_drive_tokens').update({ ...patch, updated_at: new Date().toISOString() }).eq('profile_id', profileId);
        });
        const result = await this.calendar.createEvent({ accessToken, title: parsed.title, startsAt: parsed.startsAt });
        googleEventId = result?.id ?? null;
      } catch (e: unknown) {
        calendarError = e instanceof Error ? e.message : String(e);
      }
    }

    const ins = await admin.from('appointments').insert({ profile_id: profileId, title: parsed.title, starts_at: parsed.startsAt, google_event_id: googleEventId, source: 'line' });
    if (ins.error) { await this.replyText(replyToken, 'บันทึกนัดไม่สำเร็จ'); return; }
    await this.replyFlex(replyToken, `บันทึกนัด: ${parsed.title}`, this.buildApptConfirmFlex({ title: parsed.title, startsAt: parsed.startsAt, calendarSynced: !!googleEventId, calendarError }));
  }

  private async handleApptCancel(args: {
    admin: SupabaseClient;
    cmd: { type: 'appt_cancel'; index: number };
    replyToken: string;
    profileId: string;
  }): Promise<void> {
    const { admin, cmd, replyToken, profileId } = args;
    if (!(await this.hasPermission(admin, profileId, 'bot.assistant.tasks'))) {
      await this.replyText(replyToken, 'คุณไม่มีสิทธิ์ใช้ Task Manager');
      return;
    }
    const rows = await this.getTodayAppts(admin, profileId);
    const idx = cmd.index - 1;
    if (idx < 0 || idx >= rows.length) {
      await this.replyText(replyToken, `ไม่พบนัดที่ ${cmd.index} พิมพ์ /ap เพื่อดูรายการใหม่`);
      return;
    }
    const appt = rows[idx];
    if (appt.google_event_id) {
      try {
        const driveRes = await admin.from('google_drive_tokens').select('access_token,refresh_token,expires_at,scope,token_type').eq('profile_id', profileId).maybeSingle();
        if (driveRes.data) {
          const accessToken = await this.drive.getAccessTokenForRow(driveRes.data as Record<string, unknown>, async (patch) => {
            await admin.from('google_drive_tokens').update({ ...patch, updated_at: new Date().toISOString() }).eq('profile_id', profileId);
          });
          await this.calendar.deleteEvent({ accessToken, eventId: appt.google_event_id });
        }
      } catch { /* silent */ }
    }
    await admin.from('appointments').delete().eq('id', appt.id);
    await this.replyText(replyToken, `🗑 ยกเลิกนัดแล้ว: "${appt.title}" (${this.fmtBangkokTime(appt.starts_at)})`);
  }

  // ─── LINE API helpers ─────────────────────────────────────────────────────

  private async replyText(replyToken: string, text: string): Promise<void> {
    await this.callLineApi('https://api.line.me/v2/bot/message/reply', {
      replyToken,
      messages: [{ type: 'text', text }],
    });
  }

  private async replyFlex(replyToken: string, altText: string, contents: unknown): Promise<void> {
    await this.callLineApi('https://api.line.me/v2/bot/message/reply', {
      replyToken,
      messages: [{ type: 'flex', altText, contents }],
    });
  }

  private async callLineApi(url: string, body: unknown): Promise<void> {
    const accessToken = this.config.get<string>('LINE_MESSAGING_CHANNEL_ACCESS_TOKEN') ?? '';
    if (!accessToken) return;
    await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null);
  }

  private async downloadLineContent(messageId: string): Promise<{ mimeType: string; bytes: Uint8Array }> {
    const accessToken = this.config.get<string>('LINE_MESSAGING_CHANNEL_ACCESS_TOKEN') ?? '';
    if (!accessToken) throw new Error('missing_line_access_token');
    const res = await fetch(`https://api-data.line.me/v2/bot/message/${encodeURIComponent(messageId)}/content`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`line_content_${res.status}`);
    const mimeType = res.headers.get('content-type') || 'application/octet-stream';
    const bytes = new Uint8Array(await res.arrayBuffer());
    return { mimeType, bytes };
  }

  // ─── DB helpers ───────────────────────────────────────────────────────────

  private async hasPermission(admin: SupabaseClient, userId: string, functionKey: string): Promise<boolean> {
    const profRes = await admin.from('profiles').select('role,is_active').eq('id', userId).maybeSingle();
    if (profRes.error || !profRes.data) return false;
    const row = profRes.data as Record<string, unknown>;
    if (row.is_active === false) return false;
    if (String(row.role ?? '') === 'admin') return true;
    const permRes = await admin.from('user_permissions').select('allowed').eq('user_id', userId).eq('function_key', functionKey).maybeSingle();
    if (permRes.error || !permRes.data) return false;
    return Boolean((permRes.data as Record<string, unknown>).allowed);
  }

  private async getPendingTasks(admin: SupabaseClient, profileId: string): Promise<Array<{ id: string; title: string; status: string; created_at: string }>> {
    const { data } = await admin.from('tasks').select('id,title,status,created_at').eq('profile_id', profileId).in('status', ['pending', 'in_progress']).order('created_at', { ascending: true });
    return (data ?? []) as Array<{ id: string; title: string; status: string; created_at: string }>;
  }

  private async getTodayAppts(admin: SupabaseClient, profileId: string): Promise<ApptRow[]> {
    const { start, end } = this.bkkDayBounds();
    const { data } = await admin.from('appointments').select('id,title,starts_at,google_event_id').eq('profile_id', profileId).gte('starts_at', start).lte('starts_at', end).order('starts_at', { ascending: true });
    return (data ?? []) as ApptRow[];
  }

  private async buildNewsText(admin: SupabaseClient): Promise<string> {
    const cfgRes = await admin.from('news_agent_configs').select('topics,sources,summary_style,max_items').order('updated_at', { ascending: false }).limit(1).maybeSingle();
    const cfg = cfgRes.error ? null : (cfgRes.data as Record<string, unknown> | null);
    const topics = Array.isArray(cfg?.topics) ? (cfg?.topics as string[]) : [];
    const sources = Array.isArray(cfg?.sources) ? (cfg?.sources as Record<string, string>[]) : [];
    const style = (cfg?.summary_style as 'bullet' | 'brief' | 'detailed') || 'bullet';
    const maxItems = Math.min(30, Math.max(1, Number(cfg?.max_items ?? 8)));
    const rssUrls = sources.map((s) => String(s?.value ?? '')).filter((x) => x.trim().length);
    const perSource = Math.max(1, Math.ceil(maxItems / Math.max(1, rssUrls.length)));
    const lists = await Promise.all(rssUrls.map((u) => this.news.fetchRssItems(u, perSource).catch(() => [])));
    const items = lists.flat().slice(0, maxItems);
    const key = this.config.get<string>('OPENAI_API_KEY') ?? '';
    if (!key) return this.news.basicHeadlineSummary(items, Math.min(8, maxItems));
    try {
      return await this.news.summarizeWithOpenAI({ apiKey: key, topics, items, style });
    } catch {
      return this.news.basicHeadlineSummary(items, Math.min(8, maxItems));
    }
  }

  // ─── Command parser ───────────────────────────────────────────────────────

  private parseCommand(text: string): Command {
    const t = String(text ?? '').trim();
    if (!t.startsWith('/')) return { type: 'unknown' };
    const body = t.slice(1).trim();
    const lower = body.toLowerCase();

    if (lower === 'help' || lower === 'คำสั่ง') return { type: 'help' };

    const taskMatch = body.match(/^t(?:\s+(.+))?$/i);
    if (taskMatch !== null) return { type: 'task_create', input: (taskMatch[1] ?? '').trim() };

    const apptMatch = body.match(/^a(?:\s+(.+))?$/i);
    if (apptMatch !== null) return { type: 'appt_create', input: (apptMatch[1] ?? '').trim() };

    const linkMatch = body.match(/^(?:link|ผูกบัญชี)\s+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
    if (linkMatch?.[1]) return { type: 'link', token: linkMatch[1] };

    if (lower === 'news' || lower === 'สรุปข่าว' || lower === 'ข่าว') return { type: 'news' };
    if (lower === 'latest' || lower === 'สรุปล่าสุด') return { type: 'news_latest' };

    const incomeMatch = body.match(/^(?:income|รายรับ)\s+([0-9.,]+)\s*(.*)$/i);
    if (incomeMatch?.[1]) return { type: 'income', amountText: incomeMatch[1], note: (incomeMatch[2] ?? '').trim() };

    const expenseMatch = body.match(/^(?:expense|รายจ่าย)\s+([0-9.,]+)\s*(.*)$/i);
    if (expenseMatch?.[1]) return { type: 'expense', amountText: expenseMatch[1], note: (expenseMatch[2] ?? '').trim() };

    if (lower === 'tk') return { type: 'task_list' };

    const doneMatch = body.match(/^d\s+([0-9]+)$/i);
    if (doneMatch?.[1]) return { type: 'task_done', index: parseInt(doneMatch[1]) };

    if (lower === 'ap all') return { type: 'appt_all' };
    if (lower === 'ap') return { type: 'appt_today' };

    const cancelMatch = body.match(/^ac\s+([0-9]+)$/i);
    if (cancelMatch?.[1]) return { type: 'appt_cancel', index: parseInt(cancelMatch[1]) };

    return { type: 'unknown_slash' };
  }

  // ─── Format helpers ───────────────────────────────────────────────────────

  private fmtBangkokTime(iso: string): string {
    return new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
  }

  private fmtBangkokDate(iso: string): string {
    return new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
  }

  private fmtBangkokDateTime(iso: string): string {
    return new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
  }

  private parseMoney(text: string): number | null {
    const n = Number(String(text ?? '').replaceAll(',', '').trim());
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round(n * 100) / 100;
  }

  private bkkDayBounds(): { start: string; end: string } {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(now)
      .reduce((a, p) => { if (p.type !== 'literal') (a as Record<string, string>)[p.type] = p.value; return a; }, {} as Record<string, string>);
    return {
      start: new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00+07:00`).toISOString(),
      end: new Date(`${parts.year}-${parts.month}-${parts.day}T23:59:59+07:00`).toISOString(),
    };
  }

  // ─── Flex builders ────────────────────────────────────────────────────────

  private buildTaskConfirmFlex(title: string): unknown {
    return {
      type: 'bubble', size: 'kilo',
      header: { type: 'box', layout: 'vertical', backgroundColor: '#1B6CA8', paddingAll: '14px', contents: [{ type: 'text', text: '✅ บันทึกงานแล้ว', color: '#ffffff', weight: 'bold', size: 'sm' }] },
      body: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '14px', contents: [{ type: 'text', text: title, weight: 'bold', size: 'md', wrap: true }, { type: 'text', text: 'สถานะ: กำลังดำเนินการ', size: 'sm', color: '#888888', margin: 'md' }] },
      footer: { type: 'box', layout: 'horizontal', contents: [{ type: 'button', action: { type: 'message', label: 'ดูงานทั้งหมด', text: '/tk' }, style: 'secondary', height: 'sm' }] },
    };
  }

  private buildApptTodayFlex(rows: ApptRow[]): unknown {
    return {
      type: 'bubble', size: 'kilo',
      header: { type: 'box', layout: 'vertical', backgroundColor: '#0F7B6C', paddingAll: '14px', contents: [{ type: 'text', text: `📅 นัดวันนี้ (${rows.length} รายการ)`, color: '#ffffff', weight: 'bold', size: 'sm' }] },
      body: {
        type: 'box', layout: 'vertical', spacing: 'md', paddingAll: '14px',
        contents: rows.map((r, i) => ({
          type: 'box', layout: 'horizontal', alignItems: 'center', spacing: 'sm',
          contents: [
            { type: 'box', layout: 'vertical', flex: 5, contents: [{ type: 'text', text: r.title, size: 'sm', weight: 'bold', wrap: true, flex: 0 }, { type: 'text', text: this.fmtBangkokTime(r.starts_at), size: 'xs', color: '#888888', flex: 0 }] },
            { type: 'button', flex: 3, action: { type: 'message', label: `ยกเลิก ${i + 1}`, text: `/ac ${i + 1}` }, style: 'secondary', height: 'sm' },
          ],
        })),
      },
      footer: { type: 'box', layout: 'horizontal', contents: [{ type: 'button', action: { type: 'message', label: 'ดูนัดทั้งหมด', text: '/ap all' }, style: 'secondary', height: 'sm' }] },
    };
  }

  private buildApptConfirmFlex(args: { title: string; startsAt: string; calendarSynced: boolean; calendarError?: string | null }): unknown {
    const { title, startsAt, calendarSynced, calendarError } = args;
    const calLine = calendarSynced
      ? { type: 'text', text: '📆 บันทึกใน Google Calendar แล้ว', size: 'xs', color: '#34A853' }
      : calendarError
      ? { type: 'text', text: `📆 Calendar sync ล้มเหลว: ${calendarError.slice(0, 80)}`, size: 'xs', color: '#D93025', wrap: true }
      : { type: 'text', text: '📆 ยังไม่ได้เชื่อม Google Calendar', size: 'xs', color: '#888888' };
    return {
      type: 'bubble', size: 'kilo',
      header: { type: 'box', layout: 'vertical', backgroundColor: '#0F7B6C', paddingAll: '14px', contents: [{ type: 'text', text: '📅 บันทึกนัดแล้ว', color: '#ffffff', weight: 'bold', size: 'sm' }] },
      body: {
        type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '14px',
        contents: [
          { type: 'text', text: title, weight: 'bold', size: 'md', wrap: true },
          { type: 'box', layout: 'vertical', margin: 'md', spacing: 'xs', contents: [
            { type: 'box', layout: 'horizontal', contents: [{ type: 'text', text: '📅 วัน', size: 'sm', color: '#888888', flex: 2 }, { type: 'text', text: this.fmtBangkokDate(startsAt), size: 'sm', flex: 3 }] },
            { type: 'box', layout: 'horizontal', contents: [{ type: 'text', text: '🕐 เวลา', size: 'sm', color: '#888888', flex: 2 }, { type: 'text', text: this.fmtBangkokTime(startsAt), size: 'sm', flex: 3 }] },
          ]},
          calLine,
        ],
      },
      footer: { type: 'box', layout: 'horizontal', contents: [{ type: 'button', action: { type: 'message', label: 'นัดวันนี้', text: '/ap' }, style: 'secondary', height: 'sm' }] },
    };
  }

  private buildTaskListText(tasks: Array<{ title: string }>): string {
    if (!tasks.length) return 'ไม่มีงานค้าง ✅';
    const lines = tasks.map((t, i) => `${i + 1}. ${t.title}`);
    return `📋 งานที่ยังทำอยู่ (${tasks.length} รายการ)\n${lines.join('\n')}\n\nพิมพ์ /d <เลข> เพื่อปิดงาน`;
  }
}
