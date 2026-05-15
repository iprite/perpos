import crypto from "crypto";
import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ensureDriveFolder, getDriveAccessTokenForRow, uploadFileToDrive } from "@/lib/google/drive";
import { basicHeadlineSummary, fetchRssItems, summarizeWithOpenAI } from "@/lib/news/news-agent";
import { parseTaskFromText, bangkokToday } from "@/lib/assistant/task-parser";

export const runtime = "nodejs";

// ─────────────────────────────────────────────
// Generic helpers
// ─────────────────────────────────────────────

function verifyLineSignature(args: { body: string; signature: string | null; channelSecret: string | undefined }) {
  const secret = args.channelSecret ?? "";
  const signature = args.signature ?? "";
  if (!secret || !signature) return false;
  const computed = crypto.createHmac("sha256", secret).update(args.body).digest("base64");
  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
  } catch {
    return false;
  }
}

async function replyText(args: { replyToken: string; text: string }) {
  const accessToken = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN ?? "";
  if (!accessToken) return;
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ replyToken: args.replyToken, messages: [{ type: "text", text: args.text }] }),
  }).catch(() => null);
}

async function replyFlex(args: { replyToken: string; altText: string; contents: unknown }) {
  const accessToken = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN ?? "";
  if (!accessToken) return;
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ replyToken: args.replyToken, messages: [{ type: "flex", altText: args.altText, contents: args.contents }] }),
  }).catch(() => null);
}

async function downloadLineMessageContent(messageId: string) {
  const accessToken = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN ?? "";
  if (!accessToken) throw new Error("missing_line_access_token");
  const res = await fetch(`https://api-data.line.me/v2/bot/message/${encodeURIComponent(messageId)}/content`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`line_content_${res.status}${errText ? `:${errText.slice(0, 180)}` : ""}`);
  }
  const mimeType = res.headers.get("content-type") || "application/octet-stream";
  const bytes = new Uint8Array(await res.arrayBuffer());
  return { mimeType, bytes };
}

