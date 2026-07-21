import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../../_lib/auth";
import { createAdminClient } from "../../../_lib/supabase";

const SHADOW_DOMAIN = "@stt-line.perpos.io";

/**
 * Super admin — รายชื่อผู้ใช้ทั้งหมด (LINE-first) แบบรวมศูนย์
 * รวมข้อมูล: profile (รูป+ชื่อ), org memberships (Biz), โควต้าผู้ช่วย AI (STT)
 * ใช้ profiles เป็นแหล่งข้อมูลหลัก — ทุกคนสมัครผ่าน LINE
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();

  const { data: profiles, error } = await admin
    .from("profiles")
    .select(
      "id, display_name, email, role, is_active, line_user_id, line_picture_url, personal_org_id, created_at, last_seen_at",
    )
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = profiles ?? [];
  const ids = rows.map((p) => p.id as string);

  // personal/home org ของผู้ช่วย AI (B2C) — ไม่นับเป็นองค์กร Biz (ERP)
  const personalOrgIds = new Set(
    rows.map((p) => p.personal_org_id as string | null).filter((v): v is string => !!v),
  );

  // ── รูปโปรไฟล์ LINE — backfill ที่ยังไม่มี (ผู้ใช้เก่าก่อนเก็บรูป) ────────────
  const pictureById = new Map<string, string | null>();
  for (const p of rows)
    pictureById.set(p.id as string, (p.line_picture_url as string | null) ?? null);
  const missing = rows.filter((p) => !p.line_picture_url && p.line_user_id).slice(0, 50);
  if (missing.length) {
    const token = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN ?? "";
    await Promise.all(
      missing.map(async (p) => {
        try {
          const res = await fetch(`https://api.line.me/v2/bot/profile/${p.line_user_id}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) return;
          const j = (await res.json()) as { pictureUrl?: string };
          const url = j.pictureUrl ?? null;
          if (url) {
            pictureById.set(p.id as string, url);
            await admin
              .from("profiles")
              .update({ line_picture_url: url })
              .eq("id", p.id as string);
          }
        } catch {
          /* ignore — รูปไม่ใช่ของสำคัญ */
        }
      }),
    );
  }

  // ── org memberships (Biz) + รายชื่อ org + เครดิต token + การใช้บริการผู้ช่วย ──
  // การใช้งานผู้ช่วย (Flow) = มิเตอร์จาก token_ledger (debit) แยกตาม service:
  //   stt (วินาที→นาที), bot=บอทเข้าประชุม (วินาที→นาที), pdf (หน้า)
  const [membersRes, orgsRes, tokenRes, ledgerRes, ratesRes] = await Promise.all([
    ids.length
      ? admin
          .from("organization_members")
          .select("user_id, organization_id, role, organizations(name)")
          .in("user_id", ids)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    admin.from("organizations").select("id, name").order("name"),
    ids.length
      ? admin.from("token_accounts").select("profile_id, balance_tokens").in("profile_id", ids)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    ids.length
      ? admin
          .from("token_ledger")
          .select("profile_id, service, tokens, created_at")
          .eq("kind", "debit")
          .in("profile_id", ids)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    admin.from("token_rates").select("service, tokens_per_unit"),
  ]);

  // อัตราแปลง token → หน่วยจริง (ปัจจุบัน) — stt/bot คิดเป็นวินาที, pdf คิดเป็นหน้า
  const ratePerUnit: Record<string, number> = { stt: 0, bot: 0, pdf: 0 };
  for (const r of (ratesRes.data ?? []) as Record<string, unknown>[]) {
    ratePerUnit[String(r.service)] = Number(r.tokens_per_unit) || 0;
  }

  // รวมการใช้บริการต่อผู้ใช้ (จาก token ที่ใช้ไป ÷ อัตรา → หน่วยจริง) + วันล่าสุด
  type UsageAgg = {
    sttSeconds: number;
    botSeconds: number;
    pdfPages: number;
    lastUsed: string | null;
  };
  const usageById = new Map<string, UsageAgg>();
  for (const l of (ledgerRes.data ?? []) as Record<string, unknown>[]) {
    const pid = String(l.profile_id);
    const service = String(l.service ?? "");
    const usedTokens = Math.abs(Number(l.tokens) || 0); // debit เก็บเป็นค่าลบ
    const rate = ratePerUnit[service] || 0;
    if (rate <= 0) continue;
    const units = usedTokens / rate;
    const cur = usageById.get(pid) ?? { sttSeconds: 0, botSeconds: 0, pdfPages: 0, lastUsed: null };
    if (service === "stt") cur.sttSeconds += units;
    else if (service === "bot") cur.botSeconds += units;
    else if (service === "pdf") cur.pdfPages += units;
    const ts = l.created_at ? String(l.created_at) : null;
    if (ts && (!cur.lastUsed || ts > cur.lastUsed)) cur.lastUsed = ts;
    usageById.set(pid, cur);
  }

  const orgsByUser = new Map<string, { orgId: string; orgName: string; role: string }[]>();
  for (const m of (membersRes.data ?? []) as Record<string, unknown>[]) {
    const orgId = String(m.organization_id);
    if (personalOrgIds.has(orgId)) continue; // home org ของผู้ช่วย AI — ไม่ใช่องค์กร Biz
    const uid = String(m.user_id);
    const list = orgsByUser.get(uid) ?? [];
    list.push({
      orgId,
      orgName: String((m.organizations as Record<string, unknown>)?.name ?? ""),
      role: String(m.role),
    });
    orgsByUser.set(uid, list);
  }

  const balanceById = new Map<string, number>();
  for (const t of (tokenRes.data ?? []) as Record<string, unknown>[]) {
    balanceById.set(String(t.profile_id), Number(t.balance_tokens));
  }

  const items = rows.map((p) => {
    const email = String(p.email ?? "");
    // shadow email (line.<id>@stt-line.perpos.io) = ไม่มีอีเมลจริง — login ผ่าน LINE เท่านั้น
    const realEmail = email !== "" && !email.endsWith(SHADOW_DOMAIN) ? email : null;
    return {
      id: p.id,
      display_name: (p.display_name as string | null) ?? "ผู้ใช้ LINE",
      picture_url: pictureById.get(p.id as string) ?? null,
      email: realEmail,
      role: p.role,
      is_active: p.is_active !== false,
      line_linked: !!p.line_user_id,
      line_user_id: (p.line_user_id as string | null) ?? null,
      created_at: p.created_at,
      last_seen_at: (p.last_seen_at as string | null) ?? null,
      orgs: orgsByUser.get(p.id as string) ?? [],
      tokens: { balance: balanceById.get(p.id as string) ?? 0 },
      usage: usageById.get(p.id as string) ?? {
        sttSeconds: 0,
        botSeconds: 0,
        pdfPages: 0,
        lastUsed: null,
      },
    };
  });

  // ตัด personal/home org ออกจากตัวเลือก "เพิ่มองค์กร" — เหลือเฉพาะองค์กร Biz จริง
  const allOrgs = (orgsRes.data ?? []).filter(
    (o) => !personalOrgIds.has(String((o as { id: string }).id)),
  );

  return NextResponse.json({ ok: true, items, allOrgs });
}
