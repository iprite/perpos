-- ── ต้นทุนโครงสร้างพื้นฐานระดับบัญชี GCP (แยกตามแอป) ──────────────────────────
--
-- ต่างจาก `usage_events` ที่เป็นต้นทุน "ต่อ org ของ perpos" — ตารางนี้เก็บภาพรวมบิล GCP
-- ทั้งบัญชีซึ่งมีหลายแอปใช้ project เดียวกัน (perpos / exapp) เพื่อตอบคำถามว่า
-- "บิลเดือนนี้ ฿X เป็นของแอปไหนเท่าไร"
--
-- ทำไมต้องมีตาราง ไม่ query Cloud Monitoring สด ๆ จากหน้าเว็บ:
--   แอปรันบน Vercel ไม่มี credential ของ GCP · จะให้มีต้องสร้าง service account + key
--   ⇒ ใช้สคริปต์ `pnpm infra:sync` (รันจากเครื่องที่ gcloud login แล้ว) ดึงมาเก็บเป็น snapshot รายเดือน
--   แล้วหน้าเว็บอ่านจากตารางนี้ — ท่าเดียวกับ `pnpm kb:embed`
--
-- ⚠️ ตัวเลขเป็น snapshot ณ เวลาที่ sync — เดือนที่ยังไม่จบจะยังไม่ครบ (ดู synced_at)

BEGIN;

CREATE TABLE IF NOT EXISTS public.infra_costs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month        date NOT NULL,                    -- วันที่ 1 ของเดือน
  app          text NOT NULL,                    -- 'perpos' | 'exapp' | 'shared' | 'unknown'
  service      text NOT NULL,                    -- ชื่อ Cloud Run service หรือชื่อบริการ GCP
  cpu_seconds  numeric(20,3) NOT NULL DEFAULT 0,
  gib_seconds  numeric(20,3) NOT NULL DEFAULT 0,
  requests     bigint        NOT NULL DEFAULT 0,
  cost_usd     numeric(14,6) NOT NULL DEFAULT 0 CHECK (cost_usd >= 0),
  source       text NOT NULL DEFAULT 'monitoring' CHECK (source IN ('monitoring','billing_export','manual')),
  note         text,
  synced_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (month, app, service, source)
);

CREATE INDEX IF NOT EXISTS infra_costs_month_idx ON public.infra_costs (month DESC, cost_usd DESC);

ALTER TABLE public.infra_costs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.infra_costs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.infra_costs TO service_role;

COMMIT;
