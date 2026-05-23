-- ============================================================
-- Audit Logs v2 — tamper-evident system-wide audit log
-- Part 3/3: Attach triggers to monitored tables
-- ============================================================

-- Clean slate
DROP TRIGGER IF EXISTS trg_audit_tmc_finance_entries  ON tmc_finance_entries;
DROP TRIGGER IF EXISTS trg_audit_tmc_accounts          ON tmc_accounts;
DROP TRIGGER IF EXISTS trg_audit_profiles              ON profiles;
DROP TRIGGER IF EXISTS trg_audit_organization_members  ON organization_members;

-- TMC finance entries — all operations
CREATE TRIGGER trg_audit_tmc_finance_entries
  AFTER INSERT OR UPDATE OR DELETE ON tmc_finance_entries
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log_changes();

-- TMC accounts — all operations
CREATE TRIGGER trg_audit_tmc_accounts
  AFTER INSERT OR UPDATE OR DELETE ON tmc_accounts
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log_changes();

-- Profiles — UPDATE and DELETE only (skip noisy auth registrations)
CREATE TRIGGER trg_audit_profiles
  AFTER UPDATE OR DELETE ON profiles
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log_changes();

-- Org members — all operations
CREATE TRIGGER trg_audit_organization_members
  AFTER INSERT OR UPDATE OR DELETE ON organization_members
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log_changes();
