-- ── infra_costs: รองรับหลาย GCP project / หลาย billing account ────────────────
--
-- เดิมตารางนี้เก็บเฉพาะ Cloud Run ของ project `perpos` (billing account "perpos")
-- แต่ระบบมี 2 billing account จริง — `perpos` (project perpos) และ `exapp`
-- (project exworker-435807) — และ perpos คือจุดควบคุมกลางที่ต้องเห็นทุกแอป
--
-- 2 อย่างที่เพิ่ม:
--   1. `project` — แยกที่มาของแถว (ชื่อ service ซ้ำข้าม project ได้ เช่น *-pdf-renderer)
--   2. `sku`/`billing_account` — ใช้กับแถวที่มาจาก BigQuery billing export (ต้นทุนจริงทั้งใบ
--      ไม่ใช่แค่ Cloud Run ที่ประมาณจาก Cloud Monitoring)
--
-- ⚠️ source='monitoring' (ประมาณ) กับ source='billing_export' (จริง) เป็นคนละชุดตัวเลข
--    ของเดือนเดียวกัน — **ห้ามบวกรวมกัน** หน้าเว็บต้องเลือกแสดงทีละ source เสมอ

BEGIN;

-- sku/billing_account เป็น '' (ไม่ใช่ NULL) เพราะอยู่ใน unique key — NULL ทำให้ upsert
-- ของ PostgREST ชนกันไม่ติด (NULL ≠ NULL) แล้วแถวจะงอกซ้ำทุกครั้งที่ sync
ALTER TABLE public.infra_costs
  ADD COLUMN IF NOT EXISTS project         text NOT NULL DEFAULT 'perpos',
  ADD COLUMN IF NOT EXISTS sku             text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS billing_account text NOT NULL DEFAULT '';

ALTER TABLE public.infra_costs ALTER COLUMN project DROP DEFAULT;

-- unique key เดิมไม่มี project → service ชื่อเดียวกันคนละ project จะทับกัน
ALTER TABLE public.infra_costs DROP CONSTRAINT IF EXISTS infra_costs_month_app_service_source_key;

ALTER TABLE public.infra_costs
  ADD CONSTRAINT infra_costs_uniq UNIQUE (month, project, app, service, source, sku);

COMMIT;
