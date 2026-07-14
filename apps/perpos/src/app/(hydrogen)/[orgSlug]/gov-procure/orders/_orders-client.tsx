"use client";

// _orders-client.tsx — รายการงาน (list) client view — spec §5 #3
// Table primitives + filter bar (ค้นหา/stage/company/กอง) + footer sum + row clickable → DetailDialog
// ปุ่ม "+ สร้างงาน" (canWrite) เปิด OrderDialog · ?new=1 → เปิด create dialog อัตโนมัติ

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ClipboardList, Plus, Search, PackageOpen, FilterX } from "lucide-react";
import { PageShell } from "@/components/ui/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CustomSelect } from "@/components/ui/custom-select";
import { Text } from "@/components/ui/typography";
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
} from "@/components/ui/table";
import { STAGE_ORDER, STAGE_LABELS } from "@/lib/gov-procure/stage";
import { computeAging, isOverdue } from "@/lib/gov-procure/summary";
import type { GovProcureOrder, GovProcureSettings, GovProcureRole } from "@/lib/gov-procure/types";
import {
  GovProcureProvider,
  useData,
  useRole,
  fmtMoney,
  fmtNum,
  DEPARTMENT_SUGGESTIONS,
  TODAY_DATE,
} from "../_components";
import { StageBadge, OverdueBadge, CompanyBadge } from "../_components/badges";
import { OrderDialog } from "../_components/order-dialog";
import { DetailDialog } from "../_components/detail-dialog";
import { StageMoveDialog } from "../_components/stage-move-dialog";

const STAGE_OPTIONS = [
  { value: "", label: "ทุกสถานะ" },
  ...STAGE_ORDER.map((s) => ({ value: s, label: STAGE_LABELS[s] })),
];

const COMPANY_OPTIONS = [
  { value: "", label: "ทุกบริษัท" },
  { value: "89 Global Work", label: "89 Global Work" },
  { value: "P2P Supply", label: "P2P Supply" },
];

const DEPT_OPTIONS = [
  { value: "", label: "ทุกกอง" },
  ...DEPARTMENT_SUGGESTIONS.map((d) => ({ value: d, label: d })),
];

export function OrdersClient({
  orders,
  settings,
  orgId,
  orgSlug,
  role,
}: {
  orders: GovProcureOrder[];
  settings: GovProcureSettings;
  orgId: string;
  orgSlug: string;
  role: GovProcureRole;
}) {
  return (
    <GovProcureProvider
      orgId={orgId}
      orgSlug={orgSlug}
      role={role}
      initialOrders={orders}
      initialSettings={settings}
    >
      <OrdersBody />
    </GovProcureProvider>
  );
}

