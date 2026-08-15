"use client";

/**
 * useMailShortcuts — ผูกคีย์ลัดของหน้าเมล (MAIL_UI_SPEC §3 · contract §6.3)
 *
 * 🔑 หลักการเดียวที่สำคัญ: **registry-as-data**
 *    รายการคีย์ลัดประกาศไว้ที่ `lib/mail/shortcuts.ts` ชุดเดียว แล้วใช้ทั้ง
 *    (1) ผูก handler ที่นี่ และ (2) เรนเดอร์ตารางคีย์ลัด `?`
 *    → ตารางกับของจริงไม่มีทางหลุด sync **ห้ามประกาศรายการคีย์ซ้ำที่ไหนอีก**
 *
 * - ใช้ react-hotkeys-hook v5 → ได้ guard input/textarea/contenteditable ในตัว
 *   (พิมพ์ในช่องค้นหาแล้วต้องไม่ยิง e/#/s)
 * - `g i` เป็น **คีย์ต่อเนื่อง** เขียนเป็น sequence `'g>i'` (syntax v5) ไม่ใช่ `['g','i']`
 * - action ที่ไม่มี handler ส่งมา = ไม่ผูกอะไร (M2 เช่น ตอบ/ส่งต่อ) — ห้ามผูก handler ที่ไม่ทำงาน
 */

import { useEffect, useMemo, useRef } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { MAIL_SHORTCUTS, type MailShortcutAction } from "@/lib/mail/shortcuts";

/** scope เดียวของหน้าเมล — ต้องตรงกับ initiallyActiveScopes ของ <HotkeysProvider> */
export const MAIL_HOTKEY_SCOPE = "mail";

/** action ที่ยังไม่มี handler (เช่นของ M2) = ไม่ผูกอะไร — ห้ามผูกปุ่มที่กดแล้วไม่เกิดอะไร */
export type MailShortcutHandlers = Partial<Record<MailShortcutAction, () => void>>;

export function useMailShortcuts(handlers: MailShortcutHandlers, enabled = true) {
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  const { keys, keyToAction } = useMemo(() => {
    const map = new Map<string, MailShortcutAction>();
    for (const s of MAIL_SHORTCUTS) map.set(s.keys, s.action);
    return { keys: Array.from(map.keys()), keyToAction: map };
  }, []);

  useHotkeys(
    keys,
    (event, hotkeysEvent) => {
      const action = keyToAction.get(hotkeysEvent.hotkey);
      if (!action) return;
      const fn = handlersRef.current[action];
      if (!fn) return;
      event.preventDefault();
      fn();
    },
    {
      scopes: MAIL_HOTKEY_SCOPE,
      enabled,
      enableOnFormTags: false,
      enableOnContentEditable: false,
      preventDefault: false,
    },
    [keys, keyToAction],
  );
}
