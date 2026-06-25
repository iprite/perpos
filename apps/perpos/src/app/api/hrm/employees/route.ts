import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../_lib/supabase";
import { setAuditContext } from "../../_lib/audit";
import { recordMetric } from "@/lib/metrics";
import { requireHrmMember, canWriteHrm, hrmError, orgIdFromQuery } from "../_lib";
import { listEmployees } from "@/lib/hrm/employees";
import type { EmployeeStatus } from "@/lib/hrm/types";

const ROUTE = "/api/hrm/employees";

/** GET ?orgId=[&status=&search=] → รายชื่อพนักงาน (RLS) */
export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const orgId = orgIdFromQuery(req);
  if (!orgId) return hrmError("missing orgId");

  const auth = await requireHrmMember(req, orgId);
  if (!auth.ok) return auth.res;

  const p = req.nextUrl.searchParams;
  try {
    const rows = await listEmployees(auth.rls, orgId, {
      status: (p.get("status") as EmployeeStatus | "all") || "all",
      search: p.get("search") ?? undefined,
    });
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 200, t0 });
    return NextResponse.json({ employees: rows });
  } catch (e) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return hrmError((e as Error).message, 500);
  }
}

/** ฟิลด์ที่อนุญาตให้เขียน (whitelist — org_id/id/created_at มาจาก server) */
const WRITABLE = [
  "employee_code",
  "first_name",
  "last_name",
  "department_tag",
  "position",
  "employment_type",
  "base_salary",
  "tax_id",
  "ssn",
  "bank_name",
  "bank_account",
  "phone",
  "birth_date",
  "start_date",
  "probation_end_date",
  "contract_end_date",
  "end_date",
  "status",
] as const;

const DATE_FIELDS = new Set([
  "birth_date",
  "start_date",
  "probation_end_date",
  "contract_end_date",
  "end_date",
]);

function pickWritable(body: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const k of WRITABLE) {
    if (body[k] === undefined) continue;
    let v = body[k];
    if (k === "base_salary") v = Number(v) || 0;
    else if (DATE_FIELDS.has(k)) v = (v as string) || null;
    else if (typeof v === "string")
      v =
        v.trim() || (k === "employee_code" || k === "first_name" || k === "last_name" ? "" : null);
    patch[k] = v;
  }
  return patch;
}

/** POST → สร้างพนักงาน */
export async function POST(req: NextRequest) {
  const t0 = Date.now();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = String(body.orgId ?? "");
  if (!orgId) return hrmError("missing orgId");

  const auth = await requireHrmMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteHrm(auth.role)) return hrmError("ไม่มีสิทธิ์เพิ่มพนักงาน", 403);

  const patch = pickWritable(body);
  if (!patch.employee_code || !patch.first_name || !patch.last_name) {
    return hrmError("กรุณากรอกรหัสพนักงาน ชื่อ และนามสกุล");
  }

  await setAuditContext(req, auth.userId, orgId);
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("hrm_employees")
    .insert({
      ...patch,
      org_id: orgId, // จาก auth — ไม่เชื่อ client
      employment_type: patch.employment_type ?? "monthly",
      status: patch.status ?? "active",
    })
    .select()
    .single();

  if (error) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return hrmError(error.message, 500);
  }
  void recordMetric({ orgId, route: ROUTE, method: req.method, status: 201, t0 });
  return NextResponse.json(data, { status: 201 });
}

/** PATCH → แก้ไขพนักงาน (body: orgId, id, ...fields) */
export async function PATCH(req: NextRequest) {
  const t0 = Date.now();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = String(body.orgId ?? "");
  const id = String(body.id ?? "");
  if (!orgId || !id) return hrmError("missing orgId or id");

  const auth = await requireHrmMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteHrm(auth.role)) return hrmError("ไม่มีสิทธิ์แก้ไขพนักงาน", 403);

  const patch = pickWritable(body);
  if (Object.keys(patch).length === 0) return hrmError("ไม่มีข้อมูลให้แก้ไข");

  await setAuditContext(req, auth.userId, orgId);
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("hrm_employees")
    .update(patch)
    .eq("id", id)
    .eq("org_id", orgId) // กันแก้ข้าม org
    .select()
    .single();

  if (error) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return hrmError(error.message, 500);
  }
  void recordMetric({ orgId, route: ROUTE, method: req.method, status: 200, t0 });
  return NextResponse.json(data);
}
