/**
 * /api/acc-firm/client-line-group — กลุ่ม LINE ของลูกค้า (acc_firm)
 *
 * GET    ?orgId=<firmOrgId>                 → สถานะกลุ่มของลูกค้าทุกรายในทะเบียน
 * POST   { orgId, serviceClientId, action } → 'code' สร้างรหัสเชื่อมกลุ่ม
 *                                             'unlink' เลิกเชื่อม
 *                                             'send' ส่งข้อความเข้ากลุ่ม (announce/billing)
 * PATCH  { orgId, serviceClientId, notify }  → เปิด/ปิดหัวข้อที่จะส่ง
 *
 * สิทธิ์: สมาชิกโมดูล acc_firm ของ firm org · viewer แก้/ส่งไม่ได้ (เหมือนทะเบียนลูกค้า)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireModuleMember } from "../../_lib/module-auth";
import { createAdminClient } from "../../_lib/supabase";
import {
  CLIENT_LINE_EVENTS,
  EVENT_LABEL,
  buildUpdateFlex,
  getOrCreateGroupRow,
  issuePairCode,
  notifyClientGroup,
  unlinkClientGroup,
  type ClientLineEvent,
} from "@/lib/acc-firm/line-group";
import { sendLineMessages } from "@/lib/line/send-messages";

const NOTIFY_KEYS = [
  "notify_doc_received",
  "notify_tax_due",
  "notify_tax_filed",
  "notify_billing",
  "notify_announce",
] as const;

/** ลูกค้ารายนี้อยู่ในทะเบียนของ firm นี้จริงไหม (กัน IDOR ข้ามสำนักงาน) */
async function assertClient(
  admin: ReturnType<typeof createAdminClient>,
  firmOrgId: string,
  serviceClientId: string,
): Promise<{ id: string; company_name: string } | null> {
  const { data } = await admin
    .from("acc_firm_service_clients")
    .select("id, company_name")
    .eq("id", serviceClientId)
    .eq("firm_org_id", firmOrgId)
    .maybeSingle();
  return (data as { id: string; company_name: string }) ?? null;
}

export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("orgId");
  if (!orgId) return NextResponse.json({ error: "missing orgId" }, { status: 400 });

  const auth = await requireModuleMember(req, orgId, "acc_firm");
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("acc_firm_client_line_groups")
    .select("*")
    .eq("firm_org_id", orgId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ rows: data ?? [] });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const orgId = typeof body?.orgId === "string" ? body.orgId : "";
  const serviceClientId = typeof body?.serviceClientId === "string" ? body.serviceClientId : "";
  const action = typeof body?.action === "string" ? body.action : "";
  if (!orgId || !serviceClientId)
    return NextResponse.json({ error: "missing orgId หรือ serviceClientId" }, { status: 400 });

  const auth = await requireModuleMember(req, orgId, "acc_firm");
  if (!auth.ok) return auth.res;
  if (auth.moduleRole === "viewer")
    return NextResponse.json({ error: "ไม่มีสิทธิ์จัดการกลุ่ม LINE ของลูกค้า" }, { status: 403 });

  const admin = createAdminClient();
  const client = await assertClient(admin, orgId, serviceClientId);
  if (!client) return NextResponse.json({ error: "ไม่พบลูกค้ารายนี้" }, { status: 404 });

  try {
    if (action === "code") {
      const { code, expiresAt } = await issuePairCode(admin, orgId, serviceClientId, auth.userId);
      return NextResponse.json({ code, expiresAt });
    }

    if (action === "unlink") {
      const gid = await unlinkClientGroup(admin, orgId, serviceClientId);
      if (gid) {
        await sendLineMessages({
          to: gid,
          messages: [
            {
              type: "text",
              text: "🔌 สำนักงานบัญชีเลิกเชื่อมกลุ่มนี้กับระบบแล้ว — กลุ่มนี้จะไม่ได้รับอัปเดตอัตโนมัติอีก",
            },
          ],
        });
      }
      return NextResponse.json({ ok: true });
    }

    if (action === "send") {
      const event = (typeof body?.event === "string" ? body.event : "announce") as ClientLineEvent;
      if (!CLIENT_LINE_EVENTS.includes(event) || (event !== "announce" && event !== "billing"))
        return NextResponse.json(
          { error: "ส่งเองได้เฉพาะประกาศและแจ้งค่าบริการ" },
          { status: 400 },
        );

      const message = typeof body?.message === "string" ? body.message.trim() : "";
      if (!message) return NextResponse.json({ error: "ระบุข้อความที่จะส่ง" }, { status: 400 });
      if (message.length > 1500)
        return NextResponse.json({ error: "ข้อความยาวเกิน 1,500 ตัวอักษร" }, { status: 400 });

      const res = await notifyClientGroup(admin, {
        serviceClientId,
        event,
        summary: message.slice(0, 200),
        sentBy: auth.userId,
        messages: [
          buildUpdateFlex({
            title: event === "billing" ? "💳 แจ้งค่าบริการ" : "📣 ประกาศจากสำนักงานบัญชี",
            companyName: client.company_name,
            lines: [message],
            footnote: "ข้อความนี้ส่งจากระบบของสำนักงานบัญชี",
          }),
        ],
      });

      if (!res.sent) {
        const reason =
          res.reason === "not_linked"
            ? "ยังไม่ได้เชื่อมกลุ่ม LINE ของลูกค้ารายนี้"
            : res.reason === "muted"
              ? `ปิดการแจ้ง "${EVENT_LABEL[event]}" ของลูกค้ารายนี้อยู่`
              : (res.error ?? "ส่งไม่สำเร็จ");
        return NextResponse.json({ error: reason }, { status: 409 });
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "action ไม่ถูกต้อง" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message ?? e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const orgId = typeof body?.orgId === "string" ? body.orgId : "";
  const serviceClientId = typeof body?.serviceClientId === "string" ? body.serviceClientId : "";
  if (!orgId || !serviceClientId)
    return NextResponse.json({ error: "missing orgId หรือ serviceClientId" }, { status: 400 });

  const auth = await requireModuleMember(req, orgId, "acc_firm");
  if (!auth.ok) return auth.res;
  if (auth.moduleRole === "viewer")
    return NextResponse.json({ error: "ไม่มีสิทธิ์แก้ไขการแจ้งเตือน" }, { status: 403 });

  const admin = createAdminClient();
  if (!(await assertClient(admin, orgId, serviceClientId)))
    return NextResponse.json({ error: "ไม่พบลูกค้ารายนี้" }, { status: 404 });

  const patch: Record<string, boolean> = {};
  const notify = (body?.notify ?? {}) as Record<string, unknown>;
  for (const k of NOTIFY_KEYS) if (typeof notify[k] === "boolean") patch[k] = notify[k] as boolean;
  if (!Object.keys(patch).length)
    return NextResponse.json({ error: "ไม่มีค่าที่จะแก้" }, { status: 400 });

  // แถวอาจยังไม่มี (ยังไม่เคยสร้างรหัส) → สร้างก่อนแล้วค่อยอัปเดต
  await getOrCreateGroupRow(admin, orgId, serviceClientId, auth.userId);

  const { data, error } = await admin
    .from("acc_firm_client_line_groups")
    .update(patch)
    .eq("service_client_id", serviceClientId)
    .eq("firm_org_id", orgId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}
