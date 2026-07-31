"use client";

/**
 * _pr-detail-client.tsx — เปลือกหน้ารายละเอียดใบขอซื้อ
 * ข้อมูลตั้งต้นมาจาก SSR · ทุกการเปลี่ยนแปลงยิงผ่าน `/api/just-me/purchase-requests/*` แล้ว `router.refresh()`
 * ⛔ สถานะใบขยับที่ API เท่านั้น (submit/approve/cancel/select-vendor/receive) — ที่นี่แค่กดปุ่ม
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, PackageCheck, Pencil, Send, ShoppingCart, XCircle } from "lucide-react";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageCard, PageShell } from "@/components/ui/page-shell";
import { StatCard } from "@/components/ui/stat-card";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Text } from "@/components/ui/typography";
import { notify } from "@/lib/toast";
import { PR_STATUS_LABEL, PR_STATUS_TONE } from "@/lib/just-me/labels";
import { jmSend } from "../../_components/api-client";
import { money, percent, qtyText, thaiDate } from "../../_components/format";
import { LinesDialog } from "./_lines-dialog";
import { QuoteCompare } from "./_quote-compare";
import { ReceiveDialog } from "./_receive-dialog";
import type { PrDetailInitial } from "./_types";

export function PrDetailClient({
  orgId,
  orgSlug,
  canWrite,
  isOwner,
  initial,
}: {
  orgId: string;
  orgSlug: string;
  canWrite: boolean;
  isOwner: boolean;
  initial: PrDetailInitial;
}) {
  const router = useRouter();
  const { pr, items } = initial;
  const [busy, setBusy] = useState<string | null>(null);
  const [linesOpen, setLinesOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const editable = pr.status === "draft" || pr.status === "submitted";
  const canApprove = pr.status === "submitted" && (!initial.approvalRequired || isOwner);
  const canSelectVendor = pr.status === "approved" || pr.status === "ordered";
  const canReceive =
    pr.status === "approved" || pr.status === "ordered" || pr.status === "partially_received";

  const receivedLines = items.filter((i) => (i.received_qty ?? 0) + 0.0001 >= (i.qty ?? 0)).length;

  async function act(action: string, successText: string) {
    setBusy(action);
    try {
      await jmSend(orgId, `purchase-requests/${pr.id}`, "PATCH", { action });
      notify.success(successText);
      router.refresh();
    } catch (e) {
      notify.error(e, "ทำรายการไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  }

  return (
    <PageShell
      title={pr.pr_code}
      description={initial.projectLabel ?? "ซื้อเข้าคลังกลาง (ไม่ผูกโครงการ)"}
      icon={<ShoppingCart className="h-6 w-6" />}
      width="full"
      actions={
        <>
          <StatusBadge tone={PR_STATUS_TONE[pr.status]}>{PR_STATUS_LABEL[pr.status]}</StatusBadge>
          {canWrite && editable && (
            <Button variant="outline" onClick={() => setLinesOpen(true)}>
              <Pencil className="h-4 w-4" /> แก้รายการ
            </Button>
          )}
          {canWrite && pr.status === "draft" && (
            <Button
              variant="outline"
              disabled={busy !== null}
              onClick={() => act("submit", "ส่งขออนุมัติแล้ว")}
            >
              <Send className="h-4 w-4" /> ส่งขออนุมัติ
            </Button>
          )}
          {canWrite && pr.status === "submitted" && (
            <Button
              disabled={busy !== null || !canApprove}
              title={canApprove ? undefined : "ใบขอซื้อต้องให้เจ้าของเป็นผู้อนุมัติ"}
              onClick={() => act("approve", "อนุมัติใบขอซื้อแล้ว")}
            >
              <CheckCircle2 className="h-4 w-4" /> อนุมัติ
            </Button>
          )}
          {canWrite && canReceive && (
            <Button onClick={() => setReceiveOpen(true)}>
              <PackageCheck className="h-4 w-4" /> รับของ
            </Button>
          )}
          {canWrite && pr.status !== "received" && pr.status !== "cancelled" && (
            <Button variant="outline" disabled={busy !== null} onClick={() => setCancelOpen(true)}>
              <XCircle className="h-4 w-4" /> ยกเลิกใบ
            </Button>
          )}
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="ยอดประเมิน"
          value={money(pr.total_estimated_cost)}
          sub={`${items.length.toLocaleString("th-TH")} รายการ`}
          tone="neutral"
        />
        <StatCard
          label="ยอดที่เลือก"
          value={money(pr.total_selected_cost)}
          sub={pr.total_selected_cost === null ? "ยังไม่ได้เลือกผู้ขาย" : undefined}
          tone="primary"
        />
        <StatCard
          label="รับของแล้ว"
          value={`${receivedLines.toLocaleString("th-TH")} / ${items.length.toLocaleString("th-TH")}`}
          sub="จำนวนรายการที่ได้ของครบ"
          tone={receivedLines === items.length && items.length > 0 ? "positive" : "warning"}
        />
        <StatCard
          label="ต้องการใช้"
          value={thaiDate(pr.needed_date)}
          sub={pr.approved_at ? `อนุมัติ ${thaiDate(pr.approved_at.slice(0, 10))}` : undefined}
          tone="info"
        />
      </div>

      {pr.over_budget_reason && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <Text className="text-sm text-amber-800">
            ใบนี้สั่งเกินปริมาณที่ถอดไว้ใน BOQ — เหตุผล: {pr.over_budget_reason}
          </Text>
        </div>
      )}

      <PageCard title="รายการที่ขอซื้อ">
        <Table className="rounded-none border-0 shadow-none">
          <TableHeader>
            <TableRow>
              <TableHead>รายการ</TableHead>
              <TableHead align="right">จำนวน</TableHead>
              <TableHead align="right">รับแล้ว</TableHead>
              <TableHead align="right">ราคาประเมิน</TableHead>
              <TableHead align="right">ราคาที่เลือก</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableEmpty colSpan={5}>
                <div className="flex flex-col items-center gap-2 py-6">
                  <Text className="text-sm font-medium text-gray-900">ยังไม่มีรายการในใบนี้</Text>
                  <Text className="text-sm text-gray-500">
                    หยิบรายการจาก BOQ ที่อนุมัติแล้ว หรือเพิ่มรายการเอง
                  </Text>
                  {canWrite && editable && (
                    <Button size="sm" onClick={() => setLinesOpen(true)}>
                      เพิ่มรายการ
                    </Button>
                  )}
                </div>
              </TableEmpty>
            ) : (
              items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium text-gray-900">{item.name}</TableCell>
                  <TableCell align="right" className="tabular-nums">
                    {qtyText(item.qty)} {item.unit}
                  </TableCell>
                  <TableCell align="right" className="tabular-nums">
                    {qtyText(item.received_qty)}
                  </TableCell>
                  <TableCell align="right" tabular>
                    {money(item.estimated_unit_cost)}
                  </TableCell>
                  <TableCell align="right" tabular>
                    {money(item.selected_unit_cost)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </PageCard>

      {initial.boqCompare.length > 0 && (
        <PageCard title="ยอดสั่งซื้อเทียบ BOQ">
          <Table className="rounded-none border-0 shadow-none">
            <TableHeader>
              <TableRow>
                <TableHead>บรรทัด BOQ</TableHead>
                <TableHead align="right">ถอดไว้</TableHead>
                <TableHead align="right">สั่งไปแล้ว (ทุกใบ)</TableHead>
                <TableHead align="right">คิดเป็น</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {initial.boqCompare.map((row) => {
                const over = row.ordered_ratio !== null && row.ordered_ratio > 1;
                return (
                  <TableRow key={row.boq_item_id}>
                    <TableCell className="font-medium text-gray-900">{row.name}</TableCell>
                    <TableCell align="right" className="tabular-nums">
                      {qtyText(row.boq_qty)} {row.unit}
                    </TableCell>
                    <TableCell align="right" className="tabular-nums">
                      {qtyText(row.ordered_qty)}
                    </TableCell>
                    <TableCell
                      align="right"
                      className={`tabular-nums ${over ? "text-red-600" : ""}`}
                    >
                      {percent(row.ordered_ratio)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </PageCard>
      )}

      <QuoteCompare
        orgId={orgId}
        prId={pr.id}
        canWrite={canWrite}
        canSelect={canSelectVendor}
        items={items}
        quotes={initial.quotes}
        quoteItems={initial.quoteItems}
        vendorOptions={initial.vendorOptions}
        selectedVendorId={pr.selected_vendor_id}
        onChanged={() => router.refresh()}
      />

      {initial.projectLabel && (
        <Text className="px-1 text-xs text-gray-500">
          ของที่รับเข้าคลังจากใบนี้จะผูกกับโครงการอัตโนมัติ — ดูต้นทุนจริงได้ที่{" "}
          <a
            className="text-blue-600 hover:underline"
            href={`/${orgSlug}/just-me/projects/${pr.project_id}`}
          >
            หน้าโครงการ
          </a>
        </Text>
      )}

      <LinesDialog
        open={linesOpen}
        onOpenChange={setLinesOpen}
        orgId={orgId}
        prId={pr.id}
        isOwner={isOwner}
        items={items}
        boqPicks={initial.boqPicks}
        inventoryOptions={initial.inventoryOptions}
        onSaved={() => router.refresh()}
      />

      {/* ยืนยันก่อนยกเลิกใบ (DESIGN §12) — ย้อนกลับไม่ได้ ต้องออกใบใหม่ */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>ยกเลิกใบขอซื้อ {pr.pr_code}?</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-2">
              <Text className="text-sm text-gray-700">
                ใบที่ยกเลิกแล้ว <span className="font-medium text-gray-900">แก้ไขต่อไม่ได้</span>{" "}
                และ <span className="font-medium text-gray-900">เปิดกลับมาใช้ใหม่ไม่ได้</span> —
                ถ้ายังต้องซื้อของชุดนี้ ต้องสร้างใบขอซื้อใบใหม่แล้วหยิบรายการจาก BOQ อีกครั้ง
              </Text>
              <Text className="text-sm text-gray-700">
                ของที่รับเข้าคลังไปแล้ว (ถ้ามี) ยังอยู่ในคลังตามเดิม ไม่ถูกดึงกลับ
              </Text>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={busy !== null}>
              ไม่ยกเลิก
            </Button>
            <Button
              variant="destructive"
              disabled={busy !== null}
              onClick={async () => {
                await act("cancel", "ยกเลิกใบขอซื้อแล้ว");
                setCancelOpen(false);
              }}
            >
              {busy === "cancel" ? "กำลังยกเลิก…" : "ยืนยันยกเลิกใบนี้"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReceiveDialog
        open={receiveOpen}
        onOpenChange={setReceiveOpen}
        orgId={orgId}
        prId={pr.id}
        items={items}
        warehouseOptions={initial.warehouseOptions}
        defaultWarehouseId={pr.warehouse_id}
        onEditLines={
          canWrite && editable
            ? () => {
                setReceiveOpen(false);
                setLinesOpen(true);
              }
            : null
        }
        onDone={() => router.refresh()}
      />
    </PageShell>
  );
}
