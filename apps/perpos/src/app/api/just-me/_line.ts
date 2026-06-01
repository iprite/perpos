import { createAdminClient } from '../_lib/supabase';
import { signClockToken, type LocationType } from './_lib';

type Admin = ReturnType<typeof createAdminClient>;

// ─── LINE API Helpers ─────────────────────────────────────────────────────────
async function replyLine(replyToken: string, messages: unknown[]) {
  const token = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN ?? '';
  if (!token) return;
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ replyToken, messages }),
  });
}

function replyText(replyToken: string, text: string) {
  return replyLine(replyToken, [{ type: 'text', text }]);
}

// ─── Travel Clock State Machine (/ck home | /ck site [name]) ─────────────────
//
// /ck home [label]  — clock at home location
// /ck site [name]   — clock at a work site
//
// State machine (direction determined by current status):
//   idle / working → DEPART  (leaving current location, records origin GPS)
//   traveling      → ARRIVE  (reached destination, records GPS + calculates hop)
//
// Work time:
//   START = first /ck site arrival
//   END   = last /ck site departure

export async function handleJustMeClock(
  admin: Admin,
  lineUserId: string,
  profileId: string,
  orgId: string,
  replyToken: string,
  locationType: LocationType,
  note: string | undefined,
) {
  const { data: session } = await admin
    .from('just_me_clock_sessions')
    .select('status, last_depart_address, last_in_address')
    .eq('profile_id', profileId)
    .maybeSingle();

  const baseUrl = process.env.APP_BASE_URL || 'https://app.perpos.io';
  const status = (session?.status ?? 'idle') as string;

  if (status === 'traveling') {
    // ─── ARRIVE: reached destination ─────────────────────────────────────────
    const token = signClockToken(profileId, orgId, 'arrive', locationType, note);
    const url = `${baseUrl}/just-me-clock?token=${token}`;
    const fromLabel = session?.last_depart_address || 'ต้นทาง';
    const isArriveHome = locationType === 'home';
    const toLabel = note || (isArriveHome ? 'บ้าน 🏠' : 'หน้างาน');

    return replyLine(replyToken, [{
      type: 'flex',
      altText: `✅ ถึง${toLabel}แล้ว`,
      contents: {
        type: 'bubble',
        header: {
          type: 'box', layout: 'vertical', paddingAll: '16px',
          background: {
            type: 'linearGradient', angle: '135deg',
            startColor: isArriveHome ? '#059669' : '#7C3AED',
            endColor:   isArriveHome ? '#34D399' : '#A78BFA',
          },
          contents: [
            { type: 'text', text: isArriveHome ? '🏠 ถึงบ้านแล้ว' : '📍 ถึงหน้างานแล้ว', weight: 'bold', color: '#FFFFFF', size: 'sm' },
            { type: 'text', text: toLabel, weight: 'bold', size: 'md', color: '#FFFFFF', margin: 'xs', wrap: true },
          ],
        },
        body: {
          type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'md',
          contents: [
            {
              type: 'box', layout: 'vertical',
              backgroundColor: isArriveHome ? '#F0FDF4' : '#F5F3FF',
              cornerRadius: 'md', paddingAll: '12px',
              borderWidth: '1px', borderColor: isArriveHome ? '#BBF7D0' : '#DDD6FE',
              contents: [
                { type: 'text', text: `🚗 จาก: ${fromLabel}`, color: isArriveHome ? '#15803D' : '#5B21B6', size: 'sm', weight: 'bold' },
                { type: 'text', text: isArriveHome ? 'ระบบคำนวณระยะทาง hop สุดท้ายและสรุปค่าเดินทางวันนี้' : 'ระบบคำนวณระยะทางและเริ่มจับเวลางาน', color: '#475569', size: 'xs', wrap: true, margin: 'sm' },
              ],
            },
            {
              type: 'button', style: 'primary',
              color: isArriveHome ? '#059669' : '#7C3AED',
              cornerRadius: 'md',
              action: { type: 'uri', label: `📍 บันทึกมาถึง ${toLabel}`, uri: url },
            },
          ],
        },
      },
    }]);
  }

  // ─── DEPART: leaving current location ────────────────────────────────────────
  const isLeavingSite = status === 'working';
  const isDepartingHome = locationType === 'home';
  const token = signClockToken(profileId, orgId, 'depart', locationType, note);
  const url = `${baseUrl}/just-me-clock?token=${token}`;
  const currentPlace = isLeavingSite ? (session?.last_in_address || 'หน้างาน') : (note || 'บ้าน');
  const headerText = isDepartingHome ? '🏠 ออกจากบ้าน' : '🚗 ออกจากหน้างาน';
  const headerSub  = note || (isDepartingHome ? 'บันทึกพิกัดต้นทาง (บ้าน)' : 'บันทึกพิกัดการออกจากหน้างาน');
  const bgColor    = isDepartingHome ? { start: '#2563EB', end: '#60A5FA' } : { start: '#D97706', end: '#FCD34D' };

  return replyLine(replyToken, [{
    type: 'flex',
    altText: headerText,
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical', paddingAll: '16px',
        background: { type: 'linearGradient', angle: '135deg', startColor: bgColor.start, endColor: bgColor.end },
        contents: [
          { type: 'text', text: headerText, weight: 'bold', color: '#FFFFFF', size: 'sm' },
          { type: 'text', text: headerSub, weight: 'bold', size: 'md', color: '#FFFFFF', margin: 'xs', wrap: true },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'md',
        contents: [
          {
            type: 'box', layout: 'vertical',
            backgroundColor: isDepartingHome ? '#EFF6FF' : '#FFFBEB',
            cornerRadius: 'md', paddingAll: '12px',
            borderWidth: '1px', borderColor: isDepartingHome ? '#BFDBFE' : '#FDE68A',
            contents: [
              { type: 'text', text: `📍 กำลังออกจาก: ${currentPlace}`, color: isDepartingHome ? '#1E40AF' : '#92400E', size: 'xs', wrap: true },
              { type: 'text', text: 'GPS ณ ตำแหน่งนี้จะเป็นจุดเริ่มต้นของ hop ถัดไป', color: '#64748B', size: 'xs', wrap: true, margin: 'sm' },
            ],
          },
          {
            type: 'button', style: 'primary',
            color: isDepartingHome ? '#2563EB' : '#D97706',
            cornerRadius: 'md',
            action: { type: 'uri', label: `📍 ${headerText} (บันทึก GPS)`, uri: url },
          },
        ],
      },
    },
  }]);
}
