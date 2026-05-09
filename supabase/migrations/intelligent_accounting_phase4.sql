BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

ALTER TABLE public.journal_entries
ADD COLUMN IF NOT EXISTS reconciled_at timestamptz,
ADD COLUMN IF NOT EXISTS reconciled_by uuid;

ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS cogs_journal_entry_id uuid;

ALTER TABLE public.invoice_items
ADD COLUMN IF NOT EXISTS inventory_item_id uuid;

CREATE TABLE IF NOT EXISTS public.org_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  company_name_th text,
  company_name_en text,
  address text,
  tax_id text,
  branch_info text,
  logo_object_path text,
  accountant_signature_object_path text,
  authorized_signature_object_path text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id),
  CONSTRAINT org_settings_org_fk FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.document_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  doc_type text NOT NULL,
  prefix text NOT NULL,
  next_number int NOT NULL DEFAULT 1,
  reset_policy text NOT NULL DEFAULT 'yearly' CHECK (reset_policy IN ('never','yearly','monthly')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, doc_type),
  CONSTRAINT document_sequences_org_fk FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  doc_type text NOT NULL,
  doc_no text,
  title text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','void')),
  storage_path text,
  issued_at timestamptz,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT documents_org_fk FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  UNIQUE (organization_id, doc_type, doc_no)
);

CREATE TABLE IF NOT EXISTS public.wht_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  document_id uuid,
  certificate_no text,
  wht_date date NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','void')),

  payer_name text NOT NULL,
  payer_tax_id text,
  payer_address text,

  receiver_name text NOT NULL,
  receiver_tax_id text,
  receiver_address text,

  wht_category text NOT NULL,
  wht_rate numeric(6,4) NOT NULL,
  base_amount numeric(18,2) NOT NULL,
  wht_amount numeric(18,2) NOT NULL,
  notes text,

  posted_journal_entry_id uuid,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT wht_org_fk FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT wht_doc_fk FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE SET NULL,
  CONSTRAINT wht_posted_je_fk FOREIGN KEY (posted_journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  UNIQUE (organization_id, certificate_no)
);

CREATE TABLE IF NOT EXISTS public.bank_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  bank_name text NOT NULL,
  bank_account_name text NOT NULL,
  period_from date,
  period_to date,
  source_file_path text,
  status text NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded','processed','void')),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bank_imports_org_fk FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.bank_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  bank_import_id uuid NOT NULL,
  txn_date date NOT NULL,
  description text,
  amount numeric(18,2) NOT NULL,
  direction text NOT NULL CHECK (direction IN ('in','out')),
  reference text,
  balance numeric(18,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bank_lines_org_fk FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT bank_lines_import_fk FOREIGN KEY (bank_import_id) REFERENCES public.bank_imports(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_bank_lines_import ON public.bank_lines(bank_import_id, txn_date DESC);

CREATE TABLE IF NOT EXISTS public.reconciliation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  conditions jsonb NOT NULL,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reconciliation_rules_org_fk FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.reconciliation_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  bank_line_id uuid NOT NULL,
  journal_entry_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('suggested','confirmed','void')),
  decided_by uuid NOT NULL DEFAULT auth.uid(),
  decided_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reconciliation_matches_org_fk FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT reconciliation_matches_bank_line_fk FOREIGN KEY (bank_line_id) REFERENCES public.bank_lines(id) ON DELETE CASCADE,
  CONSTRAINT reconciliation_matches_je_fk FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  UNIQUE (bank_line_id)
);
CREATE INDEX IF NOT EXISTS idx_recon_matches_je ON public.reconciliation_matches(journal_entry_id);

CREATE TABLE IF NOT EXISTS public.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  sku text NOT NULL,
  name text NOT NULL,
  uom text NOT NULL DEFAULT 'EA',
  current_stock numeric(18,6) NOT NULL DEFAULT 0,
  unit_cost numeric(18,6) NOT NULL DEFAULT 0,
  inventory_account_id uuid,
  cogs_account_id uuid,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_items_org_fk FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  UNIQUE (organization_id, sku)
);

