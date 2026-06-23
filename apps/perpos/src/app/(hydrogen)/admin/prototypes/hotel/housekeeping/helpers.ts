/** map staff id → label ไทย (mock) — แยกจาก page.tsx เพราะ Next.js page ห้าม export อื่นนอก default */
export function assigneeLabel(id: string): string {
  const map: Record<string, string> = {
    "staff-hk-001": "พี่นวล (แม่บ้าน)",
    "staff-hk-002": "พี่แดง (แม่บ้าน)",
  };
  return map[id] ?? id;
}
