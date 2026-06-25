import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../_lib/supabase";
import { setAuditContext } from "../../_lib/audit";
import { recordMetric } from "@/lib/metrics";
import { requireHrmMember, canWriteHrm, hrmError, orgIdFromQuery, employeeInOrg } from "../_lib";
import { listDocuments } from "@/lib/hrm/documents";
import type { DocType } from "@/lib/hrm/types";

const ROUTE = "/api/hrm/documents";
const VALID_DOC_TYPES: DocType[] = ["payslip", "salary_cert", "contract", "other"];

/** GET ?orgId=[&employeeId=&docType=] → เอกสาร HR (RLS) */
export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const orgId = orgIdFromQuery(req);
  if (!orgId) return hrmError("missing orgId");

  const auth = await requireHrmMember(req, orgId);
  if (!auth.ok) return auth.res;

  const p = req.nextUrl.searchParams;
  try {
    const docs = await listDocuments(auth.rls, orgId, {
      employeeId: p.get("employeeId") ?? undefined,
      docType: (p.get("docType") as DocType) || undefined,
    });
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 200, t0 });
    return NextResponse.json({ documents: docs });
  } catch (e) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return hrmError((e as Error).message, 500);
  }
}

/** POST → สร้างเอกสาร (metadata; การสร้างไฟล์ PDF/storage = follow-up B0 เลื่อน) */
export async function POST(req: NextRequest) {
  const t0 = Date.now();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = String(body.orgId ?? "");
  if (!orgId) return hrmError("missing orgId");

  const auth = await requireHrmMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteHrm(auth.role)) return hrmError("ไม่มีสิทธิ์สร้างเอกสาร", 403);

  const employee_id = String(body.employee_id ?? "");
  const doc_type = String(body.doc_type ?? "") as DocType;
  const title = String(body.title ?? "").trim();
  if (!employee_id || !title) return hrmError("ระบุพนักงานและชื่อเอกสาร");
  if (!VALID_DOC_TYPES.includes(doc_type)) return hrmError("ประเภทเอกสารไม่ถูกต้อง");

  await setAuditContext(req, auth.userId, orgId);
  const admin = createAdminClient();
  if (!(await employeeInOrg(admin, orgId, employee_id))) {
    return hrmError("ไม่พบพนักงานในองค์กรนี้", 404);
  }
  const { data, error } = await admin
    .from("hrm_documents")
    .insert({
      org_id: orgId,
      employee_id,
      doc_type,
      title,
      issued_date: (body.issued_date as string) || null,
      ref_run_id: (body.ref_run_id as string) || null,
      storage_path: (body.storage_path as string) || null,
      status: (body.status as string) === "issued" ? "issued" : "draft",
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
