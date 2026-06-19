import {
  LayoutDashboard,
  ReceiptText,
  ShoppingCart,
  Wallet,
  BookOpenText,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
} from "lucide-react";

const sidebarItems = [
  { icon: LayoutDashboard, label: "รายงาน", active: true },
  { icon: ReceiptText, label: "ขาย" },
  { icon: ShoppingCart, label: "ซื้อ" },
  { icon: Wallet, label: "การเงิน" },
  { icon: BookOpenText, label: "บัญชี" },
];

const kpis = [
  {
    label: "รายได้เดือนนี้",
    value: "฿1,240,000",
    delta: "+12.5%",
    up: true,
    accent: "text-secondary",
  },
  {
    label: "รายจ่ายเดือนนี้",
    value: "฿680,000",
    delta: "-3.1%",
    up: false,
    accent: "text-foreground-secondary",
  },
  {
    label: "กำไรสุทธิ",
    value: "฿560,000",
    delta: "+8.2%",
    up: true,
    accent: "text-primary",
  },
];

const bars = [42, 58, 51, 67, 73, 62, 88];
const barMonths = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค."];

const documents = [
  { code: "INV-2026-0142", name: "บริษัท สยามเทค จำกัด", amount: "฿86,400", status: "ชำระแล้ว", tone: "secondary" },
  { code: "QT-2026-0098", name: "ร้านกาแฟ ลาเต้ดี", amount: "฿24,000", status: "รออนุมัติ", tone: "accent" },
  { code: "INV-2026-0141", name: "หจก. รุ่งเรืองพาณิชย์", amount: "฿152,800", status: "ชำระแล้ว", tone: "secondary" },
];

const toneMap: Record<string, string> = {
  secondary: "bg-secondary/10 text-secondary",
  accent: "bg-accent/10 text-accent-dark",
};

export function DashboardMockup() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-elevated">
      {/* Browser chrome */}
      <div className="flex items-center gap-2 border-b border-border bg-background-secondary px-4 py-3">
        <div className="flex gap-1.5">
          <span className="h-3 w-3 rounded-full bg-[#FF5F57]" />
          <span className="h-3 w-3 rounded-full bg-[#FEBC2E]" />
          <span className="h-3 w-3 rounded-full bg-[#28C840]" />
        </div>
        <div className="mx-auto flex items-center gap-2 rounded-md bg-white px-3 py-1 text-xs text-foreground-muted ring-1 ring-border">
          <span className="h-2.5 w-2.5 rounded-full bg-secondary/70" />
          app.perpos.ai/p2p/accounting
        </div>
      </div>

      {/* App body */}
      <div className="flex">
        {/* Sidebar */}
        <aside className="hidden w-44 shrink-0 border-r border-border bg-background-secondary/60 p-3 sm:block">
          <div className="flex items-center gap-2 px-2 py-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-[11px] font-bold text-white">
              P
            </span>
            <span className="text-sm font-bold text-foreground">PERPOS</span>
          </div>
          <div className="mt-3 space-y-0.5">
            {sidebarItems.map((item) => (
              <div
                key={item.label}
                className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium ${
                  item.active
                    ? "bg-primary/10 text-primary"
                    : "text-foreground-secondary"
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </div>
            ))}
          </div>
        </aside>

        {/* Main content */}
        <div className="min-w-0 flex-1 bg-white p-4 sm:p-5">
          {/* Page header */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-foreground sm:text-base">
                แดชบอร์ดผู้บริหาร
              </h3>
              <p className="text-[11px] text-foreground-muted">ภาพรวมประจำเดือน กรกฎาคม 2569</p>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg border border-border bg-white px-2.5 py-1.5 text-[11px] font-medium text-foreground-secondary">
              <span className="h-2 w-2 rounded-full bg-primary" />
              บริษัท พีทูพี โซลูชั่น
            </div>
          </div>

          {/* KPI cards */}
          <div className="mt-4 grid grid-cols-3 gap-2.5 sm:gap-3">
            {kpis.map((kpi) => (
              <div
                key={kpi.label}
                className="rounded-xl border border-border bg-white p-3 shadow-soft"
              >
                <p className="truncate text-[10px] text-foreground-muted sm:text-[11px]">
                  {kpi.label}
                </p>
                <p className="mt-1 text-sm font-bold text-foreground sm:text-lg">
                  {kpi.value}
                </p>
                <div
                  className={`mt-1 inline-flex items-center gap-0.5 text-[10px] font-semibold ${
                    kpi.up ? "text-secondary" : "text-foreground-muted"
                  }`}
                >
                  {kpi.up ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {kpi.delta}
                </div>
              </div>
            ))}
          </div>

          {/* Chart + activity */}
          <div className="mt-3 grid gap-3 lg:grid-cols-5">
            {/* Bar chart */}
            <div className="rounded-xl border border-border bg-white p-3.5 lg:col-span-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-foreground">
                  รายได้รายเดือน
                </p>
                <span className="inline-flex items-center gap-0.5 rounded-md bg-secondary/10 px-1.5 py-0.5 text-[10px] font-semibold text-secondary">
                  <ArrowUpRight className="h-3 w-3" />
                  18%
                </span>
              </div>
              <div className="mt-4 space-y-1.5">
                <div className="flex h-28 items-end gap-1.5">
                  {bars.map((h, i) => (
                    <div
                      key={i}
                      className={`flex-1 rounded-md ${
                        i === bars.length - 1
                          ? "bg-gradient-to-t from-primary to-primary-light"
                          : "bg-primary/15"
                      }`}
                      style={{ height: `${h}%` }}
                    />
                  ))}
                </div>
                <div className="flex gap-1.5">
                  {barMonths.map((m) => (
                    <span
                      key={m}
                      className="flex-1 text-center text-[8px] text-foreground-muted"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Recent documents */}
            <div className="rounded-xl border border-border bg-white p-3.5 lg:col-span-2">
              <p className="text-xs font-semibold text-foreground">เอกสารล่าสุด</p>
              <div className="mt-3 space-y-2.5">
                {documents.map((doc) => (
                  <div key={doc.code} className="flex items-center gap-2.5">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <ReceiptText className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-semibold text-foreground">
                        {doc.code}
                      </p>
                      <p className="truncate text-[10px] text-foreground-muted">
                        {doc.name}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] font-bold text-foreground">
                        {doc.amount}
                      </p>
                      <span
                        className={`mt-0.5 inline-block rounded px-1.5 py-px text-[8px] font-semibold ${
                          toneMap[doc.tone]
                        }`}
                      >
                        {doc.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
