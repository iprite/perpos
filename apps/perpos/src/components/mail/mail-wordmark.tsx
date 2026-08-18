import cn from "@core/utils/class-names";

/**
 * โลโก้ตัวอักษรของ **PERPOS Mail** — รูปแบบเดียวกับ `PERPOS | SUITE` / `PERPOS | FLOW`
 * ในฝั่ง Suite ([sidebar.tsx](../../layouts/hydrogen/sidebar.tsx)): ฟอนต์ NeoTech + ขีดคั่นบาง ๆ
 * แล้วต่อท้ายด้วยคำที่ลงสีประจำผลิตภัณฑ์ — ของ Mail = **BLUE JEANS** (`text-mail-600`)
 *
 * โซน `(mail)` ห้ามพึ่งของฝั่ง Suite/Flow จึงคัดลอกโครงมาไว้ที่นี่แทนการ import ข้ามโซน
 */
export function MailWordmark({
  size = "md",
  className,
}: {
  /** `sm` = แถบเครื่องมือ/หัวมือถือ · `md` = หัวการ์ดหน้าเข้าสู่ระบบ */
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "font-neo-tech flex items-center font-bold leading-none tracking-[0.18em] text-gray-900",
        size === "sm" ? "gap-1.5 text-sm" : "gap-2 text-xl",
        className,
      )}
    >
      <span>PERPOS</span>
      <span
        aria-hidden="true"
        className="h-[1.05em] w-0.5 -translate-y-[0.08em] rounded-full bg-gray-300"
      />
      <span className="text-mail-600">MAIL</span>
    </span>
  );
}
