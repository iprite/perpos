import crypto from "crypto";
import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ensureDriveFolder, getDriveAccessTokenForRow, uploadFileToDrive } from "@/lib/google/drive";
import { basicHeadlineSummary, fetchRssItems, summarizeWithOpenAI } from "@/lib/news/news-agent";

export const runtime = "nodejs";

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
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      replyToken: args.replyToken,
      messages: [{ type: "text", text: args.text }],
    }),
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
  const t = String(text ?? "")
    .replaceAll(",", "")
    .trim();
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

function pickCommand(text: string) {
  const t = String(text ?? "").trim();
  const lower = t.toLowerCase();

  if (lower === "help" || t === "ช่วยด้วย" || t === "คำสั่ง") return { type: "help" as const };

  const linkMatch = t.match(/^(?:link|ผูกบัญชี)\s*[:：]?\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
  if (linkMatch?.[1]) return { type: "link" as const, token: linkMatch[1] };

  if (lower === "news" || t === "สรุปข่าว" || t === "ข่าว") return { type: "news" as const };
  if (lower === "latest" || t === "สรุปล่าสุด") return { type: "news_latest" as const };

  const incomeMatch = t.match(/^(?:income|รายรับ)\s+([0-9.,]+)\s*(.*)$/i);
  if (incomeMatch?.[1]) return { type: "income" as const, amountText: incomeMatch[1], note: (incomeMatch[2] ?? "").trim() };

  const expenseMatch = t.match(/^(?:expense|รายจ่าย)\s+([0-9.,]+)\s*(.*)$/i);
  if (expenseMatch?.[1]) return { type: "expense" as const, amountText: expenseMatch[1], note: (expenseMatch[2] ?? "").trim() };

  const addMeetMatch = t.match(/^(?:meet|นัด)\s+([0-9]{1,2}:[0-9]{2})\s+(.+)$/i);
  if (addMeetMatch?.[1] && addMeetMatch?.[2]) return { type: "calendar_add" as const, time: addMeetMatch[1], title: addMeetMatch[2].trim() };

  if (lower === "today" || t === "วันนี้") return { type: "calendar_today" as const };

  return { type: "unknown" as const };
}

async function hasPermission(admin: ReturnType<typeof createSupabaseAdminClient>, userId: string, functionKey: string) {
  const profRes = await admin.from("profiles").select("role,is_active").eq("id", userId).maybeSingle();
  if (profRes.error || !profRes.data) return false;
  const role = String((profRes.data as any).role ?? "");
  const isActive = (profRes.data as any).is_active !== false;
  if (!isActive) return false;
  if (role === "admin") return true;

  const permRes = await admin
    .from("user_permissions")
    .select("allowed")
    .eq("user_id", userId)
    .eq("function_key", functionKey)
    .maybeSingle();
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

  const rssUrls = sources
    .map((s) => (s && typeof s.value === "string" ? String(s.value) : ""))
    .filter((x) => x.trim().length);

  const perSource = Math.max(1, Math.ceil(maxItems / Math.max(1, rssUrls.length)));
  const lists = await Promise.all(rssUrls.map((u) => fetchRssItems(u, perSource).catch(() => [])));
  const items = lists.flat().slice(0, maxItems);

  const key = process.env.OPENAI_API_KEY ?? "";
  if (!key) return basicHeadlineSummary(items, Math.min(8, maxItems));

  try {
    return await summarizeWithOpenAI({ apiKey: key, topics, items, style });
  } catch {
    return basicHeadlineSummary(items, Math.min(8, maxItems));
  }
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
  const y = parts.year;
  const m = parts.month;
  const d = parts.day;
  const start = new Date(`${y}-${m}-${d}T00:00:00+07:00`);
  const end = new Date(`${y}-${m}-${d}T23:59:59+07:00`);
  return { start, end, y, m, d };
}

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

      if (messageType !== "text") {
        const supported = new Set(["file", "image", "video", "audio"]);
        if (!supported.has(messageType)) {
          await replyText({ replyToken, text: "ตอนนี้รองรับเฉพาะไฟล์/รูป/วิดีโอ/เสียง" });
          return;
        }

        const profRes = await admin
          .from("profiles")
          .select("id,is_active")
          .eq("line_user_id", lineUserId)
          .maybeSingle();
        if (profRes.error || !profRes.data) {
          await replyText({ replyToken, text: "ยังไม่ได้ผูกบัญชี\nพิมพ์: LINK <token>" });
          return;
        }
        const profileId = String((profRes.data as any).id);
        if ((profRes.data as any).is_active === false) {
          await replyText({ replyToken, text: "บัญชีถูกปิดใช้งาน" });
          return;
        }

        const okPerm = await hasPermission(admin, profileId, "bot.drive.upload");
        if (!okPerm) {
          await replyText({ replyToken, text: "คุณไม่มีสิทธิ์อัปโหลดไฟล์ไป Google Drive" });
          return;
        }

        const driveRes = await admin
          .from("google_drive_tokens")
          .select("profile_id,refresh_token,access_token,expires_at,scope,token_type,drive_root_folder_id")
          .eq("profile_id", profileId)
          .maybeSingle();
        if (driveRes.error || !driveRes.data) {
          await replyText({ replyToken, text: "ยังไม่ได้เชื่อม Google Drive\nไปที่ Settings เพื่อเชื่อมต่อ" });
          return;
        }

        const messageId = String(ev?.message?.id ?? "");
        if (!messageId) {
          await replyText({ replyToken, text: "ไม่พบ message id ของไฟล์" });
          return;
        }

        try {
          const { mimeType, bytes } = await downloadLineMessageContent(messageId);

          const row = driveRes.data as any;
          const accessToken = await getDriveAccessTokenForRow(row, async (patch) => {
            await admin
              .from("google_drive_tokens")
              .update({ ...patch, updated_at: new Date().toISOString() })
              .eq("profile_id", profileId);
          });

          const folderId = await ensureDriveFolder(accessToken, "PERPOS", row.drive_root_folder_id);
          if (!row.drive_root_folder_id && folderId) {
            await admin
              .from("google_drive_tokens")
              .update({ drive_root_folder_id: folderId, updated_at: new Date().toISOString() })
              .eq("profile_id", profileId);
          }

          const suggestedName = String(ev?.message?.fileName ?? "").trim();
          const ext = mimeType.includes("pdf")
            ? "pdf"
            : mimeType.includes("png")
              ? "png"
              : mimeType.includes("jpeg")
                ? "jpg"
                : mimeType.includes("gif")
                  ? "gif"
                  : "bin";
          const fileName = suggestedName || `line-${messageId}.${ext}`;
          const uploaded = await uploadFileToDrive({ accessToken, fileName, mimeType, bytes, folderId });

          const link = uploaded.webViewLink ? `\n${uploaded.webViewLink}` : "";
          await replyText({ replyToken, text: `อัปโหลดไป Google Drive แล้ว: ${uploaded.name ?? fileName}${link}` });
        } catch (e: any) {
          const msg = String(e?.message ?? "unknown_error").slice(0, 160);
          await replyText({ replyToken, text: `อัปโหลดไป Google Drive ไม่สำเร็จ (${msg})` });
        }
        return;
      }

      const text = String(ev?.message?.text ?? "");

      const cmd = pickCommand(text);

      if (cmd.type === "help") {
        await replyText({
          replyToken,
          text:
            "PERPOS คำสั่งหลัก\n" +
            "- LINK <token> หรือ ผูกบัญชี <token>\n" +
            "- สรุปข่าว (news)\n" +
            "- รายรับ <จำนวน> <โน้ต>\n" +
            "- รายจ่าย <จำนวน> <โน้ต>\n" +
            "- นัด <HH:MM> <เรื่อง>\n" +
            "- วันนี้ (ดูนัดวันนี้)",
        });
        return;
      }

      if (cmd.type === "link") {
        const token = cmd.token;
        const tokRes = await admin
          .from("line_link_tokens")
          .select("token,profile_id,expires_at,used_at")
          .eq("token", token)
          .maybeSingle();

        if (tokRes.error || !tokRes.data) {
          await replyText({ replyToken, text: "ไม่พบโค้ดผูกบัญชี" });
          return;
        }
        const usedAt = (tokRes.data as any).used_at as string | null;
        const expiresAt = new Date(String((tokRes.data as any).expires_at ?? ""));
        if (usedAt) {
          await replyText({ replyToken, text: "โค้ดนี้ถูกใช้ไปแล้ว" });
          return;
        }
        if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
          await replyText({ replyToken, text: "โค้ดหมดอายุแล้ว" });
          return;
        }

        const profileId = String((tokRes.data as any).profile_id ?? "");
        const upd = await admin
          .from("profiles")
          .update({ line_user_id: lineUserId, line_linked_at: new Date().toISOString() })
          .eq("id", profileId);
        if (upd.error) {
          await replyText({ replyToken, text: "ผูกบัญชีไม่สำเร็จ" });
          return;
        }
        await admin.from("line_link_tokens").update({ used_at: new Date().toISOString() }).eq("token", token);
        await replyText({ replyToken, text: "ผูกบัญชีสำเร็จ" });
        return;
      }

      const profRes = await admin
        .from("profiles")
        .select("id,role,is_active")
        .eq("line_user_id", lineUserId)
        .maybeSingle();

      if (profRes.error || !profRes.data) {
        await replyText({ replyToken, text: "ยังไม่ได้ผูกบัญชี\nพิมพ์: LINK <token>" });
        return;
      }
      const profileId = String((profRes.data as any).id);

      if ((profRes.data as any).is_active === false) {
        await replyText({ replyToken, text: "บัญชีถูกปิดใช้งาน" });
        return;
      }

      if (cmd.type === "news" || cmd.type === "news_latest") {
        const okPerm = await hasPermission(admin, profileId, cmd.type === "news" ? "bot.news.request" : "bot.news.latest");
        if (!okPerm) {
          await replyText({ replyToken, text: "คุณไม่มีสิทธิ์ใช้ฟังก์ชันสรุปข่าว" });
          return;
        }
        const text = await buildNewsText(admin);
        await replyText({ replyToken, text });
        return;
      }

      if (cmd.type === "income" || cmd.type === "expense") {
        const okPerm = await hasPermission(admin, profileId, cmd.type === "income" ? "bot.finance.income_add" : "bot.finance.expense_add");
        if (!okPerm) {
          await replyText({ replyToken, text: "คุณไม่มีสิทธิ์บันทึกรายรับ/รายจ่าย" });
          return;
        }
        const amount = parseMoney(cmd.amountText);
        if (!amount) {
          await replyText({ replyToken, text: "กรุณาระบุจำนวนเงิน เช่น รายรับ 1000 ขายของ" });
          return;
        }
        const ins = await admin.from("finance_entries").insert({
          profile_id: profileId,
          entry_type: cmd.type === "income" ? "income" : "expense",
          amount,
          note: cmd.note || null,
          occurred_at: new Date().toISOString(),
        });
        if (ins.error) {
          await replyText({ replyToken, text: "บันทึกไม่สำเร็จ" });
          return;
        }
        await replyText({ replyToken, text: `บันทึก${cmd.type === "income" ? "รายรับ" : "รายจ่าย"} ${amount.toLocaleString("th-TH")} บาทแล้ว` });
        return;
      }

      if (cmd.type === "calendar_add") {
        const okPerm = await hasPermission(admin, profileId, "bot.calendar.add");
        if (!okPerm) {
          await replyText({ replyToken, text: "คุณไม่มีสิทธิ์เพิ่มนัด" });
          return;
        }
        const time = cmd.time;
        const m = time.match(/^([0-9]{1,2}):([0-9]{2})$/);
        if (!m) {
          await replyText({ replyToken, text: "รูปแบบเวลาไม่ถูกต้อง เช่น นัด 10:30 ประชุม" });
          return;
        }
        const hh = Number(m[1]);
        const mm = Number(m[2]);
        if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
          await replyText({ replyToken, text: "รูปแบบเวลาไม่ถูกต้อง" });
          return;
        }
        const { y, m: mo, d } = bangkokDayRange(new Date());
        const startsAt = new Date(`${y}-${mo}-${d}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+07:00`).toISOString();
        const ins = await admin.from("calendar_events").insert({ profile_id: profileId, starts_at: startsAt, title: cmd.title });
        if (ins.error) {
          await replyText({ replyToken, text: "เพิ่มนัดไม่สำเร็จ" });
          return;
        }
        await replyText({ replyToken, text: `เพิ่มนัดวันนี้ ${time} - ${cmd.title}` });
        return;
      }

      if (cmd.type === "calendar_today") {
        const okPerm = await hasPermission(admin, profileId, "bot.calendar.today");
        if (!okPerm) {
          await replyText({ replyToken, text: "คุณไม่มีสิทธิ์ดูนัดวันนี้" });
          return;
        }
        const { start, end } = bangkokDayRange(new Date());
        const res = await admin
          .from("calendar_events")
          .select("starts_at,title")
          .eq("profile_id", profileId)
          .gte("starts_at", start.toISOString())
          .lte("starts_at", end.toISOString())
          .order("starts_at", { ascending: true });
        if (res.error) {
          await replyText({ replyToken, text: "โหลดนัดวันนี้ไม่สำเร็จ" });
          return;
        }
        const rows = (res.data ?? []) as Array<{ starts_at: string; title: string }>;
        if (!rows.length) {
          await replyText({ replyToken, text: "วันนี้ไม่มีนัด" });
          return;
        }
        const lines = rows.map((r, idx) => {
          const t = new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(r.starts_at));
          return `${idx + 1}. ${t} ${r.title}`;
        });
        await replyText({ replyToken, text: `นัดวันนี้\n${lines.join("\n")}` });
        return;
      }

      await replyText({ replyToken, text: "ไม่เข้าใจคำสั่ง ลองพิมพ์ HELP" });
    }),
  );

  return NextResponse.json({ ok: true });
}
