"use client";

// shipments/page.tsx — จัดส่ง (Contract v3 หน้า 6) — mock Shipnity + J&T
// "ซิงก์เลขพัสดุจาก Shipnity" = **action ที่เขียนข้อมูลจริง** (ได้เลขพัสดุ + เปลี่ยนสถานะ + บันทึกเวลาซิงก์)
// ไม่ใช่ปุ่มรีเฟรชหน้าจอ — หน้าโหลดข้อมูลเองตามตัวกรองอยู่แล้ว

import { useEffect, useMemo, useState } from "react";
import { Banknote, PackageCheck, Search, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented";
import { SkeletonTable } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { Text } from "@/components/ui/typography";
import { notify } from "@/lib/toast";
import { SHIPMENT_CARRIER_LABEL, SHIPMENT_STATUS_LABEL } from "../_fixtures/labels";
import type { ShipmentCarrier, ShipmentStatus } from "../_fixtures/types";
import {
  FilterBar,
  MattiiShell,
  NoAccess,
  canAdvance,
  fmtMoney,
  fmtNum,
  useMattiiData,
  useMattiiRole,
} from "../_components";
import { ShipmentsTable } from "./shipments-table";
import { ShipmentDialog } from "./shipment-dialog";
import { useShipmentsState, type ShipmentFormInput, type ShipmentRow } from "./use-shipments-state";

const CARRIER_OPTIONS = [
  { value: "", label: "ขนส่งทั้งหมด" },
  ...(Object.keys(SHIPMENT_CARRIER_LABEL) as ShipmentCarrier[]).map((k) => ({
    value: k,
    label: SHIPMENT_CARRIER_LABEL[k],
  })),
];

const STATUS_OPTIONS = [
  { value: "", label: "ทุกสถานะพัสดุ" },
  ...(Object.keys(SHIPMENT_STATUS_LABEL) as ShipmentStatus[]).map((k) => ({
    value: k,
    label: SHIPMENT_STATUS_LABEL[k],
  })),
];

export default function ShipmentsPage() {
  const { can, role } = useMattiiRole();
  const { advanceOrder } = useMattiiData();
  const {
    rows,
    createShipment,
    updateShipment,
    syncTrackingNumbers,
    advanceTracking,
    markCodCollected,
  } = useShipmentsState();

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [carrier, setCarrier] = useState<ShipmentCarrier | "">("");
  const [status, setStatus] = useState<ShipmentStatus | "">("");
  const [codScope, setCodScope] = useState<"all" | "cod" | "cod_pending">("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setLoading(false), 450);
    return () => window.clearTimeout(t);
  }, []);

  // รับตัวกรองจากการ์ด "COD ค้างเก็บ" บนหน้าภาพรวม (`?cod=cod_pending|cod`)
  // อ่านจาก window.location แทน useSearchParams เพื่อเลี่ยง Suspense boundary ของ Next.js
  useEffect(() => {
    const cod = new URLSearchParams(window.location.search).get("cod");
    if (cod === "cod" || cod === "cod_pending") setCodScope(cod);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (carrier && r.shipment.carrier !== carrier) return false;
      if (status && r.shipment.status !== status) return false;
      if (codScope === "cod" && r.shipment.cod_amount <= 0) return false;
      if (codScope === "cod_pending" && !(r.shipment.cod_amount > 0 && !r.shipment.cod_collected))
        return false;
      if (!q) return true;
      return (
        (r.order?.order_no.toLowerCase().includes(q) ?? false) ||
        r.shipment.recipient_name.toLowerCase().includes(q) ||
        (r.shipment.tracking_no?.toLowerCase().includes(q) ?? false) ||
        (r.customer?.display_name.toLowerCase().includes(q) ?? false)
      );
    });
  }, [rows, search, carrier, status, codScope]);

  const kpi = useMemo(() => {
    const waitingLabel = rows.filter((r) => !r.shipment.tracking_no).length;
    const inTransit = rows.filter((r) =>
      (["label_created", "picked_up", "in_transit"] as ShipmentStatus[]).includes(
        r.shipment.status,
      ),
    ).length;
    const delivered = rows.filter((r) => r.shipment.status === "delivered").length;
    const codPending = rows
      .filter((r) => r.shipment.cod_amount > 0 && !r.shipment.cod_collected)
      .reduce((s, r) => s + r.shipment.cod_amount, 0);
    return { waitingLabel, inTransit, delivered, codPending };
  }, [rows]);

  const selected = selectedKey ? (rows.find((r) => r.key === selectedKey) ?? null) : null;
  const hasFilter = !!(search || carrier || status || codScope !== "all");

  function clearFilters() {
    setSearch("");
    setCarrier("");
    setStatus("");
    setCodScope("all");
  }

  if (!can("view", "shipments")) {
    return (
      <NoAccess title="จัดส่ง" icon={<Truck className="h-6 w-6" />}>
        บทบาทนี้ไม่มีสิทธิ์ดูรายการจัดส่ง — ลองสลับเป็นทีมผลิต ฝ่ายขาย หรือเจ้าของ/ผู้จัดการ
      </NoAccess>
    );
  }

  const canWrite = can("approve", "shipments");

  function handleSync() {
    setSyncing(true);
    window.setTimeout(() => {
      const count = syncTrackingNumbers();
      setSyncing(false);
      if (count === 0) notify.info("ไม่มีพัสดุที่รอเลขพัสดุใหม่ — ทุกรายการมีเลขครบแล้ว");
      else notify.success(`ซิงก์เลขพัสดุจาก Shipnity สำเร็จ ${fmtNum(count)} รายการ`);
    }, 1200);
  }

  function handleSave(row: ShipmentRow, input: ShipmentFormInput) {
    if (row.isDraft) {
      const created = createShipment(row, input);
      setSelectedKey(created.id);
      notify.success(`สร้างรายการส่งของออเดอร์ ${row.order?.order_no ?? ""} แล้ว`);
    } else {
      updateShipment(row, input);
      notify.saved("บันทึกข้อมูลการจัดส่งแล้ว");
    }
  }

  function handleAdvanceTracking(row: ShipmentRow) {
    const next = advanceTracking(row);
    if (!next) {
      notify.info("พัสดุนี้ถึงปลายทางแล้ว ไม่มีขั้นถัดไป");
      return;
    }
    notify.success(`อัปเดตพัสดุ: ${SHIPMENT_STATUS_LABEL[next]}`);
  }

  function handleShipOrder(row: ShipmentRow) {
    if (!row.order || !canAdvance("ready_to_ship", role)) {
      notify.error("บทบาทของคุณไม่มีสิทธิ์บันทึกการส่งของ");
      return;
    }
    const msg = advanceOrder(row.order.id);
    if (msg) notify.success(msg);
  }

  return (
    <MattiiShell
      title="จัดส่ง"
      description="พัสดุ เลขติดตาม และเงินเก็บปลายทาง — ซิงก์เลขพัสดุจาก Shipnity ได้ในคลิกเดียว"
      icon={<Truck className="h-6 w-6" />}
      actions={
        <Button disabled={!canWrite || syncing} onClick={handleSync}>
          <PackageCheck className="mr-1.5 h-4 w-4" />
          {syncing ? "กำลังซิงก์กับ Shipnity…" : "ซิงก์เลขพัสดุจาก Shipnity"}
        </Button>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<PackageCheck className="h-4 w-4" />}
          label="รอเลขพัสดุ"
          value={fmtNum(kpi.waitingLabel)}
          sub="ซิงก์กับ Shipnity เพื่อออกเลข"
          tone="warning"
          valueColored
        />
        <StatCard
          icon={<Truck className="h-4 w-4" />}
          label="ระหว่างขนส่ง"
          value={fmtNum(kpi.inTransit)}
          sub="ออกจากร้านแล้ว ยังไม่ถึงลูกค้า"
          tone="info"
        />
        <StatCard
          icon={<PackageCheck className="h-4 w-4" />}
          label="ส่งสำเร็จ"
          value={fmtNum(kpi.delivered)}
          sub="ลูกค้าได้รับของแล้ว"
          tone="positive"
          valueColored
        />
        <StatCard
          icon={<Banknote className="h-4 w-4" />}
          label="เงินปลายทางค้างเก็บ"
          value={fmtMoney(kpi.codPending)}
          sub="ยังไม่ได้บันทึกว่าเก็บเงินแล้ว"
          tone={kpi.codPending > 0 ? "negative" : "neutral"}
          valueColored={kpi.codPending > 0}
        />
      </div>

      <Text className="rounded-xl border border-gray-200 bg-white p-3 text-xs text-gray-500 shadow-sm">
        ปุ่ม “ซิงก์เลขพัสดุจาก Shipnity” เป็นการดึงเลขพัสดุใหม่เข้ามาบันทึกในระบบ
        (เปลี่ยนสถานะพัสดุจริง) ไม่ใช่ปุ่มรีเฟรชหน้าจอ —
        ข้อมูลในตารางอัปเดตตามตัวกรองให้อัตโนมัติอยู่แล้ว
      </Text>

      <div>
        <FilterBar
          onClear={hasFilter ? clearFilters : undefined}
          resultText={`แสดง ${fmtNum(filtered.length)} จาก ${fmtNum(rows.length)} พัสดุ`}
        >
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาเลขออเดอร์ / ผู้รับ / เลขพัสดุ"
              className="pl-9"
            />
          </div>
          <CustomSelect
            value={carrier}
            onChange={(v) => setCarrier(v as ShipmentCarrier | "")}
            options={CARRIER_OPTIONS}
            className="w-48"
          />
          <CustomSelect
            value={status}
            onChange={(v) => setStatus(v as ShipmentStatus | "")}
            options={STATUS_OPTIONS}
            className="w-48"
          />
          <SegmentedControl
            value={codScope}
            onChange={setCodScope}
            size="sm"
            ariaLabel="ตัวกรองเงินปลายทาง"
            options={[
              { value: "all", label: "ทั้งหมด" },
              { value: "cod", label: "เฉพาะ COD" },
              { value: "cod_pending", label: "COD ค้างเก็บ" },
            ]}
          />
        </FilterBar>

        {loading ? (
          <SkeletonTable rows={6} cols={6} />
        ) : (
          <ShipmentsTable
            rows={filtered}
            filtered={hasFilter}
            onSelect={(r) => setSelectedKey(r.key)}
            onClearFilters={clearFilters}
          />
        )}
      </div>

      {selected && (
        <ShipmentDialog
          key={selected.key}
          row={selected}
          onOpenChange={(open) => !open && setSelectedKey(null)}
          onSave={(input) => handleSave(selected, input)}
          onAdvanceTracking={() => handleAdvanceTracking(selected)}
          onMarkCod={() => {
            markCodCollected(selected);
            notify.success(
              `บันทึกเก็บเงินปลายทาง ${fmtMoney(selected.shipment.cod_amount)} แล้ว — ไปบันทึกรับเงินต่อที่หน้าการเงินได้`,
            );
          }}
          onShipOrder={() => handleShipOrder(selected)}
          onPrintLabel={() =>
            notify.info(
              `เตรียมไฟล์ใบปะหน้าพัสดุของ ${selected.order?.order_no ?? ""} แล้ว (ตัวอย่างระบบ)`,
            )
          }
        />
      )}
    </MattiiShell>
  );
}
