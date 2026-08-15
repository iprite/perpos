"use client";

/**
 * MailShortcutsDialog — ตารางคีย์ลัด (กด `?`) — MAIL_UI_SPEC §3
 *
 * ⚠️ เรนเดอร์จาก `MAIL_SHORTCUTS` **ชุดเดียวกับที่ผูก handler จริง** (`use-mail-shortcuts.ts`)
 *    ห้ามพิมพ์รายการคีย์ซ้ำที่นี่เด็ดขาด — ไม่งั้นตารางกับของจริงหลุด sync แล้วผู้ใช้เชื่อไม่ได้
 *
 * แสดงเป็นกริด (ไม่ใช่ <Table>) เพราะเป็นคู่ "ปุ่ม → ความหมาย" ไม่ใช่ข้อมูลตาราง
 */

import { useMemo } from "react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Text } from "@/components/ui/typography";
import {
  detectKeyPlatform,
  formatDisplayKeys,
  mailShortcutRows,
  type MailShortcutScope,
} from "@/lib/mail/shortcuts";

const SCOPE_LABEL: Record<MailShortcutScope, string> = {
  global: "ทั่วไป",
  list: "รายการเมล",
  reader: "บานอ่าน",
};

type ShortcutRow = { id: string; label: string; scope: MailShortcutScope; keys: string[] };

export function MailShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const groups = useMemo(() => {
    const platform = detectKeyPlatform(
      typeof navigator === "undefined" ? undefined : navigator.userAgent,
    );
    const rows: ShortcutRow[] = mailShortcutRows().map((s) => ({
      id: s.action,
      label: s.label,
      scope: s.scope,
      keys: formatDisplayKeys(s.display, platform),
    }));
    const byScope = new Map<MailShortcutScope, ShortcutRow[]>();
    for (const r of rows) {
      const list = byScope.get(r.scope) ?? [];
      list.push(r);
      byScope.set(r.scope, list);
    }
    return Array.from(byScope.entries());
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>คีย์ลัด</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <Text className="mb-4 text-xs text-gray-500">
            คีย์ลัดจะถูกปิดอัตโนมัติเมื่อกำลังพิมพ์อยู่ในช่องค้นหาหรือช่องกรอกข้อความ
          </Text>
          <div className="grid gap-6 sm:grid-cols-2">
            {groups.map(([scope, rows]) => (
              <div key={scope}>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {SCOPE_LABEL[scope]}
                </div>
                <dl className="space-y-1.5">
                  {rows.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-4">
                      <dt className="min-w-0 truncate text-sm text-gray-700">{r.label}</dt>
                      <dd className="flex shrink-0 items-center gap-1">
                        {r.keys.map((k) => (
                          <kbd
                            key={k}
                            className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-[11px] text-gray-700"
                          >
                            {k}
                          </kbd>
                        ))}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
