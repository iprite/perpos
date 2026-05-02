import crypto from "crypto";
import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolvePettyCashCategory } from "@/lib/petty-cash/category-match";
import { parsePettyCashLineText } from "@/lib/petty-cash/line-parser";

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

function extractEmployerConnectTokenFromText(text: string) {
  const t = String(text ?? "").trim();
  const m = t.match(/^employer_connect\s*[:：]?\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
  return m?.[1] ?? null;
}

function money(n: number) {
  const x = Number.isFinite(n) ? n : 0;
  return x.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function getActivePettyCashCategories(admin: any) {
  const res = await admin
    .from("petty_cash_categories")
    .select("name,is_active,sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .limit(200);
  if (res.error) return [] as string[];
  return (res.data ?? []).map((r: any) => String(r.name)).filter(Boolean);
}

async function getPettyCashBalance(admin: any) {
  const res = await admin.rpc("petty_cash_balance");
  if (res.error) throw new Error(res.error.message);
  return Number(res.data ?? 0);
}

async function getPettyCashSummary(admin: any) {
  const res = await admin.rpc("petty_cash_summary");
  if (res.error) throw new Error(res.error.message);
  const d = (res.data ?? {}) as any;
  return {
    balance: Number(d.balance ?? 0),
    todayTopUp: Number(d.today_top_up ?? 0),
    todaySpend: Number(d.today_spend ?? 0),
    monthTopUp: Number(d.month_top_up ?? 0),
    monthSpend: Number(d.month_spend ?? 0),
  };
}

async function fetchProfileByLineUserId(admin: any, lineUserId: string) {
  const res = await admin.from("profiles").select("id,role,display_name").eq("line_user_id", lineUserId).maybeSingle();
  if (res.error) return null;
  return res.data as any;
}

function isAllowedPettyCashRole(role: string | null) {
  return role === "admin" || role === "operation";
}

function formatCategoryConfirmMessage(args: { input: string; suggestions: string[]; allowedAll?: string[] | null }) {
  const lines: string[] = [];
  lines.push(`ไม่พบหมวด “${args.input}”`);
  if (args.suggestions.length) {
    lines.push("เลือกหมวดที่ถูกต้อง (ตอบเป็นเลข):");
    args.suggestions.forEach((n, idx) => {
      lines.push(`${idx + 1}) ${n}`);
    });
  } else {
    const all = Array.isArray(args.allowedAll) ? args.allowedAll.map((x) => String(x)).filter(Boolean) : [];
    if (all.length) {
      const shown = all.slice(0, 12);
      const suffix = all.length > shown.length ? "..." : "";
      lines.push(`หมวดที่ตั้งค่าไว้: ${shown.join(", ")}${suffix}`);
    }
  }
  lines.push("พิมพ์ “ยืนยัน” เพื่อบันทึกเป็น “อื่นๆ” หรือพิมพ์ “ยกเลิก” เพื่อยกเลิกรายการ");
  return lines.join("\n");
}

async function getPending(admin: any, lineUserId: string) {
  const now = new Date().toISOString();
  const res = await admin
    .from("petty_cash_line_pending")
    .select("id,kind,status,payload,expires_at")
    .eq("line_user_id", lineUserId)
    .eq("status", "pending")
    .gt("expires_at", now)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (res.error) return null;
  return res.data as any;
}

async function markPending(admin: any, id: string, status: "used" | "cancelled" | "expired") {
  const now = new Date().toISOString();
  await admin.from("petty_cash_line_pending").update({ status, used_at: now }).eq("id", id);
}

async function createPending(admin: any, args: { lineUserId: string; payload: any }) {
  await admin.from("petty_cash_line_pending").update({ status: "expired", used_at: new Date().toISOString() }).eq("line_user_id", args.lineUserId).eq("status", "pending");
  const ins = await admin.from("petty_cash_line_pending").insert({ line_user_id: args.lineUserId, kind: "CATEGORY_CONFIRM", payload: args.payload });
  if (ins.error) throw new Error(ins.error.message);
}

async function insertPettyCashTxn(admin: any, args: { profileId: string; lineUserId: string; txnType: "TOP_UP" | "SPEND"; amount: number; occurredAt: string; categoryName: string | null; title: string; referenceUrl: string | null; rawText: string }) {
  const categoryName = args.txnType === "SPEND" ? String(args.categoryName ?? "").trim() || "อื่นๆ" : String(args.categoryName ?? "").trim() || null;
  const title = String(args.title ?? "").trim();
  const ins = await admin
    .from("petty_cash_transactions")
    .insert({
      txn_type: args.txnType,
      amount: args.amount,
      occurred_at: args.occurredAt,
      category_name: categoryName,
      title,
      note: null,
      reference_url: args.referenceUrl,
      created_by_profile_id: args.profileId,
      source: "line",
      line_user_id: args.lineUserId,
      raw_text: args.rawText,
    })
    .select("id")
    .single();
  if (ins.error) throw new Error(ins.error.message);
  return ins.data as any;
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

    const employerConnectToken = extractEmployerConnectTokenFromText(text);
    if (employerConnectToken) {
      const tokenRow = await admin
        .from("customer_line_connect_tokens")
        .select("token,customer_id,expires_at,used_at")
        .eq("token", employerConnectToken)
        .maybeSingle();

      if (tokenRow.error || !tokenRow.data) {
        await replyText({ replyToken, text: "โค้ดเชื่อมต่อไม่ถูกต้อง กรุณาติดต่อทีมงานเพื่อขอลิงก์ใหม่" });
        continue;
      }

      const expiresAt = new Date(String((tokenRow.data as any).expires_at));
      const usedAt = (tokenRow.data as any).used_at;
      if (usedAt) {
        await replyText({ replyToken, text: "โค้ดนี้ถูกใช้งานแล้ว กรุณาติดต่อทีมงานเพื่อขอลิงก์ใหม่" });
        continue;
      }
      if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
        await replyText({ replyToken, text: "โค้ดหมดอายุ กรุณาติดต่อทีมงานเพื่อขอลิงก์ใหม่" });
        continue;
      }

      const customerId = String((tokenRow.data as any).customer_id ?? "").trim();
      if (!customerId) {
        await replyText({ replyToken, text: "โค้ดไม่สมบูรณ์ กรุณาติดต่อทีมงาน" });
        continue;
      }

      const now = new Date().toISOString();
      await admin
        .from("customer_line_connections")
        .upsert(
          {
            customer_id: customerId,
            line_user_id: lineUserId,
            status: "CONNECTED",
            connected_at: now,
            last_error_at: null,
            last_error_message: null,
            updated_at: now,
          },
          { onConflict: "customer_id" },
        );

      await admin.from("customer_line_connect_tokens").update({ used_at: now }).eq("token", employerConnectToken);

      const custRes = await admin.from("customers").select("name").eq("id", customerId).maybeSingle();
      const name = String((custRes.data as any)?.name ?? "").trim() || "นายจ้าง";
      await replyText({ replyToken, text: `ผลการเชื่อมต่อ\nเชื่อมต่อสำเร็จ: ${name}` });
      continue;
    }

    const linkToken = extractLinkTokenFromText(text);
    if (!linkToken) {
      const cmd = parsePettyCashLineText(text);
      if (!cmd) continue;

      const profile = await fetchProfileByLineUserId(admin, lineUserId);
      const role = String(profile?.role ?? "");
      const profileId = String(profile?.id ?? "");
      if (!profileId) {
        await replyText({ replyToken, text: "ยังไม่เชื่อมบัญชี กรุณาเชื่อม LINE จากหน้า ตั้งค่าผู้ใช้" });
        continue;
      }
      if (!isAllowedPettyCashRole(role)) {
        await replyText({ replyToken, text: "ไม่มีสิทธิ์บันทึกเงินสดย่อย (อนุญาตเฉพาะ admin/operation)" });
        continue;
      }

      const pending = await getPending(admin, lineUserId);
      const msg = String(text ?? "").trim();

      if (pending) {
        const lower = msg.toLowerCase();
        const isCancel = lower === "ยกเลิก" || lower === "cancel";
        const isConfirm = lower === "ยืนยัน" || lower === "confirm";
        const pickNumber = msg.match(/^\d{1,2}$/) ? Number(msg) : NaN;
        const payload = (pending as any).payload ?? {};
        const suggestions = Array.isArray(payload?.suggestions) ? payload.suggestions.map((x: any) => String(x)) : [];
        const txn = payload?.txn;

        if (isCancel) {
          await markPending(admin, String(pending.id), "cancelled");
          await replyText({ replyToken, text: "ยกเลิกรายการที่รอยืนยันแล้ว" });
          continue;
        }

        if (isConfirm || (Number.isFinite(pickNumber) && pickNumber >= 1 && pickNumber <= suggestions.length)) {
          const categoryName = isConfirm ? "อื่นๆ" : String(suggestions[pickNumber - 1] ?? "อื่นๆ");
          try {
            await insertPettyCashTxn(admin, {
              profileId,
              lineUserId,
              txnType: String(txn?.txnType) === "TOP_UP" ? "TOP_UP" : "SPEND",
              amount: Number(txn?.amount ?? 0),
              occurredAt: String(txn?.occurredAt ?? ""),
              categoryName,
              title: String(txn?.title ?? "").trim(),
              referenceUrl: txn?.referenceUrl ? String(txn.referenceUrl) : null,
              rawText: String(txn?.rawText ?? ""),
            });
            await markPending(admin, String(pending.id), "used");
            const bal = await getPettyCashBalance(admin);
            await replyText({
              replyToken,
              text: `บันทึกแล้ว\nยอดคงเหลือ: ${money(bal)} บาท`,
            });
          } catch (e: any) {
            await replyText({ replyToken, text: e?.message ?? "บันทึกไม่สำเร็จ" });
          }
          continue;
        }

        await replyText({
          replyToken,
          text: formatCategoryConfirmMessage({
            input: String(payload?.categoryInput ?? "").trim() || "(ไม่ระบุ)",
            suggestions,
            allowedAll: Array.isArray(payload?.allowedAll) ? payload.allowedAll : null,
          }),
        });
        continue;
      }

      if (cmd.kind === "balance") {
        try {
          const bal = await getPettyCashBalance(admin);
          await replyText({ replyToken, text: `ยอดคงเหลือเงินสดย่อย: ${money(bal)} บาท` });
        } catch (e: any) {
          await replyText({ replyToken, text: e?.message ?? "ดึงยอดไม่สำเร็จ" });
        }
        continue;
      }

      if (cmd.kind === "summary") {
        try {
          const s = await getPettyCashSummary(admin);
          const lines: string[] = [];
          lines.push("สรุปเงินสดย่อย");
          lines.push(`ยอดคงเหลือ: ${money(s.balance)} บาท`);
          lines.push("──────────");
          lines.push(`วันนี้ • เติมเงิน ${money(s.todayTopUp)} • ใช้เงิน ${money(s.todaySpend)}`);
          lines.push(`เดือนนี้ • เติมเงิน ${money(s.monthTopUp)} • ใช้เงิน ${money(s.monthSpend)}`);
          await replyText({ replyToken, text: lines.join("\n") });
        } catch (e: any) {
          const msg = String(e?.message ?? "");
          if (msg.toLowerCase().includes("petty_cash_summary") && msg.toLowerCase().includes("does not exist")) {
            await replyText({ replyToken, text: "ระบบสรุป /pc ยังไม่พร้อมใช้งาน กรุณา apply migration petty_cash_summary_rpc.sql ใน Supabase ก่อน" });
          } else {
            await replyText({ replyToken, text: msg || "ดึงสรุปไม่สำเร็จ" });
          }
        }
        continue;
      }

      if (cmd.kind === "last") {
        const limit = Number.isFinite(cmd.limit) ? cmd.limit : 5;
        const res = await admin
          .from("petty_cash_transactions")
          .select("txn_type,amount,occurred_at,category_name,title")
          .order("occurred_at", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(limit);
        if (res.error) {
          await replyText({ replyToken, text: res.error.message });
          continue;
        }
        const rows = (res.data ?? []) as any[];
        if (!rows.length) {
          await replyText({ replyToken, text: "ยังไม่มีรายการเงินสดย่อย" });
          continue;
        }
        const lines: string[] = [];
        lines.push(`รายการล่าสุด ${rows.length} รายการ`);
        for (const r of rows) {
          const sign = String(r.txn_type) === "TOP_UP" ? "+" : "-";
          const cat = String(r.category_name ?? "-");
          const title = String(r.title ?? "").trim() || "-";
          const d = String(r.occurred_at ?? "-");
          lines.push(`${d} ${sign}${money(Number(r.amount ?? 0))} | ${cat} | ${title}`);
        }
        try {
          const bal = await getPettyCashBalance(admin);
          lines.push(`ยอดคงเหลือ: ${money(bal)} บาท`);
        } catch {
        }
        await replyText({ replyToken, text: lines.join("\n") });
        continue;
      }

      if (cmd.kind === "transaction") {
        const categories = await getActivePettyCashCategories(admin);
        const allowOther = categories.includes("อื่นๆ") ? "อื่นๆ" : (categories[categories.length - 1] ?? "อื่นๆ");
        const categoryInput = cmd.categoryInput;
        const resolved = resolvePettyCashCategory({ input: categoryInput, allowed: categories });
        const defaultCategory = cmd.txnType === "SPEND" ? allowOther : null;

        if (cmd.txnType === "SPEND" && categoryInput && !resolved.ok) {
          await createPending(admin, {
            lineUserId,
            payload: {
              categoryInput,
              suggestions: resolved.suggestions,
              allowedAll: categories,
              txn: {
                txnType: cmd.txnType,
                amount: cmd.amount,
                occurredAt: cmd.occurredAt,
                title: cmd.title,
                referenceUrl: cmd.referenceUrl,
                rawText: cmd.rawText,
              },
            },
          });
          await replyText({ replyToken, text: formatCategoryConfirmMessage({ input: categoryInput, suggestions: resolved.suggestions, allowedAll: categories }) });
          continue;
        }

        const categoryName = cmd.txnType === "SPEND" ? resolved.categoryName ?? defaultCategory : null;

        try {
          await insertPettyCashTxn(admin, {
            profileId,
            lineUserId,
            txnType: cmd.txnType,
            amount: cmd.amount,
            occurredAt: cmd.occurredAt,
            categoryName,
            title: cmd.title,
            referenceUrl: cmd.referenceUrl,
            rawText: cmd.rawText,
          });
          const bal = await getPettyCashBalance(admin);
          const verb = cmd.txnType === "TOP_UP" ? "เติมเงิน" : "ใช้เงิน";
          const cat = cmd.txnType === "SPEND" ? String(categoryName ?? "-") : "-";
          await replyText({
            replyToken,
            text: `บันทึกแล้ว\n${verb} ${money(cmd.amount)} บาท\nหมวด: ${cat}\nยอดคงเหลือ: ${money(bal)} บาท`,
          });
        } catch (e: any) {
          await replyText({ replyToken, text: e?.message ?? "บันทึกไม่สำเร็จ" });
        }
        continue;
      }

      continue;
    }

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
