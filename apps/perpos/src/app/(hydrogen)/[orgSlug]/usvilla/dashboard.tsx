'use client';

import { TrendingUp, BedDouble, Percent, DollarSign } from 'lucide-react';
import { useLang } from './_lang-context';
import { getPayLabel } from './_i18n';

export interface DashboardData {
  date: string;
  month_start: string;
  days_elapsed: number;
  total_rooms: number;
  daily: {
    by_type: Record<string, number>;
    rev_by_type: Record<string, number>;
    rev_by_method: Record<string, number>;
    total_count: number;
    total_revenue: number;
    sources: Record<string, number>;
    occupancy_rate: number;
    adr: number;
    revpar: number;
  };
  monthly: {
    rev_by_type: Record<string, number>;
    rev_by_method: Record<string, number>;
    total_revenue: number;
    room_nights: number;
    available: number;
    occupancy_rate: number;
    adr: number;
    revpar: number;
  };
}

const ROOM_TYPES = ['A', 'V', 'C'] as const;
const METHODS = ['cash','qr','credit_card','trip','agoda','expedia','wechat','alipay'] as const;

const TYPE_BG: Record<string, string> = {
  A: 'bg-blue-50', V: 'bg-purple-50', C: 'bg-emerald-50',
};
const TYPE_COLOR: Record<string, string> = {
  A: 'text-blue-700', V: 'text-purple-700', C: 'text-emerald-700',
};

