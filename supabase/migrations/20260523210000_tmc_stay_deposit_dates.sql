-- Add separate deposit date columns to tmc_stays
-- Previously: received used check_in date, returned used check_out date
-- Now: each has its own explicit date field

ALTER TABLE tmc_stays
  ADD COLUMN IF NOT EXISTS deposit_received_date date,
  ADD COLUMN IF NOT EXISTS deposit_returned_date date;

COMMENT ON COLUMN tmc_stays.deposit_received_date IS 'วันที่รับเงินมัดจำ (อาจต่างจากวันเช็คอิน)';
COMMENT ON COLUMN tmc_stays.deposit_returned_date IS 'วันที่คืนเงินมัดจำ (อาจต่างจากวันเช็คเอาต์)';
