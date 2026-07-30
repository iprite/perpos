"use client";

/**
 * TmcDashboardView — body แดชบอร์ด TMC (รับ data จาก server component)
 * graphTab + recharts เป็น client · range filter อยู่ใน header (searchParams)
 */

import { useState } from "react";
import { StatCard } from "@/components/ui/stat-card";
import { SegmentedControl } from "@/components/ui/segmented";
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
  Percent,
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
  TMC1: "#5D9CEC",
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

  // เงินเข้า-ออกจริงของช่วงนี้ (บัญชี + เงินสดย่อย) — เติมเงินสดย่อยไม่นับเป็นเงินเข้า
  // เพราะเป็นการโยกจากบัญชีหลัก ไม่ใช่รายได้ใหม่
  const cashIn = t.finance.income;
  const cashOut = t.finance.expense + t.petty.expense;
  const netCash = cashIn - cashOut;

  // รายรับเดือนล่าสุดเทียบเดือนก่อนหน้า (%)
  const fm = data.financeMonthly;
  const last = fm.at(-1)?.income ?? 0;
  const prev = fm.at(-2)?.income ?? 0;
  const incomeDelta = fm.length >= 2 && prev > 0 ? ((last - prev) / prev) * 100 : null;

  // หมวดที่มีรายจ่าย — วาดแค่ 12 อันดับแรก และคิดความสูงกราฟจาก "จำนวนแท่งที่วาดจริง"
  // (ก่อนหน้านี้คิดจากจำนวนหมวดทั้งหมด → กราฟสูงเกินจนแท่งห่างกันมาก)
  const catExpenseAll = data.byCategory.filter((r) => r.expense > 0);
  const catExpense = catExpenseAll.slice(0, 12);
  const catExpenseHidden = catExpenseAll.length - catExpense.length;

  // แปลงที่มีตัวเลขบัญชี — ใช้ทั้งเป็น data และเป็นตัวไล่สี Cell (ต้องเป็นชุดเดียวกัน ไม่งั้นสีเลื่อน)
  const propRows = data.byProperty.filter((r) => r.finIncome > 0 || r.finExpense > 0);

  return (
    <>
      {/* ── Headline: กระแสเงินสดรวมของช่วงนี้ ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Landmark className="h-4 w-4" />}
          label="เงินเข้า-ออกสุทธิ (ช่วงนี้)"
          value={`฿${fmt(netCash)}`}
          sub={`เข้า ${fmtK(cashIn)} / ออก ${fmtK(cashOut)} · รวมเงินสดย่อย`}
          tone={netCash >= 0 ? "info" : "negative"}
          valueColored
        />
        <StatCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="รายรับ (บัญชี)"
          value={`฿${fmt(t.finance.income)}`}
          sub={
            incomeDelta == null
              ? "เดือนล่าสุดเทียบเดือนก่อน —"
              : `เดือนล่าสุด ${incomeDelta >= 0 ? "▲" : "▼"} ${Math.abs(incomeDelta).toFixed(0)}% เทียบเดือนก่อน`
          }
          tone="positive"
          valueColored
        />
        <StatCard
          icon={<TrendingDown className="h-4 w-4" />}
          label="รายจ่าย (บัญชี + เงินสดย่อย)"
          value={`฿${fmt(t.finance.expense + t.petty.expense)}`}
          sub={`บัญชี ${fmtK(t.finance.expense)} + เงินสดย่อย ${fmtK(t.petty.expense)}`}
          tone="negative"
          valueColored
        />
        <StatCard
          icon={<Wallet className="h-4 w-4" />}
          label="เงินสดย่อยคงเหลือ"
          value={`฿${fmt(t.petty.top_up - t.petty.expense)}`}
          sub={`เติม ${fmtK(t.petty.top_up)} / ใช้ ${fmtK(t.petty.expense)}`}
          tone="primary"
        />
      </div>

      {/* ── ดำเนินงาน: ห้องพัก + คลัง ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Percent className="h-4 w-4" />}
          label="อัตราการเข้าพัก (Occupancy)"
          value={t.occupancy.rate == null ? "—" : `${t.occupancy.rate}%`}
          sub={
            t.occupancy.rate == null
              ? "ยังไม่มีห้องเปิดขาย"
              : `ขายได้ ${t.occupancy.soldNights} จาก ${t.occupancy.availableNights} คืน · ${t.occupancy.rooms} ห้อง`
          }
          tone={
            t.occupancy.rate == null ? "neutral" : t.occupancy.rate >= 50 ? "positive" : "warning"
          }
          valueColored
        />
        <StatCard
          icon={<Building2 className="h-4 w-4" />}
          label="การเข้าพัก (ช่วงนี้)"
          value={`${t.stays.count} ครั้ง`}
          sub={`${t.stays.nights} คืน · สะสมทั้งหมด ${t.staysAllTime} ครั้ง`}
          tone="positive"
        />
        <StatCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="รายรับห้องพัก"
          value={`฿${fmt(t.stays.revenue)}`}
          sub={
            t.stays.nights > 0
              ? `เฉลี่ย ฿${fmt(Math.round(t.stays.revenue / t.stays.nights))} ต่อคืน`
              : "ยังไม่มีการเข้าพัก"
          }
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
          sub={t.stock.low > 0 ? `ใกล้หมด ${t.stock.low} รายการ` : "ระดับสต๊อกปกติ"}
          tone={t.stock.low > 0 ? "warning" : "neutral"}
        />
      </div>

      {/* ── Stock low (ยกขึ้นมาไว้บน — เป็นสิ่งที่ต้องลงมือทำ) ── */}
      {data.stockLow.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-amber-700">
            <AlertTriangle className="h-4 w-4" /> Stock ใกล้หมด — ควรสั่งเพิ่ม
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

      {/* ── Graph section ── */}
      <div className="rounded-xl border bg-white p-4">
        <div className="mb-4">
          <SegmentedControl
            value={graphTab}
            onChange={setGraphTab}
            size="sm"
            options={[
              { value: "finance", label: "บัญชีการเงิน", icon: <Landmark className="h-4 w-4" /> },
              { value: "petty", label: "เงินสดย่อย", icon: <Wallet className="h-4 w-4" /> },
              { value: "stays", label: "การเข้าพัก", icon: <Building2 className="h-4 w-4" /> },
            ]}
          />
        </div>
        {graphTab === "finance" ? (
          <FinanceChart data={finChart} />
        ) : graphTab === "petty" ? (
          <PettyChart data={pettyChart} />
        ) : (
          <StaysChart data={staysChart} />
        )}
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
          {propRows.length > 0 && (
            <div className="border-t p-4">
              <p className="mb-3 text-xs text-slate-500">รายรับ / รายจ่าย แยกแปลง</p>
              <ResponsiveContainer width="100%" height={48 + propRows.length * 46}>
                <BarChart
                  data={propRows}
                  layout="vertical"
                  margin={{ left: 16, right: 16, top: 4, bottom: 4 }}
                  barCategoryGap="22%"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#F5F7FA" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => fmtK(v)} />
                  <YAxis
                    type="category"
                    dataKey="property"
                    tick={{ fontSize: 11 }}
                    width={64}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    {...TT}
                    cursor={{ fill: "#F5F7FA" }}
                    formatter={(v: number) => `฿${fmt(v)}`}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="finIncome" name="รายรับ" fill="#48CFAD" radius={[0, 3, 3, 0]}>
                    {propRows.map((r) => (
                      <Cell key={r.property} fill={propColor(r.property)} />
                    ))}
                  </Bar>
                  <Bar dataKey="finExpense" name="รายจ่าย" fill="#E36A7B" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
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
          {catExpense.length > 0 && (
            <div className="border-t p-4">
              <p className="mb-3 text-xs text-slate-500">
                รายจ่ายตามหมวด (บาท)
                {catExpenseHidden > 0 && (
                  <span className="ml-1 text-slate-400">
                    — แสดง 12 หมวดแรก จาก {catExpense.length + catExpenseHidden} หมวด
                  </span>
                )}
              </p>
              <ResponsiveContainer width="100%" height={32 + catExpense.length * 30}>
                <BarChart
                  data={catExpense}
                  layout="vertical"
                  margin={{ left: 8, right: 16, top: 4, bottom: 4 }}
                  barCategoryGap="20%"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#F5F7FA" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => fmtK(v)} />
                  <YAxis
                    type="category"
                    dataKey="category"
                    tick={{ fontSize: 11 }}
                    width={150}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    {...TT}
                    cursor={{ fill: "#F5F7FA" }}
                    formatter={(v: number) => `฿${fmt(v)}`}
                  />
                  <Bar dataKey="expense" name="รายจ่าย" fill="#E36A7B" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
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
              stroke="#5D9CEC"
              strokeWidth={2}
              dot={{ r: 4, fill: "#5D9CEC" }}
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
