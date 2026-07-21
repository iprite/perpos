"use client";

/**
 * TmcDashboardView — body แดชบอร์ด TMC (รับ data จาก server component)
 * graphTab + recharts เป็น client · range filter อยู่ใน header (searchParams)
 */

import { useState } from "react";
import { StatCard } from "@/components/ui/stat-card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  Landmark,
  Wallet,
  Building2,
  Package,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
} from "lucide-react";
import type { TmcDashData } from "@/lib/tmc/dashboard";

const TH_MONTHS = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];
function thMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return `${TH_MONTHS[m - 1]} ${String(y + 543).slice(-2)}`;
}
function fmtK(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString("th-TH");
}
function fmt(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

const PROPERTY_COLORS: Record<string, string> = {
  TMC1: "#4FC1E9",
  TMC2: "#8067B7",
  "TMC3-4": "#EC87C0",
  TMC5: "#FFCE54",
  TMC6: "#A0CECB",
  TMC7: "#48CFAD",
  ส่วนกลาง: "#9CA3AF",
  "(ไม่ระบุ)": "#CCD1D9",
};
function propColor(p: string) {
  return PROPERTY_COLORS[p] ?? "#8067B7";
}

const TT = { contentStyle: { fontSize: 12, borderRadius: 8, border: "1px solid #E6E9EE" } };

export function TmcDashboardView({ data }: { data: TmcDashData }) {
  const [graphTab, setGraphTab] = useState<"finance" | "petty" | "stays">("finance");
  const t = data.totals;

  const finChart = data.financeMonthly.map((r) => ({
    name: thMonth(r.month),
    รายรับ: r.income ?? 0,
    รายจ่าย: r.expense ?? 0,
    คงเหลือ: (r.income ?? 0) - (r.expense ?? 0),
  }));
  const pettyChart = data.pettyMonthly.map((r) => ({
    name: thMonth(r.month),
    รับเงิน: r.top_up ?? 0,
    รายจ่าย: r.expense ?? 0,
  }));
  const staysChart = data.staysMonthly.map((r) => ({
    name: thMonth(r.month),
    การเข้าพัก: r.stays ?? 0,
    คืน: r.nights ?? 0,
    รายรับห้อง: r.revenue ?? 0,
  }));

  return (
    <>
      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={<Landmark className="h-4 w-4" />}
          label="รายรับสุทธิ (บัญชี)"
          value={`฿${fmtK(t.finance.income - t.finance.expense)}`}
          sub={`รับ ${fmtK(t.finance.income)} / จ่าย ${fmtK(t.finance.expense)}`}
          tone="info"
        />
        <StatCard
          icon={<Wallet className="h-4 w-4" />}
          label="เงินสดย่อยคงเหลือ"
          value={`฿${fmtK(t.petty.top_up - t.petty.expense)}`}
          sub={`รับ ${fmtK(t.petty.top_up)} / จ่าย ${fmtK(t.petty.expense)}`}
          tone="primary"
        />
        <StatCard
          icon={<Building2 className="h-4 w-4" />}
          label="การเข้าพัก (ทั้งหมด)"
          value={`${t.staysAllTime} ครั้ง`}
          sub={`ช่วงนี้ ${t.stays.count} ครั้ง · ${t.stays.nights} คืน · ฿${fmtK(t.stays.revenue)}`}
          tone="positive"
        />
        <StatCard
          icon={
            t.stock.low > 0 ? (
              <AlertTriangle className="h-4 w-4" />
            ) : (
              <Package className="h-4 w-4" />
            )
          }
          label="Stock คลัง"
          value={`${t.stock.items} รายการ`}
          sub={t.stock.low > 0 ? `ใกล้หมด ${t.stock.low} รายการ` : "ปกติ"}
          tone={t.stock.low > 0 ? "warning" : "neutral"}
        />
      </div>

      {/* ── Quick totals row ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="รายรับรวม"
          value={`฿${fmt(t.finance.income)}`}
          tone="positive"
          valueColored
        />
        <StatCard
          icon={<TrendingDown className="h-4 w-4" />}
          label="รายจ่ายรวม"
          value={`฿${fmt(t.finance.expense)}`}
          tone="negative"
          valueColored
        />
        <StatCard
          icon={<Wallet className="h-4 w-4" />}
          label="เงินสดย่อย รายจ่าย"
          value={`฿${fmt(t.petty.expense)}`}
          tone="warning"
          valueColored
        />
      </div>

      {/* ── Graph section ── */}
      <div className="rounded-xl border bg-white">
        <div className="flex items-center gap-1 border-b px-4 pt-3">
          {(
            [
              { key: "finance", label: "บัญชีการเงิน", icon: <Landmark className="h-3.5 w-3.5" /> },
              { key: "petty", label: "เงินสดย่อย", icon: <Wallet className="h-3.5 w-3.5" /> },
              { key: "stays", label: "การเข้าพัก", icon: <Building2 className="h-3.5 w-3.5" /> },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setGraphTab(tab.key)}
              className={`flex items-center gap-1.5 rounded-t border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                graphTab === tab.key
                  ? "border-blue-500 bg-blue-50 text-blue-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
        <div className="p-4">
          {graphTab === "finance" ? (
            <FinanceChart data={finChart} />
          ) : graphTab === "petty" ? (
            <PettyChart data={pettyChart} />
          ) : (
            <StaysChart data={staysChart} />
          )}
        </div>
      </div>

      {/* ── By Property ── */}
      {data.byProperty.length > 0 && (
        <div className="rounded-xl border bg-white">
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-700">สรุปตามแปลง</h2>
          </div>
          <Table wrapperClassName="rounded-none border-0">
            <TableHeader>
              <TableRow>
                <TableHead>แปลง</TableHead>
                <TableHead align="right">รายรับ (บัญชี)</TableHead>
                <TableHead align="right">รายจ่าย (บัญชี)</TableHead>
                <TableHead align="right">เงินสดย่อย</TableHead>
                <TableHead align="right">รายรับห้อง</TableHead>
                <TableHead align="right">เข้าพัก</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.byProperty.map((r) => (
                <TableRow key={r.property}>
                  <TableCell className="font-medium text-slate-700">
                    <span
                      className="mr-2 inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: propColor(r.property) }}
                    />
                    {r.property}
                  </TableCell>
                  <TableCell align="right" tabular className="font-medium text-green-700">
                    {r.finIncome > 0 ? fmt(r.finIncome) : "—"}
                  </TableCell>
                  <TableCell align="right" tabular className="text-red-600">
                    {r.finExpense > 0 ? fmt(r.finExpense) : "—"}
                  </TableCell>
                  <TableCell align="right" tabular className="text-violet-700">
                    {r.pettyExpense > 0 ? fmt(r.pettyExpense) : "—"}
                  </TableCell>
                  <TableCell align="right" tabular className="font-medium text-emerald-700">
                    {r.stayRevenue > 0 ? fmt(r.stayRevenue) : "—"}
                  </TableCell>
                  <TableCell align="right" tabular className="text-slate-500">
                    {r.stays > 0 ? `${r.stays} ครั้ง` : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="border-t p-4">
            <p className="mb-3 text-xs text-slate-500">รายรับ / รายจ่าย แยกแปลง</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={data.byProperty.filter((r) => r.finIncome > 0 || r.finExpense > 0)}
                layout="vertical"
                margin={{ left: 16, right: 16 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#F5F7FA" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => fmtK(v)} />
                <YAxis type="category" dataKey="property" tick={{ fontSize: 11 }} width={56} />
                <Tooltip {...TT} formatter={(v: number) => `฿${fmt(v)}`} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar
                  dataKey="finIncome"
                  name="รายรับ"
                  fill="#48CFAD"
                  radius={[0, 3, 3, 0]}
                  maxBarSize={20}
                >
                  {data.byProperty.map((r) => (
                    <Cell key={r.property} fill={propColor(r.property)} />
                  ))}
                </Bar>
                <Bar
                  dataKey="finExpense"
                  name="รายจ่าย"
                  fill="#E36A7B"
                  radius={[0, 3, 3, 0]}
                  maxBarSize={20}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── By Category ── */}
      {data.byCategory.length > 0 && (
        <div className="rounded-xl border bg-white">
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-700">สรุปตามหมวด (บัญชีการเงิน)</h2>
          </div>
          <Table wrapperClassName="rounded-none border-0">
            <TableHeader>
              <TableRow>
                <TableHead>หมวด</TableHead>
                <TableHead align="right">รายรับ</TableHead>
                <TableHead align="right">รายจ่าย</TableHead>
                <TableHead align="right">สุทธิ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.byCategory.slice(0, 15).map((r) => {
                const net = r.income - r.expense;
                return (
                  <TableRow key={r.category}>
                    <TableCell className="font-medium text-slate-700">{r.category}</TableCell>
                    <TableCell align="right" tabular className="text-green-700">
                      {r.income > 0 ? fmt(r.income) : "—"}
                    </TableCell>
                    <TableCell align="right" tabular className="text-red-600">
                      {r.expense > 0 ? fmt(r.expense) : "—"}
                    </TableCell>
                    <TableCell
                      align="right"
                      tabular
                      className={`font-medium ${net >= 0 ? "text-blue-700" : "text-orange-600"}`}
                    >
                      {fmt(net)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {data.byCategory.some((r) => r.expense > 0) && (
            <div className="border-t p-4">
              <p className="mb-3 text-xs text-slate-500">รายจ่ายตามหมวด (บาท)</p>
              <ResponsiveContainer
                width="100%"
                height={Math.max(180, data.byCategory.filter((r) => r.expense > 0).length * 28)}
              >
                <BarChart
                  data={data.byCategory.filter((r) => r.expense > 0).slice(0, 12)}
                  layout="vertical"
                  margin={{ left: 8, right: 16 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#F5F7FA" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => fmtK(v)} />
                  <YAxis type="category" dataKey="category" tick={{ fontSize: 11 }} width={130} />
                  <Tooltip {...TT} formatter={(v: number) => `฿${fmt(v)}`} />
                  <Bar
                    dataKey="expense"
                    name="รายจ่าย"
                    fill="#E36A7B"
                    radius={[0, 3, 3, 0]}
                    maxBarSize={20}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* ── Stock low ── */}
      {data.stockLow.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-amber-700">
            <AlertTriangle className="h-4 w-4" /> Stock ใกล้หมด
          </p>
          <div className="flex flex-wrap gap-2">
            {data.stockLow.map((item) => (
              <span
                key={item.name}
                className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-white px-3 py-1 text-xs text-amber-800"
              >
                {item.name}
                <span className="ml-1 font-bold text-red-500">{item.qty}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ── Graph components ──────────────────────────────────────────────────

function FinanceChart({
  data,
}: {
  data: { name: string; รายรับ: number; รายจ่าย: number; คงเหลือ: number }[];
}) {
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-xs text-slate-500">รายรับ / รายจ่าย บัญชีธนาคาร (บาท)</p>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F5F7FA" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtK(v)} />
            <Tooltip {...TT} formatter={(v: number) => `฿${fmt(v)}`} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="รายรับ" fill="#48CFAD" radius={[3, 3, 0, 0]} maxBarSize={44} />
            <Bar dataKey="รายจ่าย" fill="#E36A7B" radius={[3, 3, 0, 0]} maxBarSize={44} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div>
        <p className="mb-2 text-xs text-slate-500">คงเหลือสุทธิ (บาท)</p>
        <ResponsiveContainer width="100%" height={150}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F5F7FA" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtK(v)} />
            <Tooltip {...TT} formatter={(v: number) => `฿${fmt(v)}`} />
            <Line
              dataKey="คงเหลือ"
              stroke="#4FC1E9"
              strokeWidth={2}
              dot={{ r: 4, fill: "#4FC1E9" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function PettyChart({ data }: { data: { name: string; รับเงิน: number; รายจ่าย: number }[] }) {
  return (
    <div>
      <p className="mb-2 text-xs text-slate-500">เงินสดย่อย รับ / จ่าย (บาท)</p>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} barGap={4}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F5F7FA" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtK(v)} />
          <Tooltip {...TT} formatter={(v: number) => `฿${fmt(v)}`} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="รับเงิน" fill="#A290CA" radius={[3, 3, 0, 0]} maxBarSize={44} />
          <Bar dataKey="รายจ่าย" fill="#FD9580" radius={[3, 3, 0, 0]} maxBarSize={44} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function StaysChart({
  data,
}: {
  data: { name: string; การเข้าพัก: number; คืน: number; รายรับห้อง: number }[];
}) {
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-xs text-slate-500">การเข้าพัก — ครั้ง / คืน</p>
        <ResponsiveContainer width="100%" height={190}>
          <BarChart data={data} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F5F7FA" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip {...TT} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="การเข้าพัก" fill="#79DCC3" radius={[3, 3, 0, 0]} maxBarSize={44} />
            <Bar dataKey="คืน" fill="#A7E8D8" radius={[3, 3, 0, 0]} maxBarSize={44} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div>
        <p className="mb-2 text-xs text-slate-500">รายรับห้องพัก (บาท)</p>
        <ResponsiveContainer width="100%" height={150}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F5F7FA" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtK(v)} />
            <Tooltip {...TT} formatter={(v: number) => `฿${fmt(v)}`} />
            <Line
              dataKey="รายรับห้อง"
              stroke="#48CFAD"
              strokeWidth={2}
              dot={{ r: 4, fill: "#48CFAD" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
