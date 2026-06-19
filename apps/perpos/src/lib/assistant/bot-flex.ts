/**
 * การ์ด LINE Flex ของบอทประชุม (ใช้ร่วม webhook + scheduler) — ตามคัมภีร์ docs/line-flex-card-guide.md
 * header CHARCOAL #3C3B3D flat · error/quota RUBY #D8334A · chip info #E6F1FB/#0C447C
 */

/** ลิงก์หน้าเติมโควต้า (เปิดในเบราว์เซอร์ — user login ผ่าน LINE อยู่แล้ว) */
export function billingUrl(): string {
  const base = (process.env.APP_BASE_URL ?? 'https://app.perpos.ai').replace(/\/$/, '');
  return `${base}/assistant/billing`;
}

/**
 * การ์ดยืนยันส่งบอท (กลาง) — ใช้ทั้ง immediate (LINE, confirmData=`botsend:<jobId>`)
 * และ reminder จากปฏิทิน (scheduler, confirmData=`calsend:<eventId>`)
 */
export function buildBotConfirmFlex(opts: {
  platformLabel: string; remainMin: number; lowQuota: boolean; confirmData: string;
  title?: string; joinAtText?: string;
}) {
  const { platformLabel, remainMin, lowQuota, confirmData, title, joinAtText } = opts;
  const statusText = joinAtText ? `📅 ประชุม ${joinAtText} น.` : '📍 พร้อมส่งบอทเข้าห้องตอนนี้';
  return {
    type: 'flex' as const,
    altText: joinAtText ? `🔔 เตือนประชุม ${joinAtText} — ยืนยันส่งบอท?` : '🤖 ยืนยันส่งบอทเข้าประชุม?',
    contents: {
      type: 'bubble',
      header: { type: 'box', layout: 'horizontal', backgroundColor: '#3C3B3D', paddingAll: '14px',
        contents: [{ type: 'text', text: joinAtText ? '🔔 เตือนประชุม' : '🤖 ยืนยันส่งบอทเข้าประชุม', color: '#ffffff', weight: 'bold', size: 'md' }] },
      body: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '18px', contents: [
        ...(title ? [{ type: 'text' as const, text: title, size: 'sm' as const, weight: 'bold' as const, color: '#1A1A1B', wrap: true }] : []),
        { type: 'text', text: `📹 ${platformLabel}`, size: 'sm', color: '#1A1A1B' },
        { type: 'box', layout: 'horizontal', backgroundColor: '#E6F1FB', cornerRadius: '8px', paddingAll: '10px', margin: 'sm',
          contents: [{ type: 'text', text: statusText, size: 'sm', color: '#0C447C', wrap: true }] },
        { type: 'text', text: `⏱️ โควต้าบอทคงเหลือ ${remainMin} นาที`, size: 'sm', weight: 'bold', color: lowQuota ? '#D8334A' : '#656D78', margin: 'md' },
        ...(lowQuota ? [{ type: 'text' as const, text: 'โควต้าใกล้หมด — เติมก่อนเพื่อให้บอทอยู่ครบประชุม', size: 'xxs' as const, wrap: true, color: '#D8334A' }] : []),
        { type: 'separator', margin: 'md' },
        { type: 'text', text: 'กดยืนยันเพื่อให้บอท "PERPOS Assistant (AI Note-taker)" เข้าห้อง · ไฟล์เสียงถูกลบทันทีหลังสรุปเสร็จ', size: 'xxs', wrap: true, color: '#9CA3AF', margin: 'md' },
      ] },
      footer: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '14px', contents: [
        { type: 'button', style: 'primary', height: 'sm', color: '#3C3B3D',
          action: { type: 'postback', label: '✅ ส่งบอทเข้าประชุม', data: confirmData, displayText: 'ส่งบอทเข้าประชุม' } },
        { type: 'button', style: 'link', height: 'sm',
          action: { type: 'uri', label: '💳 เติมโควต้าบอท', uri: billingUrl() } },
      ] },
    },
  };
}

/** การ์ดโควต้าไม่พอเริ่มประชุม (< ขั้นต่ำ) → ปุ่มเติมอย่างเดียว */
export function buildQuotaTopupFlex(remainMin: number, minStartMin: number) {
  return {
    type: 'flex' as const,
    altText: '⏱️ โควต้าบอทไม่พอเริ่มประชุม — เติมโควต้า',
    contents: {
      type: 'bubble',
      header: { type: 'box', layout: 'horizontal', backgroundColor: '#D8334A', paddingAll: '14px',
        contents: [{ type: 'text', text: '⏱️ โควต้าบอทไม่พอ', color: '#ffffff', weight: 'bold', size: 'md' }] },
      body: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '18px', contents: [
        { type: 'text', text: `โควต้าบอทเหลือ ${remainMin} นาที ไม่พอเริ่มประชุม (ขั้นต่ำ ${minStartMin} นาที)`, size: 'sm', wrap: true, color: '#1A1A1B' },
        { type: 'text', text: 'เติมโควต้าแล้ววางลิงก์ประชุมอีกครั้งได้เลยครับ', size: 'xs', wrap: true, color: '#656D78', margin: 'md' },
      ] },
      footer: { type: 'box', layout: 'vertical', paddingAll: '14px',
        contents: [{ type: 'button', style: 'primary', height: 'sm', color: '#3C3B3D',
          action: { type: 'uri', label: '💳 เติมโควต้าบอท', uri: billingUrl() } }] },
    },
  };
}

