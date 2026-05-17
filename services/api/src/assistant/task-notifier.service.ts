import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import type { SupabaseClient } from '@supabase/supabase-js';

const BKK = 'Asia/Bangkok';

@Injectable()
export class TaskNotifierService {
  constructor(
    private readonly config: ConfigService,
    private readonly supabase: SupabaseService,
  ) {}

  async runScheduler(): Promise<void> {
    const admin = this.supabase.createAdminClient();
    const now = new Date();
    const { hour, minute } = this.bkkHourMin(now);

    await this.sendAppointmentReminders(admin, now);

    if (hour === 8 && minute <= 4) {
      await this.sendDailyTaskBriefing(admin);
    }
  }

  private async sendDailyTaskBriefing(admin: SupabaseClient): Promise<void> {
    const { data: profiles } = await admin
      .from('profiles')
      .select('id,line_user_id,display_name')
      .not('line_user_id', 'is', null)
      .eq('is_active', true);

    if (!profiles?.length) return;

    for (const profile of profiles as Record<string, unknown>[]) {
      const lineUserId = profile.line_user_id as string;
      const { data: tasks } = await admin
        .from('tasks')
        .select('title,created_at')
        .eq('profile_id', profile.id)
        .in('status', ['pending', 'in_progress'])
        .order('created_at', { ascending: true });

      const name = (profile.display_name as string) || 'คุณ';
      const lines: string[] = [`🌅 สวัสดีตอนเช้า ${name}!`];

      if (tasks?.length) {
        lines.push(`\n📋 งานที่ยังค้างอยู่ (${tasks.length} รายการ):`);
        (tasks as Record<string, string>[]).forEach((t, i) => { lines.push(`${i + 1}. ${t.title}`); });
        lines.push('\nพิมพ์ /d <เลข> เพื่อปิดงาน');
      } else {
        lines.push('\n✅ ไม่มีงานค้าง วันนี้ว่างเต็มที่!');
      }

      await this.sendLineMessage(lineUserId, lines.join('\n'));
    }
  }

  private async sendAppointmentReminders(admin: SupabaseClient, now: Date): Promise<void> {
    const { hour, minute } = this.bkkHourMin(now);
    const isMorningWindow = hour === 8 && minute <= 4;

    if (isMorningWindow) {
      const today = this.bkkDayBounds(now);
      const tomorrow = this.bkkDayBounds(new Date(now.getTime() + 24 * 60 * 60 * 1000));

      const { data: dayBefore } = await admin.from('appointments').select('id,profile_id,title,starts_at').eq('reminded_day_before', false).gte('starts_at', tomorrow.start).lte('starts_at', tomorrow.end);
      for (const appt of (dayBefore ?? []) as Record<string, string>[]) {
        const lineUserId = await this.getLineUserId(admin, appt.profile_id);
        if (!lineUserId) continue;
        await this.sendLineMessage(lineUserId, `🔔 แจ้งเตือนล่วงหน้า 1 วัน\n📅 ${appt.title}\n🗓 ${this.fmtDate(appt.starts_at)} เวลา ${this.fmtTime(appt.starts_at)}`);
        await admin.from('appointments').update({ reminded_day_before: true }).eq('id', appt.id);
      }

      const { data: dayOf } = await admin.from('appointments').select('id,profile_id,title,starts_at').eq('reminded_day_of', false).gte('starts_at', today.start).lte('starts_at', today.end);
      for (const appt of (dayOf ?? []) as Record<string, string>[]) {
        const lineUserId = await this.getLineUserId(admin, appt.profile_id);
        if (!lineUserId) continue;
        await this.sendLineMessage(lineUserId, `📅 วันนี้มีนัด!\n📌 ${appt.title}\n🕐 เวลา ${this.fmtTime(appt.starts_at)}`);
        await admin.from('appointments').update({ reminded_day_of: true }).eq('id', appt.id);
      }
    }

    const windowStart = new Date(now.getTime() + 55 * 60 * 1000).toISOString();
    const windowEnd = new Date(now.getTime() + 65 * 60 * 1000).toISOString();
    const { data: upcoming } = await admin.from('appointments').select('id,profile_id,title,starts_at').eq('reminded_1h_before', false).gte('starts_at', windowStart).lte('starts_at', windowEnd);
    for (const appt of (upcoming ?? []) as Record<string, string>[]) {
      const lineUserId = await this.getLineUserId(admin, appt.profile_id);
      if (!lineUserId) continue;
      await this.sendLineMessage(lineUserId, `⏰ อีก 1 ชั่วโมง มีนัด!\n📌 ${appt.title}\n🕐 เวลา ${this.fmtTime(appt.starts_at)}`);
      await admin.from('appointments').update({ reminded_1h_before: true }).eq('id', appt.id);
    }
  }

  private async sendLineMessage(to: string, text: string): Promise<void> {
    const accessToken = this.config.get<string>('LINE_MESSAGING_CHANNEL_ACCESS_TOKEN') ?? '';
    if (!accessToken) return;
    await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ to, messages: [{ type: 'text', text }] }),
    }).catch(() => null);
  }

  private async getLineUserId(admin: SupabaseClient, profileId: string): Promise<string | null> {
    const res = await admin.from('profiles').select('line_user_id').eq('id', profileId).maybeSingle();
    return (res.data as Record<string, string> | null)?.line_user_id ?? null;
  }

  private bkkHourMin(d: Date): { hour: number; minute: number } {
    const hour = parseInt(new Intl.DateTimeFormat('en', { timeZone: BKK, hour: 'numeric', hour12: false }).format(d));
    const minute = parseInt(new Intl.DateTimeFormat('en', { timeZone: BKK, minute: 'numeric' }).format(d));
    return { hour, minute };
  }

  private bkkDayBounds(d: Date): { start: string; end: string } {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: BKK, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(d)
      .reduce((a, p) => { if (p.type !== 'literal') (a as Record<string, string>)[p.type] = p.value; return a; }, {} as Record<string, string>);
    const { year: y, month: m, day: dd } = parts;
    return { start: new Date(`${y}-${m}-${dd}T00:00:00+07:00`).toISOString(), end: new Date(`${y}-${m}-${dd}T23:59:59+07:00`).toISOString() };
  }

  private fmtTime(iso: string): string {
    return new Intl.DateTimeFormat('th-TH', { timeZone: BKK, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
  }

  private fmtDate(iso: string): string {
    return new Intl.DateTimeFormat('th-TH', { timeZone: BKK, day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
  }
}
