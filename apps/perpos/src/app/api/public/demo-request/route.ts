/**
 * Public lead-capture — ฟอร์ม "ขอเดโม Suite" จากหน้า landing (www.perpos.ai)
 *   POST /api/public/demo-request
 *     body { name, phone, product?, source?, note?, company_website? (honeypot) }
 *     → insert demo_requests + push LINE แจ้ง super_admin → { ok: true }
 *
 * Public (ไม่มี auth) + CORS ให้เฉพาะ origin ของ landing · กัน spam ด้วย honeypot
 * + dedup เบอร์เดิมภายใน 10 นาที · เขียนผ่าน service role (RLS deny-all)
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../_lib/supabase";
import { sendLineMessages } from "@/lib/line/send-messages";

export const runtime = "nodejs";

const ALLOWED_ORIGINS = new Set([
  "https://www.perpos.ai",
  "https://perpos.ai",
  "http://localhost:3000",
]);

const PRODUCT_LABEL: Record<string, string> = { suite: "Suite", flow: "Flow" };

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://www.perpos.ai";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

export async function POST(req: NextRequest) {
  const cors = corsHeaders(req.headers.get("origin"));
  const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: cors });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return json({ ok: false, error: "invalid_body" }, 400);

  // honeypot: บอทมักกรอกช่องนี้ — ถ้ามีค่า ตอบ ok เฉย ๆ ไม่บันทึก/ไม่แจ้ง
  if (typeof body.company_website === "string" && body.company_website.trim()) {
    return json({ ok: true });
  }

  const name = String(body.name ?? "")
    .trim()
    .slice(0, 120);
  const phone = String(body.phone ?? "")
    .trim()
    .slice(0, 40);
  const product = body.product === "flow" ? "flow" : "suite";
  const source =
    String(body.source ?? "landing")
      .trim()
      .slice(0, 60) || "landing";
  const note = body.note ? String(body.note).trim().slice(0, 500) : null;

  if (!name) return json({ ok: false, error: "missing_name" }, 400);
  if (phone.replace(/\D/g, "").length < 6) return json({ ok: false, error: "invalid_phone" }, 400);

  const admin = createAdminClient();

  // dedup: เบอร์เดิม + product เดิม ภายใน 10 นาที → ถือว่าส่งซ้ำ ตอบ ok ไม่แจ้งซ้ำ
  const tenMinAgo = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data: dup } = await admin
    .from("demo_requests")
    .select("id")
    .eq("phone", phone)
    .eq("product", product)
    .gte("created_at", tenMinAgo)
    .limit(1);
  if (dup && dup.length) return json({ ok: true });

  const { error } = await admin.from("demo_requests").insert({
    name,
    phone,
    product,
    source,
    note,
    user_agent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
  });
  if (error) return json({ ok: false, error: "save_failed" }, 500);

  // แจ้ง super_admin ทาง LINE (best-effort — ไม่ให้ล้มทั้ง request ถ้า push พลาด)
  notifySuperAdmins({ admin, name, phone, product, note }).catch(() => {});

  return json({ ok: true });
}

async function notifySuperAdmins(args: {
  admin: ReturnType<typeof createAdminClient>;
  name: string;
  phone: string;
  product: string;
  note: string | null;
}) {
  const { admin, name, phone, product, note } = args;
  const { data: admins } = await admin
    .from("profiles")
    .select("line_user_id")
    .eq("role", "super_admin")
    .not("line_user_id", "is", null);
  if (!admins?.length) return;

  const base = process.env.APP_BASE_URL ?? "https://app.perpos.ai";
  const label = PRODUCT_LABEL[product] ?? product;
  const lines = [
    `🔔 ลูกค้าขอเดโม PERPOS ${label}`,
    "",
    `ชื่อ: ${name}`,
    `โทร: ${phone}`,
    note ? `โน้ต: ${note}` : null,
    "",
    `ดูทั้งหมด: ${base}/admin/leads`,
  ].filter(Boolean);
  const text = lines.join("\n");

  await Promise.all(
    admins.map((a) =>
      sendLineMessages({
        to: a.line_user_id as string,
        messages: [{ type: "text", text }],
      }).catch(() => {}),
    ),
  );
}
