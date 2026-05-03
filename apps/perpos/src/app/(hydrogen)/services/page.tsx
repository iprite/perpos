"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Button, Input } from "rizzui";
import { Title, Text } from "rizzui/typography";
import AppSelect from "@core/ui/app-select";
import TablePagination from "@core/components/table/pagination";
import { getCoreRowModel, getPaginationRowModel, useReactTable } from "@tanstack/react-table";
import TableSearch from "@/components/table/table-search";
import { useConfirmDialog } from "@/app/shared/confirm-dialog/provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type ServiceRow = {
  id: string;
  job_id: string;
  name: string;
  service_group_code: "mou" | "registration" | "general";
  cost: number;
  cost_detail: string | null;
  sell_price: number;
  sell_price_detail: string | null;
  task_list: string[];
  status: "active" | "inactive";
  created_at: string;
};

const serviceGroupOptions: Array<{ label: string; value: ServiceRow["service_group_code"] }> = [
  { label: "MOU", value: "mou" },
  { label: "ขึ้นทะเบียน", value: "registration" },
  { label: "ทั่วไป", value: "general" },
];

export default function ServicesPage() {
  const confirmDialog = useConfirmDialog();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const topRef = useRef<HTMLDivElement | null>(null);

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ServiceRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });
  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [jobId, setJobId] = useState("");
  const [name, setName] = useState("");
  const [group, setGroup] = useState<"mou" | "registration" | "general">("general");
  const [cost, setCost] = useState("0");
  const [costDetail, setCostDetail] = useState("");
  const [sellPrice, setSellPrice] = useState("0");
  const [sellPriceDetail, setSellPriceDetail] = useState("");
  const [tasksText, setTasksText] = useState("");

  const groupLabel = useCallback((code: ServiceRow["service_group_code"]) => {
    if (code === "mou") return "MOU";
    if (code === "registration") return "ขึ้นทะเบียน";
    return "ทั่วไป";
  }, []);

  const resetForm = useCallback(() => {
    setEditingId(null);
    setJobId("");
    setName("");
    setGroup("general");
    setCost("0");
    setCostDetail("");
    setSellPrice("0");
    setSellPriceDetail("");
    setTasksText("");
  }, []);

  const refresh = useCallback(() => {
    Promise.resolve().then(async () => {
      setLoading(true);
      setError(null);
      const { data, error: e } = await supabase
        .from("services")
        .select(
          "id,job_id,name,service_group_code,cost,cost_detail,sell_price,sell_price_detail,task_list,status,created_at",
        )
        .order("created_at", { ascending: false });
      if (e) {
        setError(e.message);
        setRows([]);
        setLoading(false);
        return;
      }
      setRows((data ?? []) as ServiceRow[]);
      setLoading(false);
    });
  }, [supabase]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  React.useEffect(() => {
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }, [rows.length, search]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = [r.job_id, r.name, r.service_group_code, r.status].map((x) => String(x ?? "").toLowerCase()).join(" ");
      return hay.includes(q);
    });
  }, [rows, search]);

  const table = useReactTable({
    data: filteredRows,
    columns: useMemo(() => [{ accessorKey: "id" }], []),
    state: { pagination },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const canSave = jobId.trim().length > 0 && name.trim().length > 0;
  const canDelete = !!editingId;
  const formTitle = editingId ? "แก้ไขบริการ" : "เพิ่มบริการ";

  return (
    <div ref={topRef}>
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <Title as="h1" className="text-lg font-semibold text-gray-900">
            บริการของเรา
          </Title>
          <Text className="mt-1 text-sm text-gray-600">รายการบริการเพื่อใช้ทำใบเสนอราคาและอ้างอิงงาน</Text>
        </div>
        <div className="flex flex-wrap gap-2">
          <TableSearch value={search} onChange={setSearch} />
          <Button
            variant="outline"
            onClick={() => {
              setEditingId(null);
              setShowForm(true);
              resetForm();
              topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
              window.setTimeout(() => {
                (document.getElementById("service-job-id") as HTMLInputElement | null)?.focus?.();
              }, 50);
            }}
            disabled={loading}
          >
            เพิ่มบริการ
          </Button>
        </div>
      </div>

      {showForm ? (
        <div className="mt-5 grid gap-3 rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-sm font-semibold text-gray-900">{formTitle}</div>
          <div className="grid gap-3 md:grid-cols-3">
            <Input
              id="service-job-id"
              label="Job id (ตั้งเอง)"
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
            />
            <Input label="ชื่อบริการ" value={name} onChange={(e) => setName(e.target.value)} />
            <div>
              <AppSelect
                label="กลุ่ม"
                placeholder="เลือก"
                options={serviceGroupOptions}
                value={group}
                onChange={(v: ServiceRow["service_group_code"]) => setGroup(v)}
                getOptionValue={(o) => o.value}
                displayValue={(selected) => serviceGroupOptions.find((o) => o.value === selected)?.label ?? ""}
                selectClassName="h-10 px-3"
              />
            </div>
            <Input label="ต้นทุน" value={cost} onChange={(e) => setCost(e.target.value)} inputMode="decimal" />
            <Input label="รายละเอียดต้นทุน" value={costDetail} onChange={(e) => setCostDetail(e.target.value)} />
            <Input label="ราคาขาย" value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} inputMode="decimal" />
            <Input label="รายละเอียดราคา" value={sellPriceDetail} onChange={(e) => setSellPriceDetail(e.target.value)} />
            <div className="md:col-span-3">
              <div className="mb-1 text-sm font-medium text-gray-700">รายละเอียด (รายการงานย่อย)</div>
              <textarea
                className="h-28 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gray-400"
                placeholder="พิมพ์ 1 งานต่อ 1 บรรทัด"
                value={tasksText}
                onChange={(e) => setTasksText(e.target.value)}
              />
              <div className="mt-1 text-xs text-gray-500">ระบบจะเก็บเป็น list งานย่อยของบริการนี้</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={async () => {
                setLoading(true);
                setError(null);
                const costNum = Number(cost || 0);
                const sellNum = Number(sellPrice || 0);
                const safeSell = Math.max(Number.isFinite(costNum) ? costNum : 0, Number.isFinite(sellNum) ? sellNum : 0);
                const taskList = tasksText
                  .split("\n")
                  .map((x) => x.trim())
                  .filter(Boolean);

                const payload = {
                  job_id: jobId.trim(),
                  name: name.trim(),
                  service_group_code: group,
                  service_group: groupLabel(group),
                  cost: Number.isFinite(costNum) ? costNum : 0,
                  base_price: Number.isFinite(costNum) ? costNum : 0,
                  cost_detail: costDetail.trim() || null,
                  sell_price: safeSell,
                  sell_price_detail: sellPriceDetail.trim() || null,
                  task_list: taskList,
                  status: "active" as const,
                };

                const { error: e } = editingId
                  ? await supabase.from("services").update(payload).eq("id", editingId)
                  : await supabase.from("services").insert(payload);
                if (e) {
                  setError(e.message);
                  setLoading(false);
                  return;
                }
                toast.success(editingId ? "อัปเดตแล้ว" : "บันทึกแล้ว");
                resetForm();
                setShowForm(false);
                setLoading(false);
                refresh();
              }}
              disabled={loading || !canSave}
            >
              {editingId ? "อัปเดต" : "บันทึก"}
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                if (!editingId) return;
                const ok = await confirmDialog({
                  title: "ยืนยันการลบ",
                  message: "ต้องการลบบริการนี้หรือไม่?",
                  confirmText: "ลบ",
                  tone: "danger",
                });
                if (!ok) return;
                setLoading(true);
                setError(null);
                const { error: e } = await supabase.from("services").delete().eq("id", editingId);
                if (e) {
                  setError(e.message);
                  setLoading(false);
                  return;
                }
                toast.success("ลบแล้ว");
                resetForm();
                setShowForm(false);
                setLoading(false);
                refresh();
              }}
              disabled={loading || !canDelete}
            >
              ลบ
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                resetForm();
                setShowForm(false);
              }}
              disabled={loading}
            >
              ยกเลิก
            </Button>
          </div>
        </div>
      ) : null}

      {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="grid grid-cols-[0.55fr_1.2fr_0.7fr_0.55fr_0.55fr_0.6fr] gap-3 border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-600">
          <div>Job id</div>
          <div>บริการ</div>
          <div>กลุ่ม</div>
          <div>ต้นทุน</div>
          <div>ราคาขาย</div>
          <div>สถานะ</div>
        </div>
        {rows.length === 0 ? (
          <div className="px-4 py-8 text-sm text-gray-500">
            {loading ? "กำลังโหลด..." : "ยังไม่มีข้อมูล"}
          </div>
        ) : (
          table.getRowModel().rows.map((row) => {
            const r = row.original as ServiceRow;
            return (
              <div
                key={r.id}
              role="button"
              tabIndex={0}
              className="grid cursor-pointer grid-cols-[0.55fr_1.2fr_0.7fr_0.55fr_0.55fr_0.6fr] gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0 transition-colors hover:bg-gray-100 active:bg-gray-200"
              onClick={() => {
                setEditingId(r.id);
                setShowForm(true);
                setJobId(r.job_id ?? "");
                setName(r.name ?? "");
                setGroup(r.service_group_code ?? "general");
                setCost(String(r.cost ?? 0));
                setCostDetail(r.cost_detail ?? "");
                setSellPrice(String(r.sell_price ?? 0));
                setSellPriceDetail(r.sell_price_detail ?? "");
                setTasksText(Array.isArray(r.task_list) ? r.task_list.join("\n") : "");
                topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                window.setTimeout(() => {
                  (document.getElementById("service-job-id") as HTMLInputElement | null)?.focus?.();
                }, 50);
              }}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                setEditingId(r.id);
                setShowForm(true);
                setJobId(r.job_id ?? "");
                setName(r.name ?? "");
                setGroup(r.service_group_code ?? "general");
                setCost(String(r.cost ?? 0));
                setCostDetail(r.cost_detail ?? "");
                setSellPrice(String(r.sell_price ?? 0));
                setSellPriceDetail(r.sell_price_detail ?? "");
                setTasksText(Array.isArray(r.task_list) ? r.task_list.join("\n") : "");
                topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                window.setTimeout(() => {
                  (document.getElementById("service-job-id") as HTMLInputElement | null)?.focus?.();
                }, 50);
              }}
            >
              <div className="text-sm font-medium text-gray-900">{r.job_id}</div>
              <div>
                <div className="text-sm font-medium text-gray-900">{r.name}</div>
                {r.cost_detail ? <div className="mt-0.5 text-xs text-gray-500">{r.cost_detail}</div> : null}
                {r.sell_price_detail ? <div className="mt-0.5 text-xs text-gray-500">{r.sell_price_detail}</div> : null}
                {Array.isArray(r.task_list) && r.task_list.length ? (
                  <div className="mt-2 text-xs text-gray-500">
                    <div className="font-medium text-gray-700">งานย่อย</div>
                    <ul className="mt-1 list-disc pl-4">
                      {r.task_list.slice(0, 4).map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                      {r.task_list.length > 4 ? <li>+{r.task_list.length - 4} รายการ</li> : null}
                    </ul>
                  </div>
                ) : null}
              </div>
              <div className="text-sm text-gray-600">{groupLabel(r.service_group_code)}</div>
              <div className="text-sm text-gray-900">{Number(r.cost ?? 0).toLocaleString()}</div>
              <div className="text-sm text-gray-900">{Number(r.sell_price ?? 0).toLocaleString()}</div>
              <div className="text-sm text-gray-600">{r.status}</div>
              </div>
            );
          })
        )}
        <TablePagination table={table} />
      </div>
    </div>
  );
}
