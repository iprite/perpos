/**
 * _budget-bars.tsx — แท่งเทียบ "งบ vs ใช้จริง vs ผูกพัน" รายโครงการ (server component)
 *
 * ทำไมไม่ใช้ recharts: หน้านี้เป็น display ล้วน — แท่งเทียบสัดส่วนแบบนี้ทำด้วย CSS ได้ตรง ๆ
 * จึงไม่ต้องแปลงหน้าเป็น client component เพียงเพื่อกราฟ (และไม่ต้องฮาร์ดโค้ดสีนอกพาเลตต์)
 *
 * ⛔ ไม่คำนวณเงิน — สัดส่วนความกว้างเป็นเรื่องการแสดงผล (ตัวเลขที่โชว์มาจาก project-metrics.ts)
 */

import { Text } from "@/components/ui/typography";
import { money } from "../_components/format";
import type { ReportRow } from "./_report-table";

/** ความกว้างของแท่ง = สัดส่วนเทียบกับค่ามากสุดในชุด (คนละเรื่องกับยอดเงิน) */
function widthPct(value: number, max: number): string {
  if (!(max > 0)) return "0%";
  return `${Math.min(100, Math.max(0, (value / max) * 100)).toFixed(2)}%`;
}

export function BudgetBars({ rows }: { rows: ReportRow[] }) {
  const usable = rows.filter((r) => r.budget_cost !== null);
  if (usable.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm">
        <Text className="text-sm font-medium text-gray-900">ยังเทียบงบเป็นแท่งไม่ได้</Text>
        <Text className="mt-1 text-sm text-gray-500">
          ต้องมีโครงการที่อนุมัติ BOQ แล้วอย่างน้อย 1 โครงการ จึงจะมีงบต้นทุนไว้เทียบ
        </Text>
      </div>
    );
  }

  const max = Math.max(
    ...usable.map((r) => Math.max(r.budget_cost ?? 0, r.actual_cost + r.committed_cost)),
  );

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Text className="text-sm font-semibold text-gray-900">
          งบ เทียบกับ ใช้จริง + ผูกพัน ({usable.length} โครงการที่มีงบ)
        </Text>
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-gray-300" />
            งบต้นทุน
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-primary" />
            ใช้จริง
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-amber-400" />
            ผูกพัน
          </span>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {usable.map((r) => (
          <div key={r.id}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Text className="text-xs font-medium text-gray-900">
                {r.project_code} · {r.name}
              </Text>
              <Text
                className={`text-xs tabular-nums ${r.over_budget ? "font-semibold text-red-600" : "text-gray-500"}`}
              >
                {r.over_budget ? "เกินงบ " : "เทียบงบ "}
                {money(r.cost_variance)}
              </Text>
            </div>

            <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-gray-300"
                style={{ width: widthPct(r.budget_cost ?? 0, max) }}
              />
            </div>
            <div className="mt-1 flex h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
              <div className="h-full bg-primary" style={{ width: widthPct(r.actual_cost, max) }} />
              <div
                className="h-full bg-amber-400"
                style={{ width: widthPct(r.committed_cost, max) }}
              />
            </div>
            <Text className="mt-1 text-xs tabular-nums text-gray-500">
              งบ {money(r.budget_cost)} · ใช้จริง {money(r.actual_cost)} · ผูกพัน{" "}
              {money(r.committed_cost)}
            </Text>
          </div>
        ))}
      </div>
    </div>
  );
}
