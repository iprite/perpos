import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
} from "@/components/ui/table";
import { Inbox, Sparkles, CalendarClock } from "lucide-react";
import { requireSuperAdminPage } from "@/lib/admin/guard";
import {
  listLeads,
  getLeadStats,
  LEAD_STATUS_LABEL,
  LEAD_STATUS_TONE,
  PRODUCT_LABEL,
  fmtLeadTime,
  type LeadStatus,
} from "@/lib/admin/leads";
import { AdminPage } from "../_components/admin-page";

function pageHref(page: number, sp: Record<string, string>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (v) qs.set(k, v);
  if (page > 1) qs.set("page", String(page));
  return qs.toString() ? `?${qs}` : "?";
}

export default async function AdminLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string; product?: string }>;
}) {
  const admin = await requireSuperAdminPage();
  const sp = await searchParams;
  const status = sp.status ?? "";
  const product = sp.product ?? "";
  const reqPage = Math.max(1, Number(sp.page ?? 1));

  const [{ items, total, page, limit }, stats] = await Promise.all([
    listLeads(admin, { status, product, page: reqPage }),
    getLeadStats(admin),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const baseSp = { status, product };

  return (
    <AdminPage
      width="wide"
      title="ลูกค้าขอเดโม (Leads)"
      description="รายชื่อที่กรอกฟอร์ม “ขอเดโม” จากหน้าเว็บ perpos.ai"
      icon={<Inbox className="h-6 w-6" />}
    >
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          icon={<Sparkles className="h-4 w-4" />}
          label="รอติดต่อ (ใหม่)"
          value={String(stats.new)}
          tone={stats.new > 0 ? "warning" : "neutral"}
        />
        <StatCard
          icon={<CalendarClock className="h-4 w-4" />}
          label="เข้ามาใน 7 วัน"
          value={String(stats.last7d)}
          tone="info"
        />
        <StatCard
          icon={<Inbox className="h-4 w-4" />}
          label="ทั้งหมด"
          value={String(stats.total)}
          tone="neutral"
        />
      </div>

      <Table className="shadow-sm">
        <TableHeader>
          <TableRow>
            <TableHead>ชื่อ</TableHead>
            <TableHead>เบอร์โทร</TableHead>
            <TableHead align="center">สนใจ</TableHead>
            <TableHead align="center">สถานะ</TableHead>
            <TableHead>เข้ามาเมื่อ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableEmpty colSpan={5}>
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="mb-4 rounded-full bg-gray-100 p-4">
                  <Inbox className="h-8 w-8 text-gray-400" />
                </div>
                <h3 className="text-sm font-medium text-gray-900">ยังไม่มีลูกค้าขอเดโม</h3>
                <p className="mt-1 text-sm text-gray-500">
                  เมื่อมีคนกรอกฟอร์ม “ขอเดโม” จากหน้าเว็บ รายชื่อจะแสดงที่นี่
                </p>
              </div>
            </TableEmpty>
          ) : (
            items.map((l) => (
              <TableRow key={l.id}>
                <TableCell>
                  <span className="font-medium text-gray-900">{l.name}</span>
                  {l.note && <span className="mt-0.5 block text-xs text-gray-400">{l.note}</span>}
                </TableCell>
                <TableCell>
                  <a
                    href={`tel:${l.phone.replace(/\s/g, "")}`}
                    className="text-primary hover:underline"
                  >
                    {l.phone}
                  </a>
                </TableCell>
                <TableCell align="center" className="text-xs text-gray-600">
                  {PRODUCT_LABEL[l.product] ?? l.product}
                </TableCell>
                <TableCell align="center">
                  <StatusBadge tone={LEAD_STATUS_TONE[l.status as LeadStatus] ?? "neutral"}>
                    {LEAD_STATUS_LABEL[l.status as LeadStatus] ?? l.status}
                  </StatusBadge>
                </TableCell>
                <TableCell className="text-xs text-gray-500">{fmtLeadTime(l.created_at)}</TableCell>
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
