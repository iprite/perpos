import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../_lib/supabase";
import { setAuditContext } from "../../_lib/audit";
import { recordMetric } from "@/lib/metrics";
import { requireAccountingMember, canWriteBackstage, accError, orgIdFromQuery } from "../_lib";
import { listAccounts } from "@/lib/accounting/accounts";

const ROUTE = "/api/accounting/accounts";
const VALID_TYPES = ["asset", "liability", "equity", "income", "expense"];

/** GET ?orgId=&activeOnly=&accountType= → ผังบัญชี */
export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const orgId = orgIdFromQuery(req);
  if (!orgId) return accError("missing orgId");

  const auth = await requireAccountingMember(req, orgId);
  if (!auth.ok) return auth.res;

  const p = req.nextUrl.searchParams;
  try {
    const data = await listAccounts(auth.rls, orgId, {
      activeOnly: p.get("activeOnly") === "1",
      accountType: p.get("accountType") ?? undefined,
    });
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 200, t0 });
    return NextResponse.json({ accounts: data });
  } catch (e) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return accError((e as Error).message, 500);
  }
}

/** POST → สร้างบัญชี (หลังบ้าน: accountant) */
export async function POST(req: NextRequest) {
  const t0 = Date.now();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = String(body.orgId ?? "");
  if (!orgId) return accError("missing orgId");

  const auth = await requireAccountingMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteBackstage(auth)) return accError("เฉพาะนักบัญชีเท่านั้นที่จัดการผังบัญชีได้", 403);

  const code = String(body.code ?? "").trim();
  const name = String(body.name ?? "").trim();
  const accountType = String(body.account_type ?? "");
  if (!code) return accError("กรุณากรอกเลขที่บัญชี");
  if (!name) return accError("กรุณากรอกชื่อบัญชี");
  if (!VALID_TYPES.includes(accountType)) return accError("ประเภทบัญชีไม่ถูกต้อง");

  await setAuditContext(req, auth.userId, orgId);
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("acc_accounts")
    .insert({
      org_id: orgId,
      code,
      name,
      account_type: accountType,
      parent_id: (body.parent_id as string) || null,
      is_active: body.is_active === undefined ? true : Boolean(body.is_active),
      is_system: false, // บัญชีที่ผู้ใช้สร้าง ลบได้
    })
    .select()
    .single();
  if (error) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    if ((error as { code?: string }).code === "23505") return accError("เลขที่บัญชีนี้มีอยู่แล้ว");
    return accError(error.message, 500);
  }
  void recordMetric({ orgId, route: ROUTE, method: req.method, status: 201, t0 });
  return NextResponse.json(data, { status: 201 });
}
