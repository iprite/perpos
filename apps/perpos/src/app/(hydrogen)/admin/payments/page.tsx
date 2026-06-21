/**
 * /admin/payments — Payments & Subscriptions console (super admin)
 * ภาพรวมรายได้รวม แยก 2 สาย: ผู้ช่วย AI (B2C) + ERP (B2B)
 * Server Component — fetch metrics ตอน SSR (ไม่มี client round-trip) · tab อื่นลิงก์ไปหน้า detail เดิม
 */

import { StatCard } from "@/components/ui/stat-card";
import { PageShell, PageCard } from "@/components/ui/page-shell";
import { TrendingUp, CalendarClock, Wallet, UserMinus, Bot, Building2 } from "lucide-react";
import { requireSuperAdminPage } from "@/lib/admin/guard";
import { computePaymentsMetrics, type StreamMetrics } from "@/lib/admin/payments";
import { PaymentsTabs } from "./_tabs";

const baht = (n: number, d = 0) =>
  "฿" +
  new Intl.NumberFormat("th-TH", { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);

function StreamCard({
  icon,
  title,
  tagline,
  m,
}: {
  icon: React.ReactNode;
  title: string;
  tagline: string;
  m: StreamMetrics;
}) {
  return (
    <PageCard>
      <div className="flex items-center gap-3">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-gray-600">
          {icon}
        </div>
        <div>
          <div className="text-base font-semibold text-gray-900">{title}</div>
          <div className="text-xs text-gray-500">{tagline}</div>
        </div>
        <div className="ml-auto text-right">
          <div className="text-xs text-gray-500">MRR</div>
          <div className="text-2xl font-bold tabular-nums text-gray-900">{baht(m.mrr)}</div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-gray-100 pt-4 text-center">
        <div>
          <div className="text-lg font-semibold tabular-nums text-gray-900">
            {m.paying_subscribers.toLocaleString()}
          </div>
          <div className="text-xs text-gray-500">
            สมาชิกจ่ายเงิน{m.trialing > 0 ? ` · ทดลอง ${m.trialing}` : ""}
          </div>
        </div>
        <div>
          <div className="text-lg font-semibold tabular-nums text-gray-900">{baht(m.arpu, 0)}</div>
          <div className="text-xs text-gray-500">ARPU</div>
        </div>
        <div>
          <div className="text-lg font-semibold tabular-nums text-gray-900">
            {baht(m.revenue_month)}
          </div>
          <div className="text-xs text-gray-500">รายได้เดือนนี้</div>
        </div>
      </div>
    </PageCard>
  );
}

export default async function PaymentsConsolePage() {
  const admin = await requireSuperAdminPage();
  const data = await computePaymentsMetrics(admin);

  return (
    <PageShell
      title="Payments & Subscriptions"
      icon={<Wallet className="h-6 w-6" />}
      description={`อัปเดต ${new Date(data.computed_at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}`}
      tabs={<PaymentsTabs />}
    >
      {/* รายได้รวมทั้งระบบ */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="MRR รวม"
          value={baht(data.combined.mrr)}
          sub={`ARR ${baht(data.combined.arr)}`}
          tone="info"
          valueColored
        />
        <StatCard
          icon={<Wallet className="h-4 w-4" />}
          label="รายได้เดือนนี้"
          value={baht(data.combined.revenue_month)}
          sub={`รวมสะสม ${baht(data.combined.revenue_total)}`}
          tone="positive"
          valueColored
        />
        <StatCard
          icon={<CalendarClock className="h-4 w-4" />}
          label="สมาชิกจ่ายเงิน"
          value={data.combined.paying_subscribers.toLocaleString()}
          sub={`ARPU ${baht(data.combined.arpu)} · ทดลอง ${data.combined.trialing}`}
          tone="primary"
        />
        <StatCard
          icon={<UserMinus className="h-4 w-4" />}
          label="ยกเลิก 30 วัน"
          value={data.combined.churned_30d.toLocaleString()}
          sub="churn (ประมาณ)"
          tone="warning"
        />
      </div>

      {/* แยก 2 สาย */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <StreamCard
          icon={<Bot className="h-5 w-5" />}
          title="ผู้ช่วย AI"
          tagline="B2C · รายคน (per-profile)"
          m={data.streams.assistant}
        />
        <StreamCard
          icon={<Building2 className="h-5 w-5" />}
          title="ERP"
          tagline="B2B · ต่อองค์กร (per-org)"
          m={data.streams.erp}
        />
      </div>
    </PageShell>
  );
}
