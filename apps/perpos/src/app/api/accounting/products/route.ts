import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../_lib/supabase";
import { setAuditContext } from "../../_lib/audit";
import { recordMetric } from "@/lib/metrics";
import {
  requireAccountingMember,
  canWriteFrontstage,
  accError,
  orgIdFromQuery,
  num,
} from "../_lib";
import { listProducts } from "@/lib/accounting/products";

const ROUTE = "/api/accounting/products";

/** GET ?orgId=&kind=&search=&activeOnly= → รายการสินค้า/บริการ */
export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const orgId = orgIdFromQuery(req);
  if (!orgId) return accError("missing orgId");

  const auth = await requireAccountingMember(req, orgId);
  if (!auth.ok) return auth.res;

  const p = req.nextUrl.searchParams;
  try {
    const data = await listProducts(auth.rls, orgId, {
      kind: p.get("kind") ?? undefined,
      search: p.get("search") ?? undefined,
      activeOnly: p.get("activeOnly") === "1",
    });
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 200, t0 });
    return NextResponse.json({ products: data });
  } catch (e) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return accError((e as Error).message, 500);
  }
}

/** POST → สร้างสินค้า/บริการ (หน้าบ้าน) */
export async function POST(req: NextRequest) {
  const t0 = Date.now();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = String(body.orgId ?? "");
  if (!orgId) return accError("missing orgId");

  const auth = await requireAccountingMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteFrontstage(auth)) return accError("ไม่มีสิทธิ์บันทึกข้อมูล", 403);

  const kind = String(body.kind ?? "");
  const name = String(body.name ?? "").trim();
  if (!name) return accError("กรุณากรอกชื่อสินค้า/บริการ");
  if (!["good", "service"].includes(kind)) return accError("ประเภทไม่ถูกต้อง");

  await setAuditContext(req, auth.userId, orgId);
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("acc_products")
    .insert({
      org_id: orgId,
      kind,
      code: (body.code as string) || null,
      name,
      unit: (body.unit as string) || null,
      unit_price: num(body.unit_price, { nonNeg: true }),
      is_active: body.is_active === undefined ? true : Boolean(body.is_active),
      description: (body.description as string) || null,
    })
    .select()
    .single();
  if (error) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    // 23505 = code ซ้ำใน org
    if ((error as { code?: string }).code === "23505") return accError("รหัสสินค้านี้มีอยู่แล้ว");
    return accError(error.message, 500);
  }
  void recordMetric({ orgId, route: ROUTE, method: req.method, status: 201, t0 });
  return NextResponse.json(data, { status: 201 });
}
