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
import { useMailT } from "@/components/mail/mail-locale";

export function MailRecipientInput({
  id,
  value,
  onChange,
  placeholder,
  autoFocus,
  bare,
}: {
  id?: string;
  /** รายที่อยู่ (string ดิบ) — ผู้เรียกส่งต่อให้ API ได้เลย */
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  autoFocus?: boolean;
  /**
   * ถอดกรอบ/พื้นออก ให้เป็น "แถว" แบบเดียวกับกล่องเขียนเมลบนมือถือ (Gmail)
   * — เส้นคั่นเป็นของแถวที่ครอบอยู่ ไม่ใช่ของช่องนี้
   */
  bare?: boolean;
}) {
  const t = useMailT();
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
    // หน้าตาต้องเท่ากับ <Input> ของดีไซน์ระบบเป๊ะ (ขอบ/มุม/ความสูง/วงโฟกัส)
    // — ช่องนี้เป็น chip input จึงใช้ <Input> ตรง ๆ ไม่ได้ แต่ห้ามคิดสไตล์ใหม่เอง
    <div
      className={cn(
        "flex min-h-9 w-full flex-wrap items-center gap-1.5 bg-white",
        bare
          ? "px-0 py-1"
          : "mt-1 rounded-md border border-slate-200 px-3 py-0.5 transition-colors focus-within:border-slate-400 focus-within:ring-2 focus-within:ring-slate-900/10 hover:border-slate-300",
      )}
      onClick={() => inputRef.current?.focus()}
    >
      {value.map((address) => {
        const ok = isEmailAddress(address);
        return (
          <span
            key={address}
            title={ok ? address : t("compose.recipient.invalid")}
            className={cn(
              "inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-xs",
              ok ? "bg-gray-100 text-gray-700" : "border border-red-200 bg-red-50 text-red-700",
            )}
          >
            <span className="truncate">{address}</span>
            <button
              type="button"
              aria-label={t("compose.recipient.remove", { address })}
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
        className={cn(
          "h-7 flex-1 border-0 bg-transparent p-0 text-slate-900 outline-none placeholder:text-slate-400 focus:ring-0",
          // แถวบนมือถือแคบกว่า — ขั้นต่ำ 10rem จะดันจนล้นออกนอกจอ
          // 🔴 `text-base` (16px) ห้ามลด: Safari บน iOS **ซูมทั้งหน้า** เมื่อโฟกัสช่องที่ตัวอักษรเล็กกว่า 16px
          //    (อาการ: กดจะพิมพ์แล้วจอขยายจนปุ่มปิด/ส่งหลุดออกนอกจอ)
          bare ? "min-w-[6rem] text-base" : "min-w-[10rem] text-sm",
        )}
      />
    </div>
  );
}
