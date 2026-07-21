-- Migration: 20260721100000_fix_ocr_vendor_mappings_fk.sql
-- Fix schema drift in the OCR learning loop.
--
-- ocr_vendor_mappings was created (20260607140000_ocr_learning_loop.sql) pointing at
-- the LEGACY chart-of-accounts tables:
--   debit_account_id -> accounts(id)
--   contact_id       -> contacts(id)
-- But after BUG-2 (f0bfd5d) the OCR pipeline writes acc_* ids
-- (approve route inserts acc_accounts.id into debit_account_id). The mismatched FK
-- makes every learning-loop write raise a foreign-key violation, which the approve
-- route swallows in a try/catch — so vendor mappings were never persisted and the
-- self-improvement loop never actually learned anything.
--
-- Repoint both FKs at the acc_* tables. Table is empty in prod (0 rows) so this is a
-- safe drop+recreate; RLS, unique constraints and audit triggers are untouched.

ALTER TABLE public.ocr_vendor_mappings
  DROP CONSTRAINT IF EXISTS ocr_vendor_mappings_debit_account_id_fkey;

ALTER TABLE public.ocr_vendor_mappings
  ADD CONSTRAINT ocr_vendor_mappings_debit_account_id_fkey
  FOREIGN KEY (debit_account_id) REFERENCES public.acc_accounts(id) ON DELETE CASCADE;

ALTER TABLE public.ocr_vendor_mappings
  DROP CONSTRAINT IF EXISTS ocr_vendor_mappings_contact_id_fkey;

ALTER TABLE public.ocr_vendor_mappings
  ADD CONSTRAINT ocr_vendor_mappings_contact_id_fkey
  FOREIGN KEY (contact_id) REFERENCES public.acc_contacts(id) ON DELETE SET NULL;
