import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StatusBadge, type BadgeTone } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Coins, TrendingUp, Users, Receipt } from "lucide-react";
import { requireSuperAdminPage } from "@/lib/admin/guard";
import { computeSttBilling } from "@/lib/admin/stt-billing";
import { StatCard } from "@/components/ui/stat-card";
import { AdminPage } from "../_components/admin-page";
import { PaymentsTabs } from "../payments/_tabs";

const baht = (n: number, d = 0) =>
  "฿" +
  new Intl.NumberFormat("th-TH", { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
const dt = (s: string) =>
  new Date(s).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });

const STATUS_TONE: Record<string, BadgeTone> = {
  succeeded: "success",
  pending: "warning",
  failed: "danger",
  refunded: "neutral",
};

export default async function AdminSttBillingPage() {
  const admin = await requireSuperAdminPage();
  const s = await computeSttBilling(admin);

  return (
    <AdminPage
      title="การเงิน & บริการ"
      description="รายได้จากบริการผู้ช่วย AI / แกะเสียง รายบุคคล (B2C)"
      icon={<Coins className="h-6 w-6" />}
      tabs={<PaymentsTabs />}
      actions={
        <>
          <Link href="/admin/stt-stats">
            <Button variant="outline" size="sm">
              สถิติ
            </Button>
          </Link>
          <Link href="/admin/stt-cost">
            <Button variant="outline" size="sm">
              ต้นทุน
            </Button>
          </Link>
        </>
      }
    >
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            icon={<TrendingUp className="h-4 w-4" />}
            label="MRR (รายเดือนประจำ)"
            value={baht(s.totals.mrr)}
            sub={`${s.totals.active_subscribers} สมาชิก active`}
            tone="primary"
          />
          <StatCard
            icon={<Coins className="h-4 w-4" />}
            label="รายได้เดือนนี้"
            value={baht(s.totals.revenue_month)}
            tone="positive"
            valueColored
          />
          <StatCard
            icon={<Coins className="h-4 w-4" />}
            label="รายได้รวมทั้งหมด"
            value={baht(s.totals.revenue_total)}
            sub={`${s.totals.payments_count} รายการ`}
            tone="info"
          />
          <StatCard
            icon={<Users className="h-4 w-4" />}
            label="สมาชิกรายเดือน"
            value={String(s.totals.active_subscribers)}
            tone="neutral"
          />
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">รายได้ตามแพ็ก</h3>
          {s.by_plan.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">ยังไม่มีรายการขาย</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {s.by_plan.map((p) => (
                <div key={p.name} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="text-gray-800">{p.name}</span>
                  <span className="tabular-nums text-gray-500">
                    {p.count} รายการ ·{" "}
                    <span className="font-medium text-gray-800">{baht(p.revenue)}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Receipt className="h-4 w-4 text-gray-400" /> รายการชำระเงินล่าสุด
          </h3>
          {s.recent.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">ยังไม่มีรายการ</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ผู้ใช้</TableHead>
                  <TableHead>แพ็ก</TableHead>
                  <TableHead align="right">จำนวนเงิน</TableHead>
                  <TableHead align="center">สถานะ</TableHead>
                  <TableHead align="right">เวลา</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {s.recent.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-gray-800">{p.name}</TableCell>
                    <TableCell className="text-gray-500">
                      {p.plan ?? (p.kind === "topup" ? "เติมนาที" : "—")}
                    </TableCell>
                    <TableCell align="right" tabular className="text-gray-800">
                      {baht(p.amount, 2)}
                    </TableCell>
                    <TableCell align="center">
                      <StatusBadge tone={STATUS_TONE[p.status] ?? "neutral"}>
                        {p.status}
                      </StatusBadge>
                    </TableCell>
                    <TableCell align="right" className="text-xs text-gray-400">
                      {dt(p.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <p className="text-xs text-gray-400">
          * refund / dispute / log ดิบ ดูที่ Stripe Dashboard โดยตรง — หน้านี้สรุปจากฐานข้อมูลของเรา
        </p>
      </div>
    </AdminPage>
  );
}
