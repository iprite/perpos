-- ============================================================
-- Audit Logs v2 — P2 enrichment
-- 1. set_audit_context: switch to session-level GUC (is_local=false)
--    → survives transaction commit, best-effort via PostgREST
-- 2. fn_audit_log_changes: Tier-2 row-data auto-extraction
--    → always captures actor_id (created_by/user_id) & org_id from rows
--    → clears GUC after each trigger fire to prevent session leakage
-- ============================================================

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
    PERFORM set_config('audit.actor_id',   p_actor_id::text, false);
  END IF;
  IF p_org_id IS NOT NULL THEN
    PERFORM set_config('audit.org_id',     p_org_id::text,   false);
  END IF;
  IF p_ip IS NOT NULL THEN
    PERFORM set_config('audit.ip_address', p_ip,             false);
  END IF;
  IF p_ua IS NOT NULL THEN
    PERFORM set_config('audit.user_agent', p_ua,             false);
  END IF;
  IF p_req_id IS NOT NULL THEN
    PERFORM set_config('audit.request_id', p_req_id,         false);
  END IF;
END;
$$;

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
  -- ── Tier 1: session GUC (best-effort) ────────────────────
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

  -- ── Serialize rows ────────────────────────────────────────
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

  -- ── Tier 2: auto-extract from row data (always reliable) ─
  -- actor_id fallback: created_by → user_id
  IF v_actor_id IS NULL THEN
    BEGIN
      IF v_new_data IS NOT NULL THEN
        IF (v_new_data->>'created_by') IS NOT NULL THEN
          v_actor_id := (v_new_data->>'created_by')::uuid;
        ELSIF (v_new_data->>'user_id') IS NOT NULL THEN
          v_actor_id := (v_new_data->>'user_id')::uuid;
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  -- org_id fallback: org_id column on new or old row
  IF v_org_id IS NULL THEN
    BEGIN
      IF v_new_data IS NOT NULL AND (v_new_data->>'org_id') IS NOT NULL THEN
        v_org_id := (v_new_data->>'org_id')::uuid;
      ELSIF v_old_data IS NOT NULL AND (v_old_data->>'org_id') IS NOT NULL THEN
        v_org_id := (v_old_data->>'org_id')::uuid;
      END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

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

  -- ── Clear GUC after use (prevent leaking to future requests) ─
  PERFORM set_config('audit.actor_id',   '', false);
  PERFORM set_config('audit.org_id',     '', false);
  PERFORM set_config('audit.ip_address', '', false);
  PERFORM set_config('audit.user_agent', '', false);
  PERFORM set_config('audit.request_id', '', false);

  RETURN NULL;
END;
$$;
