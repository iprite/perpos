"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CustomSelect } from "@/components/ui/custom-select";
import { PageShell } from "@/components/ui/page-shell";
import { TablePager, usePagination } from "@/components/ui/table-pager";
import { StatusBadge, type BadgeTone } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
} from "@/components/ui/table";
import { Plus, Briefcase, Search, Trash2, ExternalLink } from "lucide-react";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";

type Solution = {
  id: string;
  title: string;
  status: string;
  priority: string;
  value: number | null;
  start_date: string | null;
  end_date: string | null;
  description: string | null;
  tags: string[];
  client: { id: string; name: string } | null;
};

const STATUSES: { value: string; label: string; color: string; header: string; tone: BadgeTone }[] =
  [
    {
      value: "lead",
      label: "Lead",
      color: "border-slate-200",
      header: "bg-slate-50 text-slate-600",
      tone: "neutral",
    },
    {
      value: "proposal",
      label: "Proposal",
      color: "border-blue-200",
      header: "bg-blue-50 text-blue-700",
      tone: "info",
    },
    {
      value: "in_progress",
      label: "In Progress",
      color: "border-amber-200",
      header: "bg-amber-50 text-amber-700",
      tone: "warning",
    },
    {
      value: "on_hold",
      label: "On Hold",
      color: "border-orange-200",
      header: "bg-orange-50 text-orange-700",
      tone: "warning",
    },
    {
      value: "completed",
      label: "Completed",
      color: "border-green-200",
      header: "bg-green-50 text-green-700",
      tone: "success",
    },
    {
      value: "cancelled",
      label: "Cancelled",
      color: "border-red-200",
      header: "bg-red-50 text-red-600",
      tone: "danger",
    },
  ];

const PRIORITY_DOT: Record<string, string> = {
  low: "bg-slate-300",
  medium: "bg-blue-400",
  high: "bg-orange-400",
  urgent: "bg-red-500",
};

const PRIORITY_COLOR: Record<string, string> = {
  low: "#9CA3AF",
  medium: "#4FC1E9",
  high: "#FC6E51",
  urgent: "#D8334A",
};

const STATUS_FILTER_OPTS = [
  { value: "", label: "ทุก Status" },
  ...STATUSES.map((s) => ({ value: s.value, label: s.label })),
];

