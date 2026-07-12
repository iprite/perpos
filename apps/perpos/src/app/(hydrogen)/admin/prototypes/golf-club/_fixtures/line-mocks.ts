// line-mocks.ts — Mock LINE content (Flex JSON + LIFF preview data) — prototype เท่านั้น ไม่ยิงจริง
// ยึด golf-line-mocks-spec.md (line-integration-designer P1) ตรงเป๊ะ
// D1 LOCKED: LINE booking = LIFF web form (grid) ไม่ใช่ Flex step — Flex ใช้เฉพาะ notify/confirm (T1,T3–T6)
//
// *** hex exception (ตั้งใจ — ตรง CONTEXT §0.9 lesson + line-flex-card-guide.md §2) ***
// ไฟล์นี้จำลอง LINE Flex Message JSON ที่ render "นอก" Tailwind (LINE app เอง เป็นคนวาด บน mobile)
// จึงต้องใช้ hex ตรง ๆ (ไม่ผ่าน Tailwind class ได้) — header CHARCOAL #3C3B3D, T5 ยกเลิก RUBY #D8334A
// ห้ามเลียนแบบ pattern นี้ในไฟล์ UI แอปจริง (รวม line-preview mobile-frame) ที่ต้องใช้ Tailwind palette เท่านั้น

// ==================== Fixture anchor (การ์ดทุกใบผูกชุดเดียว) ====================
export const lineAnchor = {
  org_name: "กรีนวัลเลย์ กอล์ฟคลับ",
  member_id: "gm-001",
  member_name: "คุณสมชาย ใจดี",
  booking_ref: "GC-20260713-018",
  resource_name: "สนาม A (18 หลุม)",
  date_iso: "2026-07-13",
  date_label: "13 ก.ค. 2569 (จันทร์)",
  start_time: "07:30",
  party_size: 4,
  caddie_count: 2,
  cart_count: 1,
  total_amount: 9600.0,
  deposit_amount: 2000.0,
  paid_amount: 2000.0,
  outstanding_amount: 7600.0,
  payment_status: "deposit_paid" as const,
  liff_book_url: "https://liff.line.me/xxxx-golf-club/book",
  report_url: "/admin/prototypes/golf-club/reports",
};

const money = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2 }) + " ฿";

