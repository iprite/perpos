/**
 * ร่องรอยการแก้บัญชีของลูกค้า — ฝั่งสำนักงานบัญชี
 *
 * ตอบคำถาม "ทีมเราไปแตะบัญชีของลูกค้ารายไหน ทำอะไร เมื่อไร" ซึ่งเป็นหน้าที่ของสำนักงาน
 * ต้องตอบลูกค้าได้ (และเป็นหลักฐานเวลาถูกถามย้อนหลัง)
 *
 * SSR searchParams-driven ตาม SERVER_COMPONENT_PATTERN (list + filter + แบ่งหน้า)
 * guard = member ของ module acc_firm + ข้อมูลวิ่งผ่าน RPC ที่บังคับขอบเขตด้วย
 * acc_firm_has_client_access() เอง — ไม่ใช้ service-role กับข้อมูล per-org
 */

import { notFound } from "next/navigation";
import { History } from "lucide-react";

import { StatusBadge, type BadgeTone } from "@/components/ui/badge";
import { PageShell } from "@/components/ui/page-shell";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
} from "@/components/ui/table";
import { LinkTablePager } from "@/components/ui/table-pager";
import { listFirmAudit, FIRM_AUDIT_PAGE_SIZE, type FirmAuditRow } from "@/lib/acc-firm/audit";
import { listFirmClientOrgsForCurrentUser } from "@/lib/acc-firm/firm-clients";
import {
  getModuleRoleForCurrentUser,
  getOrganizationsForCurrentUser,
} from "@/lib/accounting/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { FirmAuditFilters } from "./_filters";

export const dynamic = "force-dynamic";

const ACTION_TONE: Record<string, BadgeTone> = {
  INSERT: "success",
  UPDATE: "info",
  DELETE: "danger",
};

/** ชื่อการกระทำเป็นภาษาคน — ที่ไม่รู้จักให้โชว์ค่าดิบไว้ ดีกว่าซ่อน */
const ACTION_LABEL: Record<string, string> = {
  "journal.create": "สร้างรายการสมุดรายวัน",
  "journal.update": "แก้รายการสมุดรายวัน",
  "journal.post": "ลงบัญชี",
  "journal.void": "ยกเลิกรายการสมุดรายวัน",
  "document.create": "ออกเอกสารขาย",
  "document.update": "แก้เอกสารขาย",
  "document.convert": "แปลงเอกสาร",
  "document.delete": "ลบเอกสาร",
  "document.soft_delete": "ลบเอกสาร (เก็บหลักฐาน)",
  "document.share_create": "สร้างลิงก์ส่งเอกสาร",
  "document.share_revoke": "เพิกถอนลิงก์เอกสาร",
  "purchase_document.create": "บันทึกใบกำกับซื้อ",
  "purchase_document.update": "แก้ใบกำกับซื้อ",
  "purchase_document.post": "ลงบัญชีใบกำกับซื้อ",
  "purchase_document.delete": "ลบใบกำกับซื้อ",
  "period.create": "เปิดงวดบัญชี",
  "period.close": "ปิดงวดบัญชี",
  "period.reopen": "เปิดงวดที่ปิดแล้ว",
  "settings.update": "แก้ตั้งค่าบัญชี",
  "account.create": "เพิ่มผังบัญชี",
  "account.update": "แก้ผังบัญชี",
  "account.delete": "ลบผังบัญชี",
  "tax_filing.mark_filed": "ยืนยันยื่นแบบภาษี",
};

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "short",
    timeStyle: "short",
  });
}

function actionLabel(r: FirmAuditRow): string {
  if (!r.businessAction) return r.tableName.replace(/^acc_/, "");
  return ACTION_LABEL[r.businessAction] ?? r.businessAction;
}

