import {
  Users,
  Building2,
  Activity,
  Webhook,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  CreditCard,
  Wrench,
  Clock,
  LayoutDashboard,
} from "lucide-react";
import Link from "next/link";
import { requireSuperAdminPage } from "@/lib/admin/guard";
import { computeAdminDashboard } from "@/lib/admin/dashboard";
import { PLAN_LABELS, PLAN_COLORS, type PlanTier } from "@/lib/billing";
import { StatCard, type StatTone } from "@/components/ui/stat-card";
import { PageCard } from "@/components/ui/page-shell";
import { OrgLink } from "@/components/admin/org-link";
import { AdminPage } from "./_components/admin-page";

// ── Helpers ───────────────────────────────────────────────────────────────────

const GRADE_COLOR: Record<string, string> = {
  A: "bg-green-50  border border-green-200  text-green-700",
  B: "bg-blue-50   border border-blue-200   text-blue-700",
  C: "bg-yellow-50 border border-yellow-200 text-yellow-700",
  D: "bg-orange-50 border border-orange-200 text-orange-700",
  F: "bg-red-50    border border-red-200    text-red-700",
};

function fmtNum(n: number) {
  return n.toLocaleString();
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  });
}

// ── Main (Server Component — fetch ตอน SSR ไม่มี client round-trip) ──────────────

