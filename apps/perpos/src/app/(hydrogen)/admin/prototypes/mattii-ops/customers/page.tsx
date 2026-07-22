"use client";

// customers/page.tsx — ทะเบียนลูกค้า (Contract v3 §4 หน้า 7)
// ค้นหา + กรองช่องทาง/ระดับลูกค้า · row click → dialog ประวัติการสั่ง/ยอดสะสม/ช่องทางที่ติดต่อ
// mock: เพิ่ม/แก้ไขอยู่ใน client state ของหน้านี้ (data-context ยังไม่มี setter ของลูกค้า)

import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/toast";
import { CHAT_CHANNEL_LABEL, CUSTOMER_TIER_LABEL } from "../_fixtures/labels";
import { MOCK_ORG_ID } from "../_fixtures/helpers";
import type { ChatChannel, CustomerTier, MattiiCustomer } from "../_fixtures/types";
import {
  FilterBar,
  MattiiShell,
  NoAccess,
  fmtNum,
  useMattiiData,
  useMattiiRole,
} from "../_components";
import { CustomersTable } from "./customers-table";
import { CustomerDetailDialog } from "./customer-detail-dialog";
import { CustomerFormDialog, type CustomerFormValues } from "./customer-form-dialog";

const CHANNEL_OPTIONS = [
  { value: "", label: "ทุกช่องทาง" },
  ...(Object.keys(CHAT_CHANNEL_LABEL) as ChatChannel[]).map((c) => ({
    value: c as string,
    label: CHAT_CHANNEL_LABEL[c],
  })),
];
const TIER_OPTIONS = [
  { value: "", label: "ทุกระดับลูกค้า" },
  ...(Object.keys(CUSTOMER_TIER_LABEL) as CustomerTier[]).map((t) => ({
    value: t as string,
    label: CUSTOMER_TIER_LABEL[t],
  })),
];

let cusSeq = 1;

export default function MattiiCustomersPage() {
  const { can } = useMattiiRole();
  const { customers: seedCustomers } = useMattiiData();

  const [rows, setRows] = useState<MattiiCustomer[]>(() => seedCustomers);
  const [search, setSearch] = useState("");
  const [channel, setChannel] = useState<ChatChannel | "">("");
  const [tier, setTier] = useState<CustomerTier | "">("");
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(false), 400);
    return () => window.clearTimeout(timer);
  }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((c) => {
        if (channel && c.primary_channel !== channel) return false;
        if (tier && c.tier !== tier) return false;
        if (q) {
          const hay = [c.display_name, c.full_name ?? "", c.code, c.phone ?? "", c.province ?? ""]
            .join(" ")
            .toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [rows, search, channel, tier]);

  const selected = selectedId ? (rows.find((c) => c.id === selectedId) ?? null) : null;
  const editing = editingId ? (rows.find((c) => c.id === editingId) ?? null) : null;
  const hasFilter = !!(search || channel || tier);

  function clearFilters() {
    setSearch("");
    setChannel("");
    setTier("");
  }

  function nextCode(): string {
    const max = rows.reduce((m, c) => {
      const n = Number(c.code.split("-").pop());
      return Number.isFinite(n) && n > m ? n : m;
    }, 0);
    return `CUS-${String(max + 1).padStart(4, "0")}`;
  }

  function handleSubmit(values: CustomerFormValues) {
    const now = new Date().toISOString();
    if (editing) {
      setRows((prev) =>
        prev.map((c) =>
          c.id === editing.id
            ? {
                ...c,
                display_name: values.display_name.trim(),
                full_name: values.full_name || null,
                phone: values.phone || null,
                primary_channel: values.primary_channel,
                tier: values.tier,
                address_line: values.address_line || null,
                subdistrict: values.subdistrict || null,
                district: values.district || null,
                province: values.province || null,
                postcode: values.postcode || null,
                note: values.note || null,
                updated_at: now,
              }
            : c,
        ),
      );
      notify.saved(`บันทึกข้อมูล ${values.display_name} แล้ว`);
    } else {
      const row: MattiiCustomer = {
        id: `cus-new-${Date.now()}-${cusSeq++}`,
        org_id: MOCK_ORG_ID,
        code: nextCode(),
        display_name: values.display_name.trim(),
        full_name: values.full_name || null,
        phone: values.phone || null,
        primary_channel: values.primary_channel,
        channel_handles: {},
        tier: values.tier,
        address_line: values.address_line || null,
        subdistrict: values.subdistrict || null,
        district: values.district || null,
        province: values.province || null,
        postcode: values.postcode || null,
        total_orders: 0,
        total_spent: 0,
        note: values.note || null,
        created_at: now,
        updated_at: now,
      };
      setRows((prev) => [row, ...prev]);
      notify.created(`เพิ่มลูกค้า ${row.display_name} (${row.code}) แล้ว`);
    }
    setEditingId(null);
  }

  if (!can("view", "customers")) {
    return (
      <NoAccess title="ลูกค้า" icon={<Users className="h-6 w-6" />}>
        บทบาทนี้ไม่มีสิทธิ์ดูทะเบียนลูกค้า — ลองสลับเป็นเจ้าของ/ผู้จัดการ หรือฝ่ายขาย
      </NoAccess>
    );
  }

  const canWrite = can("write", "customers");

  return (
    <MattiiShell
      title="ลูกค้า"
      description="ทะเบียนลูกค้าพร้อมประวัติการสั่ง ยอดสะสม และช่องทางที่ใช้ติดต่อ"
      icon={<Users className="h-6 w-6" />}
      actions={
        canWrite ? (
          <Button
            onClick={() => {
              setEditingId(null);
              setFormOpen(true);
            }}
          >
            <Plus className="mr-1.5 h-4 w-4" /> เพิ่มลูกค้า
          </Button>
        ) : undefined
      }
    >
      <FilterBar
        onClear={hasFilter ? clearFilters : undefined}
        resultText={`พบ ${fmtNum(visible.length)} ราย จากทั้งหมด ${fmtNum(rows.length)} ราย`}
      >
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อ / รหัสลูกค้า / เบอร์โทร"
            className="pl-9"
          />
        </div>
        <CustomSelect
          value={channel}
          onChange={(v) => setChannel(v as ChatChannel | "")}
          options={CHANNEL_OPTIONS}
          className="w-40"
        />
        <CustomSelect
          value={tier}
          onChange={(v) => setTier(v as CustomerTier | "")}
          options={TIER_OPTIONS}
          className="w-44"
        />
      </FilterBar>

      <CustomersTable
        customers={visible}
        loading={loading}
        filtered={hasFilter}
        canWrite={canWrite}
        onSelect={(c) => setSelectedId(c.id)}
        onClearFilters={clearFilters}
        onCreate={() => {
          setEditingId(null);
          setFormOpen(true);
        }}
      />

      <CustomerDetailDialog
        customer={selected}
        canWrite={canWrite}
        onOpenChange={(v) => !v && setSelectedId(null)}
        onEdit={(c) => {
          setSelectedId(null);
          setEditingId(c.id);
          setFormOpen(true);
        }}
      />

      <CustomerFormDialog
        open={formOpen}
        editing={editing}
        onOpenChange={(v) => {
          setFormOpen(v);
          if (!v) setEditingId(null);
        }}
        onSubmit={handleSubmit}
      />
    </MattiiShell>
  );
}