// ==================== T1 — Welcome / Provisioning ====================
export const t1WelcomeFlex = {
  type: "flex",
  altText: "🏌️ ยินดีต้อนรับสู่ กรีนวัลเลย์ กอล์ฟคลับ — จองผ่าน LINE ได้เลย",
  contents: {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#3C3B3D",
      paddingAll: "14px",
      contents: [
        { type: "text", text: "🏌️ ยินดีต้อนรับ", color: "#ffffff", weight: "bold", size: "md" },
        { type: "text", text: lineAnchor.org_name, color: "#cccccc", size: "sm", margin: "xs" },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "18px",
      spacing: "sm",
      contents: [
        { type: "text", text: `${lineAnchor.member_name} เพิ่มเราเป็นเพื่อนเรียบร้อยแล้ว ✅`, color: "#1A1A1B", size: "sm", wrap: true },
        {
          type: "box",
          layout: "horizontal",
          backgroundColor: "#F2FCF9",
          cornerRadius: "6px",
          paddingAll: "10px",
          margin: "sm",
          contents: [{ type: "text", text: "คุณเป็นสมาชิกแล้ว — จองได้ทันที", color: "#065F46", size: "sm", wrap: true }],
        },
        {
          type: "text",
          text: "• จองสนาม/ไดร์ฟ 24 ชม. ผ่าน LINE\n• รับแจ้งเตือนยืนยัน + เตือนก่อนถึงคิว\n• ดู/ยกเลิกคิวได้เอง",
          color: "#656D78",
          size: "sm",
          wrap: true,
          margin: "sm",
        },
        { type: "text", text: "แตะปุ่มด้านล่าง หรือใช้เมนูด้านล่างจอเพื่อเริ่มจอง", color: "#1A1A1B", size: "sm", wrap: true, margin: "sm" },
        { type: "separator", margin: "md" },
        { type: "text", text: "🔒 ข้อมูลการจองของคุณผูกกับสนามนี้เท่านั้น", color: "#9CA3AF", size: "xs", wrap: true, margin: "md" },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      paddingAll: "10px",
      spacing: "sm",
      contents: [
        { type: "button", action: { type: "uri", label: "⛳ จองเลย", uri: lineAnchor.liff_book_url }, style: "primary", color: "#3C3B3D", height: "sm" },
        { type: "button", action: { type: "message", label: "ดูคิวของฉัน", text: "/คิวของฉัน" }, style: "secondary", height: "sm" },
      ],
    },
  },
};

// ==================== T3 — ยืนยันการจอง (canonical) ====================
export const t3ConfirmFlex = {
  type: "flex",
  altText: `✅ ยืนยันการจอง ${lineAnchor.booking_ref} — สนาม A 13 ก.ค. 07:30 น.`,
  contents: {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#3C3B3D",
      paddingAll: "14px",
      contents: [
        { type: "text", text: "✅ ยืนยันการจองแล้ว", color: "#ffffff", weight: "bold", size: "md" },
        { type: "text", text: `เลขที่ ${lineAnchor.booking_ref}`, color: "#cccccc", size: "sm", margin: "xs" },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "18px",
      spacing: "sm",
      contents: [
        { type: "text", text: `⛳ ${lineAnchor.resource_name} · ${lineAnchor.org_name}`, color: "#1A1A1B", size: "sm", wrap: true },
        {
          type: "box",
          layout: "horizontal",
          backgroundColor: "#E6F1FB",
          cornerRadius: "6px",
          paddingAll: "10px",
          margin: "sm",
          contents: [{ type: "text", text: "🕐 ยืนยันแล้ว · กรุณามาถึงก่อน tee-off 30 นาที", color: "#0C447C", size: "sm", wrap: true }],
        },
        { type: "text", text: `วันที่เล่น ${lineAnchor.date_label}`, color: "#1A1A1B", size: "sm", margin: "md" },
        { type: "text", text: `Tee-off ${lineAnchor.start_time} น.`, color: "#1A1A1B", size: "sm" },
        { type: "text", text: `ผู้เล่น ${lineAnchor.party_size} คน · แคดดี้ ${lineAnchor.caddie_count} · รถ ${lineAnchor.cart_count}`, color: "#1A1A1B", size: "sm" },
        { type: "separator", margin: "md" },
        {
          type: "box",
          layout: "horizontal",
          margin: "md",
          contents: [
            { type: "text", text: "ค่าบริการรวม", color: "#1A1A1B", size: "sm", weight: "bold", flex: 1 },
            { type: "text", text: money(lineAnchor.total_amount), color: "#1A1A1B", size: "sm", weight: "bold", align: "end" },
          ],
        },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "ชำระแล้ว (มัดจำ)", color: "#065F46", size: "sm", flex: 1 },
            { type: "text", text: money(lineAnchor.paid_amount), color: "#065F46", size: "sm", align: "end" },
          ],
        },
        { type: "text", text: `ยอดคงเหลือ ${money(lineAnchor.outstanding_amount)} ชำระที่เคาน์เตอร์วันเล่น`, color: "#656D78", size: "sm", margin: "sm", wrap: true },
        { type: "separator", margin: "md" },
        { type: "text", text: "🔒 ยกเลิกฟรีก่อนเวลาเล่น 12 ชม. · เกินกำหนดมัดจำไม่คืน", color: "#9CA3AF", size: "xs", wrap: true, margin: "md" },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      paddingAll: "10px",
      spacing: "sm",
      contents: [
        { type: "button", action: { type: "postback", label: "ยกเลิกการจอง", data: `golfcancel:${lineAnchor.booking_ref}` }, style: "secondary", height: "sm" },
        { type: "button", action: { type: "message", label: "ดูคิวของฉัน", text: "/คิวของฉัน" }, style: "link", height: "sm" },
      ],
    },
  },
};

