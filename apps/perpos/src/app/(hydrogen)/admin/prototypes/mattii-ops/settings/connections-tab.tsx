"use client";

// connections-tab.tsx — การ์ดการเชื่อมต่อ 4 ระบบ + ปุ่ม "ทดสอบการเชื่อมต่อ"
// ปุ่มนี้ = action ที่มีผลข้างเคียงจริง (เขียน last_sync_at / เคลียร์-ตั้ง last_error / นับจำนวนซิงก์)
// ไม่ใช่ปุ่ม refresh ข้อมูลหน้าจอ — รายการอัปเดตเองตาม state (DESIGN §9)

import { useState } from "react";
import { CheckCircle2, Loader2, Plug, RefreshCcwDot, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge, type BadgeTone } from "@/components/ui/badge";
import { Text } from "@/components/ui/typography";
import { notify } from "@/lib/toast";
import {
  CHAT_CHANNEL_LABEL,
  INTEGRATION_KIND_LABEL,
  INTEGRATION_STATUS_LABEL,
} from "../_fixtures/labels";
import type { IntegrationStatus, MattiiIntegration } from "../_fixtures/types";
import { Field, SectionHeading, fmtDateTimeTH, fmtNum } from "../_components";

const STATUS_TONE: Record<IntegrationStatus, BadgeTone> = {
  connected: "success",
  disconnected: "neutral",
  error: "danger",
};

/** สิ่งที่ผู้ใช้ได้จริงจากการเชื่อมแต่ละระบบ (เล่าคุณค่า ไม่ใช่ศัพท์เทคนิค) */
const BENEFIT: Record<string, string> = {
  zaapi: "แชท Facebook / LINE / TikTok เข้ามารวมในกล่องเดียว — ไม่ต้องสลับ 3 แอปอีก",
  shipnity: "ดึงเลขพัสดุและสถานะขนส่งอัตโนมัติ — ไม่ต้องคีย์เลขพัสดุเองทีละใบ",
  jt: "สร้างเลขพัสดุ J&T และติดตามสถานะจนถึงมือลูกค้า",
  line_notify: "ส่งแจ้งเตือนหาทีมเป็นรายคน — งานไม่ตกหล่นแม้ไม่ได้เปิดคอม",
};

export function ConnectionsTab({
  integrations,
  onChange,
}: {
  integrations: MattiiIntegration[];
  onChange: (updater: (prev: MattiiIntegration[]) => MattiiIntegration[]) => void;
}) {
  const [testingId, setTestingId] = useState<string | null>(null);

  function handleTest(itg: MattiiIntegration) {
    setTestingId(itg.id);
    // จำลองเวลาเรียกปลายทาง (prototype ไม่ยิง API จริง)
    window.setTimeout(() => {
      const now = new Date().toISOString();
      const recovered = itg.status === "error";
      onChange((prev) =>
        prev.map((row) =>
          row.id === itg.id
            ? {
                ...row,
                status: "connected",
                last_error: null,
                last_sync_at: now,
                sync_count_today: row.sync_count_today + 1,
                updated_at: now,
              }
            : row,
        ),
      );
      setTestingId(null);
      notify.success(
        recovered
          ? `${itg.display_name}: เชื่อมต่อใหม่สำเร็จ — ระบบกลับมาซิงก์ข้อมูลแล้ว`
          : `${itg.display_name}: ทดสอบแล้ว เชื่อมต่อปกติ`,
      );
    }, 900);
  }

  return (
    <div className="space-y-4">
      <SectionHeading>ระบบที่เชื่อมกับร้าน</SectionHeading>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {integrations.map((itg) => {
          const testing = testingId === itg.id;
          const isError = itg.status === "error";
          return (
            <div key={itg.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={
                        isError
                          ? "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600"
                          : "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-green-50 text-green-600"
                      }
                    >
                      {isError ? (
                        <TriangleAlert className="h-4 w-4" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                    </span>
                    <span className="truncate text-sm font-semibold text-gray-900">
                      {itg.display_name}
                    </span>
                  </div>
                  <Text className="mt-1.5 text-xs text-gray-500">{BENEFIT[itg.kind]}</Text>
                </div>
                <StatusBadge tone={STATUS_TONE[itg.status]}>
                  {INTEGRATION_STATUS_LABEL[itg.status]}
                </StatusBadge>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Field label="ระบบ">{INTEGRATION_KIND_LABEL[itg.kind]}</Field>
                <Field label="บัญชีที่ผูก">{itg.account_label ?? "—"}</Field>
                <Field label="ซิงก์ล่าสุด">
                  <span className="tabular-nums">{fmtDateTimeTH(itg.last_sync_at)}</span>
                </Field>
                <Field label="ซิงก์วันนี้">
                  <span className="tabular-nums">{fmtNum(itg.sync_count_today)} ครั้ง</span>
                </Field>
              </div>

              {itg.connected_channels.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-gray-500">ช่องทางที่รวมอยู่:</span>
                  {itg.connected_channels.map((ch) => (
                    <StatusBadge key={ch} tone="neutral">
                      {CHAT_CHANNEL_LABEL[ch]}
                    </StatusBadge>
                  ))}
                </div>
              )}

              {itg.last_error && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  <Text className="text-sm text-red-700">
                    {itg.last_error} — เลขพัสดุจะไม่ถูกดึงเข้าระบบจนกว่าจะเชื่อมต่อใหม่
                  </Text>
                </div>
              )}

              <div className="mt-3 flex items-center gap-2">
                <Button
                  size="sm"
                  variant={isError ? "default" : "outline"}
                  disabled={testing}
                  onClick={() => handleTest(itg)}
                >
                  {testing ? (
                    <>
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      กำลังทดสอบ…
                    </>
                  ) : (
                    <>
                      <RefreshCcwDot className="mr-1.5 h-4 w-4" />
                      {isError ? "เชื่อมต่อใหม่" : "ทดสอบการเชื่อมต่อ"}
                    </>
                  )}
                </Button>
                <Text className="text-xs text-gray-400">
                  ทดสอบแล้วระบบจะบันทึกเวลาซิงก์ล่าสุดและผลลัพธ์ไว้ในการ์ดนี้
                </Text>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
        <Plug className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
        <Text className="text-xs text-gray-500">
          ตัวอย่างนี้เป็นการจำลอง — ตอนใช้งานจริง กุญแจ API ของ ZAAPI / Shipnity / J&T
          จะถูกเก็บฝั่งเซิร์ฟเวอร์ ไม่แสดงบนหน้าจอ
        </Text>
      </div>
    </div>
  );
}