CREATE TABLE IF NOT EXISTS public.inventory_layers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  inventory_item_id uuid NOT NULL,
  qty_remaining numeric(18,6) NOT NULL,
  unit_cost numeric(18,6) NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  source_ref text,
  CONSTRAINT inventory_layers_org_fk FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT inventory_layers_item_fk FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_inventory_layers_item ON public.inventory_layers(inventory_item_id, received_at);

CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  inventory_item_id uuid NOT NULL,
  movement_type text NOT NULL CHECK (movement_type IN ('in','out','adjust')),
  qty numeric(18,6) NOT NULL,
  unit_cost numeric(18,6),
  source_type text,
  source_id uuid,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_movements_org_fk FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT inventory_movements_item_fk FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_item ON public.inventory_movements(inventory_item_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  user_id uuid,
  action text NOT NULL,
  table_name text NOT NULL,
  record_id uuid,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_org_created ON public.audit_logs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_table_created ON public.audit_logs(table_name, created_at DESC);

ALTER TABLE public.org_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wht_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_layers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_settings_select ON public.org_settings;
CREATE POLICY org_settings_select ON public.org_settings
FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = org_settings.organization_id AND m.user_id = auth.uid())
);
DROP POLICY IF EXISTS org_settings_write_admin ON public.org_settings;
CREATE POLICY org_settings_write_admin ON public.org_settings
FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = org_settings.organization_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = org_settings.organization_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin'))
);

DROP POLICY IF EXISTS doc_seq_select ON public.document_sequences;
CREATE POLICY doc_seq_select ON public.document_sequences
FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = document_sequences.organization_id AND m.user_id = auth.uid())
);
DROP POLICY IF EXISTS doc_seq_write_admin ON public.document_sequences;
CREATE POLICY doc_seq_write_admin ON public.document_sequences
FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = document_sequences.organization_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = document_sequences.organization_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin'))
);

DROP POLICY IF EXISTS documents_select ON public.documents;
CREATE POLICY documents_select ON public.documents
FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = documents.organization_id AND m.user_id = auth.uid())
);
DROP POLICY IF EXISTS documents_write_admin ON public.documents;
CREATE POLICY documents_write_admin ON public.documents
FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = documents.organization_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = documents.organization_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin'))
);

DROP POLICY IF EXISTS wht_select ON public.wht_certificates;
CREATE POLICY wht_select ON public.wht_certificates
FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = wht_certificates.organization_id AND m.user_id = auth.uid())
);
DROP POLICY IF EXISTS wht_write_admin ON public.wht_certificates;
CREATE POLICY wht_write_admin ON public.wht_certificates
FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = wht_certificates.organization_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = wht_certificates.organization_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin'))
);

DROP POLICY IF EXISTS bank_imports_select ON public.bank_imports;
CREATE POLICY bank_imports_select ON public.bank_imports
FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = bank_imports.organization_id AND m.user_id = auth.uid())
);
DROP POLICY IF EXISTS bank_imports_write_admin ON public.bank_imports;
CREATE POLICY bank_imports_write_admin ON public.bank_imports
FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = bank_imports.organization_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = bank_imports.organization_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin'))
);

DROP POLICY IF EXISTS bank_lines_select ON public.bank_lines;
CREATE POLICY bank_lines_select ON public.bank_lines
FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = bank_lines.organization_id AND m.user_id = auth.uid())
);
DROP POLICY IF EXISTS bank_lines_write_admin ON public.bank_lines;
CREATE POLICY bank_lines_write_admin ON public.bank_lines
FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = bank_lines.organization_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = bank_lines.organization_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin'))
);

DROP POLICY IF EXISTS recon_rules_select ON public.reconciliation_rules;
CREATE POLICY recon_rules_select ON public.reconciliation_rules
FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = reconciliation_rules.organization_id AND m.user_id = auth.uid())
);
DROP POLICY IF EXISTS recon_rules_write_admin ON public.reconciliation_rules;
CREATE POLICY recon_rules_write_admin ON public.reconciliation_rules
FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = reconciliation_rules.organization_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = reconciliation_rules.organization_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin'))
);

