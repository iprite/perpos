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
import { Bug, Clock, CheckCircle2, AlertTriangle } from "lucide-react";
import { requireSuperAdminPage } from "@/lib/admin/guard";
import { listIssues, getIssueStats, isActiveStatus, daysSince } from "@/lib/admin/issues";
import { StatCard } from "@/components/ui/stat-card";
import { AdminPage } from "../_components/admin-page";
import { IssueFilters } from "./_filter";
import { CreateIssueButton } from "./_create-button";
import {
  STATUS_LABEL,
  STATUS_TONE,
  TYPE_LABEL,
  SEVERITY_LABEL,
  SEVERITY_TONE,
  SOURCE_LABEL,
  areaLabel,
  fmtTime,
} from "./_meta";
import cn from "@core/utils/class-names";

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

  const [{ items, total, page, limit }, stats] = await Promise.all([
    listIssues(admin, { status, type, severity, page: reqPage }),
    getIssueStats(admin),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const baseSp = { status, type, severity };
  const hasFilter = Boolean(status || type || severity);

  const fmtMttr = (h: number | null) =>
    h == null ? "—" : h < 24 ? `${h.toFixed(1)} ชม.` : `${(h / 24).toFixed(1)} วัน`;

  return (
    <AdminPage
      width="wide"
      title="ติดตามปัญหา (Issue Tracker)"
      icon={<Bug className="h-6 w-6" />}
      actions={<CreateIssueButton />}
    >
      {/* dashboard — สถิติภาพรวม */}
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="เปิดค้างทั้งหมด"
          value={String(stats.activeTotal)}
          sub={`วิกฤต ${stats.activeBySeverity.sev1} · สำคัญ ${stats.activeBySeverity.sev2} · เล็ก ${stats.activeBySeverity.sev3}`}
          tone={stats.activeBySeverity.sev1 > 0 ? "negative" : "warning"}
        />
        <StatCard
          icon={<Clock className="h-4 w-4" />}
          label="เวลาเฉลี่ยจนแก้ (MTTR)"
          value={fmtMttr(stats.mttrHours)}
          sub={`จาก ${stats.bySource.line} LINE · ${stats.bySource.admin} แอดมิน · ${stats.bySource.agent} agent`}
          tone="info"
        />
        <StatCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="ปิด/แก้ใน 7 วัน"
          value={String(stats.resolved7d)}
          tone="positive"
          valueColored
        />
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
            <TableEmpty colSpan={7}>
              {hasFilter ? (
                <div className="flex flex-col items-center gap-2 py-6">
                  <p className="text-sm text-gray-500">ไม่พบปัญหาในเงื่อนไขที่กรอง</p>
                  <Link href="/admin/issues" className="text-sm text-primary hover:underline">
                    ล้างตัวกรอง
                  </Link>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="mb-4 rounded-full bg-gray-100 p-4">
                    <Bug className="h-8 w-8 text-gray-400" />
                  </div>
                  <h3 className="text-sm font-medium text-gray-900">ยังไม่มีปัญหาในระบบ</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    เริ่มบันทึกปัญหาเพื่อติดตามตั้งแต่แจ้งจนปิดเรื่อง
                  </p>
                  <div className="mt-4">
                    <CreateIssueButton label="เพิ่มปัญหาแรก" />
                  </div>
                </div>
              )}
            </TableEmpty>
          ) : (
            items.map((i) => {
              const active = isActiveStatus(i.status);
              const ageDays = active ? daysSince(i.created_at) : null;
              const stale = ageDays != null && ageDays > 7;
              return (
                <TableRow
                  key={i.id}
                  className={cn(
                    "hover:bg-gray-50",
                    active && i.severity === "sev1" && "bg-red-50/40",
                  )}
                >
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
                        <span className="ml-1 text-xs text-gray-400">
                          · {i.area.map(areaLabel).join(", ")}
                        </span>
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
                  <TableCell className="text-xs text-gray-500">
                    {fmtTime(i.updated_at)}
                    {ageDays != null && (
                      <span
                        className={cn(
                          "mt-0.5 block",
                          stale ? "font-medium text-amber-600" : "text-gray-400",
                        )}
                      >
                        ค้าง {ageDays} วัน
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })
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
