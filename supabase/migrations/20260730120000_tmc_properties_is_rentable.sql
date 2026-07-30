-- tmc_properties.is_rentable — ห้องที่เปิดขายจริง (นับเป็นฐาน occupancy rate)
-- แปลงอื่น (บ้านเจ้าของ/ส่วนกลาง) ไม่นับเป็นห้องว่างให้เช่า
ALTER TABLE tmc_properties
  ADD COLUMN IF NOT EXISTS is_rentable boolean NOT NULL DEFAULT false;

UPDATE tmc_properties SET is_rentable = true WHERE code IN ('TMC1', 'TMC5', 'TMC7');