DROP POLICY IF EXISTS recon_matches_select ON public.reconciliation_matches;
CREATE POLICY recon_matches_select ON public.reconciliation_matches
FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = reconciliation_matches.organization_id AND m.user_id = auth.uid())
);
DROP POLICY IF EXISTS recon_matches_write_admin ON public.reconciliation_matches;
CREATE POLICY recon_matches_write_admin ON public.reconciliation_matches
FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = reconciliation_matches.organization_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = reconciliation_matches.organization_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin'))
);

DROP POLICY IF EXISTS inv_items_select ON public.inventory_items;
CREATE POLICY inv_items_select ON public.inventory_items
FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = inventory_items.organization_id AND m.user_id = auth.uid())
);
DROP POLICY IF EXISTS inv_items_write_admin ON public.inventory_items;
CREATE POLICY inv_items_write_admin ON public.inventory_items
FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = inventory_items.organization_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = inventory_items.organization_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin'))
);

DROP POLICY IF EXISTS inv_layers_select ON public.inventory_layers;
CREATE POLICY inv_layers_select ON public.inventory_layers
FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = inventory_layers.organization_id AND m.user_id = auth.uid())
);
DROP POLICY IF EXISTS inv_layers_write_admin ON public.inventory_layers;
CREATE POLICY inv_layers_write_admin ON public.inventory_layers
FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = inventory_layers.organization_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = inventory_layers.organization_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin'))
);

DROP POLICY IF EXISTS inv_mov_select ON public.inventory_movements;
CREATE POLICY inv_mov_select ON public.inventory_movements
FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = inventory_movements.organization_id AND m.user_id = auth.uid())
);
DROP POLICY IF EXISTS inv_mov_write_admin ON public.inventory_movements;
CREATE POLICY inv_mov_write_admin ON public.inventory_movements
FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = inventory_movements.organization_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = inventory_movements.organization_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin'))
);

DROP POLICY IF EXISTS audit_select_admin ON public.audit_logs;
CREATE POLICY audit_select_admin ON public.audit_logs
FOR SELECT TO authenticated
USING (
  organization_id IS NULL OR
  EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = audit_logs.organization_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin'))
);
DROP POLICY IF EXISTS audit_no_write ON public.audit_logs;
CREATE POLICY audit_no_write ON public.audit_logs
FOR INSERT TO authenticated
WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.next_document_number(p_org uuid, p_doc_type text, p_date date)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq public.document_sequences;
  v_no int;
  v_token text;