function parseMoney(text: string) {
  const t = String(text ?? "").replaceAll(",", "").trim();
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

function bangkokDayRange(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(now)
    .reduce((acc, p) => {
      if (p.type !== "literal") (acc as any)[p.type] = p.value;
      return acc;
    }, {} as Record<string, string>);
  const { year: y, month: m, day: d } = parts;
  return {
    start: new Date(`${y}-${m}-${d}T00:00:00+07:00`),
    end: new Date(`${y}-${m}-${d}T23:59:59+07:00`),
    y, m, d,
  };
}

function fmtBangkokTime(iso: string) {
  return new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

function fmtBangkokDateTime(iso: string) {
  return new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

async function hasPermission(admin: ReturnType<typeof createSupabaseAdminClient>, userId: string, functionKey: string) {
  const profRes = await admin.from("profiles").select("role,is_active").eq("id", userId).maybeSingle();
  if (profRes.error || !profRes.data) return false;
  const role = String((profRes.data as any).role ?? "");
  if ((profRes.data as any).is_active === false) return false;
  if (role === "admin") return true;
  const permRes = await admin.from("user_permissions").select("allowed").eq("user_id", userId).eq("function_key", functionKey).maybeSingle();
  if (permRes.error || !permRes.data) return false;
  return Boolean((permRes.data as any).allowed);
}

async function buildNewsText(admin: ReturnType<typeof createSupabaseAdminClient>) {
  const cfgRes = await admin.from("news_agent_configs").select("topics,sources,summary_style,max_items").order("updated_at", { ascending: false }).limit(1).maybeSingle();
  const cfg = cfgRes.error ? null : (cfgRes.data as any);
  const topics = Array.isArray(cfg?.topics) ? (cfg?.topics as string[]) : [];
  const sources = Array.isArray(cfg?.sources) ? (cfg?.sources as any[]) : [];
  const style = (cfg?.summary_style as any) || "bullet";
  const maxItems = Math.min(30, Math.max(1, Number(cfg?.max_items ?? 8)));
  const rssUrls = sources.map((s) => (s && typeof s.value === "string" ? String(s.value) : "")).filter((x) => x.trim().length);
  const perSource = Math.max(1, Math.ceil(maxItems / Math.max(1, rssUrls.length)));
  const lists = await Promise.all(rssUrls.map((u) => fetchRssItems(u, perSource).catch(() => [])));
  const items = lists.flat().slice(0, maxItems);
  const key = process.env.OPENAI_API_KEY ?? "";
  if (!key) return basicHeadlineSummary(items, Math.min(8, maxItems));
  try { return await summarizeWithOpenAI({ apiKey: key, topics, items, style }); } catch { return basicHeadlineSummary(items, Math.min(8, maxItems)); }
}

// ─────────────────────────────────────────────
// Command parser
// ─────────────────────────────────────────────

type Command =
  | { type: "help" }
  | { type: "link"; token: string }
  | { type: "news" }
  | { type: "news_latest" }
  | { type: "income"; amountText: string; note: string }
  | { type: "expense"; amountText: string; note: string }
  | { type: "calendar_add"; time: string; title: string }
  | { type: "calendar_today" }
  | { type: "task_list" }
  | { type: "task_done"; index: number }
  | { type: "task_postpone"; index: number }
  | { type: "task_overdue" }
  | { type: "task_create"; input: string }  // /t <text> → force NLP task creation
  | { type: "unknown_slash" }              // starts with / but no match → show error
  | { type: "unknown" };                   // no / → try NLP

// All commands must start with /  Plain text (no /) goes to NLP fallback.
function pickCommand(text: string): Command {
  const t = String(text ?? "").trim();

  // Not a command — let NLP handle it
  if (!t.startsWith("/")) return { type: "unknown" };

  const body  = t.slice(1).trim();           // strip leading /
  const lower = body.toLowerCase();

  if (lower === "help" || lower === "คำสั่ง") return { type: "help" };

  const taskCreateMatch = body.match(/^t(?:\s+(.+))?$/i);
  if (taskCreateMatch !== null) return { type: "task_create", input: (taskCreateMatch[1] ?? "").trim() };

  const linkMatch = body.match(/^(?:link|ผูกบัญชี)\s+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
  if (linkMatch?.[1]) return { type: "link", token: linkMatch[1] };

  if (lower === "news" || lower === "สรุปข่าว" || lower === "ข่าว") return { type: "news" };
  if (lower === "latest" || lower === "สรุปล่าสุด") return { type: "news_latest" };

  const incomeMatch = body.match(/^(?:income|รายรับ)\s+([0-9.,]+)\s*(.*)$/i);
  if (incomeMatch?.[1]) return { type: "income", amountText: incomeMatch[1], note: (incomeMatch[2] ?? "").trim() };

  const expenseMatch = body.match(/^(?:expense|รายจ่าย)\s+([0-9.,]+)\s*(.*)$/i);
  if (expenseMatch?.[1]) return { type: "expense", amountText: expenseMatch[1], note: (expenseMatch[2] ?? "").trim() };

  const addMeetMatch = body.match(/^(?:meet|นัด)\s+([0-9]{1,2}:[0-9]{2})\s+(.+)$/i);
  if (addMeetMatch?.[1] && addMeetMatch?.[2]) return { type: "calendar_add", time: addMeetMatch[1], title: addMeetMatch[2].trim() };

  if (lower === "today" || lower === "วันนี้") return { type: "calendar_today" };

  if (lower === "tasks" || lower === "งาน" || lower === "รายการงาน") return { type: "task_list" };
  if (lower === "overdue" || lower === "งานค้าง") return { type: "task_overdue" };

  const doneMatch = body.match(/^(?:done|เสร็จ)\s+([0-9]+)$/i);
  if (doneMatch?.[1]) return { type: "task_done", index: parseInt(doneMatch[1]) };

  const postponeMatch = body.match(/^(?:postpone|เลื่อน)\s+([0-9]+)$/i);
  if (postponeMatch?.[1]) return { type: "task_postpone", index: parseInt(postponeMatch[1]) };

  return { type: "unknown_slash" };
}

// ─────────────────────────────────────────────
// Task helpers
// ─────────────────────────────────────────────

const PRIORITY_LABEL: Record<string, string> = { low: "ต่ำ", medium: "ปานกลาง", high: "สูง", urgent: "ด่วนมาก" };

async function getPendingTasks(admin: ReturnType<typeof createSupabaseAdminClient>, profileId: string) {
  const { data } = await admin
    .from("tasks")
    .select("id,title,due_at,priority,status")
    .eq("profile_id", profileId)
    .in("status", ["pending", "in_progress"])
    .order("due_at", { ascending: true, nullsFirst: false });
  return (data ?? []) as Array<{ id: string; title: string; due_at: string | null; priority: string; status: string }>;
}

function buildTaskListText(tasks: Array<{ title: string; due_at: string | null; priority: string }>, label: string) {
  if (!tasks.length) return `ไม่มี${label}`;
  const lines = tasks.map((t, i) => {
    const time = t.due_at ? ` (${fmtBangkokDateTime(t.due_at)})` : "";
    return `${i + 1}. ${t.title}${time}`;
  });
  return `📋 ${label} (${tasks.length} รายการ)\n${lines.join("\n")}\n\nพิมพ์ /เสร็จ <เลข> หรือ /เลื่อน <เลข>`;
}

function buildTaskConfirmFlex(args: { title: string; dueAt?: string; priority: string; remindBefore: number }) {
  const { title, dueAt, priority, remindBefore } = args;
  return {
    type: "bubble",
    size: "kilo",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#1B6CA8",
      paddingAll: "14px",
      contents: [{ type: "text", text: "✅ บันทึกงานแล้ว", color: "#ffffff", weight: "bold", size: "sm" }],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "14px",
      contents: [
        { type: "text", text: title, weight: "bold", size: "md", wrap: true },
        {
          type: "box",
          layout: "vertical",
          margin: "md",
          spacing: "xs",
          contents: [
            { type: "box", layout: "horizontal", contents: [{ type: "text", text: "📅 กำหนด", size: "sm", color: "#888888", flex: 2 }, { type: "text", text: dueAt ? fmtBangkokDateTime(dueAt) : "ไม่ระบุ", size: "sm", flex: 3 }] },
            { type: "box", layout: "horizontal", contents: [{ type: "text", text: "🔴 ความสำคัญ", size: "sm", color: "#888888", flex: 2 }, { type: "text", text: PRIORITY_LABEL[priority] ?? priority, size: "sm", flex: 3 }] },
            { type: "box", layout: "horizontal", contents: [{ type: "text", text: "⏰ แจ้งเตือน", size: "sm", color: "#888888", flex: 2 }, { type: "text", text: `ก่อน ${remindBefore} นาที`, size: "sm", flex: 3 }] },
          ],
        },
      ],
    },
    footer: {
      type: "box",
      layout: "horizontal",
      contents: [{ type: "button", action: { type: "message", label: "ดูงานทั้งหมด", text: "งาน" }, style: "secondary", height: "sm" }],
    },
  };
}

// ─────────────────────────────────────────────
// Webhook POST handler
// ─────────────────────────────────────────────

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get("x-line-signature");
  const ok = verifyLineSignature({ body, signature, channelSecret: process.env.LINE_MESSAGING_CHANNEL_SECRET });
  if (!ok) return NextResponse.json({ ok: false }, { status: 401 });

  const payload = JSON.parse(body || "{}") as any;
  const events = Array.isArray(payload?.events) ? payload.events : [];

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    return NextResponse.json({ ok: true });
  }

  await Promise.all(
    events.map(async (ev: any) => {
      const replyToken = String(ev?.replyToken ?? "");
      const lineUserId = String(ev?.source?.userId ?? "");
      if (!replyToken || !lineUserId) return;
      if (String(ev?.type ?? "") !== "message") return;

      const messageType = String(ev?.message?.type ?? "");

      // ── Non-text → Google Drive upload ──────────────────────────────────
      if (messageType !== "text") {
        const supported = new Set(["file", "image", "video", "audio"]);
        if (!supported.has(messageType)) {
          await replyText({ replyToken, text: "ตอนนี้รองรับเฉพาะไฟล์/รูป/วิดีโอ/เสียง" });
          return;
        }
        const profRes = await admin.from("profiles").select("id,is_active").eq("line_user_id", lineUserId).maybeSingle();
        if (profRes.error || !profRes.data) { await replyText({ replyToken, text: "ยังไม่ได้ผูกบัญชี\nพิมพ์: LINK <token>" }); return; }
        const profileId = String((profRes.data as any).id);
        if ((profRes.data as any).is_active === false) { await replyText({ replyToken, text: "บัญชีถูกปิดใช้งาน" }); return; }
        const okPerm = await hasPermission(admin, profileId, "bot.drive.upload");
        if (!okPerm) { await replyText({ replyToken, text: "คุณไม่มีสิทธิ์อัปโหลดไฟล์ไป Google Drive" }); return; }
        const driveRes = await admin.from("google_drive_tokens").select("profile_id,refresh_token,access_token,expires_at,scope,token_type,drive_root_folder_id").eq("profile_id", profileId).maybeSingle();
        if (driveRes.error || !driveRes.data) { await replyText({ replyToken, text: "ยังไม่ได้เชื่อม Google Drive\nไปที่ Settings เพื่อเชื่อมต่อ" }); return; }
        const messageId = String(ev?.message?.id ?? "");
        if (!messageId) { await replyText({ replyToken, text: "ไม่พบ message id ของไฟล์" }); return; }
        try {
          const { mimeType, bytes } = await downloadLineMessageContent(messageId);
          const row = driveRes.data as any;
          const accessToken = await getDriveAccessTokenForRow(row, async (patch) => {
            await admin.from("google_drive_tokens").update({ ...patch, updated_at: new Date().toISOString() }).eq("profile_id", profileId);
          });
          const folderId = await ensureDriveFolder(accessToken, "PERPOS", row.drive_root_folder_id);
          if (!row.drive_root_folder_id && folderId) {
            await admin.from("google_drive_tokens").update({ drive_root_folder_id: folderId, updated_at: new Date().toISOString() }).eq("profile_id", profileId);
          }
          const suggestedName = String(ev?.message?.fileName ?? "").trim();
          const ext = mimeType.includes("pdf") ? "pdf" : mimeType.includes("png") ? "png" : mimeType.includes("jpeg") ? "jpg" : mimeType.includes("gif") ? "gif" : "bin";
          const fileName = suggestedName || `line-${messageId}.${ext}`;
          const uploaded = await uploadFileToDrive({ accessToken, fileName, mimeType, bytes, folderId });
          const link = uploaded.webViewLink ? `\n${uploaded.webViewLink}` : "";
          await replyText({ replyToken, text: `อัปโหลดไป Google Drive แล้ว: ${uploaded.name ?? fileName}${link}` });
        } catch (e: any) {
          await replyText({ replyToken, text: `อัปโหลดไป Google Drive ไม่สำเร็จ (${String(e?.message ?? "unknown_error").slice(0, 160)})` });
        }
        return;
      }

      // ── Text message ─────────────────────────────────────────────────────
      const text = String(ev?.message?.text ?? "");
      const cmd = pickCommand(text);

      if (cmd.type === "help") {
        await replyText({
          replyToken,
          text:
            "PERPOS — คำสั่งทั้งหมด\n" +
            "════════════════\n" +
            "🔗 /link <token>        ผูกบัญชี LINE\n" +
            "📰 /ข่าว                สรุปข่าว\n" +
            "💰 /รายรับ <จำนวน> <โน้ต>\n" +
            "💸 /รายจ่าย <จำนวน> <โน้ต>\n" +
            "📅 /นัด <HH:MM> <เรื่อง>  เพิ่มนัด\n" +
            "🗓 /วันนี้              นัดวันนี้\n" +
            "────────────────\n" +
            "✍️ /t <ข้อความ>        บันทึกงานใหม่\n" +
            "📋 /งาน                รายการงาน\n" +
            "⚠️ /งานค้าง            งานเกินกำหนด\n" +
            "✅ /เสร็จ <เลข>        ปิดงาน\n" +
            "📆 /เลื่อน <เลข>       เลื่อน 1 วัน\n" +
            "════════════════\n" +
            "💡 พิมพ์ข้อความธรรมดา\n   เพื่อบันทึกงานด้วย AI",
        });
        return;
      }

      if (cmd.type === "link") {
        const tokRes = await admin.from("line_link_tokens").select("token,profile_id,expires_at,used_at").eq("token", cmd.token).maybeSingle();
        if (tokRes.error || !tokRes.data) { await replyText({ replyToken, text: "ไม่พบโค้ดผูกบัญชี" }); return; }
        const usedAt = (tokRes.data as any).used_at as string | null;
        const expiresAt = new Date(String((tokRes.data as any).expires_at ?? ""));
        if (usedAt) { await replyText({ replyToken, text: "โค้ดนี้ถูกใช้ไปแล้ว" }); return; }
        if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) { await replyText({ replyToken, text: "โค้ดหมดอายุแล้ว" }); return; }
        const profileId = String((tokRes.data as any).profile_id ?? "");
        const upd = await admin.from("profiles").update({ line_user_id: lineUserId, line_linked_at: new Date().toISOString() }).eq("id", profileId);
        if (upd.error) { await replyText({ replyToken, text: "ผูกบัญชีไม่สำเร็จ" }); return; }
        await admin.from("line_link_tokens").update({ used_at: new Date().toISOString() }).eq("token", cmd.token);
        await replyText({ replyToken, text: "ผูกบัญชีสำเร็จ" });
        return;
      }

      // Resolve profile for all remaining commands
      const profRes = await admin.from("profiles").select("id,role,is_active").eq("line_user_id", lineUserId).maybeSingle();
      if (profRes.error || !profRes.data) { await replyText({ replyToken, text: "ยังไม่ได้ผูกบัญชี\nพิมพ์: LINK <token>" }); return; }
      const profileId = String((profRes.data as any).id);
      if ((profRes.data as any).is_active === false) { await replyText({ replyToken, text: "บัญชีถูกปิดใช้งาน" }); return; }

      if (cmd.type === "news" || cmd.type === "news_latest") {
        const okPerm = await hasPermission(admin, profileId, cmd.type === "news" ? "bot.news.request" : "bot.news.latest");
        if (!okPerm) { await replyText({ replyToken, text: "คุณไม่มีสิทธิ์ใช้ฟังก์ชันสรุปข่าว" }); return; }
        await replyText({ replyToken, text: await buildNewsText(admin) });
        return;
      }

      if (cmd.type === "income" || cmd.type === "expense") {
        const okPerm = await hasPermission(admin, profileId, cmd.type === "income" ? "bot.finance.income_add" : "bot.finance.expense_add");
        if (!okPerm) { await replyText({ replyToken, text: "คุณไม่มีสิทธิ์บันทึกรายรับ/รายจ่าย" }); return; }
        const amount = parseMoney(cmd.amountText);
        if (!amount) { await replyText({ replyToken, text: "กรุณาระบุจำนวนเงิน เช่น รายรับ 1000 ขายของ" }); return; }
        const ins = await admin.from("finance_entries").insert({ profile_id: profileId, entry_type: cmd.type === "income" ? "income" : "expense", amount, note: cmd.note || null, occurred_at: new Date().toISOString() });
        if (ins.error) { await replyText({ replyToken, text: "บันทึกไม่สำเร็จ" }); return; }
        await replyText({ replyToken, text: `บันทึก${cmd.type === "income" ? "รายรับ" : "รายจ่าย"} ${amount.toLocaleString("th-TH")} บาทแล้ว` });
        return;
      }

      if (cmd.type === "calendar_add") {
        const okPerm = await hasPermission(admin, profileId, "bot.calendar.add");
        if (!okPerm) { await replyText({ replyToken, text: "คุณไม่มีสิทธิ์เพิ่มนัด" }); return; }
        const m = cmd.time.match(/^([0-9]{1,2}):([0-9]{2})$/);
        if (!m) { await replyText({ replyToken, text: "รูปแบบเวลาไม่ถูกต้อง เช่น นัด 10:30 ประชุม" }); return; }
        const hh = Number(m[1]), mm = Number(m[2]);
        if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) { await replyText({ replyToken, text: "รูปแบบเวลาไม่ถูกต้อง" }); return; }
        const { y, m: mo, d } = bangkokDayRange(new Date());
        const startsAt = new Date(`${y}-${mo}-${d}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+07:00`).toISOString();
        const ins = await admin.from("calendar_events").insert({ profile_id: profileId, starts_at: startsAt, title: cmd.title });
        if (ins.error) { await replyText({ replyToken, text: "เพิ่มนัดไม่สำเร็จ" }); return; }
        await replyText({ replyToken, text: `เพิ่มนัดวันนี้ ${cmd.time} - ${cmd.title}` });
        return;
      }

      if (cmd.type === "calendar_today") {
        const okPerm = await hasPermission(admin, profileId, "bot.calendar.today");
        if (!okPerm) { await replyText({ replyToken, text: "คุณไม่มีสิทธิ์ดูนัดวันนี้" }); return; }
        const { start, end } = bangkokDayRange(new Date());
        const res = await admin.from("calendar_events").select("starts_at,title").eq("profile_id", profileId).gte("starts_at", start.toISOString()).lte("starts_at", end.toISOString()).order("starts_at", { ascending: true });
        if (res.error) { await replyText({ replyToken, text: "โหลดนัดวันนี้ไม่สำเร็จ" }); return; }
        const rows = (res.data ?? []) as Array<{ starts_at: string; title: string }>;
        if (!rows.length) { await replyText({ replyToken, text: "วันนี้ไม่มีนัด" }); return; }
        await replyText({ replyToken, text: `นัดวันนี้\n${rows.map((r, i) => `${i + 1}. ${fmtBangkokTime(r.starts_at)} ${r.title}`).join("\n")}` });
        return;
      }

      // ── Task commands ────────────────────────────────────────────────────

      if (cmd.type === "task_list") {
        const okPerm = await hasPermission(admin, profileId, "bot.assistant.tasks");
        if (!okPerm) { await replyText({ replyToken, text: "คุณไม่มีสิทธิ์ใช้ Task Manager" }); return; }
        const tasks = await getPendingTasks(admin, profileId);
        await replyText({ replyToken, text: buildTaskListText(tasks, "งานที่รอดำเนินการ") });
        return;
      }

      if (cmd.type === "task_overdue") {
        const okPerm = await hasPermission(admin, profileId, "bot.assistant.tasks");
        if (!okPerm) { await replyText({ replyToken, text: "คุณไม่มีสิทธิ์ใช้ Task Manager" }); return; }
        const { data } = await admin.from("tasks").select("id,title,due_at,priority").eq("profile_id", profileId).eq("status", "pending").lt("due_at", new Date().toISOString()).order("due_at", { ascending: true });
        await replyText({ replyToken, text: buildTaskListText((data ?? []) as any[], "งานค้าง") });
        return;
      }

      if (cmd.type === "task_done") {
        const okPerm = await hasPermission(admin, profileId, "bot.assistant.tasks");
        if (!okPerm) { await replyText({ replyToken, text: "คุณไม่มีสิทธิ์ใช้ Task Manager" }); return; }
        const tasks = await getPendingTasks(admin, profileId);
        const idx = cmd.index - 1;
        if (idx < 0 || idx >= tasks.length) { await replyText({ replyToken, text: `ไม่พบงานที่ ${cmd.index} ลองพิมพ์ "งาน" เพื่อดูรายการใหม่` }); return; }
        await admin.from("tasks").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", tasks[idx].id);
        await replyText({ replyToken, text: `✅ ปิดงานแล้ว: "${tasks[idx].title}"` });
        return;
      }

      if (cmd.type === "task_postpone") {
        const okPerm = await hasPermission(admin, profileId, "bot.assistant.tasks");
        if (!okPerm) { await replyText({ replyToken, text: "คุณไม่มีสิทธิ์ใช้ Task Manager" }); return; }
        const tasks = await getPendingTasks(admin, profileId);
        const idx = cmd.index - 1;
        if (idx < 0 || idx >= tasks.length) { await replyText({ replyToken, text: `ไม่พบงานที่ ${cmd.index} ลองพิมพ์ "งาน" เพื่อดูรายการใหม่` }); return; }
        const task = tasks[idx];
        const base = task.due_at ? new Date(task.due_at).getTime() : Date.now();
        const newDueAt = new Date(base + 24 * 60 * 60 * 1000).toISOString();
        const newRemindAt = new Date(new Date(newDueAt).getTime() - 15 * 60 * 1000).toISOString();
        await admin.from("tasks").update({ due_at: newDueAt, remind_at: newRemindAt, follow_up_sent_at: null }).eq("id", task.id);
        await replyText({ replyToken, text: `📅 เลื่อนงาน "${task.title}" เป็น ${fmtBangkokDateTime(newDueAt)}` });
        return;
      }

      // ── /t <text> → NLP task creation ───────────────────────────────────
      if (cmd.type === "task_create") {
        const okPerm = await hasPermission(admin, profileId, "bot.assistant.tasks");
        if (!okPerm) { await replyText({ replyToken, text: "คุณไม่มีสิทธิ์ใช้ Task Manager" }); return; }
        const input = cmd.input;
        if (!input) { await replyText({ replyToken, text: "ระบุรายละเอียดงานด้วย\nเช่น /t พรุ่งนี้ 10 โมงประชุม Q3" }); return; }
        const apiKey = process.env.OPENAI_API_KEY ?? "";
        if (!apiKey) { await replyText({ replyToken, text: "ยังไม่ได้ตั้งค่า OPENAI_API_KEY" }); return; }
        try {
          const parsed = await parseTaskFromText({ text: input, apiKey, todayBangkok: bangkokToday() });
          if (!parsed) { await replyText({ replyToken, text: "ไม่สามารถสร้างงานได้ ลองระบุชื่องาน วัน และเวลาให้ชัดขึ้น" }); return; }
          const ins = await admin.from("tasks").insert({
            profile_id: profileId,
            title: parsed.title,
            description: parsed.description ?? null,
            due_at: parsed.due_at ?? null,
            remind_at: parsed.remind_at ?? null,
            remind_before_minutes: parsed.remind_before_minutes,
            priority: parsed.priority,
            source: "line",
            raw_input: input,
          });
          if (ins.error) { await replyText({ replyToken, text: "บันทึกงานไม่สำเร็จ" }); return; }
          await replyFlex({
            replyToken,
            altText: `บันทึกงาน: ${parsed.title}`,
            contents: buildTaskConfirmFlex({ title: parsed.title, dueAt: parsed.due_at, priority: parsed.priority, remindBefore: parsed.remind_before_minutes }),
          });
        } catch {
          await replyText({ replyToken, text: "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง" });
        }
        return;
      }

      // ── Unknown slash command ────────────────────────────────────────────
      if (cmd.type === "unknown_slash") {
        await replyText({ replyToken, text: "ไม่รู้จักคำสั่งนี้\nพิมพ์ /help เพื่อดูคำสั่งทั้งหมด" });
        return;
      }

      // ── NLP fallback: create task from plain-text natural language ────────
      const apiKey = process.env.OPENAI_API_KEY ?? "";
      if (apiKey) {
        const okPerm = await hasPermission(admin, profileId, "bot.assistant.tasks");
        if (okPerm) {
          try {
            const parsed = await parseTaskFromText({ text, apiKey, todayBangkok: bangkokToday() });
            if (parsed) {
              const ins = await admin.from("tasks").insert({
                profile_id: profileId,
                title: parsed.title,
                description: parsed.description ?? null,
                due_at: parsed.due_at ?? null,
                remind_at: parsed.remind_at ?? null,
                remind_before_minutes: parsed.remind_before_minutes,
                priority: parsed.priority,
                source: "line",
                raw_input: text,
              });
              if (!ins.error) {
                await replyFlex({
                  replyToken,
                  altText: `บันทึกงาน: ${parsed.title}`,
                  contents: buildTaskConfirmFlex({ title: parsed.title, dueAt: parsed.due_at, priority: parsed.priority, remindBefore: parsed.remind_before_minutes }),
                });
                return;
              }
            }
          } catch {
            // fall through to unknown
          }
        }
      }

      await replyText({ replyToken, text: "ไม่เข้าใจคำสั่ง ลองพิมพ์ HELP" });
    }),
  );

  return NextResponse.json({ ok: true });
}
