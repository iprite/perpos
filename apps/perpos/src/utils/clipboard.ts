/**
 * คัดลอกข้อความลงคลิปบอร์ดแบบทนทาน
 * - ลอง Clipboard API (navigator.clipboard.writeText) ก่อน
 * - ถ้าถูกปฏิเสธ (NotAllowedError / insecure context / permissions policy)
 *   fallback ไปใช้ execCommand('copy') ผ่าน <textarea> ชั่วคราว
 * คืน true เมื่อคัดลอกสำเร็จจริง
 */
export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* ตกไป fallback */
    }
  }

  if (typeof document === "undefined") return false;
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "0";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
