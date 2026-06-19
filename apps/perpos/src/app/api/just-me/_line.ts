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
    .select('status, last_depart_address, last_in_address, last_in_time')
    .eq('profile_id', profileId)
    .maybeSingle();

  const baseUrl = process.env.APP_BASE_URL || 'https://app.perpos.ai';
  const status = (session?.status ?? 'idle') as string;

  // Determine if this is a DEPART or ARRIVE action
  let action: 'depart' | 'arrive' = 'depart';
  if (status === 'traveling') {
    action = 'arrive';
  } else if (status === 'working') {
    action = locationType === 'home' ? 'arrive' : 'depart';
  } else {
    // idle / other
    action = locationType === 'site' ? 'arrive' : 'depart';
  }

  if (action === 'arrive') {
    // ─── ARRIVE: reached destination ─────────────────────────────────────────
    const token = signClockToken(profileId, orgId, 'arrive', locationType, note);
    const url = `${baseUrl}/just-me-clock?token=${token}`;
    
    // Determine the starting point label for display in the card
    const fromLabel = status === 'working'
      ? (session?.last_in_address || 'หน้างาน')
      : (session?.last_depart_address || 'ต้นทาง');
      
    const isArriveHome = locationType === 'home';
    const toLabel = note || (isArriveHome ? 'บ้าน 🏠' : 'หน้างาน');

    // Green gradient for site arrive (CLOCK IN), purple for home arrive
    const startColor = isArriveHome ? '#7761A7' : '#46BC9E';
    const endColor = isArriveHome ? '#A290CA' : '#79DCC3';
    const headerTitle = isArriveHome ? '🏠 ถึงบ้านแล้ว' : '⏰ CLOCK IN REQUEST';
    const headerSub = isArriveHome ? 'สิ้นสุดการเดินทางวันนี้' : `ถึงหน้างาน: ${toLabel}`;
    const descText = isArriveHome 
      ? '🚗 ระบบจะคำนวณระยะทาง hop สุดท้ายและสรุปค่าเดินทางทั้งหมดของวันนี้'
      : '🔒 ระบบความปลอดภัยจะดึงพิกัด GPS จริงของคุณโดยตรงจากอุปกรณ์ และเริ่มนับเวลาทำงาน';
    const btnLabel = isArriveHome ? '📍 บันทึกถึงบ้าน (บันทึก GPS)' : '📍 บันทึกเข้างาน ณ ตำแหน่งนี้';
    const btnColor = isArriveHome ? '#7761A7' : '#46BC9E';
    const boxBgColor = isArriveHome ? '#F6F4FA' : '#F2FCF9';
    const boxBorderColor = isArriveHome ? '#D9D1E9' : '#C8F1E6';
    const tagColor = isArriveHome ? '#61537F' : '#44A38B';

    return replyLine(replyToken, [{
      type: 'flex',
      altText: isArriveHome ? '🏠 เดินทางถึงบ้าน' : '⏰ บันทึกเวลาเข้างาน (Clock In)',
      contents: {
        type: 'bubble',
        header: {
          type: 'box', layout: 'vertical', paddingAll: '16px',
          background: { type: 'linearGradient', angle: '135deg', startColor, endColor },
          contents: [
            { type: 'text', text: headerTitle, weight: 'bold', color: '#FFFFFF', size: 'sm' },
            { type: 'text', text: headerSub, weight: 'bold', size: 'md', color: '#FFFFFF', margin: 'xs', wrap: true },
          ],
        },
        body: {
          type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'md',
          contents: [
            {
              type: 'box', layout: 'vertical',
              backgroundColor: boxBgColor,
              cornerRadius: 'md', paddingAll: '12px',
              borderWidth: '1px', borderColor: boxBorderColor,
              contents: [
                { type: 'text', text: `🚗 จาก: ${fromLabel}`, color: tagColor, size: 'sm', weight: 'bold' },
                { type: 'text', text: descText, color: '#525866', size: 'xs', wrap: true, margin: 'sm' },
              ],
            },
            {
              type: 'button', style: 'primary',
              color: btnColor,
              action: { type: 'uri', label: btnLabel, uri: url },
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
  
  const currentPlace = isLeavingSite ? (session?.last_in_address || 'หน้างาน') : 'บ้าน';
  
  // Blue gradient for departing home, Amber/orange for departing site
  const startColor = isDepartingHome ? '#4DB0D3' : '#E6BB51';
  const endColor = isDepartingHome ? '#7FD2EF' : '#FFE7AD';
  const headerTitle = isDepartingHome ? '🏠 ออกจากบ้าน' : '⏰ CLOCK OUT REQUEST';
  const headerSub = note || (isDepartingHome ? 'เริ่มการเดินทางจากบ้านเพื่อไปหน้างาน' : `ออกจากหน้างาน: ${currentPlace}`);
  const descText = isDepartingHome
    ? '📍 GPS ณ ตำแหน่งนี้จะเป็นจุดเริ่มต้นของการคำนวณระยะทาง hop แรก'
    : '📍 ระบบจะบันทึกพิกัดเพื่อคำนวณระยะทาง hop ถัดไป และหยุดจับเวลาทำงานของ site นี้';
  const btnLabel = isDepartingHome ? '📍 บันทึกออกจากบ้าน (บันทึก GPS)' : '📍 บันทึกออกจากหน้างาน (บันทึก GPS)';
  const btnColor = isDepartingHome ? '#4DB0D3' : '#E6BB51';
  const boxBgColor = isDepartingHome ? '#F3FBFD' : '#FFFCF3';
  const boxBorderColor = isDepartingHome ? '#CAECF8' : '#FFF0CC';
  const tagColor = isDepartingHome ? '#46839A' : '#A58A49';

  return replyLine(replyToken, [{
    type: 'flex',
    altText: isDepartingHome ? '🏠 ออกจากบ้าน' : '⏰ บันทึกเวลาออกงาน (Clock Out)',
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical', paddingAll: '16px',
        background: { type: 'linearGradient', angle: '135deg', startColor, endColor },
        contents: [
          { type: 'text', text: headerTitle, weight: 'bold', color: '#FFFFFF', size: 'sm' },
          { type: 'text', text: headerSub, weight: 'bold', size: 'md', color: '#FFFFFF', margin: 'xs', wrap: true },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'md',
        contents: [
          {
            type: 'box', layout: 'vertical',
            backgroundColor: boxBgColor,
            cornerRadius: 'md', paddingAll: '12px',
            borderWidth: '1px', borderColor: boxBorderColor,
            contents: [
              { type: 'text', text: `📍 กำลังออกจาก: ${currentPlace}`, color: tagColor, size: 'xs', wrap: true },
              { type: 'text', text: descText, color: '#656D78', size: 'xs', wrap: true, margin: 'sm' },
            ],
          },
          {
            type: 'button', style: 'primary',
            color: btnColor,
            action: { type: 'uri', label: btnLabel, uri: url },
          },
        ],
      },
    },
  }]);
}
