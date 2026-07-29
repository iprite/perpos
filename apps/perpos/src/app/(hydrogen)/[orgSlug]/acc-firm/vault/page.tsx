// page.tsx — คลังเอกสารลูกค้า (หน้าแรก) · Server Component
// guard: getModuleRoleForCurrentUser('acc_firm') + createSupabaseServerClient (RLS)
// ตัวกรองอยู่ใน searchParams → ไม่ต้อง client fetch (SERVER_COMPONENT_PATTERN §2)

import Link from "next/link";
import { Archive, AlertTriangle, CalendarClock, FolderOpen, Users } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Text, Title } from "@/components/ui/typography";
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
import { listClientSummaries } from "@/lib/acc-firm/vault/queries";
import { requireVaultPage } from "./_components/guard";
import { VaultFilterShell } from "./_components/filter-shell";
import { LinkRow } from "./_components/link-row";
import { fmtDateTime } from "./_components/format";

export default async function VaultIndexPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ q?: string; scope?: string; page?: string }>;
}) {
  const { orgSlug } = await params;
  const { q = "", scope = "", page: pageParam } = await searchParams;
  const ctx = await requireVaultPage(orgSlug);

  const summaries = await listClientSummaries(ctx.rls, ctx.orgId);

  const keyword = q.trim().toLowerCase();
  const rows = summaries.filter((s) => {
    if (scope === "missing" && s.missingRequired === 0) return false;
    if (scope === "overdue" && s.overdueRequired === 0) return false;
    if (!keyword) return true;
    return [s.client.clientCode, s.client.companyName, s.client.taxId ?? ""]
      .join(" ")
      .toLowerCase()
      .includes(keyword);
  });

  // แบ่งหน้าฝั่ง server — page อยู่ใน searchParams (ดู DESIGN.md §5.1 ท่าที่ 3)
  const PAGE_SIZE = 25;
  const page = Math.max(1, Number(pageParam ?? 1) || 1);
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const totalClients = summaries.length;
  const clientsMissing = summaries.filter((s) => s.missingRequired > 0).length;
  const overdueItems = summaries.reduce((sum, s) => sum + s.overdueRequired, 0);
  const totalDocuments = summaries.reduce((sum, s) => sum + s.documentCount, 0);

  return (
    <VaultFilterShell
      icon={<Archive className="h-6 w-6" />}
      title="คลังเอกสารลูกค้า"
      description="ทะเบียนเอกสารของลูกค้าแต่ละราย — ครบ/ขาดอะไร เก็บไว้ที่ไหน ใครรับไป"
      q={q}
      scope={scope}
      summary={
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={<Users className="h-4 w-4" />}
            label="ลูกค้าทั้งหมด"
            value={totalClients.toLocaleString("th-TH")}
            tone="info"
          />
          <StatCard
            icon={<FolderOpen className="h-4 w-4" />}
            label="ลูกค้าที่ยังขาดเอกสาร"
            value={clientsMissing.toLocaleString("th-TH")}
            sub={totalClients > 0 ? `จากทั้งหมด ${totalClients} ราย` : undefined}
            tone={clientsMissing > 0 ? "warning" : "positive"}
            valueColored
          />
          <StatCard
            icon={<CalendarClock className="h-4 w-4" />}
            label="รายการที่เลยกำหนด"
            value={overdueItems.toLocaleString("th-TH")}
            tone={overdueItems > 0 ? "negative" : "positive"}
            valueColored
          />
          <StatCard
            icon={<Archive className="h-4 w-4" />}
            label="เอกสารในคลัง"
            value={totalDocuments.toLocaleString("th-TH")}
            tone="neutral"
          />
        </div>
      }
    >
      {/* เตือนก่อนตาราง — ตารางต้องเป็นชิ้นสุดท้ายของหน้า (fillViewport, DESIGN.md §4) */}
      {overdueItems > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <Text className="text-xs text-amber-800">
            มีรายการเอกสารที่เลยกำหนดรับ {overdueItems.toLocaleString("th-TH")} รายการ —
            เปิดแฟ้มลูกค้าเพื่อดูว่าค้างหมวดไหน แล้วติดตามจากลูกค้า
          </Text>
        </div>
      )}

      {summaries.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-16 text-center shadow-sm">
          <div className="mb-4 rounded-full bg-gray-100 p-4">
            <Archive className="h-8 w-8 text-gray-400" />
          </div>
          <Title as="h3" className="text-sm text-gray-900">
            ยังไม่มีลูกค้าในคลังเอกสาร
          </Title>
          <Text className="mt-1 text-sm text-gray-500">
            เพิ่มลูกค้าในทะเบียนลูกค้าก่อน แล้วเอกสารทุกงวดจะมาอยู่ที่นี่
          </Text>
          <Button className="mt-4" size="sm" asChild>
            <Link href={`/${orgSlug}/acc-firm/clients`}>ไปที่ทะเบียนลูกค้า</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <Table className="shadow-sm" stickyHeader fillViewport>
            <TableHeader sticky>
              <TableRow>
                <TableHead>รหัส</TableHead>
                <TableHead>ชื่อบริษัท</TableHead>
                <TableHead>เลขผู้เสียภาษี</TableHead>
                <TableHead align="right">ขาดเอกสาร</TableHead>
                <TableHead align="right">เลยกำหนด</TableHead>
                <TableHead align="right">เอกสารทั้งหมด</TableHead>
                <TableHead>อัปโหลดล่าสุด</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableEmpty colSpan={7}>ไม่พบลูกค้าที่ตรงกับตัวกรอง</TableEmpty>
              ) : (
                pageRows.map((s) => (
                  <LinkRow key={s.client.id} href={`/${orgSlug}/acc-firm/vault/${s.client.id}`}>
                    <TableCell className="font-medium text-gray-800">
                      {s.client.clientCode}
                    </TableCell>
                    <TableCell className="text-gray-800">
                      <span className="flex items-center gap-2">
                        {s.client.companyName}
                        {!s.client.dbdRelocationNotified && s.client.storageLocation && (
                          <StatusBadge tone="warning">ยังไม่แจ้งย้ายที่เก็บ</StatusBadge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell align="right" tabular className="text-gray-600">
                      {s.client.taxId ?? "—"}
                    </TableCell>
                    <TableCell align="right" tabular>
                      {s.missingRequired > 0 ? (
                        <span className="text-amber-700">
                          {s.missingRequired.toLocaleString("th-TH")}
                        </span>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </TableCell>
                    <TableCell align="right" tabular>
                      {s.overdueRequired > 0 ? (
                        <span className="text-red-600">
                          {s.overdueRequired.toLocaleString("th-TH")}
                        </span>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </TableCell>
                    <TableCell align="right" tabular className="text-gray-700">
                      {s.documentCount.toLocaleString("th-TH")}
                    </TableCell>
                    <TableCell className="text-xs text-gray-500">
                      {fmtDateTime(s.lastUploadAt)}
                    </TableCell>
                  </LinkRow>
                ))
              )}
            </TableBody>
          </Table>
          <LinkTablePager
            page={page}
            pageSize={PAGE_SIZE}
            total={rows.length}
            query={{ q, scope }}
            unit="ราย"
          />
        </div>
      )}
    </VaultFilterShell>
  );
}
