-- ============================================================
-- Audit Logs v2 — tamper-evident system-wide audit log
-- Part 2/3: Functions (set_audit_context, trigger, verify)
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. set_audit_context() — call from API before mutating queries
--    Stores actor_id, org_id, IP, UA, request_id in session GUCs
--    so the trigger function can pick them up automatically.
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_audit_context(
  p_actor_id uuid    DEFAULT NULL,
  p_org_id   uuid    DEFAULT NULL,
  p_ip       text    DEFAULT NULL,
  p_ua       text    DEFAULT NULL,
  p_req_id   text    DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_actor_id IS NOT NULL THEN
    PERFORM set_config('audit.actor_id',   p_actor_id::text, true);
  END IF;
  IF p_org_id IS NOT NULL THEN
    PERFORM set_config('audit.org_id',     p_org_id::text,   true);
  END IF;
  IF p_ip IS NOT NULL THEN
    PERFORM set_config('audit.ip_address', p_ip,             true);
  END IF;
  IF p_ua IS NOT NULL THEN
    PERFORM set_config('audit.user_agent', p_ua,             true);
  END IF;
  IF p_req_id IS NOT NULL THEN
    PERFORM set_config('audit.request_id', p_req_id,         true);
  END IF;
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 2. fn_audit_log_changes() — SECURITY DEFINER trigger function
--    Fires AFTER INSERT/UPDATE/DELETE on monitored tables.
--    Computes payload_hash + hash chain, then inserts into audit_logs.
--    Owned by postgres (superuser) → bypasses FORCE RLS on audit_logs.
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_audit_log_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_actor_id     uuid;
  v_org_id       uuid;
  v_ip           text;
  v_ua           text;
  v_req_id       text;
  v_old_data     jsonb;
  v_new_data     jsonb;
  v_diff_keys    text[];
  v_record_id    uuid;
  v_payload      jsonb;
  v_payload_hash text;
  v_prev_hash    text;
  v_chain_hash   text;
  v_setting      text;
BEGIN
  -- ── Read application-set context ──────────────────────────
  BEGIN
    v_setting := current_setting('audit.actor_id', true);
    IF v_setting IS NOT NULL AND v_setting <> '' THEN
      v_actor_id := v_setting::uuid;
    END IF;
  EXCEPTION WHEN OTHERS THEN v_actor_id := NULL;
  END;

  BEGIN
    v_setting := current_setting('audit.org_id', true);
    IF v_setting IS NOT NULL AND v_setting <> '' THEN
      v_org_id := v_setting::uuid;
    END IF;
  EXCEPTION WHEN OTHERS THEN v_org_id := NULL;
  END;

  v_ip     := NULLIF(current_setting('audit.ip_address', true), '');
  v_ua     := NULLIF(current_setting('audit.user_agent',  true), '');
  v_req_id := NULLIF(current_setting('audit.request_id',  true), '');

  -- ── Serialize old/new rows ────────────────────────────────
  CASE TG_OP
    WHEN 'INSERT' THEN
      v_new_data  := row_to_json(NEW)::jsonb;
      v_old_data  := NULL;
      v_diff_keys := ARRAY(SELECT jsonb_object_keys(v_new_data));
      BEGIN v_record_id := (v_new_data->>'id')::uuid;
      EXCEPTION WHEN OTHERS THEN v_record_id := NULL; END;

    WHEN 'UPDATE' THEN
      v_new_data  := row_to_json(NEW)::jsonb;
      v_old_data  := row_to_json(OLD)::jsonb;
      SELECT ARRAY(
        SELECT k FROM jsonb_object_keys(v_new_data) AS k
        WHERE v_new_data->k IS DISTINCT FROM v_old_data->k
      ) INTO v_diff_keys;
      BEGIN v_record_id := (v_new_data->>'id')::uuid;
      EXCEPTION WHEN OTHERS THEN v_record_id := NULL; END;

    WHEN 'DELETE' THEN
      v_old_data  := row_to_json(OLD)::jsonb;
      v_new_data  := NULL;
      v_diff_keys := NULL;
      BEGIN v_record_id := (v_old_data->>'id')::uuid;
      EXCEPTION WHEN OTHERS THEN v_record_id := NULL; END;
  END CASE;

  -- ── Payload hash ──────────────────────────────────────────
  v_payload := jsonb_build_object(
    'action',    TG_OP,
    'table',     TG_TABLE_NAME,
    'record_id', v_record_id::text,
    'old_data',  v_old_data,
    'new_data',  v_new_data,
    'logged_at', now()::text
  );
  v_payload_hash := encode(
    extensions.digest(v_payload::text, 'sha256'), 'hex'
  );

  -- ── Hash chain ────────────────────────────────────────────
  -- Get the most recent chain_hash for this table to continue the chain.
  SELECT chain_hash INTO v_prev_hash
  FROM   audit_logs
  WHERE  table_name = TG_TABLE_NAME
  ORDER  BY sequence_no DESC
  LIMIT  1;

  IF v_prev_hash IS NULL THEN
    v_prev_hash := '0000000000000000000000000000000000000000000000000000000000000000';
  END IF;

  v_chain_hash := encode(
    extensions.digest(v_prev_hash || v_payload_hash, 'sha256'), 'hex'
  );

  -- ── Write log ─────────────────────────────────────────────
  INSERT INTO audit_logs (
    org_id, actor_id, action, table_name, record_id,
    old_data, new_data, diff_keys,
    payload_hash, chain_hash,
    ip_address, user_agent, request_id,
    logged_at
  ) VALUES (
    v_org_id, v_actor_id, TG_OP, TG_TABLE_NAME, v_record_id,
    v_old_data, v_new_data, v_diff_keys,
    v_payload_hash, v_chain_hash,
    v_ip, v_ua, v_req_id,
    now()
  );

  RETURN NULL;
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 3. verify_audit_chain() — integrity verification for admin UI
--    Returns each log entry with expected vs actual chain_hash.
--    If ok=false anywhere, the chain has been tampered with.
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION verify_audit_chain(p_table_name text)
RETURNS TABLE(
  seq_no     bigint,
  chain_hash text,
  expected   text,
  ok         boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  r          record;
  prev_hash  text := '0000000000000000000000000000000000000000000000000000000000000000';
  exp_hash   text;
BEGIN
  FOR r IN
    SELECT al.sequence_no, al.payload_hash, al.chain_hash
    FROM   audit_logs al
    WHERE  al.table_name = p_table_name
    ORDER  BY al.sequence_no ASC
  LOOP
    exp_hash   := encode(
      extensions.digest(prev_hash || r.payload_hash, 'sha256'), 'hex'
    );
    seq_no     := r.sequence_no;
    chain_hash := r.chain_hash;
    expected   := exp_hash;
    ok         := (r.chain_hash = exp_hash);
    RETURN NEXT;
    prev_hash  := r.chain_hash;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION set_audit_context  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION verify_audit_chain TO authenticated, service_role;
