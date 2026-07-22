import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../_lib/supabase";
import { setAuditContext } from "../../_lib/audit";
import { requireGovProcureMember, canManageSettings, orgIdFromQuery, govError } from "../_lib";
import { listInvestors } from "@/lib/gov-procure/capital";

// GET /api/gov-procure/investors?orgId=... → รายชื่อนักลงทุน (member ทุก role อ่านได้ — เห็นชุดเดียวกัน)
export async function GET(req: NextRequest) {
  const orgId = orgIdFromQuery(req);
  if (!orgId) return govError("missing orgId");

  const auth = await requireGovProcureMember(req, orgId);
  if (!auth.ok) return auth.res;

  try {
    return NextResponse.json({ investors: await listInvestors(createAdminClient(), orgId) });
  } catch (e) {
    return govError((e as Error).message, 500);
  }
}

const WRITABLE = ["name", "share_pct", "profile_id", "is_active", "note"] as const;

function pickPatch(body: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const key of WRITABLE) if (key in body) patch[key] = body[key];
  if ("share_pct" in patch) {
    const pct = Number(patch.share_pct);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100)
      throw new Error("สัดส่วนต้องอยู่ระหว่าง 0–100");
    patch.share_pct = pct;
  }
  if ("name" in patch) {
    const name = String(patch.name ?? "").trim();
    if (!name) throw new Error("กรุณากรอกชื่อนักลงทุน");
    patch.name = name;
  }
  return patch;
}

// POST /api/gov-procure/investors?orgId=... → เพิ่มนักลงทุน (owner/manager)
export async function POST(req: NextRequest) {
  const orgId = orgIdFromQuery(req);
  if (!orgId) return govError("missing orgId");

  const auth = await requireGovProcureMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canManageSettings(auth.role)) return govError("ไม่มีสิทธิ์จัดการนักลงทุน", 403);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  let patch: Record<string, unknown>;
  try {
    patch = pickPatch(body);
  } catch (e) {
    return govError((e as Error).message);
  }
  if (!patch.name) return govError("กรุณากรอกชื่อนักลงทุน");

  const admin = createAdminClient();
  await setAuditContext(req, auth.userId, orgId);

  const { data, error } = await admin
    .from("gov_procure_investors")
    .insert({ org_id: orgId, ...patch })
    .select()
    .single();

  if (error) return govError(error.message, 500);
  return NextResponse.json({ investor: data });
}

// PUT /api/gov-procure/investors?orgId=...&id=... → แก้ไขนักลงทุน (owner/manager)
export async function PUT(req: NextRequest) {
  const orgId = orgIdFromQuery(req);
  if (!orgId) return govError("missing orgId");
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return govError("missing id");

  const auth = await requireGovProcureMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canManageSettings(auth.role)) return govError("ไม่มีสิทธิ์จัดการนักลงทุน", 403);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  let patch: Record<string, unknown>;
  try {
    patch = pickPatch(body);
  } catch (e) {
    return govError((e as Error).message);
  }
  if (Object.keys(patch).length === 0) return govError("ไม่มีข้อมูลที่แก้ไขได้");

  const admin = createAdminClient();
  await setAuditContext(req, auth.userId, orgId);

  const { data, error } = await admin
    .from("gov_procure_investors")
    .update(patch)
    .eq("id", id)
    .eq("org_id", orgId)
    .select()
    .maybeSingle();

  if (error) return govError(error.message, 500);
  if (!data) return govError("ไม่พบนักลงทุนนี้", 404);
  return NextResponse.json({ investor: data });
}