/** การ์ดเตือนโควต้าใกล้หมดระหว่างประชุม (≥10 นาทีก่อนบอทดีดตัว) → เติมเพื่ออยู่ต่อ */
export function buildQuotaWarningFlex(minsLeft: number) {
  return {
    type: 'flex' as const,
    altText: `⏳ โควต้าบอทใกล้หมด — อีก ~${minsLeft} นาทีบอทจะออกจากห้อง`,
    contents: {
      type: 'bubble',
      header: { type: 'box', layout: 'horizontal', backgroundColor: '#3C3B3D', paddingAll: '14px',
        contents: [{ type: 'text', text: '⏳ โควต้าบอทใกล้หมด', color: '#ffffff', weight: 'bold', size: 'md' }] },
      body: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '18px', contents: [
        { type: 'box', layout: 'horizontal', backgroundColor: '#FCF1F2', cornerRadius: '8px', paddingAll: '10px',
          contents: [{ type: 'text', text: `อีกประมาณ ${minsLeft} นาที บอทจะออกจากห้องประชุมอัตโนมัติ`, size: 'sm', color: '#D8334A', wrap: true }] },
        { type: 'text', text: 'เติมโควต้าตอนนี้เพื่อให้บอทอยู่บันทึกต่อจนจบประชุม (เติมแล้วบอทอยู่ต่อให้อัตโนมัติ)', size: 'xs', wrap: true, color: '#656D78', margin: 'md' },
      ] },
      footer: { type: 'box', layout: 'vertical', paddingAll: '14px',
        contents: [{ type: 'button', style: 'primary', height: 'sm', color: '#3C3B3D',
          action: { type: 'uri', label: '💳 เติมโควต้าบอท', uri: billingUrl() } }] },
    },
  };
}

/** การ์ดชวนเชื่อม Google Calendar (เมื่อยังไม่เชื่อม) */
export function buildConnectCalendarFlex(connectUrl: string) {
  return {
    type: 'flex' as const,
    altText: '📅 เชื่อม Google Calendar เพื่อบันทึกนัด + เตือนส่งบอท',
    contents: {
      type: 'bubble',
      header: { type: 'box', layout: 'horizontal', backgroundColor: '#3C3B3D', paddingAll: '14px',
        contents: [{ type: 'text', text: '📅 เชื่อม Google Calendar', color: '#ffffff', weight: 'bold', size: 'md' }] },
      body: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '18px', contents: [
        { type: 'text', text: 'เชื่อมปฏิทินเพื่อให้บันทึกนัดประชุมนี้ลง Google Calendar และเตือน+ยืนยันส่งบอทให้อัตโนมัติ 5 นาทีก่อนเริ่ม', size: 'sm', wrap: true, color: '#1A1A1B' },
        { type: 'separator', margin: 'md' },
        { type: 'text', text: '🔒 อ่าน+เขียนปฏิทินเพื่อเตือน/ส่งบอทเท่านั้น ไม่แก้รายการอื่นของคุณ', size: 'xxs', wrap: true, color: '#9CA3AF', margin: 'md' },
      ] },
      footer: { type: 'box', layout: 'vertical', paddingAll: '14px',
        contents: [{ type: 'button', style: 'primary', height: 'sm', color: '#3C3B3D',
          action: { type: 'uri', label: '🔗 เชื่อม Google Calendar', uri: connectUrl } }] },
    },
  };
}

/** การ์ดยืนยันบันทึกลงปฏิทินแล้ว */
export function buildCalendarSavedFlex(title: string, joinAtText: string, platformLabel: string) {
  return {
    type: 'flex' as const,
    altText: `📅 บันทึกลงปฏิทินแล้ว — ${title}`,
    contents: {
      type: 'bubble',
      header: { type: 'box', layout: 'horizontal', backgroundColor: '#3C3B3D', paddingAll: '14px',
        contents: [{ type: 'text', text: '📅 บันทึกลงปฏิทินแล้ว', color: '#ffffff', weight: 'bold', size: 'md' }] },
      body: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '18px', contents: [
        { type: 'text', text: title, size: 'sm', weight: 'bold', color: '#1A1A1B', wrap: true },
        { type: 'box', layout: 'horizontal', backgroundColor: '#E6F1FB', cornerRadius: '8px', paddingAll: '10px', margin: 'sm',
          contents: [{ type: 'text', text: `📅 ${joinAtText} น. · ${platformLabel}`, size: 'sm', color: '#0C447C', wrap: true }] },
        { type: 'text', text: 'จะเตือนให้ยืนยันส่งบอทเข้าห้อง 5 นาทีก่อนเริ่มประชุมครับ', size: 'xs', wrap: true, color: '#656D78', margin: 'md' },
      ] },
    },
  };
}