// ==================== T4 — เตือนก่อนถึงคิว ====================
export const t4ReminderFlex = {
  type: "flex",
  altText: "⏰ เตือนคิวกอล์ฟพรุ่งนี้ 07:30 น. — สนาม A",
  contents: {
    type: "bubble",
    size: "kilo",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#3C3B3D",
      paddingAll: "14px",
      contents: [{ type: "text", text: "⏰ เตือนคิวของคุณ", color: "#ffffff", weight: "bold", size: "md" }],
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "18px",
      spacing: "sm",
      contents: [
        { type: "text", text: "พรุ่งนี้คุณมีคิวออกรอบ 🏌️", color: "#1A1A1B", size: "sm", wrap: true },
        {
          type: "box",
          layout: "vertical",
          backgroundColor: "#F5F7FA",
          cornerRadius: "6px",
          paddingAll: "10px",
          margin: "sm",
          spacing: "xs",
          contents: [
            { type: "text", text: lineAnchor.resource_name, color: "#1A1A1B", size: "sm", weight: "bold" },
            { type: "text", text: `${lineAnchor.date_label} · Tee-off ${lineAnchor.start_time} น. · ${lineAnchor.party_size} คน`, color: "#656D78", size: "xs", wrap: true },
            { type: "text", text: `เลขที่ ${lineAnchor.booking_ref}`, color: "#9CA3AF", size: "xs" },
          ],
        },
        { type: "text", text: "กรุณามาถึงก่อน tee-off 30 นาที · หากมาไม่ได้ โปรดกดยกเลิกล่วงหน้าเพื่อเปิดคิวให้ท่านอื่น", color: "#656D78", size: "xs", wrap: true, margin: "sm" },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      paddingAll: "10px",
      contents: [{ type: "button", action: { type: "postback", label: "ยกเลิกคิวนี้", data: `golfcancel:${lineAnchor.booking_ref}` }, style: "secondary", height: "sm" }],
    },
  },
};

// ==================== T5 — แจ้งยกเลิก (RUBY header) ====================
export const t5CancelFlex = {
  type: "flex",
  altText: `❌ การจอง ${lineAnchor.booking_ref} ถูกยกเลิก`,
  contents: {
    type: "bubble",
    size: "kilo",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#D8334A",
      paddingAll: "14px",
      contents: [{ type: "text", text: "❌ การจองถูกยกเลิก", color: "#ffffff", weight: "bold", size: "md" }],
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "18px",
      spacing: "sm",
      contents: [
        { type: "text", text: `เลขที่ ${lineAnchor.booking_ref} · ${lineAnchor.resource_name} · ${lineAnchor.date_label} ${lineAnchor.start_time} น.`, color: "#1A1A1B", size: "sm", wrap: true },
        {
          type: "box",
          layout: "horizontal",
          backgroundColor: "#FCF1F2",
          cornerRadius: "6px",
          paddingAll: "10px",
          margin: "sm",
          contents: [{ type: "text", text: "เหตุผล: สนามปิดปรับปรุงกะทันหันจากสภาพอากาศ ขออภัยในความไม่สะดวก", color: "#D8334A", size: "sm", wrap: true }],
        },
        { type: "text", text: `เราได้คืนมัดจำ ${money(lineAnchor.deposit_amount)} ให้ท่านแล้ว (คืนเข้าช่องทางเดิม 3–5 วันทำการ)`, color: "#1A1A1B", size: "sm", wrap: true, margin: "sm" },
        { type: "text", text: "ขออภัยอีกครั้ง — จองรอบใหม่ได้ผ่านเมนูด้านล่างจอ", color: "#656D78", size: "xs", wrap: true, margin: "sm" },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      paddingAll: "10px",
      contents: [{ type: "button", action: { type: "uri", label: "⛳ จองรอบใหม่", uri: lineAnchor.liff_book_url }, style: "primary", color: "#3C3B3D", height: "sm" }],
    },
  },
};

// ==================== T6 — รีพอตเจ้าของรายวัน ====================
// ตัวเลขให้ตรงกับ signals วันนี้ (2026-07-12) ที่ Dashboard/AI-1 คำนวณสด — กันเลขขัดกันเวลาเทียบ
export const t6OwnerReportData = {
  date_label: "12 ก.ค. 2569",
  revenue_today: 128400.0,
  bookings_today: 63,
  checked_in_today: 34,
  course_util_pct: 75,
  range_util_pct: 48,
  peak_band: "06:00–09:00 (เต็ม 94%)",
  quiet_band: "12:00–15:00",
  no_show_today: 3,
  no_show_loss: 4500.0,
  ai_tip: "✨ บ่ายว่าง 44% → แนะโปรฯ twilight ลดกรีนฟีช่วง 12:00–15:00 ดึงดีมานด์",
};

