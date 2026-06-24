import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
} from "@/components/ui/table";
import { Bug } from "lucide-react";
import { requireSuperAdminPage } from "@/lib/admin/guard";
import { listIssues } from "@/lib/admin/issues";
import { AdminPage } from "../_components/admin-page";
import { IssueFilters } from "./_filter";
import {
  STATUS_LABEL,
  STATUS_TONE,
  TYPE_LABEL,
  SEVERITY_LABEL,
  SEVERITY_TONE,
  SOURCE_LABEL,
  fmtTime,
} from "./_meta";

function pageHref(page: number, sp: Record<string, string>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (v) qs.set(k, v);
  if (page > 1) qs.set("page", String(page));
  else qs.delete("page");
  return qs.toString() ? `?${qs}` : "?";
}

export default async function AdminIssuesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string; type?: string; severity?: string }>;
}) {
  const admin = await requireSuperAdminPage();
  const sp = await searchParams;
  const status = sp.status ?? "";
  const type = sp.type ?? "";
  const severity = sp.severity ?? "";
  const reqPage = Math.max(1, Number(sp.page ?? 1));

  const { items, total, page, limit, counts } = await listIssues(admin, {
    status,
    type,
    severity,
    page: reqPage,
  });
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const baseSp = { status, type, severity };

  const tiles = [
    { key: "open", label: "เปิดอยู่", value: counts.open },
    { key: "in_progress", label: "กำลังดำเนินการ", value: counts.in_progress },
    { key: "fixed", label: "แก้แล้ว/ขึ้น prod", value: counts.fixed },
    { key: "closed", label: "ปิดแล้ว", value: counts.closed },
  ];

  return (
    <AdminPage width="wide" title="ติดตามปัญหา (Issue Tracker)" icon={<Bug className="h-6 w-6" />}>
      {/* summary */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.key} className="rounded-xl border border-gray-100 bg-white p-4">
            <div className="text-2xl font-bold tabular-nums text-gray-900">{t.value}</div>
            <div className="text-xs text-gray-500">{t.label}</div>
          </div>
        ))}
      </div>

      <IssueFilters status={status} type={type} severity={severity} />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>เลขอ้างอิง</TableHead>
            <TableHead>หัวข้อ</TableHead>
            <TableHead align="center">ประเภท</TableHead>
            <TableHead align="center">ความรุนแรง</TableHead>
            <TableHead align="center">สถานะ</TableHead>
            <TableHead align="center">ที่มา</TableHead>
            <TableHead>อัปเดต</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableEmpty colSpan={7}>ยังไม่มีรายการในเงื่อนไขนี้</TableEmpty>
          ) : (
            items.map((i) => (
              <TableRow key={i.id} className="hover:bg-gray-50">
                <TableCell>
                  <Link
                    href={`/admin/issues/${i.ref}`}
                    className="font-mono text-sm font-semibold text-primary hover:underline"
                  >
                    {i.ref}
                  </Link>
                </TableCell>
                <TableCell>
                  <Link href={`/admin/issues/${i.ref}`} className="block">
                    <span className="font-medium text-gray-900">{i.title}</span>
                    {i.area.length > 0 && (
                      <span className="ml-1 text-xs text-gray-400">· {i.area.join(", ")}</span>
                    )}
                  </Link>
                </TableCell>
                <TableCell align="center" className="text-xs text-gray-600">
                  {TYPE_LABEL[i.type]}
                </TableCell>
                <TableCell align="center">
                  <StatusBadge tone={SEVERITY_TONE[i.severity]}>
                    {SEVERITY_LABEL[i.severity]}
                  </StatusBadge>
                </TableCell>
                <TableCell align="center">
                  <StatusBadge tone={STATUS_TONE[i.status]}>{STATUS_LABEL[i.status]}</StatusBadge>
                </TableCell>
                <TableCell align="center">
                  <StatusBadge tone="neutral">{SOURCE_LABEL[i.source]}</StatusBadge>
                </TableCell>
                <TableCell className="text-xs text-gray-500">{fmtTime(i.updated_at)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
        <span>ทั้งหมด {total.toLocaleString("th-TH")} รายการ</span>
        <div className="flex items-center gap-2">
          {page <= 1 ? (
            <Button variant="outline" size="sm" disabled>
              ก่อนหน้า
            </Button>
          ) : (
            <Link href={pageHref(page - 1, baseSp)}>
              <Button variant="outline" size="sm">
                ก่อนหน้า
              </Button>
            </Link>
          )}
          <span className="tabular-nums">
            {page} / {totalPages}
          </span>
          {page >= totalPages ? (
            <Button variant="outline" size="sm" disabled>
              ถัดไป
            </Button>
          ) : (
            <Link href={pageHref(page + 1, baseSp)}>
              <Button variant="outline" size="sm">
                ถัดไป
              </Button>
            </Link>
          )}
        </div>
      </div>
    </AdminPage>
  );
}
