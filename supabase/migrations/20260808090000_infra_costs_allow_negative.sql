-- infra_costs: ยอมให้ cost_usd ติดลบได้
--
-- บิล GCP จริงมีบรรทัดที่ติดลบตามปกติ — "Billing Adjustment" (ปรับยอดย้อนหลัง) และ
-- "Rounding Error" ซึ่งเป็นส่วนหนึ่งของยอดที่ต้องจ่ายจริง (เดือน ก.ค. 2026 มี −$1.02)
-- เดิม CHECK (cost_usd >= 0) ทำให้ sync ทั้งเดือนล้มทั้งชุด (insert เป็น batch เดียว)
-- ถ้าตัดบรรทัดพวกนี้ทิ้งแทน ยอดรวมจะสูงกว่าบิลจริง — จึงต้องยอมให้ติดลบ
alter table public.infra_costs drop constraint if exists infra_costs_cost_usd_check;
