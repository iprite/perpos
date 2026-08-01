-- ── ปรับสมมติฐานทั้งหมดตาม "บิล GCP จริง" เดือน ก.ค. 2026 ─────────────────────
--
-- แหล่ง: Cost table export (2026-07-01 — 2026-07-31) บัญชี 01A657-0A41D8-3265B1 · รวม ฿1,062.27
--
-- ⚠️ สิ่งที่สำคัญที่สุดที่บิลบอก: **฿1,062 ของบิลไม่ใช่ของ perpos**
--    Cloud Run ฿971.92 มาจาก `exapp-clip-renderer` ถึง 98.6% (คนละแอป แชร์ GCP project เดียวกัน)
--    ต้นทุน GCP ที่เป็นของ perpos จริง ๆ ในเดือนนั้น ≈ ฿104 เท่านั้น
--    → เวลาอ่านบิลรวมอย่าเหมาว่าเป็นของ perpos ต้องแยกด้วย service_name จาก Cloud Monitoring
--
-- สิ่งที่บิลยืนยัน / แก้ให้
--   1) ราคา Gemini ต่อ token ที่ตั้งไว้ **ถูกทุกตัว** — ทุก SKU ให้อัตราแลกเปลี่ยนตรงกันที่ 33.35
--      แต่ `usd_thb_rate` ที่เดาไว้ 35 สูงไป 5% → แก้เป็น 33.35 (เรตที่ Google ใช้ออกบิลจริง)
--   2) Cloud Run มี **ส่วนลด spending-based 15.2%** ที่โมเดลเดิมไม่รู้จัก
--      เรตสุทธิจากบิล: CPU ฿0.00062744/vCPU-s · MEM ฿0.00006001/GiB-s
--      → ต้นทุนต่องานที่ประมาณไว้รอบก่อน (จาก list price + FX 35) สูงเกินจริง
--   3) มี SKU ที่โมเดลไม่รู้จักโผล่ในบิล: **gemini 3 pro** (฿2.23) และ **cached input token** (฿0.07)
--      โค้ด perpos ใช้แค่ 2.5-flash + embedding-001 ⇒ gemini-3-pro **ไม่ได้มาจากโค้ดเรา**
--      (น่าจะเป็น AI Studio playground หรือแอปอื่นที่ใช้ key เดียวกัน) — ใส่ราคาไว้กันนับเป็น 0
--   4) ต้นทุนคงที่ที่ไม่เคยนับเลย: Artifact Registry ฿27.90 + Secret Manager ฿26.79 + Scheduler ฿1.51
--      = ฿56.20/เดือน มากกว่าค่า Cloud Run ของ perpos เองเสียอีก
--
-- ผลการกระทบยอดหลังแก้ (ก.ค.): compute ของเรา ฿13.77 เทียบบิลจริง ฿13.87 → ตรง 99.3%
-- ส่วน Gemini จับได้ ฿26.25 จาก ฿34.08 (77%) — ที่ขาดคือ TMC bot/flow RAG ที่โค้ดยังไม่ deploy
-- และ gemini-3-pro ที่ไม่ใช่ของเรา

BEGIN;

UPDATE public.usage_settings SET usd_thb_rate = 33.35, updated_at = now() WHERE id = true;

UPDATE public.usage_prices SET unit_cost_usd = 0.101200000000,
  label = 'บีบ PDF — ต่อ 1 งาน (จากบิลจริง ก.ค.)', updated_at = now()
WHERE key = 'compute:pdf_compress_job';

UPDATE public.usage_prices SET unit_cost_usd = 0.035100000000,
  label = 'STT worker — compute ต่อ 1 งาน (จากบิลจริง ก.ค.)', updated_at = now()
WHERE key = 'compute:stt_job';

UPDATE public.usage_prices SET unit_cost_usd = 0.000018814000,
  label = 'Cloud Run — CPU ต่อ vCPU-วินาที (สุทธิหลังส่วนลด)', updated_at = now()
WHERE key = 'compute:cloudrun_second';

INSERT INTO public.usage_prices (key, service, label, unit, unit_cost_usd) VALUES
  ('gemini-3-pro:text_in',       'gemini', 'Gemini 3 Pro — input (ข้อความ)',  'token', 0.000002000),
  ('gemini-3-pro:audio_in',      'gemini', 'Gemini 3 Pro — input (เสียง)',    'token', 0.000002000),
  ('gemini-3-pro:out',           'gemini', 'Gemini 3 Pro — output',           'token', 0.000012000),
  ('gemini-2.5-flash:cached_in', 'gemini', 'Gemini 2.5 Flash — cached input', 'token', 0.000000030)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.usage_fixed_costs (month, label, amount_usd, allocation, note) VALUES
  ('2026-07-01', 'Artifact Registry (เก็บ image ของ worker)', 0.8366, 'pro_rata',
   'บิลจริง ก.ค. ฿27.90 — โตขึ้นทุกครั้งที่ deploy ถ้าไม่ล้าง image เก่า'),
  ('2026-07-01', 'Secret Manager', 0.8033, 'pro_rata',
   'บิลจริง ก.ค. ฿26.79 — คิดตามจำนวน secret version ที่เก็บไว้'),
  ('2026-07-01', 'Cloud Scheduler', 0.0453, 'per_org',
   'บิลจริง ก.ค. ฿1.51 — cron กลางของระบบ')
ON CONFLICT (month, label) DO UPDATE
  SET amount_usd = EXCLUDED.amount_usd, note = EXCLUDED.note;

-- ตีราคา event compute ที่เคยคิดด้วยค่าประมาณใหม่ (Gemini คิดจาก token จริงอยู่แล้ว ไม่ต้องแตะ)
UPDATE public.usage_events SET cost_usd = public.usage_price_usd('compute:stt_job')
WHERE feature = 'assistant.stt_compute';
UPDATE public.usage_events SET cost_usd = public.usage_price_usd('compute:pdf_compress_job')
WHERE feature = 'assistant.pdf_compress';

COMMIT;
