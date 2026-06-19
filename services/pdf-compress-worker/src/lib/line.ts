/** ดาวน์โหลดไฟล์ที่ผู้ใช้ส่งมาทาง LINE (content API) — worker โหลดเองกัน webhook timeout */
export async function downloadLineContent(messageId: string): Promise<Buffer> {
  const token = (process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN ?? '').trim();
  if (!token) throw new Error('LINE_MESSAGING_CHANNEL_ACCESS_TOKEN not set');
  const res = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) throw new Error(`LINE content download failed (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}
