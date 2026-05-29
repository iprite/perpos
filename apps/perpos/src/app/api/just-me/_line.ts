import { createAdminClient } from '../_lib/supabase';
import { signClockToken } from './_lib';

type Admin = ReturnType<typeof createAdminClient>;

// ─── LINE API Helper ──────────────────────────────────────────────────────────
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

// ─── Format Helpers ───────────────────────────────────────────────────────────
function fmtTimeTH(iso: string): string {
  return new Date(iso).toLocaleTimeString('th-TH', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok',
  }) + ' น.';
}

function fmtDateTH(iso: string): string {
  return new Date(iso).toLocaleDateString('th-TH', {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Bangkok',
  });
}

function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} นาที`;
  if (m === 0) return `${h} ชม.`;
  return `${h} ชม. ${m} นาที`;
}

// ─── Command Handlers ─────────────────────────────────────────────────────────

/**
 * handleJustMeIn — เรียกเมื่อผู้ใช้พิมพ์ /in
 */
export async function handleJustMeIn(
  admin: Admin,
  lineUserId: string,
  profileId: string,
  orgId: string,
  replyToken: string,
) {
  // 1. ตรวจสอบว่าผู้ใช้มี session เข้างานค้างอยู่หรือไม่
  const { data: session } = await admin
    .from('just_me_clock_sessions')
    .select('*')
    .eq('profile_id', profileId)
    .maybeSingle();

  if (session && session.status === 'clocked_in') {
    const timeStr = fmtTimeTH(session.last_in_time);
    const dateStr = fmtDateTH(session.last_in_time);
    return replyText(replyToken, `⚠️ คุณกำลังเข้างานค้างไว้ตั้งแต่ วันที่ ${dateStr} เวลา ${timeStr} กรุณาทำการบันทึกออกงาน (/out) ก่อน`);
  }

  // 2. ดึง slug ขององค์กร
  const { data: org } = await admin
    .from('organizations')
    .select('slug')
    .eq('id', orgId)
    .maybeSingle();
  const slug = org?.slug || 'justme';
  const baseUrl = process.env.APP_BASE_URL || 'https://app.perpos.io';
  const token = signClockToken(profileId, orgId, 'in');
  const clockUrl = `${baseUrl}/just-me-clock?token=${token}`;

  // 3. ส่ง Flex Card เพื่อให้ไปกดยืนยันตัวตนและบันทึกเวลาจริงจากพิกัด GPS ปัจจุบัน
  return replyLine(replyToken, [
    {
      type: 'flex',
      altText: '⏰ บันทึกเวลาเข้างาน (Clock In)',
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#ECFDF5',
          contents: [
            {
              type: 'text',
              text: '⏰ CLOCK IN REQUEST',
              weight: 'bold',
              color: '#059669',
              size: 'sm',
            },
            {
              type: 'text',
              text: 'บันทึกเวลาเข้างานด้วยตำแหน่งปัจจุบัน',
              weight: 'bold',
              size: 'md',
              color: '#1F2937',
              margin: 'xs',
              wrap: true,
            },
          ],
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: 'ระบบความปลอดภัยจะดึงพิกัด GPS ล่าสุดจากอุปกรณ์ของคุณโดยตรง และไม่อนุญาตให้เลื่อนระบุตำแหน่งบนแผนที่ด้วยตัวเอง',
              color: '#4B5563',
              size: 'xs',
              wrap: true,
            },
            {
              type: 'button',
              style: 'primary',
              color: '#10B981',
              action: {
                type: 'uri',
                label: '📍 บันทึกเข้างาน ณ ตำแหน่งนี้',
                uri: clockUrl,
              },
              margin: 'md',
            },
          ],
        },
      },
    },
  ]);
}

/**
 * handleJustMeOut — เรียกเมื่อผู้ใช้พิมพ์ /out
 */
export async function handleJustMeOut(
  admin: Admin,
  lineUserId: string,
  profileId: string,
  orgId: string,
  replyToken: string,
) {
  // 1. ตรวจสอบว่าผู้ใช้ทำการเข้างานค้างไว้หรือไม่
  const { data: session } = await admin
    .from('just_me_clock_sessions')
    .select('*')
    .eq('profile_id', profileId)
    .maybeSingle();

  if (!session || session.status !== 'clocked_in') {
    return replyText(replyToken, '⚠️ คุณยังไม่ได้บันทึกเวลาเข้างานในระบบ กรุณาพิมพ์ /in เพื่อบันทึกเวลาเข้างานก่อนครับ');
  }

  // 2. ดึง slug ขององค์กร
  const { data: org } = await admin
    .from('organizations')
    .select('slug')
    .eq('id', orgId)
    .maybeSingle();
  const slug = org?.slug || 'justme';
  const baseUrl = process.env.APP_BASE_URL || 'https://app.perpos.io';
  const token = signClockToken(profileId, orgId, 'out');
  const clockUrl = `${baseUrl}/just-me-clock?token=${token}`;

  // 3. ส่ง Flex Card เพื่อให้ไปกดยืนยันตัวตนและบันทึกเวลาจริงจากพิกัด GPS ปัจจุบัน
  return replyLine(replyToken, [
    {
      type: 'flex',
      altText: '⏰ บันทึกเวลาออกงาน (Clock Out)',
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#FEF2F2',
          contents: [
            {
              type: 'text',
              text: '⏰ CLOCK OUT REQUEST',
              weight: 'bold',
              color: '#DC2626',
              size: 'sm',
            },
            {
              type: 'text',
              text: 'บันทึกเวลาออกงานด้วยตำแหน่งปัจจุบัน',
              weight: 'bold',
              size: 'md',
              color: '#1F2937',
              margin: 'xs',
              wrap: true,
            },
          ],
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: 'ระบบความปลอดภัยจะดึงพิกัด GPS ล่าสุดจากอุปกรณ์ของคุณโดยตรง และไม่อนุญาตให้เลื่อนระบุตำแหน่งบนแผนที่ด้วยตัวเอง',
              color: '#4B5563',
              size: 'xs',
              wrap: true,
            },
            {
              type: 'button',
              style: 'primary',
              color: '#EF4444',
              action: {
                type: 'uri',
                label: '📍 บันทึกออกงาน ณ ตำแหน่งนี้',
                uri: clockUrl,
              },
              margin: 'md',
            },
          ],
        },
      },
    },
  ]);
}

/**
 * handleJustMeLocation — จัดการเมื่อได้รับ Message Type: location
 */
export async function handleJustMeLocation(
  admin: Admin,
  location: { latitude: number; longitude: number; address: string; title: string },
  lineUserId: string,
  profileId: string,
  orgId: string,
  replyToken: string,
) {
  // 1. ดึง session ปัจจุบันของ user
  const { data: session } = await admin
    .from('just_me_clock_sessions')
    .select('*')
    .eq('profile_id', profileId)
    .maybeSingle();

  if (!session) {
    return replyText(replyToken, '❌ ไม่มีรายการบันทึกเวลาที่รอดำเนินการ กรุณาพิมพ์ /in หรือ /out เพื่อทำรายการก่อน');
  }

  const now = new Date().toISOString();
  const addressName = location.title || location.address || 'ไม่ระบุชื่อสถานที่';

  if (session.status === 'pending_in') {
    // ─── Clock In ────────────────────────────────────────────────────────────
    
    // บันทึก Log เข้างาน
    const { error: logErr } = await admin.from('just_me_clock_logs').insert({
      org_id:     orgId,
      profile_id: profileId,
      type:       'in',
      timestamp:  now,
      latitude:   location.latitude,
      longitude:  location.longitude,
      address:    addressName,
    });

    if (logErr) return replyText(replyToken, `❌ บันทึกเข้างานล้มเหลว: ${logErr.message}`);

    // อัปเดตสถานะเป็นเข้างานแล้ว (clocked_in) พร้อมบันทึกรายละเอียดพิกัดเริ่มต้น
    await admin.from('just_me_clock_sessions').update({
      status:            'clocked_in',
      last_in_time:      now,
      last_in_latitude:  location.latitude,
      last_in_longitude: location.longitude,
      last_in_address:   addressName,
      updated_at:        now,
    }).eq('profile_id', profileId);

    // ส่ง Flex Card ตอบกลับ
    return replyLine(replyToken, [
      {
        type: 'flex',
        altText: '⏰ บันทึกเวลาเข้างาน (Clock In) สำเร็จ',
        contents: {
          type: 'bubble',
          header: {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#ECFDF5',
            contents: [
              {
                type: 'text',
                text: '🟢 CLOCK IN SUCCESS',
                weight: 'bold',
                color: '#059669',
                size: 'sm',
              },
              {
                type: 'text',
                text: 'บันทึกเวลาเข้างานสำเร็จ',
                weight: 'bold',
                size: 'lg',
                color: '#1F2937',
                margin: 'xs',
              },
            ],
          },
          body: {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  { type: 'text', text: 'วันที่:', color: '#6B7280', size: 'sm', flex: 2 },
                  { type: 'text', text: fmtDateTH(now), color: '#1F2937', size: 'sm', weight: 'bold', flex: 4 },
                ],
              },
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  { type: 'text', text: 'เวลา:', color: '#6B7280', size: 'sm', flex: 2 },
                  { type: 'text', text: fmtTimeTH(now), color: '#1F2937', size: 'sm', weight: 'bold', flex: 4 },
                ],
                margin: 'sm',
              },
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  { type: 'text', text: 'สถานที่:', color: '#6B7280', size: 'sm', flex: 2 },
                  { type: 'text', text: addressName, color: '#1F2937', size: 'sm', wrap: true, flex: 4 },
                ],
                margin: 'sm',
              },
            ],
          },
        },
      },
    ]);

  } else if (session.status === 'pending_out') {
    // ─── Clock Out ───────────────────────────────────────────────────────────
    
    // บันทึก Log ออกงาน
    const { error: logErr } = await admin.from('just_me_clock_logs').insert({
      org_id:     orgId,
      profile_id: profileId,
      type:       'out',
      timestamp:  now,
      latitude:   location.latitude,
      longitude:  location.longitude,
      address:    addressName,
    });

    if (logErr) return replyText(replyToken, `❌ บันทึกออกงานล้มเหลว: ${logErr.message}`);

    // คำนวณระยะเวลา
    const start = new Date(session.last_in_time);
    const end = new Date(now);
    const diffMs = end.getTime() - start.getTime();
    const diffMin = Math.max(1, Math.round(diffMs / 60000));

    // ลบ session ทิ้ง
    await admin.from('just_me_clock_sessions').delete().eq('profile_id', profileId);

    // ส่ง Flex Card ตอบกลับ
    return replyLine(replyToken, [
      {
        type: 'flex',
        altText: '⏰ บันทึกเวลาออกงาน (Clock Out) สำเร็จ',
        contents: {
          type: 'bubble',
          header: {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#FEF2F2',
            contents: [
              {
                type: 'text',
                text: '🔴 CLOCK OUT SUCCESS',
                weight: 'bold',
                color: '#DC2626',
                size: 'sm',
              },
              {
                type: 'text',
                text: 'บันทึกเวลาออกงานสำเร็จ',
                weight: 'bold',
                size: 'lg',
                color: '#1F2937',
                margin: 'xs',
              },
            ],
          },
          body: {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  { type: 'text', text: 'เวลาเข้า:', color: '#6B7280', size: 'sm', flex: 2 },
                  { type: 'text', text: fmtTimeTH(session.last_in_time), color: '#4B5563', size: 'sm', flex: 4 },
                ],
              },
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  { type: 'text', text: 'เวลาออก:', color: '#6B7280', size: 'sm', flex: 2 },
                  { type: 'text', text: fmtTimeTH(now), color: '#1F2937', size: 'sm', weight: 'bold', flex: 4 },
                ],
                margin: 'sm',
              },
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  { type: 'text', text: 'ระยะเวลา:', color: '#6B7280', size: 'sm', flex: 2 },
                  { type: 'text', text: fmtDuration(diffMin), color: '#2563EB', size: 'sm', weight: 'bold', flex: 4 },
                ],
                margin: 'sm',
              },
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  { type: 'text', text: 'สถานที่ออก:', color: '#6B7280', size: 'sm', flex: 2 },
                  { type: 'text', text: addressName, color: '#1F2937', size: 'sm', wrap: true, flex: 4 },
                ],
                margin: 'sm',
              },
            ],
          },
        },
      },
    ]);

  } else {
    // กรณีที่เคย clocked_in อยู่ แต่ยังไม่เคยกดพิมพ์ /out เลย ดันส่ง location เข้ามาดื้อๆ
    return replyText(replyToken, '💡 เพื่อบันทึกเวลาออกงาน กรุณาพิมพ์คำสั่ง /out ก่อน แล้วจึงส่งพิกัดตำแหน่งครับ');
  }
}
