import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../_lib/supabase";
import { setAuditContext } from "../../_lib/audit";
import { recordMetric } from "@/lib/metrics";
import { requireAccountingMember, canWriteFrontstage, accError, orgIdFromQuery } from "../_lib";
import { listContacts } from "@/lib/accounting/contacts";

const ROUTE = "/api/accounting/contacts";

/** GET ?orgId=&kind=&search= → รายชื่อผู้ติดต่อ */
export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const orgId = orgIdFromQuery(req);
  if (!orgId) return accError("missing orgId");

  const auth = await requireAccountingMember(req, orgId);
  if (!auth.ok) return auth.res;

  const p = req.nextUrl.searchParams;
  try {
    const data = await listContacts(auth.rls, orgId, {
      kind: p.get("kind") ?? undefined,
      search: p.get("search") ?? undefined,
    });
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 200, t0 });
    return NextResponse.json({ contacts: data });
  } catch (e) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return accError((e as Error).message, 500);
  }
}

/** POST → สร้างผู้ติดต่อ (หน้าบ้าน: owner/accountant/staff) */
export async function POST(req: NextRequest) {
  const t0 = Date.now();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = String(body.orgId ?? "");
  if (!orgId) return accError("missing orgId");

  const auth = await requireAccountingMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteFrontstage(auth.role)) return accError("ไม่มีสิทธิ์บันทึกข้อมูล", 403);

  const kind = String(body.kind ?? "");
  const name = String(body.name ?? "").trim();
  if (!name) return accError("กรุณากรอกชื่อผู้ติดต่อ");
  if (!["customer", "vendor", "both"].includes(kind)) return accError("ประเภทผู้ติดต่อไม่ถูกต้อง");

  await setAuditContext(req, auth.userId, orgId);
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("acc_contacts")
    .insert({
      org_id: orgId,
      kind,
      name,
      tax_id: (body.tax_id as string) || null,
      branch: (body.branch as string) || null,
      address: (body.address as string) || null,
      phone: (body.phone as string) || null,
      email: (body.email as string) || null,
    })
    .select()
    .single();
  if (error) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return accError(error.message, 500);
  }
  void recordMetric({ orgId, route: ROUTE, method: req.method, status: 201, t0 });
  return NextResponse.json(data, { status: 201 });
}
