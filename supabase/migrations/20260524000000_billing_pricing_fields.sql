-- Add negotiated pricing fields to org_billing
ALTER TABLE org_billing
  ADD COLUMN IF NOT EXISTS monthly_price  numeric(12,2),
  ADD COLUMN IF NOT EXISTS currency       text NOT NULL DEFAULT 'THB',
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'active'
    CHECK (payment_status IN ('active', 'overdue', 'cancelled', 'pending'));