BEGIN
  INSERT INTO public.document_sequences (organization_id, doc_type, prefix, next_number, reset_policy)
  VALUES (p_org, p_doc_type, upper(p_doc_type) || '-', 1, 'yearly')
  ON CONFLICT (organization_id, doc_type) DO NOTHING;

  SELECT * INTO v_seq
  FROM public.document_sequences
  WHERE organization_id = p_org AND doc_type = p_doc_type
  FOR UPDATE;

  v_no := v_seq.next_number;
  UPDATE public.document_sequences
  SET next_number = next_number + 1,
      updated_at = now()
  WHERE organization_id = p_org AND doc_type = p_doc_type;

  IF v_seq.reset_policy = 'monthly' THEN
    v_token := to_char(p_date, 'YYYYMM');
  ELSIF v_seq.reset_policy = 'yearly' THEN
    v_token := to_char(p_date, 'YYYY');
  ELSE
    v_token := '';
  END IF;

  RETURN v_seq.prefix || (CASE WHEN v_token <> '' THEN v_token || '-' ELSE '' END) || lpad(v_no::text, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_create_wht_certificate(
  p_organization_id uuid,
  p_wht_date date,
  p_payer_name text,
  p_payer_tax_id text,
  p_payer_address text,
  p_receiver_name text,
  p_receiver_tax_id text,
  p_receiver_address text,
  p_wht_category text,
  p_wht_rate numeric,
  p_base_amount numeric,
  p_notes text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_doc_id uuid;
  v_cert_id uuid;
  v_cert_no text;
  v_wht_amount numeric(18,2);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT m.role INTO v_role
  FROM public.organization_members m
  WHERE m.organization_id = p_organization_id AND m.user_id = v_uid
  LIMIT 1;
  IF v_role IS NULL THEN RAISE EXCEPTION 'not_member'; END IF;
  IF v_role NOT IN ('owner','admin') THEN RAISE EXCEPTION 'not_allowed'; END IF;

  v_wht_amount := round((p_base_amount * p_wht_rate)::numeric, 2);
  v_cert_no := public.next_document_number(p_organization_id, 'wht', p_wht_date);

  INSERT INTO public.documents (organization_id, doc_type, doc_no, title, status, created_by, issued_at)
  VALUES (p_organization_id, 'wht', v_cert_no, 'Withholding Tax Certificate', 'issued', v_uid, now())
  RETURNING id INTO v_doc_id;

  INSERT INTO public.wht_certificates (
    organization_id,
    document_id,
    certificate_no,
    wht_date,
    status,
    payer_name,
    payer_tax_id,
    payer_address,
    receiver_name,
    receiver_tax_id,
    receiver_address,
    wht_category,
    wht_rate,
    base_amount,
    wht_amount,
    notes,
    created_by
  )
  VALUES (
    p_organization_id,
    v_doc_id,
    v_cert_no,
    p_wht_date,
    'issued',
    p_payer_name,
    NULLIF(p_payer_tax_id, ''),
    NULLIF(p_payer_address, ''),
    p_receiver_name,
    NULLIF(p_receiver_tax_id, ''),
    NULLIF(p_receiver_address, ''),
    p_wht_category,
    p_wht_rate,
    round(p_base_amount::numeric, 2),
    v_wht_amount,
    NULLIF(p_notes, ''),
    v_uid
  )
  RETURNING id INTO v_cert_id;

  RETURN v_cert_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_bank_import_csv(
  p_organization_id uuid,
  p_bank_name text,
  p_bank_account_name text,
  p_period_from date,
  p_period_to date,
  p_source_file_path text,
  p_lines jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_import_id uuid;
  v_line jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT m.role INTO v_role
  FROM public.organization_members m
  WHERE m.organization_id = p_organization_id AND m.user_id = v_uid
  LIMIT 1;
  IF v_role IS NULL THEN RAISE EXCEPTION 'not_member'; END IF;
  IF v_role NOT IN ('owner','admin') THEN RAISE EXCEPTION 'not_allowed'; END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) < 1 THEN
    RAISE EXCEPTION 'invalid_lines';
  END IF;

  INSERT INTO public.bank_imports (
    organization_id,
    bank_name,
    bank_account_name,
    period_from,
    period_to,
    source_file_path,
    status,
    created_by
  )
  VALUES (
    p_organization_id,
    p_bank_name,
    p_bank_account_name,
    p_period_from,
    p_period_to,
    NULLIF(p_source_file_path, ''),
    'processed',
    v_uid
  )
  RETURNING id INTO v_import_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    INSERT INTO public.bank_lines (
      organization_id,
      bank_import_id,
      txn_date,
      description,
      amount,
      direction,
      reference,
      balance
    )
    VALUES (
      p_organization_id,
      v_import_id,
      (v_line->>'txn_date')::date,
      NULLIF(v_line->>'description', ''),
      round((v_line->>'amount')::numeric, 2),
      (v_line->>'direction'),
      NULLIF(v_line->>'reference', ''),
      CASE WHEN (v_line ? 'balance') AND NULLIF(v_line->>'balance','') IS NOT NULL THEN round((v_line->>'balance')::numeric,2) ELSE NULL END
    );
  END LOOP;

  RETURN v_import_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_confirm_reconciliation(
  p_organization_id uuid,
  p_bank_line_id uuid,
  p_journal_entry_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_match_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT m.role INTO v_role
  FROM public.organization_members m
  WHERE m.organization_id = p_organization_id AND m.user_id = v_uid
  LIMIT 1;
  IF v_role IS NULL THEN RAISE EXCEPTION 'not_member'; END IF;
  IF v_role NOT IN ('owner','admin') THEN RAISE EXCEPTION 'not_allowed'; END IF;

  INSERT INTO public.reconciliation_matches (organization_id, bank_line_id, journal_entry_id, status, decided_by)
  VALUES (p_organization_id, p_bank_line_id, p_journal_entry_id, 'confirmed', v_uid)
  ON CONFLICT (bank_line_id) DO UPDATE
    SET journal_entry_id = EXCLUDED.journal_entry_id,
        status = 'confirmed',
        decided_by = v_uid,
        decided_at = now()
  RETURNING id INTO v_match_id;

  UPDATE public.journal_entries
  SET reconciled_at = now(),
      reconciled_by = v_uid
  WHERE id = p_journal_entry_id
    AND organization_id = p_organization_id;

  RETURN v_match_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_unreconcile_bank_line(
  p_organization_id uuid,
  p_bank_line_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_je_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT m.role INTO v_role
  FROM public.organization_members m
  WHERE m.organization_id = p_organization_id AND m.user_id = v_uid
  LIMIT 1;
  IF v_role IS NULL THEN RAISE EXCEPTION 'not_member'; END IF;
  IF v_role NOT IN ('owner','admin') THEN RAISE EXCEPTION 'not_allowed'; END IF;

  SELECT journal_entry_id INTO v_je_id
  FROM public.reconciliation_matches
  WHERE bank_line_id = p_bank_line_id AND organization_id = p_organization_id;

  DELETE FROM public.reconciliation_matches
  WHERE bank_line_id = p_bank_line_id AND organization_id = p_organization_id;

  IF v_je_id IS NOT NULL THEN
    UPDATE public.journal_entries
    SET reconciled_at = NULL,
        reconciled_by = NULL
    WHERE id = v_je_id AND organization_id = p_organization_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_inventory_receive(
  p_organization_id uuid,
  p_inventory_item_id uuid,
  p_qty numeric,
  p_unit_cost numeric,
  p_source_type text,
  p_source_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_mov_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT m.role INTO v_role
  FROM public.organization_members m
  WHERE m.organization_id = p_organization_id AND m.user_id = v_uid
  LIMIT 1;
  IF v_role IS NULL THEN RAISE EXCEPTION 'not_member'; END IF;
  IF v_role NOT IN ('owner','admin') THEN RAISE EXCEPTION 'not_allowed'; END IF;
  IF p_qty <= 0 THEN RAISE EXCEPTION 'invalid_qty'; END IF;

  INSERT INTO public.inventory_layers (organization_id, inventory_item_id, qty_remaining, unit_cost, received_at, source_ref)
  VALUES (p_organization_id, p_inventory_item_id, p_qty, p_unit_cost, now(), NULL)
  RETURNING id INTO v_mov_id;

  INSERT INTO public.inventory_movements (organization_id, inventory_item_id, movement_type, qty, unit_cost, source_type, source_id, created_by)
  VALUES (p_organization_id, p_inventory_item_id, 'in', p_qty, p_unit_cost, NULLIF(p_source_type,''), p_source_id, v_uid);

  UPDATE public.inventory_items
  SET current_stock = current_stock + p_qty,
      unit_cost = p_unit_cost,
      updated_at = now()
  WHERE id = p_inventory_item_id AND organization_id = p_organization_id;

  RETURN v_mov_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_inventory_issue_fifo(
  p_organization_id uuid,
  p_inventory_item_id uuid,
  p_qty numeric,
  p_source_type text,
  p_source_id uuid
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_remaining numeric := p_qty;
  v_cogs numeric := 0;
  v_layer record;
  v_take numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT m.role INTO v_role
  FROM public.organization_members m
  WHERE m.organization_id = p_organization_id AND m.user_id = v_uid
  LIMIT 1;
  IF v_role IS NULL THEN RAISE EXCEPTION 'not_member'; END IF;
  IF v_role NOT IN ('owner','admin') THEN RAISE EXCEPTION 'not_allowed'; END IF;
  IF p_qty <= 0 THEN RAISE EXCEPTION 'invalid_qty'; END IF;

  FOR v_layer IN
    SELECT id, qty_remaining, unit_cost
    FROM public.inventory_layers
    WHERE organization_id = p_organization_id
      AND inventory_item_id = p_inventory_item_id
      AND qty_remaining > 0
    ORDER BY received_at ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_take := LEAST(v_remaining, v_layer.qty_remaining);
    UPDATE public.inventory_layers
    SET qty_remaining = qty_remaining - v_take
    WHERE id = v_layer.id;

    INSERT INTO public.inventory_movements (organization_id, inventory_item_id, movement_type, qty, unit_cost, source_type, source_id, created_by)
    VALUES (p_organization_id, p_inventory_item_id, 'out', v_take, v_layer.unit_cost, NULLIF(p_source_type,''), p_source_id, v_uid);

    v_cogs := v_cogs + (v_take * v_layer.unit_cost);
    v_remaining := v_remaining - v_take;
  END LOOP;

  UPDATE public.inventory_items
  SET current_stock = current_stock - p_qty,
      updated_at = now()
  WHERE id = p_inventory_item_id AND organization_id = p_organization_id;

  RETURN round(v_cogs::numeric, 2);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_post_invoice_cogs(p_invoice_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv public.invoices;
  v_uid uuid := auth.uid();
  v_role text;
  v_total_cogs numeric := 0;
  v_je_id uuid;
  v_line_no int := 1;
  v_group record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_inv FROM public.invoices WHERE id = p_invoice_id;
  IF v_inv.id IS NULL THEN RAISE EXCEPTION 'invoice_not_found'; END IF;
  SELECT m.role INTO v_role
  FROM public.organization_members m
  WHERE m.organization_id = v_inv.organization_id AND m.user_id = v_uid
  LIMIT 1;
  IF v_role IS NULL THEN RAISE EXCEPTION 'not_member'; END IF;
  IF v_role NOT IN ('owner','admin') THEN RAISE EXCEPTION 'not_allowed'; END IF;
  IF v_inv.status NOT IN ('sent','paid','overdue') THEN RAISE EXCEPTION 'invoice_not_posted'; END IF;
  IF v_inv.cogs_journal_entry_id IS NOT NULL THEN RETURN v_inv.cogs_journal_entry_id; END IF;

  FOR v_group IN
    SELECT
      ii.inventory_item_id,
      sum(ii.quantity)::numeric(18,6) AS qty
    FROM public.invoice_items ii
    WHERE ii.invoice_id = v_inv.id
      AND ii.inventory_item_id IS NOT NULL
    GROUP BY ii.inventory_item_id
  LOOP
    v_total_cogs := v_total_cogs + public.rpc_inventory_issue_fifo(v_inv.organization_id, v_group.inventory_item_id, v_group.qty, 'invoice', v_inv.id);
  END LOOP;

  IF v_total_cogs <= 0 THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.journal_entries (organization_id, entry_date, memo, status, created_by, posted_at, source_type, source_id)
  VALUES (v_inv.organization_id, v_inv.issue_date, 'COGS for ' || coalesce(v_inv.invoice_number,''), 'posted', v_uid, now(), 'invoice_cogs', v_inv.id)
  RETURNING id INTO v_je_id;

  FOR v_group IN
    SELECT
      it.inventory_account_id,
      it.cogs_account_id,
      sum(m.qty * m.unit_cost)::numeric(18,2) AS amt
    FROM public.inventory_movements m
    JOIN public.inventory_items it ON it.id = m.inventory_item_id
    WHERE m.organization_id = v_inv.organization_id
      AND m.source_type = 'invoice'
      AND m.source_id = v_inv.id
      AND m.movement_type = 'out'
    GROUP BY it.inventory_account_id, it.cogs_account_id
  LOOP
    IF v_group.inventory_account_id IS NULL OR v_group.cogs_account_id IS NULL THEN
      RAISE EXCEPTION 'missing_inventory_accounts';
    END IF;

    INSERT INTO public.journal_items (organization_id, journal_entry_id, line_no, account_id, contact_id, description, debit, credit)
    VALUES (v_inv.organization_id, v_je_id, v_line_no, v_group.cogs_account_id, v_inv.contact_id, 'COGS', v_group.amt, 0);
    v_line_no := v_line_no + 1;

    INSERT INTO public.journal_items (organization_id, journal_entry_id, line_no, account_id, contact_id, description, debit, credit)
    VALUES (v_inv.organization_id, v_je_id, v_line_no, v_group.inventory_account_id, v_inv.contact_id, 'Inventory', 0, v_group.amt);
    v_line_no := v_line_no + 1;
  END LOOP;

  UPDATE public.invoices
  SET cogs_journal_entry_id = v_je_id
  WHERE id = v_inv.id;

  RETURN v_je_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_trigger_capture()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_org := COALESCE(NEW.organization_id, NULL);
    v_id := COALESCE(NEW.id, NULL);
    INSERT INTO public.audit_logs (organization_id, user_id, action, table_name, record_id, old_value, new_value)
    VALUES (v_org, auth.uid(), 'INSERT', TG_TABLE_NAME, v_id, NULL, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    v_org := COALESCE(NEW.organization_id, OLD.organization_id, NULL);
    v_id := COALESCE(NEW.id, OLD.id, NULL);
    INSERT INTO public.audit_logs (organization_id, user_id, action, table_name, record_id, old_value, new_value)
    VALUES (v_org, auth.uid(), 'UPDATE', TG_TABLE_NAME, v_id, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    v_org := COALESCE(OLD.organization_id, NULL);
    v_id := COALESCE(OLD.id, NULL);
    INSERT INTO public.audit_logs (organization_id, user_id, action, table_name, record_id, old_value, new_value)
    VALUES (v_org, auth.uid(), 'DELETE', TG_TABLE_NAME, v_id, to_jsonb(OLD), NULL);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_journal_entries ON public.journal_entries;
CREATE TRIGGER trg_audit_journal_entries
AFTER INSERT OR UPDATE OR DELETE ON public.journal_entries
FOR EACH ROW
EXECUTE FUNCTION public.audit_trigger_capture();

DROP TRIGGER IF EXISTS trg_audit_journal_items ON public.journal_items;
CREATE TRIGGER trg_audit_journal_items
AFTER INSERT OR UPDATE OR DELETE ON public.journal_items
FOR EACH ROW
EXECUTE FUNCTION public.audit_trigger_capture();

DROP TRIGGER IF EXISTS trg_audit_invoices ON public.invoices;
CREATE TRIGGER trg_audit_invoices
AFTER INSERT OR UPDATE OR DELETE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.audit_trigger_capture();

DROP TRIGGER IF EXISTS trg_audit_wht ON public.wht_certificates;
CREATE TRIGGER trg_audit_wht
AFTER INSERT OR UPDATE OR DELETE ON public.wht_certificates
FOR EACH ROW
EXECUTE FUNCTION public.audit_trigger_capture();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'org-assets') THEN
    INSERT INTO storage.buckets (id, name, public) VALUES ('org-assets', 'org-assets', false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'bank-statements') THEN
    INSERT INTO storage.buckets (id, name, public) VALUES ('bank-statements', 'bank-statements', false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'documents') THEN
    INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false);
  END IF;
END $$;

REVOKE ALL ON public.audit_logs FROM anon;
REVOKE ALL ON public.audit_logs FROM authenticated;
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

REVOKE ALL ON FUNCTION public.next_document_number(uuid, text, date) FROM anon;
REVOKE ALL ON FUNCTION public.next_document_number(uuid, text, date) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.next_document_number(uuid, text, date) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_create_wht_certificate(uuid, date, text, text, text, text, text, text, text, numeric, numeric, text) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_create_wht_certificate(uuid, date, text, text, text, text, text, text, text, numeric, numeric, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_create_wht_certificate(uuid, date, text, text, text, text, text, text, text, numeric, numeric, text) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_bank_import_csv(uuid, text, text, date, date, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_bank_import_csv(uuid, text, text, date, date, text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_bank_import_csv(uuid, text, text, date, date, text, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_confirm_reconciliation(uuid, uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_confirm_reconciliation(uuid, uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_confirm_reconciliation(uuid, uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_unreconcile_bank_line(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_unreconcile_bank_line(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_unreconcile_bank_line(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_inventory_receive(uuid, uuid, numeric, numeric, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_inventory_receive(uuid, uuid, numeric, numeric, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_inventory_receive(uuid, uuid, numeric, numeric, text, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_inventory_issue_fifo(uuid, uuid, numeric, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_inventory_issue_fifo(uuid, uuid, numeric, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_inventory_issue_fifo(uuid, uuid, numeric, text, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_post_invoice_cogs(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_post_invoice_cogs(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_post_invoice_cogs(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