export default async function AdminDashboardPage() {
  const admin = await requireSuperAdminPage();
  const data = await computeAdminDashboard(admin);
  const { users, orgs, billing, api, webhooks, health_grades, attention_orgs, recent_orgs } = data;

  const apiTone: StatTone =
    api.error_rate_pct > 5 ? "negative" : api.error_rate_pct > 1 ? "warning" : "info";
  const hookTone: StatTone =
    webhooks.fail_rate_pct > 10 ? "negative" : webhooks.fail_rate_pct > 3 ? "warning" : "info";

  return (
    <AdminPage
      title="Super Admin Dashboard"
      icon={<LayoutDashboard className="h-6 w-6" />}
      description={`อัปเดต ${new Date(data.computed_at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}`}
    >
      {/* Attention banner */}
      {(billing.expired > 0 || billing.overdue > 0 || orgs.maintenance > 0) && (
        <div className="flex flex-wrap gap-3">
          {billing.expired > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              {billing.expired} org plan หมดอายุ
            </div>
          )}
          {billing.overdue > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-4 py-2.5 text-sm text-orange-700">
              <CreditCard className="h-4 w-4 flex-shrink-0" />
              {billing.overdue} org ค้างชำระ
            </div>
          )}
          {orgs.maintenance > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-2.5 text-sm text-yellow-700">
              <Wrench className="h-4 w-4 flex-shrink-0" />
              {orgs.maintenance} org อยู่ใน Maintenance Mode
            </div>
          )}
        </div>
      )}

      {/* Top stat cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          icon={<Building2 className="h-4 w-4" />}
          label="Orgs ทั้งหมด"
          value={fmtNum(orgs.total)}
          tone="info"
        />
        <StatCard
          icon={<Users className="h-4 w-4" />}
          label="Users ทั้งหมด"
          value={fmtNum(users.total)}
          sub={`${fmtNum(users.active)} active`}
          tone="primary"
        />
        <StatCard
          icon={<Activity className="h-4 w-4" />}
          label="API requests (24h)"
          value={fmtNum(api.requests_24h)}
          sub={`${api.error_rate_pct}% error rate`}
          tone={apiTone}
        />
        <StatCard
          icon={<Webhook className="h-4 w-4" />}
          label="Webhooks (7d)"
          value={fmtNum(webhooks.deliveries_7d)}
          sub={`${webhooks.fail_rate_pct}% fail rate`}
          tone={hookTone}
        />
      </div>

      {/* Mid row: Health grades + Billing tiers + Users breakdown */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Health grades */}
        <PageCard title={"Tenant Health Grades"}>
          <div className="flex gap-2">
            {["A", "B", "C", "D", "F"].map((g) => (
              <div
                key={g}
                className={`flex-1 rounded-lg border py-2 text-center ${GRADE_COLOR[g]}`}
              >
                <div className="text-xl font-bold">{health_grades[g] ?? 0}</div>
                <div className="text-xs font-semibold">{g}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 text-right text-xs text-gray-400">
            <Link
              href="/admin/health"
              className="underline-offset-2 hover:text-blue-600 hover:underline"
            >
              ดูรายละเอียด →
            </Link>
          </div>
        </PageCard>

        {/* Billing tiers */}
        <PageCard title={"Billing Tiers"}>
          <div className="space-y-2">
            {(["enterprise", "pro", "starter", "free"] as PlanTier[]).map((tier) => {
              const count = billing.tier_counts[tier] ?? 0;
              const pct = orgs.total > 0 ? Math.round((count / orgs.total) * 100) : 0;
              return (
                <div key={tier} className="flex items-center gap-3">
                  <span
                    className={`w-20 rounded-full px-2 py-0.5 text-center text-xs font-semibold ${PLAN_COLORS[tier]}`}
                  >
                    {PLAN_LABELS[tier]}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-2 rounded-full bg-blue-400 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-6 text-right text-sm font-medium text-gray-700">{count}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-3 text-right text-xs text-gray-400">
            <Link
              href="/admin/billing"
              className="underline-offset-2 hover:text-blue-600 hover:underline"
            >
              จัดการ Billing →
            </Link>
          </div>
        </PageCard>

        {/* Users breakdown */}
        <PageCard title={"Users"}>
          <div className="space-y-3">
            {[
              {
                label: "Active",
                value: users.active,
                icon: <CheckCircle className="h-3.5 w-3.5 text-green-500" />,
              },
              {
                label: "LINE Linked",
                value: users.line_linked,
                icon: <TrendingUp className="h-3.5 w-3.5 text-blue-500" />,
              },
              {
                label: "Super Admins",
                value: users.super_admins,
                icon: <Users className="h-3.5 w-3.5 text-purple-500" />,
              },
            ].map(({ label, value, icon }) => (
              <div key={label} className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  {icon}
                  {label}
                </div>
                <span className="text-sm font-semibold text-gray-900">{fmtNum(value)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap justify-end gap-3 text-xs text-gray-400">
            <Link
              href="/admin/stt-stats"
              className="underline-offset-2 hover:text-blue-600 hover:underline"
            >
              สถิติแกะเสียง →
            </Link>
            <Link
              href="/admin/stt-jobs"
              className="underline-offset-2 hover:text-blue-600 hover:underline"
            >
              งานแกะเสียง →
            </Link>
            <Link
              href="/admin/users"
              className="underline-offset-2 hover:text-blue-600 hover:underline"
            >
              จัดการผู้ใช้ →
            </Link>
          </div>
        </PageCard>
      </div>

      {/* Bottom row: Attention orgs + Recent orgs */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Needs attention */}
        <PageCard title={"ต้องดูแล"}>
          {attention_orgs.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle className="h-4 w-4" /> ทุก org ปกติดี
            </div>
          ) : (
            <div className="space-y-2">
              {attention_orgs.map((o) => (
                <div
                  key={o.org_id}
                  className="flex items-center justify-between border-b border-gray-100 py-1.5 last:border-0"
                >
                  <OrgLink orgId={o.org_id} className="text-sm text-gray-800">
                    {o.org_name}
                  </OrgLink>
                  <div className="flex gap-1.5">
                    {o.expired && (
                      <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700">
                        หมดอายุ
                      </span>
                    )}
                    {o.overdue && (
                      <span className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-0.5 text-xs font-medium text-orange-700">
                        ค้างชำระ
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </PageCard>

        {/* Recent orgs */}
        <PageCard title={"Org ใหม่ล่าสุด"}>
          {recent_orgs.length === 0 ? (
            <div className="text-sm text-gray-400">ยังไม่มี org</div>
          ) : (
            <div className="space-y-2">
              {recent_orgs.map((o) => (
                <div
                  key={o.id}
                  className="flex items-center justify-between border-b border-gray-100 py-1.5 last:border-0"
                >
                  <OrgLink orgId={o.id} className="text-sm text-gray-800">
                    {o.name}
                  </OrgLink>
                  <div className="flex items-center gap-1.5 text-xs text-gray-400">
                    <Clock className="h-3 w-3" />
                    {fmtDate(o.created_at)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </PageCard>
      </div>
    </AdminPage>
  );
}