export default async function FirmAuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{
    page?: string;
    client?: string;
    from?: string;
    to?: string;
    scope?: string;
  }>;
}) {
  const { orgSlug } = await params;
  const sp = await searchParams;

  const orgs = await getOrganizationsForCurrentUser();
  const org = orgs.find((o) => o.slug === orgSlug);
  if (!org) notFound();
  const role = await getModuleRoleForCurrentUser(org.id, "acc_firm");
  if (!role) notFound();

  const page = Math.max(1, Number(sp.page ?? 1));
  const rls = await createSupabaseServerClient();

  const [result, clientOrgs] = await Promise.all([
    listFirmAudit(rls, {
      clientOrgId: sp.client ?? null,
      from: sp.from ?? null,
      to: sp.to ?? null,
      onlyBusiness: sp.scope === "business",
      page,
    }),
    listFirmClientOrgsForCurrentUser(),
  ]);

  const clients = clientOrgs
    .filter((c) => c.firmOrgId === org.id)
    .map((c) => ({ id: c.id, name: c.name }));

  // query ที่ต้องคงไว้เวลาเปลี่ยนหน้า (page ถูก LinkTablePager ใส่ให้เอง)
  const baseQuery: Record<string, string> = {};
  if (sp.client) baseQuery.client = sp.client;
  if (sp.from) baseQuery.from = sp.from;
  if (sp.to) baseQuery.to = sp.to;
  if (sp.scope) baseQuery.scope = sp.scope;

  return (
    <PageShell
      title="ร่องรอยการแก้บัญชีลูกค้า"
      description="ทีมของสำนักงานไปแก้อะไรในบัญชีของลูกค้าบ้าง — เรียงจากใหม่ไปเก่า"
      icon={<History className="h-6 w-6" />}
      width="wide"
    >
      <FirmAuditFilters clients={clients} />

      <div className="space-y-3">
        <Table stickyHeader fillViewport>
          <TableHeader sticky>
            <TableRow>
              <TableHead>เวลา</TableHead>
              <TableHead>ลูกค้า</TableHead>
              <TableHead>การกระทำ</TableHead>
              <TableHead align="center">ชนิด</TableHead>
              <TableHead>ผู้ทำ</TableHead>
              <TableHead>ฟิลด์ที่เปลี่ยน</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.rows.length === 0 ? (
              <TableEmpty colSpan={6}>
                {sp.scope === "business"
                  ? "ยังไม่มีร่องรอยที่ระบุเจตนาในช่วงนี้ — รายการชนิดนี้เริ่มบันทึกตั้งแต่ระบบเปิดใช้ ร่องรอยเก่ากว่านั้นดูได้ที่ตัวกรอง “ทั้งหมด”"
                  : "ยังไม่มีร่องรอยในช่วงที่เลือก — ลองขยายช่วงวันที่ หรือเอาตัวกรองออก"}
              </TableEmpty>
            ) : (
              result.rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-xs text-gray-500">
                    {fmtTime(r.loggedAt)}
                  </TableCell>
                  <TableCell className="text-sm text-gray-800">{r.clientName}</TableCell>
                  <TableCell className="text-sm text-gray-800">
                    <span className="flex items-center gap-2">
                      {actionLabel(r)}
                      {r.onBehalfOfOrgId && (
                        <StatusBadge tone="warning">ทำในนามสำนักงาน</StatusBadge>
                      )}
                    </span>
                    <span className="block font-mono text-xs text-gray-400">{r.tableName}</span>
                  </TableCell>
                  <TableCell align="center">
                    <StatusBadge tone={ACTION_TONE[r.action] ?? "neutral"}>{r.action}</StatusBadge>
                  </TableCell>
                  <TableCell className="text-sm text-gray-700">
                    {r.actorName ?? <span className="text-xs text-gray-400">ไม่ทราบ</span>}
                  </TableCell>
                  <TableCell wrap>
                    {r.diffKeys.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {r.diffKeys.slice(0, 6).map((k) => (
                          <span
                            key={k}
                            className="whitespace-nowrap rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600"
                          >
                            {k}
                          </span>
                        ))}
                        {r.diffKeys.length > 6 && (
                          <span className="text-xs text-gray-400">+{r.diffKeys.length - 6}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <LinkTablePager
          page={result.page}
          pageSize={FIRM_AUDIT_PAGE_SIZE}
          total={result.total}
          query={baseQuery}
          unit="รายการ"
        />
      </div>
    </PageShell>
  );
}