export default function CrmSolutionsPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [orgId, setOrgId] = useState("");
  const [token, setToken] = useState("");
  const [solutions, setSolutions] = useState<Solution[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string; title: string }>({
    open: false,
    id: "",
    title: "",
  });
  const [statusFilter, setStatusFilter] = useState("");
  const [q, setQ] = useState("");

  const initAuth = useCallback(async () => {
    const { data: orgs } = await supabase
      .from("organizations")
      .select("id")
      .eq("slug", orgSlug)
      .single();
    const { data: sess } = await supabase.auth.getSession();
    if (orgs && sess.session) {
      setOrgId(orgs.id);
      setToken(sess.session.access_token);
    }
  }, [supabase, orgSlug]);

  const load = useCallback(async () => {
    if (!orgId || !token) return;
    setLoading(true);
    const params = new URLSearchParams({ orgId });
    if (statusFilter) params.set("status", statusFilter);
    const res = await fetch(`/api/crm/solutions?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setSolutions(await res.json());
    setLoading(false);
  }, [orgId, token, statusFilter]);

  useEffect(() => {
    initAuth();
  }, [initAuth]);
  useEffect(() => {
    if (orgId && token) load();
  }, [load, orgId, token]);

  const updateStatus = async (id: string, status: string) => {
    const res = await fetch(`/api/crm/solutions/${id}?orgId=${orgId}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      toast.error("อัปเดตสถานะไม่สำเร็จ");
      return;
    }
    setSolutions((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)));
    toast.success("อัปเดตสถานะแล้ว");
  };

  const doDeleteSolution = async () => {
    const res = await fetch(`/api/crm/solutions/${deleteConfirm.id}?orgId=${orgId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      toast.error("ลบไม่สำเร็จ");
      return;
    }
    setSolutions((prev) => prev.filter((s) => s.id !== deleteConfirm.id));
    setDeleteConfirm({ open: false, id: "", title: "" });
    toast.success("ลบโซลูชันแล้ว");
  };

  // Client-side text filter
  const filtered = useMemo(() => {
    if (!q.trim()) return solutions;
    const lq = q.toLowerCase();
    return solutions.filter(
      (s) =>
        s.title.toLowerCase().includes(lq) ||
        s.client?.name.toLowerCase().includes(lq) ||
        s.description?.toLowerCase().includes(lq) ||
        s.tags?.some((t) => t.toLowerCase().includes(lq)),
    );
  }, [solutions, q]);

  const grouped = useMemo(() => {
    const map: Record<string, Solution[]> = {};
    for (const s of STATUSES) map[s.value] = [];
    for (const sol of filtered) {
      if (map[sol.status]) map[sol.status].push(sol);
    }
    return map;
  }, [filtered]);

  // แบ่งหน้าเฉพาะ list view (kanban แสดงเป็นคอลัมน์ตามสถานะ ไม่แบ่งหน้า)
  const listPager = usePagination(filtered, { resetKey: `${q}|${statusFilter}` });

  return (
    <PageShell
      width="full"
      icon={<Briefcase className="h-6 w-6" />}
      title="Solution Tracking"
      actions={
        <>
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
            <Input
              className="h-8 w-44 pl-7 text-xs"
              placeholder="ค้นหา…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          {/* View toggle */}
          <div className="flex overflow-hidden rounded-lg border">
            {(["kanban", "list"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${viewMode === mode ? "bg-indigo-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
              >
                {mode === "kanban" ? "Kanban" : "List"}
              </button>
            ))}
          </div>
          <CustomSelect
            value={statusFilter}
            onChange={(v) => {
              setStatusFilter(v);
            }}
            options={STATUS_FILTER_OPTS}
            className="w-36"
          />
        </>
      }
    >
      {loading ? (
        <div className="py-10 text-center text-sm text-slate-400">กำลังโหลด…</div>
      ) : viewMode === "kanban" ? (
        /* ── Kanban ── */
        <div className="overflow-x-auto pb-4">
          <div className="flex min-w-max gap-3">
            {STATUSES.map((col) => {
              const cards = grouped[col.value] ?? [];
              return (
                <div
                  key={col.value}
                  className={`w-68 rounded-xl border ${col.color} flex flex-col`}
                  style={{ width: 272 }}
                >
                  <div
                    className={`flex items-center justify-between rounded-t-xl px-3 py-2 ${col.header}`}
                  >
                    <span className="text-xs font-semibold">{col.label}</span>
                    <span className="text-xs font-bold">{cards.length}</span>
                  </div>
                  <div className="flex min-h-24 flex-1 flex-col gap-2 p-2">
                    {cards.map((s) => (
                      <div
                        key={s.id}
                        className="group rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition-shadow hover:shadow"
                      >
                        <div className="flex items-start gap-2">
                          <span
                            className={`mt-1 h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT[s.priority] ?? "bg-slate-300"}`}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-1">
                              <Link href={`/${orgSlug}/crm/solutions/${s.id}`}>
                                <p className="text-xs font-semibold leading-snug text-slate-800 hover:text-indigo-600">
                                  {s.title}
                                </p>
                              </Link>
                              {/* Actions — show on hover */}
                              <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                                <Link href={`/${orgSlug}/crm/solutions/${s.id}`}>
                                  <button className="p-0.5 text-slate-300 hover:text-indigo-400">
                                    <ExternalLink className="h-3 w-3" />
                                  </button>
                                </Link>
                                <button
                                  onClick={() =>
                                    setDeleteConfirm({ open: true, id: s.id, title: s.title })
                                  }
                                  className="p-0.5 text-slate-300 hover:text-red-400"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                            {s.client && (
                              <Link href={`/${orgSlug}/crm/clients/${s.client.id}`}>
                                <p className="mt-0.5 truncate text-xs text-indigo-500 hover:underline">
                                  {s.client.name}
                                </p>
                              </Link>
                            )}
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              {s.value != null && (
                                <p className="text-xs text-slate-400">
                                  ฿{s.value.toLocaleString("th-TH")}
                                </p>
                              )}
                              {s.tags?.map((tag) => (
                                <span
                                  key={tag}
                                  className="rounded bg-indigo-50 px-1.5 py-0.5 text-xs text-indigo-600"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                        {/* Status mover */}
                        <div className="mt-2 flex flex-wrap gap-1 border-t pt-2">
                          {STATUSES.filter((t) => t.value !== col.value).map((t) => (
                            <button
                              key={t.value}
                              onClick={() => updateStatus(s.id, t.value)}
                              className="rounded border border-slate-200 px-1.5 py-0.5 text-xs text-slate-500 transition-colors hover:bg-slate-50"
                            >
                              → {t.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                    {cards.length === 0 && (
                      <div className="flex flex-1 items-center justify-center py-4 text-xs text-slate-300">
                        ว่าง
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* ── List view ── */
        <div className="space-y-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Solution</TableHead>
                <TableHead>ลูกค้า</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead align="right">มูลค่า</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableEmpty colSpan={5}>ไม่มี solutions</TableEmpty>
              ) : (
                listPager.rows.map((s) => {
                  const sc = STATUSES.find((x) => x.value === s.status);
                  return (
                    <TableRow
                      key={s.id}
                      clickable
                      onClick={() => router.push(`/${orgSlug}/crm/solutions/${s.id}`)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Briefcase className="h-4 w-4 shrink-0 text-slate-400" />
                          <span className="font-medium text-slate-800">{s.title}</span>
                        </div>
                        {s.description && (
                          <p className="mt-0.5 max-w-xs truncate pl-6 text-xs text-slate-400">
                            {s.description}
                          </p>
                        )}
                        {s.tags?.length > 0 && (
                          <div className="mt-1 flex gap-1 pl-6">
                            {s.tags.map((tag) => (
                              <span
                                key={tag}
                                className="whitespace-nowrap rounded bg-indigo-50 px-1.5 py-0.5 text-xs text-indigo-600"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {s.client ? (
                          <Link
                            href={`/${orgSlug}/crm/clients/${s.client.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs text-indigo-600 hover:underline"
                          >
                            {s.client.name}
                          </Link>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={sc?.tone ?? "neutral"}>
                          {sc?.label ?? s.status}
                        </StatusBadge>
                      </TableCell>
                      <TableCell>
                        <span
                          className="text-xs font-medium"
                          style={{ color: PRIORITY_COLOR[s.priority] ?? "#9CA3AF" }}
                        >
                          {s.priority}
                        </span>
                      </TableCell>
                      <TableCell align="right" tabular className="text-slate-600">
                        {s.value != null ? (
                          `฿${s.value.toLocaleString("th-TH")}`
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          <TablePager pager={listPager} />
        </div>
      )}

      {/* Empty hint */}
      {filtered.length === 0 && !loading && (
        <div className="text-center">
          <p className="mb-3 text-sm text-slate-500">เพิ่ม solution ได้จากหน้า Client Detail</p>
          <Link href={`/${orgSlug}/crm/clients`}>
            <Button variant="outline" size="sm">
              <Plus className="mr-1 h-4 w-4" /> ไปที่ลูกค้า
            </Button>
          </Link>
        </div>
      )}

      <ConfirmDeleteDialog
        open={deleteConfirm.open}
        onOpenChange={(o) => setDeleteConfirm((s) => ({ ...s, open: o }))}
        title={`ลบ "${deleteConfirm.title}"`}
        description="การกระทำนี้ไม่สามารถย้อนกลับได้"
        onConfirm={doDeleteSolution}
      />
    </PageShell>
  );
}