export const t6OwnerReportFlex = {
  type: "flex",
  altText: `📊 สรุปสนามวันนี้ ${t6OwnerReportData.date_label} — กรีนวัลเลย์`,
  contents: {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#3C3B3D",
      paddingAll: "14px",
      contents: [
        { type: "text", text: `📊 สรุปสนามวันนี้ — ${t6OwnerReportData.date_label}`, color: "#ffffff", weight: "bold", size: "md" },
        { type: "text", text: lineAnchor.org_name, color: "#cccccc", size: "sm", margin: "xs" },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "18px",
      spacing: "sm",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          backgroundColor: "#F2FCF9",
          cornerRadius: "6px",
          paddingAll: "10px",
          contents: [
            { type: "text", text: "รายได้วันนี้", color: "#065F46", size: "sm", flex: 1 },
            { type: "text", text: money(t6OwnerReportData.revenue_today), color: "#065F46", size: "sm", weight: "bold", align: "end" },
          ],
        },
        { type: "text", text: `จองวันนี้ ${t6OwnerReportData.bookings_today} รอบ · เช็คอินแล้ว ${t6OwnerReportData.checked_in_today}`, color: "#1A1A1B", size: "sm", margin: "sm" },
        { type: "text", text: `Utilization สนาม ${t6OwnerReportData.course_util_pct}% · ไดร์ฟ ${t6OwnerReportData.range_util_pct}%`, color: "#1A1A1B", size: "sm" },
        { type: "text", text: `ช่วงพีค ${t6OwnerReportData.peak_band} · ว่างมาก ${t6OwnerReportData.quiet_band}`, color: "#656D78", size: "sm" },
        { type: "separator", margin: "sm" },
        {
          type: "box",
          layout: "horizontal",
          margin: "sm",
          contents: [
            { type: "text", text: "No-show วันนี้", color: "#D8334A", size: "sm", flex: 1 },
            { type: "text", text: `${t6OwnerReportData.no_show_today} รอบ (−${t6OwnerReportData.no_show_loss.toLocaleString("th-TH", { minimumFractionDigits: 2 })} ฿)`, color: "#D8334A", size: "sm", weight: "bold", align: "end" },
          ],
        },
        { type: "text", text: t6OwnerReportData.ai_tip, color: "#9CA3AF", size: "xs", wrap: true, margin: "sm" },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      paddingAll: "10px",
      contents: [{ type: "button", action: { type: "uri", label: "เปิดรายงานเต็ม", uri: lineAnchor.report_url }, style: "primary", color: "#3C3B3D", height: "sm" }],
    },
  },
};

// ==================== T7 — คำสั่ง webhook (mock replies) ====================
export const commandReplies = {
  book: {
    type: "flex",
    altText: "⛳ แตะเพื่อเปิดหน้าจองสนาม/ไดร์ฟ",
    contents: {
      type: "bubble",
      size: "micro",
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "16px",
        contents: [{ type: "text", text: "แตะปุ่มด้านล่างเพื่อเปิดหน้าจองสนาม/ไดร์ฟ", color: "#1A1A1B", size: "sm", wrap: true }],
      },
      footer: {
        type: "box",
        layout: "vertical",
        paddingAll: "10px",
        contents: [{ type: "button", action: { type: "uri", label: "⛳ แตะเพื่อเปิดหน้าจองสนาม/ไดร์ฟ", uri: lineAnchor.liff_book_url }, style: "primary", color: "#3C3B3D", height: "sm" }],
      },
    },
  },
  myBookingsFlex: {
    type: "flex",
    altText: "📋 คิวของฉัน — 2 รายการ",
    contents: {
      type: "carousel",
      contents: [
        {
          type: "bubble",
          size: "micro",
          body: {
            type: "box",
            layout: "vertical",
            paddingAll: "14px",
            spacing: "xs",
            contents: [
              { type: "text", text: "GC-20260713-018", color: "#1A1A1B", size: "sm", weight: "bold" },
              { type: "text", text: "สนาม A · 13 ก.ค. 07:30 น.", color: "#656D78", size: "xs", wrap: true },
              { type: "text", text: "ยืนยันแล้ว", color: "#065F46", size: "xs", weight: "bold" },
            ],
          },
          footer: {
            type: "box",
            layout: "vertical",
            paddingAll: "8px",
            contents: [{ type: "button", action: { type: "postback", label: "ยกเลิก", data: "golfcancel:GC-20260713-018" }, style: "secondary", height: "sm" }],
          },
        },
        {
          type: "bubble",
          size: "micro",
          body: {
            type: "box",
            layout: "vertical",
            paddingAll: "14px",
            spacing: "xs",
            contents: [
              { type: "text", text: "GC-20260715-006", color: "#1A1A1B", size: "sm", weight: "bold" },
              { type: "text", text: "ไดร์ฟ Bay 5 · 15 ก.ค. 18:00 น.", color: "#656D78", size: "xs", wrap: true },
              { type: "text", text: "รอยืนยัน", color: "#0C447C", size: "xs", weight: "bold" },
            ],
          },
          footer: {
            type: "box",
            layout: "vertical",
            paddingAll: "8px",
            contents: [{ type: "button", action: { type: "postback", label: "ยกเลิก", data: "golfcancel:GC-20260715-006" }, style: "secondary", height: "sm" }],
          },
        },
      ],
    },
  },
  myBookingsEmptyText: "คุณยังไม่มีคิวที่กำลังจะถึง — พิมพ์ /จอง เพื่อจองเลย",
  cancelSingleFlex: {
    type: "flex",
    altText: "ยืนยันยกเลิกการจอง GC-20260713-018 ?",
    contents: {
      type: "bubble",
      size: "micro",
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "14px",
        contents: [{ type: "text", text: "ยืนยันยกเลิกการจอง GC-20260713-018 (สนาม A 13 ก.ค. 07:30 น.) ?", color: "#1A1A1B", size: "sm", wrap: true }],
      },
      footer: {
        type: "box",
        layout: "vertical",
        paddingAll: "8px",
        contents: [{ type: "button", action: { type: "postback", label: "ยืนยันยกเลิก", data: "golfcancel:GC-20260713-018" }, style: "primary", color: "#D8334A", height: "sm" }],
      },
    },
  },
  cancelMultipleText: "พิมพ์ /ยกเลิก GC-XXXX หรือกดปุ่มยกเลิกในการ์ดคิวของคุณ (/คิวของฉัน)",
  cancelSuccessText: "ยกเลิก GC-20260713-018 เรียบร้อย ✅ มัดจำจะคืนภายใน 3–5 วันทำการ",
};

