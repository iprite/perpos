import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../_lib/supabase";
import { setAuditContext } from "../../_lib/audit";
import { recordMetric } from "@/lib/metrics";
import { requireHrmMember, canWriteHrm, hrmError, orgIdFromQuery } from "../_lib";
import { listPayItems, listFunds, listAccountSettings } from "@/lib/hrm/settings";
import { listLeaveTypes } from "@/lib/hrm/leave";

const ROUTE = "/api/hrm/settings";

/** kind → table + writable fields whitelist (org_id/id/created_at จาก server) */
const KINDS = {
  pay_items: {
    table: "hrm_pay_items",
    fields: [
      "code",
      "name",
      "item_type",
      "is_recurring",
      "account_label",
      "ytd_type",
      "is_system",
      "active",
      "sort_order",
    ],
  },
  funds: {
    table: "hrm_funds",
    fields: [
      "fund_type",
      "name",
      "employee_rate",
      "employer_rate",
      "ceiling_wage",
      "active",
      "notes",
    ],
  },
  account_settings: {
    table: "hrm_account_settings",
    fields: ["setting_key", "account_label"],
  },
  leave_types: {
    table: "hrm_leave_types",
    fields: ["code", "name", "quota_days_per_year", "is_paid", "active"],
  },
} as const;

type Kind = keyof typeof KINDS;

function parseKind(v: string | null): Kind | null {
  return v && v in KINDS ? (v as Kind) : null;
}

/** GET ?orgId=&kind= → รายการตั้งค่าของชนิดนั้น (RLS) */
export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const orgId = orgIdFromQuery(req);
  if (!orgId) return hrmError("missing orgId");
  const kind = parseKind(req.nextUrl.searchParams.get("kind"));
  if (!kind) return hrmError("ระบุ kind (pay_items|funds|account_settings|leave_types)");

  const auth = await requireHrmMember(req, orgId);
  if (!auth.ok) return auth.res;

  try {
    let rows;
    if (kind === "pay_items") rows = await listPayItems(auth.rls, orgId);
    else if (kind === "funds") rows = await listFunds(auth.rls, orgId);
    else if (kind === "account_settings") rows = await listAccountSettings(auth.rls, orgId);
    else rows = await listLeaveTypes(auth.rls, orgId);
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 200, t0 });
    return NextResponse.json({ kind, items: rows });
  } catch (e) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return hrmError((e as Error).message, 500);
  }
}

function pickFields(kind: Kind, body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of KINDS[kind].fields) {
    if (body[f] === undefined) continue;
    let v = body[f];
    if (
      [
        "employee_rate",
        "employer_rate",
        "ceiling_wage",
        "quota_days_per_year",
        "sort_order",
      ].includes(f)
    ) {
      v = v === null || v === "" ? null : Number(v);
    }
    out[f] = v;
  }
  return out;
}

/** POST → สร้างรายการตั้งค่า (body: orgId, kind, ...fields) */
export async function POST(req: NextRequest) {
  const t0 = Date.now();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = String(body.orgId ?? "");
  const kind = parseKind(String(body.kind ?? ""));
  if (!orgId) return hrmError("missing orgId");
  if (!kind) return hrmError("ระบุ kind ที่ถูกต้อง");

  const auth = await requireHrmMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteHrm(auth.role)) return hrmError("ไม่มีสิทธิ์แก้ไขการตั้งค่า", 403);

  const patch = pickFields(kind, body);
  await setAuditContext(req, auth.userId, orgId);
  const admin = createAdminClient();
  const { data, error } = await admin
    .from(KINDS[kind].table)
    .insert({ ...patch, org_id: orgId })
    .select()
    .single();

  if (error) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return hrmError(error.message, 500);
  }
  void recordMetric({ orgId, route: ROUTE, method: req.method, status: 201, t0 });
  return NextResponse.json(data, { status: 201 });
}

/** PATCH → แก้ไขรายการตั้งค่า (body: orgId, kind, id, ...fields). ห้ามแก้ is_system row */
export async function PATCH(req: NextRequest) {
  const t0 = Date.now();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = String(body.orgId ?? "");
  const kind = parseKind(String(body.kind ?? ""));
  const id = String(body.id ?? "");
  if (!orgId || !id) return hrmError("missing orgId or id");
  if (!kind) return hrmError("ระบุ kind ที่ถูกต้อง");

  const auth = await requireHrmMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteHrm(auth.role)) return hrmError("ไม่มีสิทธิ์แก้ไขการตั้งค่า", 403);

  const patch = pickFields(kind, body);
  if (Object.keys(patch).length === 0) return hrmError("ไม่มีข้อมูลให้แก้ไข");

  await setAuditContext(req, auth.userId, orgId);
  const admin = createAdminClient();

  // กันแก้ pay_item ที่เป็นรายการระบบ (is_system) — ยอมแค่ toggle active
  if (kind === "pay_items") {
    const { data: row } = await admin
      .from("hrm_pay_items")
      .select("is_system")
      .eq("id", id)
      .eq("org_id", orgId)
      .maybeSingle();
    if ((row as { is_system?: boolean } | null)?.is_system) {
      const onlyActive = Object.keys(patch).length === 1 && "active" in patch;
      if (!onlyActive) return hrmError("รายการระบบแก้ไขไม่ได้ (ปรับได้เฉพาะเปิด/ปิดใช้งาน)", 403);
    }
  }

  const { data, error } = await admin
    .from(KINDS[kind].table)
    .update(patch)
    .eq("id", id)
    .eq("org_id", orgId)
    .select()
    .single();

  if (error) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return hrmError(error.message, 500);
  }
  void recordMetric({ orgId, route: ROUTE, method: req.method, status: 200, t0 });
  return NextResponse.json(data);
}
