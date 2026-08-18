-- ประวัติการใช้ทรัพยากรของเมลเซิร์ฟเวอร์ (Stalwart @ Contabo) — 1 แถว = 1 heartbeat
--
-- ทำไมต้องมีตารางนี้ ทั้งที่มี `mail_server_health` อยู่แล้ว:
--   `mail_server_health` เก็บ **ค่าล่าสุดแถวเดียว** (พอสำหรับ "เตือนไหม") แต่ตอบไม่ได้ว่า
--   "ดิสก์โตเดือนละกี่ GB" / "RAM ไต่ขึ้นตลอดไหม" ⇒ หน้า /admin/mail แท็บ "เครื่องเซิร์ฟเวอร์"
--   ต้องการ **ประวัติ** เพื่อดูแนวโน้มก่อนเต็ม (Contabo API ไม่มี usage ให้ดึง — ต้องเก็บเอง)
--
-- เขียนโดย /api/admin/mail-server/heartbeat (worker secret) เท่านั้น · อ่านโดย service role
-- RLS enable โดยไม่มี policy = deny-all · เก็บ 30 วัน แล้ว scheduler t60 ลบทิ้ง
create table if not exists mail_server_samples (
  id bigserial primary key,
  host text not null default 'stalwart',
  taken_at timestamptz not null default now(),

  -- ดิสก์ของ / (ตัวที่เต็มแล้วเมลล่ม)
  disk_pct numeric,
  disk_used_bytes bigint,
  disk_total_bytes bigint,

  -- หน่วยความจำ + โหลด
  mem_used_mb integer,
  mem_total_mb integer,
  load1 numeric,
  cpu_count integer,

  -- ขนาดฐานข้อมูลเมลจริง (RocksDB) — โตตามปริมาณเมล ไม่ใช่ทั้งดิสก์
  store_bytes bigint,

  -- backup + สถานะบริการ
  backup_age_hours numeric,
  backup_size_mb numeric,
  service_active boolean,
  smtp25_listening boolean,

  uptime_seconds bigint,

  -- ตัวนับสะสมของการ์ดเน็ต (/proc/net/dev) — UI คิดผลต่างระหว่าง 2 จุดเอง
  net_rx_bytes bigint,
  net_tx_bytes bigint
);

create index if not exists mail_server_samples_taken_at_idx
  on mail_server_samples (host, taken_at desc);

alter table mail_server_samples enable row level security;
