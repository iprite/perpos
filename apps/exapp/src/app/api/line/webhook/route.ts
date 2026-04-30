import crypto from "crypto";
import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

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
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "";
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

function extractLinkTokenFromText(text: string) {
  const t = String(text ?? "").trim();
  const m = t.match(/^link\s*[:：]?\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
  return m?.[1] ?? null;
}

export async function POST(req: Request) {
  const signature = req.headers.get("x-line-signature");
  const body = await req.text();

  const ok = verifyLineSignature({ body, signature, channelSecret: process.env.LINE_CHANNEL_SECRET });
  if (!ok) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  const payload = JSON.parse(body) as any;
  const events = Array.isArray(payload?.events) ? payload.events : [];
  if (!events.length) return NextResponse.json({ ok: true });

  const admin = createSupabaseAdminClient();

  for (const ev of events) {
    if (ev?.type !== "message") continue;
    if (ev?.message?.type !== "text") continue;

    const replyToken = String(ev?.replyToken ?? "");
    const lineUserId = String(ev?.source?.userId ?? "");
    const text = String(ev?.message?.text ?? "");

    if (!replyToken || !lineUserId) continue;
    const linkToken = extractLinkTokenFromText(text);
    if (!linkToken) continue;

    const tokenRow = await admin
      .from("line_link_tokens")
      .select("token,profile_id,expires_at,used_at")
      .eq("token", linkToken)
      .maybeSingle();

    if (tokenRow.error || !tokenRow.data) {
      await replyText({ replyToken, text: "โค้ดไม่ถูกต้อง กรุณาสร้าง QR ใหม่ในหน้า ตั้งค่าผู้ใช้" });
      continue;
    }

    const expiresAt = new Date(String((tokenRow.data as any).expires_at));
    const usedAt = (tokenRow.data as any).used_at;
    if (usedAt) {
      await replyText({ replyToken, text: "โค้ดนี้ถูกใช้งานแล้ว กรุณาสร้าง QR ใหม่ในหน้า ตั้งค่าผู้ใช้" });
      continue;
    }
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
      await replyText({ replyToken, text: "โค้ดหมดอายุ กรุณาสร้าง QR ใหม่ในหน้า ตั้งค่าผู้ใช้" });
      continue;
    }

    const profileId = String((tokenRow.data as any).profile_id);
    const now = new Date().toISOString();

    const upRes = await admin
      .from("profiles")
      .update({ line_user_id: lineUserId, line_linked_at: now })
      .eq("id", profileId);

    if (upRes.error) {
      await replyText({ replyToken, text: "เชื่อมไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" });
      continue;
    }

    const markRes = await admin.from("line_link_tokens").update({ used_at: now }).eq("token", linkToken);
    if (markRes.error) {
      await replyText({ replyToken, text: "เชื่อมสำเร็จ แต่บันทึกสถานะไม่สมบูรณ์ กรุณาตรวจสอบหน้า ตั้งค่าผู้ใช้" });
      continue;
    }

    await replyText({ replyToken, text: "เชื่อมบัญชีสำเร็จแล้ว คุณจะได้รับการแจ้งเตือนตามที่ตั้งค่าไว้" });
  }

  return NextResponse.json({ ok: true });
}

