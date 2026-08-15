"use client";

/**
 * หน้าหลังบ้าน PERPOS Mail (MAIL_UI_SPEC §6) — โซนนี้เป็นหน้า admin ปกติ
 * ⇒ ทำตาม DESIGN.md ทุกข้อ (PageShell + SegmentedControl เป็นแท็บ + Table primitives + StatCard)
 *
 * สิ่งที่ตั้งใจไม่มี: ปุ่ม/ลิงก์ใด ๆ ที่พาไปอ่านเมลของลูกค้า — หน้านี้เห็นได้แค่ metadata
 */

import { useMemo, useState } from "react";
import { AlertTriangle, HardDrive, Inbox, Mail, ShieldCheck, Globe } from "lucide-react";
import { PageShell } from "@/components/ui/page-shell";
import { SegmentedControl } from "@/components/ui/segmented";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TablePager, usePagination } from "@/components/ui/table-pager";
import type { MailAdminStatus } from "@/lib/mail/admin-api";

/** ใบรับรองเหลือน้อยกว่านี้ = ต้องรีบดู (ACME ต่ออายุเองที่ ~30 วัน ถ้าไม่ต่อ = เมลล่มทั้งระบบ) */
const CERT_WARN_DAYS = 21;
/** คิวค้างเกินนี้ = ปลายทางไม่รับ/เราโดนบล็อกอยู่ */
const QUEUE_WARN = 20;

const TABS = [
  { value: "overview", label: "ภาพรวม" },
  { value: "domains", label: "โดเมน" },
  { value: "accounts", label: "กล่องเมล" },
  { value: "health", label: "สุขภาพระบบ" },
] as const;
type Tab = (typeof TABS)[number]["value"];

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "—"; // ไม่มีข้อมูล ≠ 0
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "numeric" });
}

