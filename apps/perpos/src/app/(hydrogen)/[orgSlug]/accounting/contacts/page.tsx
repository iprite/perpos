"use client";

// contacts/page.tsx (production) — A4 ลูกค้า/ผู้ขาย
//   StatCard (ลูกค้า/ผู้ขาย/ทั้งหมด) + filter (ค้นหา/ประเภท) + Table row→ContactDialog (CRUD API จริง)
// gate §4: contacts — owner/accountant/staff (W) · viewer (V)

import { useMemo, useState } from "react";
import { Users, Search, UserCheck, Truck, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
  TableLoading,
} from "@/components/ui/table";
import { AccountingShell, useAccountingRole, useAccountingData, NoAccess } from "../_components";
import { ContactDialog } from "../_components/contact-dialog";
import type { AccContact } from "@/lib/accounting/types";

const KIND_FILTER = [
  { value: "", label: "ทุกประเภท" },
  { value: "customer", label: "ลูกค้า" },
  { value: "vendor", label: "ผู้ขาย" },
  { value: "both", label: "ทั้งสอง" },
];

const KIND_META: Record<
  AccContact["kind"],
  { label: string; tone: "info" | "warning" | "success" }
> = {
  customer: { label: "ลูกค้า", tone: "info" },
  vendor: { label: "ผู้ขาย", tone: "warning" },
  both: { label: "ทั้งสอง", tone: "success" },
};

export default function ContactsPage() {
  const { can } = useAccountingRole();
  const canView = can("view", "contacts");
  const canWrite = can("write", "contacts");

  const { contacts, loading } = useAccountingData();

  const [search, setSearch] = useState("");
  const [kindF, setKindF] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<AccContact | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts
      .filter((c) => {
        if (kindF && c.kind !== kindF) return false;
        if (q) {
          const hay = `${c.name} ${c.tax_id ?? ""} ${c.phone ?? ""} ${c.email ?? ""}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name, "th"));
  }, [contacts, search, kindF]);

  const stats = useMemo(() => {
    const customers = contacts.filter((c) => c.kind === "customer" || c.kind === "both").length;
    const vendors = contacts.filter((c) => c.kind === "vendor" || c.kind === "both").length;
    return { customers, vendors, total: contacts.length };
  }, [contacts]);

  function openAdd() {
    setSelected(null);
    setDialogOpen(true);
  }
  function openEdit(c: AccContact) {
    setSelected(c);
    setDialogOpen(true);
  }

  if (!canView)
    return (
      <NoAccess title="ลูกค้า/ผู้ขาย" icon={<Users className="h-6 w-6" />}>
        บทบาทนี้ไม่สามารถดูข้อมูลผู้ติดต่อได้
      </NoAccess>
    );

  return (
    <AccountingShell
      title="ลูกค้า/ผู้ขาย"
      description="ฐานข้อมูลผู้ติดต่อ — ใช้ซ้ำในเอกสารขาย ออกบิลได้เร็วขึ้น"
      icon={<Users className="h-6 w-6" />}
      actions={
        canWrite ? (
          <Button onClick={openAdd}>
            <Plus className="mr-1.5 h-4 w-4" /> เพิ่มผู้ติดต่อ
          </Button>
        ) : undefined
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          icon={<UserCheck className="h-4 w-4" />}
          label="ลูกค้า"
          value={String(stats.customers)}
          tone="info"
        />
        <StatCard
          icon={<Truck className="h-4 w-4" />}
          label="ผู้ขาย/ซัพพลายเออร์"
          value={String(stats.vendors)}
          tone="warning"
        />
        <StatCard
          icon={<Users className="h-4 w-4" />}
          label="ทั้งหมด"
          value={String(stats.total)}
          tone="neutral"
        />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="relative sm:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              className="pl-9"
              placeholder="ค้นหา ชื่อ / เลขภาษี / โทร / อีเมล"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <CustomSelect value={kindF} onChange={setKindF} options={KIND_FILTER} />
        </div>
      </div>

      <Table className="shadow-sm">
        <TableHeader>
          <TableRow>
            <TableHead>ชื่อ</TableHead>
            <TableHead align="center">ประเภท</TableHead>
            <TableHead>เลขผู้เสียภาษี</TableHead>
            <TableHead>โทรศัพท์</TableHead>
            <TableHead>อีเมล</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading.contacts ? (
            <TableLoading colSpan={5} />
          ) : filtered.length === 0 ? (
            <TableEmpty colSpan={5}>
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <div className="rounded-full bg-gray-100 p-4">
                  <Users className="h-8 w-8 text-gray-400" />
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900">ยังไม่มีผู้ติดต่อ</div>
                  <div className="mt-1 text-sm text-gray-500">
                    เพิ่มลูกค้าหรือผู้ขายเพื่อใช้ซ้ำตอนออกเอกสาร
                  </div>
                </div>
                {canWrite && (
                  <Button size="sm" onClick={openAdd}>
                    <Plus className="mr-1.5 h-4 w-4" /> เพิ่มผู้ติดต่อแรก
                  </Button>
                )}
              </div>
            </TableEmpty>
          ) : (
            filtered.map((c) => {
              const m = KIND_META[c.kind];
              return (
                <TableRow key={c.id} clickable onClick={() => openEdit(c)}>
                  <TableCell className="text-gray-900">{c.name}</TableCell>
                  <TableCell align="center">
                    <StatusBadge tone={m.tone}>{m.label}</StatusBadge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-xs tabular-nums text-gray-500">
                    {c.tax_id ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-gray-500">
                    {c.phone ?? "—"}
                  </TableCell>
                  <TableCell className="text-gray-500">{c.email ?? "—"}</TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      <ContactDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        contact={selected}
        canWrite={canWrite}
      />
    </AccountingShell>
  );
}