function OrdersBody() {
  const { orders, settings } = useData();
  const { canWrite } = useRole();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState("");
  const [stageF, setStageF] = useState("");
  const [companyF, setCompanyF] = useState("");
  const [deptF, setDeptF] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<GovProcureOrder | null>(null);
  const [detail, setDetail] = useState<GovProcureOrder | null>(null);
  const [moveStage, setMoveStage] = useState<GovProcureOrder | null>(null);

  // ?new=1 → เปิด create dialog (ลิงก์จาก dashboard)
  useEffect(() => {
    if (searchParams?.get("new") === "1" && canWrite) setCreateOpen(true);
  }, [searchParams, canWrite]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders
      .filter((o) => {
        if (stageF && o.stage !== stageF) return false;
        if (companyF && o.company !== companyF) return false;
        if (deptF && o.department !== deptF) return false;
        if (q) {
          const hay =
            `${o.customer_name} ${o.department ?? ""} ${o.qt_reference ?? ""} ${o.product_description ?? ""}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => (b.seq_no ?? 0) - (a.seq_no ?? 0));
  }, [orders, search, stageF, companyF, deptF]);

  const sumProposed = useMemo(
    () => filtered.reduce((s, o) => s + (o.price_incl_vat ?? 0), 0),
    [filtered],
  );

  const hasAnyOrder = orders.length > 0;
  const hasFilter = Boolean(search || stageF || companyF || deptF);

  function clearFilters() {
    setSearch("");
    setStageF("");
    setCompanyF("");
    setDeptF("");
  }

  return (
    <PageShell
      width="full"
      icon={<ClipboardList className="h-6 w-6" />}
      title="รายการงาน"
      description="ตารางงานจัดซื้อทั้งหมด — ค้นหา กรอง และเปิดดูรายละเอียดงาน"
      actions={
        canWrite ? (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> สร้างงาน
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-5">
        {!hasAnyOrder ? (
          <EmptyPortfolio canWrite={canWrite} onCreate={() => setCreateOpen(true)} />
        ) : (
          <>
            {/* filter bar */}
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="relative lg:col-span-2">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    className="pl-9"
                    placeholder="ค้นหา หน่วยงาน / QT / รายการสินค้า"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <CustomSelect value={stageF} onChange={setStageF} options={STAGE_OPTIONS} />
                <CustomSelect value={companyF} onChange={setCompanyF} options={COMPANY_OPTIONS} />
                <CustomSelect value={deptF} onChange={setDeptF} options={DEPT_OPTIONS} />
              </div>
              {hasFilter && (
                <div className="mt-2 flex items-center justify-between">
                  <Text className="text-xs text-gray-500">
                    พบ {fmtNum(filtered.length)} งานตามเงื่อนไข
                  </Text>
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    <FilterX className="mr-1.5 h-3.5 w-3.5" /> ล้างตัวกรอง
                  </Button>
                </div>
              )}
            </div>

            {/* table */}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead align="right">ลำดับ</TableHead>
                  <TableHead>หน่วยงาน / กอง</TableHead>
                  <TableHead align="center">บริษัท</TableHead>
                  <TableHead>QT</TableHead>
                  <TableHead>รายการสินค้า</TableHead>
                  <TableHead align="right">ยอดเสนอราคา</TableHead>
                  <TableHead align="center">สถานะ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableEmpty colSpan={7}>
                    <div className="flex flex-col items-center gap-2 py-6">
                      <Search className="h-8 w-8 text-gray-300" />
                      <span>ไม่พบงานตามเงื่อนไข</span>
                      <Button variant="outline" size="sm" className="mt-1" onClick={clearFilters}>
                        <FilterX className="mr-1.5 h-4 w-4" /> ล้างตัวกรอง
                      </Button>
                    </div>
                  </TableEmpty>
                ) : (
                  filtered.map((o) => {
                    const aging = computeAging(o, TODAY_DATE);
                    const overdue = isOverdue(o, settings.sla_threshold, TODAY_DATE);
                    return (
                      <TableRow key={o.id} clickable onClick={() => setDetail(o)}>
                        <TableCell align="right" tabular className="text-gray-500">
                          {o.seq_no ?? "—"}
                        </TableCell>
                        <TableCell>
                          <div className="min-w-0">
                            <div className="truncate font-medium text-gray-900">
                              {o.customer_name}
                            </div>
                            <div className="truncate text-xs text-gray-500">
                              {o.department ?? "ไม่ระบุกอง"}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell align="center">
                          <CompanyBadge company={o.company} />
                        </TableCell>
                        <TableCell className="text-gray-500">{o.qt_reference ?? "—"}</TableCell>
                        <TableCell className="max-w-[240px]">
                          <span className="block truncate text-gray-700">
                            {o.product_description ?? "—"}
                          </span>
                        </TableCell>
                        <TableCell align="right" tabular>
                          {fmtMoney(o.price_incl_vat)}
                        </TableCell>
                        <TableCell align="center">
                          <div className="flex flex-col items-center gap-1">
                            <StageBadge stage={o.stage} />
                            {overdue && aging != null && <OverdueBadge days={aging} />}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
              {filtered.length > 0 && (
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={5} className="font-medium text-gray-700">
                      รวม {fmtNum(filtered.length)} งาน
                    </TableCell>
                    <TableCell align="right" tabular className="font-semibold text-gray-900">
                      {fmtMoney(sumProposed)}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </>
        )}

        {/* dialogs */}
        <OrderDialog order={null} open={createOpen} onOpenChange={setCreateOpen} />
        <OrderDialog
          order={editing}
          open={editing !== null}
          onOpenChange={(v) => !v && setEditing(null)}
        />
        <DetailDialog
          order={detail}
          open={detail !== null}
          onOpenChange={(v) => !v && setDetail(null)}
          onEdit={(o) => {
            setDetail(null);
            setEditing(o);
          }}
          onMoveStage={(o) => {
            setDetail(null);
            setMoveStage(o);
          }}
        />
        <StageMoveDialog
          order={moveStage}
          open={moveStage !== null}
          onOpenChange={(v) => !v && setMoveStage(null)}
        />
      </div>
    </PageShell>
  );
}

/** empty: พอร์ตว่าง (§5d Orders empty) */
function EmptyPortfolio({ canWrite, onCreate }: { canWrite: boolean; onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-16 text-center">
      <div className="mb-4 rounded-full bg-gray-100 p-4">
        <PackageOpen className="h-8 w-8 text-gray-400" />
      </div>
      <Text className="text-sm font-medium text-gray-900">ยังไม่มีงานในระบบ</Text>
      <Text className="mt-1 max-w-sm text-sm text-gray-500">
        เริ่มจากสร้างงานจัดซื้อชิ้นแรก แล้วติดตามสถานะตั้งแต่เสนอราคาจนถึงรับเช็ค
      </Text>
      {canWrite && (
        <Button className="mt-4" size="sm" onClick={onCreate}>
          <Plus className="mr-1.5 h-4 w-4" /> สร้างงานแรก
        </Button>
      )}
    </div>
  );
}