export function AdminMailView({
  status,
  error,
}: {
  status: MailAdminStatus | null;
  error: string | null;
}) {
  const [tab, setTab] = useState<Tab>("overview");

  const totals = useMemo(() => {
    const accounts = status?.accounts ?? [];
    const known = accounts.filter((a) => a.usedBytes !== null);
    return {
      domains: status?.domains.length ?? 0,
      accounts: accounts.length,
      // รวมเฉพาะกล่องที่เซิร์ฟเวอร์บอกขนาดมาจริง — ถ้าไม่มีเลยให้เป็น null ไม่ใช่ 0
      usedBytes: known.length ? known.reduce((sum, a) => sum + (a.usedBytes ?? 0), 0) : null,
      queued: status?.queuedCount ?? 0,
    };
  }, [status]);

  const soonestCert = useMemo(() => {
    const withDays = (status?.certificates ?? []).filter((c) => c.daysLeft !== null);
    if (!withDays.length) return null;
    return withDays.reduce((min, c) => ((c.daysLeft ?? 0) < (min.daysLeft ?? 0) ? c : min));
  }, [status]);

  const alerts: string[] = [];
  if (soonestCert?.daysLeft !== undefined && soonestCert?.daysLeft !== null) {
    if (soonestCert.daysLeft <= CERT_WARN_DAYS) {
      alerts.push(
        `ใบรับรอง TLS เหลือ ${soonestCert.daysLeft} วัน (หมดอายุ ${formatDate(soonestCert.notValidAfter)}) — ถ้าไม่ต่ออายุ เมลจะรับ-ส่งไม่ได้ทั้งระบบ`,
      );
    }
  }
  if (totals.queued >= QUEUE_WARN) {
    alerts.push(`มีเมลค้างในคิวส่งออก ${totals.queued} ฉบับ — ตรวจว่าปลายทางปฏิเสธหรือเราถูกบล็อก`);
  }

  const domainPager = usePagination(status?.domains ?? []);
  const accountPager = usePagination(status?.accounts ?? []);

  return (
    <PageShell
      title="PERPOS Mail — หลังบ้าน"
      description="ดูแลเมลเซิร์ฟเวอร์และกล่องเมลของลูกค้า โดยไม่ต้อง ssh · เห็นได้แค่ข้อมูลกำกับ ไม่มีทางเปิดอ่านเนื้อหาเมล"
      icon={<Mail className="h-6 w-6" />}
      tabs={
        <SegmentedControl
          value={tab}
          onChange={(v) => setTab(v as Tab)}
          options={TABS.map((t) => ({ value: t.value, label: t.label }))}
        />
      }
    >
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">ยังดึงข้อมูลจากเมลเซิร์ฟเวอร์ไม่ได้</p>
            <p className="mt-0.5 text-red-600">{error}</p>
          </div>
        </div>
      )}

      {alerts.map((msg) => (
        <div
          key={msg}
          className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{msg}</span>
        </div>
      ))}

      {tab === "overview" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={<Globe className="h-4 w-4" />}
            label="โดเมนที่ให้บริการ"
            value={String(totals.domains)}
            tone="info"
          />
          <StatCard
            icon={<Inbox className="h-4 w-4" />}
            label="กล่องเมลทั้งหมด"
            value={String(totals.accounts)}
            tone="info"
          />
          <StatCard
            icon={<HardDrive className="h-4 w-4" />}
            label="พื้นที่ที่ใช้ไป"
            value={formatBytes(totals.usedBytes)}
            tone="neutral"
          />
          <StatCard
            icon={<Mail className="h-4 w-4" />}
            label="เมลค้างในคิว"
            value={String(totals.queued)}
            tone={totals.queued >= QUEUE_WARN ? "warning" : "positive"}
            sub={
              status
                ? `ข้อมูล ณ ${new Date(status.fetchedAt).toLocaleTimeString("th-TH")}`
                : undefined
            }
          />
        </div>
      )}

      {tab === "domains" && (
        <div className="space-y-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>โดเมน</TableHead>
                <TableHead align="center">สถานะ</TableHead>
                <TableHead align="center">ใบรับรอง</TableHead>
                <TableHead align="center">DKIM</TableHead>
                <TableHead>catch-all</TableHead>
                <TableHead align="center">เพิ่มเมื่อ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {domainPager.rows.length === 0 ? (
                <TableEmpty colSpan={6}>ยังไม่มีโดเมนในเมลเซิร์ฟเวอร์</TableEmpty>
              ) : (
                domainPager.rows.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>{d.name}</TableCell>
                    <TableCell align="center">
                      <StatusBadge tone={d.enabled ? "success" : "neutral"}>
                        {d.enabled ? "ใช้งาน" : "ปิดอยู่"}
                      </StatusBadge>
                    </TableCell>
                    <TableCell align="center">
                      <StatusBadge tone={d.certificateMode === "Automatic" ? "success" : "warning"}>
                        {d.certificateMode === "Automatic" ? "ต่ออายุเอง" : "ต้องดูแลเอง"}
                      </StatusBadge>
                    </TableCell>
                    <TableCell align="center">
                      <StatusBadge tone={d.dkimMode === "Automatic" ? "success" : "warning"}>
                        {d.dkimMode === "Automatic" ? "หมุนกุญแจเอง" : "ต้องดูแลเอง"}
                      </StatusBadge>
                    </TableCell>
                    <TableCell>{d.catchAll ?? "—"}</TableCell>
                    <TableCell align="center">{formatDate(d.createdAt)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <TablePager pager={domainPager} unit="โดเมน" />
        </div>
      )}

      {tab === "accounts" && (
        <div className="space-y-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>อีเมล</TableHead>
                <TableHead>โดเมน</TableHead>
                <TableHead align="center">บทบาท</TableHead>
                <TableHead align="right">พื้นที่ใช้ไป</TableHead>
                <TableHead align="right">โควตา</TableHead>
                <TableHead align="right">นามแฝง</TableHead>
                <TableHead align="center">สร้างเมื่อ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accountPager.rows.length === 0 ? (
                <TableEmpty colSpan={7}>ยังไม่มีกล่องเมล</TableEmpty>
              ) : (
                accountPager.rows.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>{a.email ?? a.name}</TableCell>
                    <TableCell>{a.domain ?? "—"}</TableCell>
                    <TableCell align="center">
                      <StatusBadge tone={a.role === "Admin" ? "warning" : "neutral"}>
                        {a.role === "Admin" ? "แอดมิน" : "ผู้ใช้"}
                      </StatusBadge>
                    </TableCell>
                    <TableCell align="right" className="tabular-nums">
                      {formatBytes(a.usedBytes)}
                    </TableCell>
                    <TableCell align="right" className="tabular-nums">
                      {a.quotaBytes === null ? "ไม่จำกัด" : formatBytes(a.quotaBytes)}
                    </TableCell>
                    <TableCell align="right" className="tabular-nums">
                      {a.aliasCount}
                    </TableCell>
                    <TableCell align="center">{formatDate(a.createdAt)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <TablePager pager={accountPager} unit="กล่อง" />
        </div>
      )}

      {tab === "health" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <StatCard
              icon={<ShieldCheck className="h-4 w-4" />}
              label="ใบรับรอง TLS ที่ใกล้หมดอายุที่สุด"
              value={
                soonestCert?.daysLeft !== null && soonestCert ? `${soonestCert.daysLeft} วัน` : "—"
              }
              sub={soonestCert ? `หมดอายุ ${formatDate(soonestCert.notValidAfter)}` : undefined}
              tone={
                soonestCert?.daysLeft !== null &&
                soonestCert !== null &&
                (soonestCert?.daysLeft ?? 99) <= CERT_WARN_DAYS
                  ? "warning"
                  : "positive"
              }
            />
            <StatCard
              icon={<Mail className="h-4 w-4" />}
              label="เมลค้างในคิวส่งออก"
              value={String(totals.queued)}
              tone={totals.queued >= QUEUE_WARN ? "warning" : "positive"}
            />
          </div>

          <div>
            <div className="mb-2.5 px-1 text-sm font-semibold text-gray-900">ใบรับรอง TLS</div>
            <Table className="shadow-sm">
              <TableHeader>
                <TableRow>
                  <TableHead>ชื่อที่ครอบคลุม</TableHead>
                  <TableHead>ผู้ออก</TableHead>
                  <TableHead align="center">หมดอายุ</TableHead>
                  <TableHead align="right">เหลือ (วัน)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(status?.certificates ?? []).length === 0 ? (
                  <TableEmpty colSpan={4}>ยังไม่มีใบรับรองในเมลเซิร์ฟเวอร์</TableEmpty>
                ) : (
                  (status?.certificates ?? []).map((c) => (
                    <TableRow key={c.id}>
                      <TableCell wrap>{c.hostnames.join(", ") || "—"}</TableCell>
                      <TableCell>{c.issuer ?? "—"}</TableCell>
                      <TableCell align="center">{formatDate(c.notValidAfter)}</TableCell>
                      <TableCell align="right" className="tabular-nums">
                        {c.daysLeft === null ? (
                          "—"
                        ) : c.daysLeft <= CERT_WARN_DAYS ? (
                          <span className="text-amber-600">{c.daysLeft}</span>
                        ) : (
                          c.daysLeft
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </PageShell>
  );
}
