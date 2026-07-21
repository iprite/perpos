"use client";

// accounts/page.tsx — B2 ผังบัญชี (chart of accounts) tree
//   tree ผ่าน TableCell indent (padding-left ตาม level) + filter type + AccountDialog
//   is_system ลบไม่ได้ · ข้อมูลจาก API จริง
// gate §4: accounts — owner(V) · accountant(W) · staff(–) · viewer(V)

import { useMemo, useState } from "react";
import { ListTree, Search, Plus, Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { CustomSelect } from "@/components/ui/custom-select";
import { Button } from "@/components/ui/button";
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
import {
  AccountingShell,
  useAccountingRole,
  useAccountingData,
  NoAccess,
  AccountDialog,
  AccountTypeBadge,
  ACCOUNT_TYPE_LABEL,
} from "../_components";
import type { AccAccount, AccAccountType } from "@/lib/accounting/types";

const TYPE_OPTIONS = [
  { value: "", label: "ทุกประเภท" },
  { value: "asset", label: "สินทรัพย์" },
  { value: "liability", label: "หนี้สิน" },
  { value: "equity", label: "ส่วนของเจ้าของ" },
  { value: "income", label: "รายได้" },
  { value: "expense", label: "ค่าใช้จ่าย" },
];

/** flatten tree เป็น list พร้อม level (depth) — DFS ตาม code */
function flattenTree(accounts: AccAccount[]): Array<AccAccount & { _level: number }> {
  const byParent = new Map<string | null, AccAccount[]>();
  for (const a of accounts) {
    const k = a.parent_id;
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k)!.push(a);
  }
  for (const list of Array.from(byParent.values()))
    list.sort((a, b) => a.code.localeCompare(b.code));

  const out: Array<AccAccount & { _level: number }> = [];
  const walk = (parentId: string | null, level: number) => {
    const children = byParent.get(parentId) ?? [];
    for (const c of children) {
      out.push({ ...c, _level: level });
      walk(c.id, level + 1);
    }
  };
  walk(null, 0);
  return out;
}

export default function AccountsPage() {
  const { can } = useAccountingRole();
  const canView = can("view", "accounts");
  const canWrite = can("write", "accounts");

  const { accounts, loading } = useAccountingData();

  const [search, setSearch] = useState("");
  const [typeF, setTypeF] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AccAccount | null>(null);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const isFiltering = q.length > 0 || typeF.length > 0;
    if (!isFiltering) return flattenTree(accounts);
    return accounts
      .filter((a) => {
        if (typeF && a.account_type !== typeF) return false;
        if (q) {
          const hay = `${a.code} ${a.name}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((a) => ({ ...a, _level: 0 }));
  }, [accounts, search, typeF]);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of accounts) m[a.account_type] = (m[a.account_type] ?? 0) + 1;
    return m;
  }, [accounts]);

  function openAdd() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(a: AccAccount) {
    setEditing(a);
    setDialogOpen(true);
  }

  if (!canView)
    return (
      <NoAccess title="ผังบัญชี" icon={<ListTree className="h-6 w-6" />}>
        หน้าหลังบ้านนี้สำหรับนักบัญชี — บทบาทของคุณไม่มีสิทธิ์ดูผังบัญชี
      </NoAccess>
    );

  return (
    <AccountingShell
      title="ผังบัญชี"
      description="โครงบัญชีมาตรฐานไทยพร้อมใช้ตั้งแต่วันแรก — เพิ่มบัญชีย่อยได้ บัญชีระบบลบไม่ได้"
      icon={<ListTree className="h-6 w-6" />}
      actions={
        canWrite ? (
          <Button onClick={openAdd}>
            <Plus className="mr-1.5 h-4 w-4" /> เพิ่มบัญชี
          </Button>
        ) : undefined
      }
    >
      {/* สรุปจำนวนบัญชีต่อประเภท */}
      <div className="flex flex-wrap gap-2">
        {(["asset", "liability", "equity", "income", "expense"] as AccAccountType[]).map((t) => (
          <div
            key={t}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm shadow-sm"
          >
            <span className="text-gray-500">{ACCOUNT_TYPE_LABEL[t]}</span>
            <span className="font-semibold tabular-nums text-gray-900">{counts[t] ?? 0}</span>
          </div>
        ))}
      </div>

      {/* filter */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              className="pl-9"
              placeholder="ค้นหา เลขที่ / ชื่อบัญชี"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <CustomSelect value={typeF} onChange={setTypeF} options={TYPE_OPTIONS} />
        </div>
      </div>

      {/* tree table */}
      <Table className="shadow-sm">
        <TableHeader>
          <TableRow>
            <TableHead>เลขที่ / ชื่อบัญชี</TableHead>
            <TableHead align="center">ประเภท</TableHead>
            <TableHead align="center">สถานะ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading.accounts ? (
            <TableLoading colSpan={3} />
          ) : rows.length === 0 ? (
            <TableEmpty colSpan={3}>ไม่พบบัญชีที่ตรงเงื่อนไข</TableEmpty>
          ) : (
            rows.map((a) => {
              const isHeader = a._level === 0 && a.parent_id === null;
              return (
                <TableRow key={a.id} clickable onClick={() => openEdit(a)}>
                  <TableCell>
                    <span
                      className="flex items-center gap-2"
                      style={{ paddingLeft: `${a._level * 1.5}rem` }}
                    >
                      <span className="font-mono text-xs tabular-nums text-gray-400">{a.code}</span>
                      <span className={isHeader ? "font-semibold text-gray-900" : "text-gray-700"}>
                        {a.name}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell align="center">
                    <AccountTypeBadge type={a.account_type} />
                  </TableCell>
                  <TableCell align="center">
                    {a.is_system ? (
                      <StatusBadge tone="neutral">
                        <Lock className="mr-1 h-3 w-3" /> ระบบ
                      </StatusBadge>
                    ) : (
                      <StatusBadge tone="info">กำหนดเอง</StatusBadge>
                    )}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      <AccountDialog open={dialogOpen} onOpenChange={setDialogOpen} account={editing} />
    </AccountingShell>
  );
}
