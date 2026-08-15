"use client";

/**
 * ช่องผู้รับแบบ chip (MAIL_UI_SPEC §4 — "`ถึง` เป็น chip ไม่ใช่ข้อความคั่นคอมมา")
 *
 * ทำไมไม่ใช้ `<MultiSelect>` ตามที่สเปกอ้าง: ตัวนั้นเป็น **closed-list picker**
 * (เลือกได้เฉพาะ option ที่มีอยู่) แต่ผู้รับเมลเป็นข้อความอิสระ และเรายังไม่มี contacts
 * (อยู่ใน M4) ⇒ ทำ chip input ของตัวเองที่เล็กที่สุด **ยังไม่มี autocomplete**
 * — เพิ่มทีหลังได้โดยไม่ต้องแก้ผู้เรียก
 *
 * กฎ:
 *  - ผูก chip เมื่อกด `Enter` / `,` / `;` / `Tab` หรือเมื่อออกจากช่อง (blur) — คนวางรายชื่อ
 *    มาทั้งก้อนแล้วเผลอกดส่งเลยต้องไม่ตกหล่น
 *  - **ที่อยู่ผิดรูปแบบยังกลายเป็น chip ได้ แต่เป็นสีแดง** — ห้ามกลืนเงียบ ไม่งั้นผู้ใช้พิมพ์ผิด
 *    ตัวเดียวแล้วหาสาเหตุไม่เจอ (เป็นปัญหาที่รีวิวจับได้จริง)
 *  - แยก/ตรวจที่อยู่ด้วย `parseRecipients` จาก `lib/mail/compose.ts` เท่านั้น — ห้าม split เอง
 */

import { useCallback, useRef, useState } from "react";
import { X } from "lucide-react";
import cn from "@core/utils/class-names";
import { isEmailAddress, parseRecipients } from "@/lib/mail/compose";

export function MailRecipientInput({
  id,
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  id?: string;
  /** รายที่อยู่ (string ดิบ) — ผู้เรียกส่งต่อให้ API ได้เลย */
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  /** ตัดข้อความที่ค้างอยู่เป็น chip — คืน true ถ้ามีอะไรถูกผูกจริง */
  const commit = useCallback(
    (raw: string): boolean => {
      const { valid, invalid } = parseRecipients(raw);
      const next = [...valid.map((v) => v.email), ...invalid];
      if (next.length === 0) return false;
      const seen = new Set(value.map((v) => v.toLowerCase()));
      onChange([...value, ...next.filter((v) => !seen.has(v.toLowerCase()))]);
      setText("");
      return true;
    },
    [onChange, value],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" || e.key === "," || e.key === ";" || e.key === "Tab") {
        if (!text.trim()) return; // Tab เปล่า ๆ ต้องยังย้ายโฟกัสได้ตามปกติ
        e.preventDefault();
        commit(text);
        return;
      }
      // ลบ chip ตัวสุดท้ายด้วย Backspace ตอนช่องว่าง (พฤติกรรมที่ทุก client มี)
      if (e.key === "Backspace" && !text && value.length > 0) {
        e.preventDefault();
        onChange(value.slice(0, -1));
      }
    },
    [commit, onChange, text, value],
  );

  return (
    <div
      className="mt-1 flex min-h-[2.5rem] w-full flex-wrap items-center gap-1.5 rounded-lg border border-gray-200 px-2 py-1.5 transition-colors focus-within:border-primary"
      onClick={() => inputRef.current?.focus()}
    >
      {value.map((address) => {
        const ok = isEmailAddress(address);
        return (
          <span
            key={address}
            title={ok ? address : "ที่อยู่อีเมลไม่ถูกต้อง"}
            className={cn(
              "inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-xs",
              ok ? "bg-gray-100 text-gray-700" : "border border-red-200 bg-red-50 text-red-700",
            )}
          >
            <span className="truncate">{address}</span>
            <button
              type="button"
              aria-label={`เอา ${address} ออก`}
              className="shrink-0 rounded-full p-0.5 text-gray-400 outline-none hover:text-gray-700"
              onClick={(e) => {
                e.stopPropagation();
                onChange(value.filter((v) => v !== address));
              }}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        );
      })}
      <input
        id={id}
        ref={inputRef}
        autoFocus={autoFocus}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => commit(text)}
        onPaste={(e) => {
          const pasted = e.clipboardData.getData("text");
          if (!/[,;\n]/.test(pasted)) return; // วางที่อยู่เดียว = ให้พิมพ์ต่อได้ตามปกติ
          e.preventDefault();
          commit(pasted);
        }}
        placeholder={value.length === 0 ? placeholder : ""}
        className="min-w-[10rem] flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-gray-400"
      />
    </div>
  );
}