function fmt(n: number) {
  if (!n) return '—';
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function pct(n: number) { return `${(n * 100).toFixed(2)}%`; }

function StatCard({ icon, label, daily, monthly, unit = '฿', highlight = false }: {
  icon: React.ReactNode; label: string;
  daily: number | string; monthly: number | string;
  unit?: string; highlight?: boolean;
}) {
  const fmtVal = (v: number | string) =>
    typeof v === 'number' ? (unit === '%' ? pct(v) : fmt(v)) : v;
  return (
    <div className={`rounded-xl border p-4 space-y-3 ${highlight ? 'bg-indigo-50 border-indigo-200' : 'bg-white'}`}>
      <div className="flex items-center gap-2 text-slate-500">{icon}<span className="text-xs font-medium">{label}</span></div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-wide">TODAY</p>
          <p className={`text-xl font-bold ${highlight ? 'text-indigo-700' : 'text-slate-800'}`}>{fmtVal(daily)}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-wide">MTD</p>
          <p className="text-xl font-bold text-slate-500">{fmtVal(monthly)}</p>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard({ data }: { data: DashboardData }) {
  const { t } = useLang();
  const { daily, monthly, total_rooms, days_elapsed } = data;

  const typeLabel: Record<string, string> = {
    A: t.room_type_a, V: t.room_type_v, C: t.room_type_c,
  };

  const dateLabel = new Date(data.date).toLocaleDateString('th-TH', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-400 uppercase tracking-wide">{t.dash_subtitle}</p>
          <h2 className="text-base font-semibold text-slate-800">{dateLabel}</h2>
        </div>
        <span className="text-xs text-slate-400 bg-slate-100 px-3 py-1 rounded-full">
          {t.dash_total_rooms(total_rooms)}
        </span>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<BedDouble className="h-4 w-4"/>} label={t.dash_kpi_rooms}
          daily={daily.total_count} monthly={monthly.room_nights} unit="ห้อง" highlight />
        <StatCard icon={<DollarSign className="h-4 w-4"/>} label={t.dash_kpi_revenue}
          daily={daily.total_revenue} monthly={monthly.total_revenue} highlight />
        <StatCard icon={<Percent className="h-4 w-4"/>} label={t.dash_kpi_occupancy}
          daily={daily.occupancy_rate} monthly={monthly.occupancy_rate} unit="%" />
        <StatCard icon={<TrendingUp className="h-4 w-4"/>} label={t.dash_kpi_revpar}
          daily={daily.revpar} monthly={monthly.revpar} />
      </div>

      {/* Revenue by type */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-4 py-3 border-b bg-slate-50">
          <h3 className="text-sm font-semibold text-slate-700">{t.dash_revenue_type}</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50 text-xs text-slate-500">
              <th className="px-4 py-2 text-left font-medium">{t.col_type}</th>
              <th className="px-4 py-2 text-right font-medium">{t.dash_col_opened}</th>
              <th className="px-4 py-2 text-right font-medium">{t.dash_col_rev_day}</th>
              <th className="px-4 py-2 text-right font-medium">{t.dash_col_rev_month}</th>
            </tr>
          </thead>
          <tbody>
            {ROOM_TYPES.map((type) => (
              <tr key={type} className={`border-b ${TYPE_BG[type]}`}>
                <td className={`px-4 py-2.5 font-semibold ${TYPE_COLOR[type]}`}>{typeLabel[type]}</td>
                <td className="px-4 py-2.5 text-right text-slate-700">{daily.by_type[type] ?? 0}</td>
                <td className="px-4 py-2.5 text-right font-medium text-slate-800">{fmt(daily.rev_by_type[type] ?? 0)}</td>
                <td className="px-4 py-2.5 text-right text-slate-500">{fmt(monthly.rev_by_type[type] ?? 0)}</td>
              </tr>
            ))}
            <tr className="bg-slate-700 text-white font-bold text-sm">
              <td className="px-4 py-2.5">{t.dash_total_row}</td>
              <td className="px-4 py-2.5 text-right">{daily.total_count}</td>
              <td className="px-4 py-2.5 text-right text-yellow-300">{fmt(daily.total_revenue)}</td>
              <td className="px-4 py-2.5 text-right text-yellow-200">{fmt(monthly.total_revenue)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Occupancy + Sources */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="px-4 py-3 border-b bg-slate-50">
            <h3 className="text-sm font-semibold text-slate-700">{t.dash_occupancy}</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-slate-400">
                <th className="px-4 py-2 text-left font-medium"></th>
                <th className="px-4 py-2 text-right font-medium">{t.dash_daily_label}</th>
                <th className="px-4 py-2 text-right font-medium">{t.dash_monthly_label}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {[
                { label: t.dash_stat_opened,    d: daily.total_count,         m: monthly.room_nights },
                { label: t.dash_stat_available, d: total_rooms,               m: total_rooms * days_elapsed },
                { label: t.dash_stat_rate,      d: pct(daily.occupancy_rate), m: pct(monthly.occupancy_rate) },
                { label: t.dash_stat_adr,       d: fmt(daily.adr),            m: fmt(monthly.adr) },
                { label: t.dash_stat_revpar,    d: fmt(daily.revpar),         m: fmt(monthly.revpar) },
              ].map((row) => (
                <tr key={row.label} className="hover:bg-slate-50">
                  <td className="px-4 py-2 text-slate-500">{row.label}</td>
                  <td className="px-4 py-2 text-right font-medium text-slate-800">{row.d}</td>
                  <td className="px-4 py-2 text-right text-slate-500">{row.m}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="px-4 py-3 border-b bg-slate-50">
            <h3 className="text-sm font-semibold text-slate-700">{t.dash_sources}</h3>
          </div>
          <div className="p-4 space-y-3">
            {[
              { key: 'direct',  label: t.dash_src_direct, color: 'bg-slate-400' },
              { key: 'trip',    label: 'Trip.com',         color: 'bg-blue-400' },
              { key: 'agoda',   label: 'Agoda',            color: 'bg-red-400' },
              { key: 'expedia', label: 'Expedia',          color: 'bg-amber-400' },
            ].map(({ key, label, color }) => {
              const count   = daily.sources[key] ?? 0;
              const pctVal  = daily.total_count > 0 ? count / daily.total_count : 0;
              return (
                <div key={key} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-600">{label}</span>
                    <span className="font-semibold text-slate-800">{count} {t.unit_rooms} ({pct(pctVal)})</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2">
                    <div className={`h-2 rounded-full ${color}`} style={{ width: `${pctVal * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Payment breakdown */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-4 py-3 border-b bg-slate-50">
          <h3 className="text-sm font-semibold text-slate-700">{t.dash_payment}</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50 text-xs text-slate-500">
              <th className="px-4 py-2 text-left font-medium">{t.field_method}</th>
              <th className="px-4 py-2 text-right font-medium">{t.dash_daily_label} (฿)</th>
              <th className="px-4 py-2 text-right font-medium">{t.dash_monthly_label} (฿)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {METHODS.map((m) => {
              const d  = daily.rev_by_method[m] ?? 0;
              const mo = monthly.rev_by_method[m] ?? 0;
              if (d === 0 && mo === 0) return null;
              return (
                <tr key={m} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 text-slate-600">{getPayLabel(m, t)}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-slate-800">
                    {d > 0 ? fmt(d) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-500">
                    {mo > 0 ? fmt(mo) : <span className="text-slate-300">—</span>}
                  </td>
                </tr>
              );
            })}
            <tr className="bg-slate-700 text-white font-bold">
              <td className="px-4 py-2.5">{t.dash_pay_total}</td>
              <td className="px-4 py-2.5 text-right text-yellow-300">{fmt(daily.total_revenue)}</td>
              <td className="px-4 py-2.5 text-right text-yellow-200">{fmt(monthly.total_revenue)}</td>
            </tr>
            <tr className="bg-slate-50 text-xs text-slate-400">
              <td className="px-4 py-2">{t.dash_balance}</td>
              <td className="px-4 py-2 text-right font-semibold text-green-600">0</td>
              <td className="px-4 py-2 text-right font-semibold text-green-600">0</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