// ==================== Rich menu (mock — bar 3 ปุ่มล่าง mobile-frame) ====================
export const richMenu = [
  { key: "tee", label: "จองสนาม", icon: "Flag", action: "liff", param: "tee_time" },
  { key: "range", label: "จองไดร์ฟ", icon: "Target", action: "liff", param: "driving_range" },
  { key: "queue", label: "คิวของฉัน", icon: "CalendarClock", action: "message", param: "/คิวของฉัน" },
] as const;

// ==================== LIFF booking page mock data ====================
export const liffMember = {
  member_id: "gm-001",
  display_name: "คุณสมชาย",
  member_type: "member" as const,
  tier: "gold" as const,
  green_fee_discount_pct: 15,
};

// tomorrow 2026-07-13 tee grid (06:00–16:00 ทุก 10 นาที) — ตรงกับ bookings.ts `tomorrow`
const TOMORROW_TEE_BOOKED: Record<string, number> = {
  "06:20": 1,
  "06:40": 1,
  "07:00": 1,
  "07:30": 4, // anchor GC-20260713-018 (เต็ม)
  "08:00": 1,
  "09:20": 1,
  "10:40": 1,
  "13:20": 1,
};

function genLiffTeeSlots() {
  const slots: { time: string; status: "available" | "partial" | "full"; remaining: number }[] = [];
  let h = 6;
  let m = 0;
  while (h < 16) {
    const time = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    const party = TOMORROW_TEE_BOOKED[time] ?? 0;
    const remaining = 4 - party;
    slots.push({
      time,
      status: party === 0 ? "available" : remaining === 0 ? "full" : "partial",
      remaining,
    });
    m += 10;
    if (m >= 60) {
      m = 0;
      h += 1;
    }
  }
  return slots;
}
export const liffTeeSlotsTomorrow = genLiffTeeSlots();

// tomorrow bays — bay-02/03/04/06 มีจองบางช่วงเย็น, bay-09/12 ปิดซ่อม
export const liffBaysTomorrow = Array.from({ length: 12 }, (_, i) => {
  const n = i + 1;
  const code = `Bay ${n}`;
  if (n === 9 || n === 12) return { code, status: "maintenance" as const, bookedSlots: [] as string[] };
  const bookedMap: Record<number, string[]> = { 2: ["17:00"], 3: ["17:00"], 4: ["18:00"], 6: ["18:30"] };
  const bookedSlots = bookedMap[n] ?? [];
  return { code, status: (bookedSlots.length > 0 ? "partial" : "available") as "partial" | "available", bookedSlots };
});

// คิวของฉัน (channel line + member gm-001) — ใช้ filter ใน line-preview panel "คิวของฉัน"
export const liffMyBookingRefs = ["GC-20260713-018", "GC-20260715-006"];
