-- ใบรับรองของโดเมนเว็บที่ Caddy origin (วันที่เหลือต่อโดเมน · null = ต่อไม่ได้) — เขียนโดยตัวเฝ้า t5
-- ให้ /admin/system โชว์ได้ โดยไม่ต้องต่อ TLS ซ้ำตอนเปิดหน้า
alter table public.mail_server_health add column if not exists web_certs jsonb;
