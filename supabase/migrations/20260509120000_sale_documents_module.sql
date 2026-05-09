-- Sale Documents Module
-- Covers: ใบเสนอราคา, ใบรับมัดจำ, ใบเสร็จรับเงิน, ใบกำกับภาษีขาย, e-Tax Invoice, ใบลดหนี้, ใบเพิ่มหนี้, ใบวางบิล

BEGIN;

-- ── Tables ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sale_documents (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL,
  doc_type             text NOT NULL CHECK (doc_type IN (
                         'quotation','deposit_receipt','receipt',
                         'tax_invoice','etax_invoice',
                         'credit_note','debit_note','billing_note')),
  contact_id           uuid NOT NULL,
  doc_number           text,
  issue_date           date NOT NULL,
  due_date             date,
  status               text NOT NULL DEFAULT 'draft',
  sub_total            numeric(18,2) NOT NULL DEFAULT 0,
  vat_amount           numeric(18,2) NOT NULL DEFAULT 0,
  total_amount         numeric(18,2) NOT NULL DEFAULT 0,
  withholding_tax      numeric(18,2),
  notes                text,
  ref_invoice_id       uuid,
  created_by           uuid NOT NULL DEFAULT auth.uid(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sale_documents_org_fk     FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT sale_documents_contact_fk FOREIGN KEY (contact_id)      REFERENCES public.contacts(id)     ON DELETE RESTRICT,
  CONSTRAINT sale_documents_inv_fk     FOREIGN KEY (ref_invoice_id)   REFERENCES public.invoices(id)     ON DELETE SET NULL,
  UNIQUE (organization_id, doc_type, doc_number)
);

CREATE INDEX IF NOT EXISTS idx_sale_documents_org_type      ON public.sale_documents (organization_id, doc_type);
CREATE INDEX IF NOT EXISTS idx_sale_documents_org_date      ON public.sale_documents (organization_id, issue_date DESC);
CREATE INDEX IF NOT EXISTS idx_sale_documents_contact       ON public.sale_documents (contact_id);
CREATE INDEX IF NOT EXISTS idx_sale_documents_ref_invoice   ON public.sale_documents (ref_invoice_id);

CREATE TABLE IF NOT EXISTS public.sale_document_items (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL,
  sale_document_id     uuid NOT NULL,
  line_no              int NOT NULL,
  product_name         text NOT NULL,
  inventory_item_id    uuid,
  quantity             numeric(18,4) NOT NULL DEFAULT 1,
  unit_price           numeric(18,2) NOT NULL DEFAULT 0,
  vat_type             text NOT NULL DEFAULT 'exclude' CHECK (vat_type IN ('include','exclude','none')),
  line_amount          numeric(18,2) NOT NULL DEFAULT 0,
  vat_amount           numeric(18,2) NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sale_document_items_doc_fk FOREIGN KEY (sale_document_id)  REFERENCES public.sale_documents(id) ON DELETE CASCADE,
  CONSTRAINT sale_document_items_org_fk FOREIGN KEY (organization_id)   REFERENCES public.organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sale_document_items_doc  ON public.sale_document_items (sale_document_id);
CREATE INDEX IF NOT EXISTS idx_sale_document_items_org  ON public.sale_document_items (organization_id);

-- ── updated_at trigger ────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_sale_documents_updated_at ON public.sale_documents;
CREATE TRIGGER trg_sale_documents_updated_at
  BEFORE UPDATE ON public.sale_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.sale_documents       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_document_items  ENABLE ROW LEVEL SECURITY;

-- sale_documents: members can read, admin/owner can write
DROP POLICY IF EXISTS sdoc_select ON public.sale_documents;
CREATE POLICY sdoc_select ON public.sale_documents FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = sale_documents.organization_id
      AND om.profile_id = auth.uid()
  ));

DROP POLICY IF EXISTS sdoc_insert ON public.sale_documents;
CREATE POLICY sdoc_insert ON public.sale_documents FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = sale_documents.organization_id
      AND om.profile_id = auth.uid()
      AND om.role IN ('owner','admin')
  ));

DROP POLICY IF EXISTS sdoc_update ON public.sale_documents;
CREATE POLICY sdoc_update ON public.sale_documents FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = sale_documents.organization_id
      AND om.profile_id = auth.uid()
      AND om.role IN ('owner','admin')
  ));

DROP POLICY IF EXISTS sdoc_delete ON public.sale_documents;
CREATE POLICY sdoc_delete ON public.sale_documents FOR DELETE
  USING (
    status = 'draft'
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = sale_documents.organization_id
        AND om.profile_id = auth.uid()
        AND om.role IN ('owner','admin')
    )
  );

-- sale_document_items: mirror parent access via org membership
DROP POLICY IF EXISTS sdoc_items_select ON public.sale_document_items;
CREATE POLICY sdoc_items_select ON public.sale_document_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = sale_document_items.organization_id
      AND om.profile_id = auth.uid()
  ));

DROP POLICY IF EXISTS sdoc_items_insert ON public.sale_document_items;
CREATE POLICY sdoc_items_insert ON public.sale_document_items FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = sale_document_items.organization_id
      AND om.profile_id = auth.uid()
      AND om.role IN ('owner','admin')
  ));

DROP POLICY IF EXISTS sdoc_items_delete ON public.sale_document_items;
CREATE POLICY sdoc_items_delete ON public.sale_document_items FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = sale_document_items.organization_id
      AND om.profile_id = auth.uid()
      AND om.role IN ('owner','admin')
  ));

REVOKE ALL ON public.sale_documents      FROM anon;
REVOKE ALL ON public.sale_document_items FROM anon;

-- ── create_sale_document RPC ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_sale_document(
  p_organization_id  uuid,
  p_doc_type         text,
  p_contact_id       uuid,
  p_issue_date       date,
  p_due_date         date,
  p_status           text,
  p_withholding_tax  numeric,
  p_notes            text,
  p_items            jsonb,
  p_ref_invoice_id   uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_role       text;
  v_doc_id     uuid;
  v_doc_number text;
  v_prefix     text;
  v_next_no    int;
  v_sub        numeric(18,2) := 0;
  v_vat        numeric(18,2) := 0;
  v_total      numeric(18,2) := 0;
  v_line_no    int := 0;
  v_line       jsonb;
  v_qty        numeric(18,4);
  v_price      numeric(18,2);
  v_vat_type   text;
  v_base       numeric(18,6);
  v_line_vat   numeric(18,6);
BEGIN
  -- auth
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  -- membership + role
  SELECT role INTO v_role
  FROM public.organization_members
  WHERE organization_id = p_organization_id AND profile_id = v_uid;

  IF v_role IS NULL THEN RAISE EXCEPTION 'not_member'; END IF;
  IF v_role NOT IN ('owner','admin') THEN RAISE EXCEPTION 'permission_denied'; END IF;

  -- validate doc_type
  IF p_doc_type NOT IN ('quotation','deposit_receipt','receipt','tax_invoice','etax_invoice','credit_note','debit_note','billing_note') THEN
    RAISE EXCEPTION 'invalid_doc_type:%', p_doc_type;
  END IF;

  -- validate status
  IF p_doc_type = 'quotation' THEN
    IF p_status NOT IN ('draft','issued','accepted','rejected','expired','voided') THEN
      RAISE EXCEPTION 'invalid_status:%', p_status;
    END IF;
  ELSE
    IF p_status NOT IN ('draft','issued','voided') THEN
      RAISE EXCEPTION 'invalid_status:%', p_status;
    END IF;
  END IF;

  -- prefix lookup
  v_prefix := CASE p_doc_type
    WHEN 'quotation'       THEN 'QT'
    WHEN 'deposit_receipt' THEN 'DEP'
    WHEN 'receipt'         THEN 'RCT'
    WHEN 'tax_invoice'     THEN 'TINV'
    WHEN 'etax_invoice'    THEN 'ETAX'
    WHEN 'credit_note'     THEN 'CN'
    WHEN 'debit_note'      THEN 'DN'
    WHEN 'billing_note'    THEN 'BN'
    ELSE 'DOC'
  END;

  -- generate doc number
  UPDATE public.document_sequences
  SET next_number = next_number + 1, updated_at = now()
  WHERE organization_id = p_organization_id AND doc_type = p_doc_type
  RETURNING next_number - 1 INTO v_next_no;

  IF NOT FOUND THEN
    INSERT INTO public.document_sequences (organization_id, doc_type, prefix, next_number)
    VALUES (p_organization_id, p_doc_type, v_prefix, 2);
    v_next_no := 1;
  END IF;

  v_doc_number := v_prefix || TO_CHAR(p_issue_date, 'YYYYMM') || LPAD(v_next_no::text, 5, '0');

  -- compute totals
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty      := (v_line->>'quantity')::numeric;
    v_price    := (v_line->>'unit_price')::numeric;
    v_vat_type := v_line->>'vat_type';

    IF v_vat_type = 'include' THEN
      v_base     := ROUND((v_qty * v_price) / 1.07, 6);
      v_line_vat := ROUND((v_qty * v_price) - v_base, 6);
    ELSIF v_vat_type = 'exclude' THEN
      v_base     := ROUND(v_qty * v_price, 6);
      v_line_vat := ROUND(v_base * 0.07, 6);
    ELSE
      v_base     := ROUND(v_qty * v_price, 6);
      v_line_vat := 0;
    END IF;

    v_sub  := v_sub + ROUND(v_base::numeric, 2);
    v_vat  := v_vat + ROUND(v_line_vat::numeric, 2);
  END LOOP;

  v_total := v_sub + v_vat;

  -- insert document
  INSERT INTO public.sale_documents (
    organization_id, doc_type, contact_id, doc_number,
    issue_date, due_date, status,
    sub_total, vat_amount, total_amount, withholding_tax,
    notes, ref_invoice_id, created_by
  ) VALUES (
    p_organization_id, p_doc_type, p_contact_id, v_doc_number,
    p_issue_date, p_due_date, p_status,
    v_sub, v_vat, v_total, p_withholding_tax,
    p_notes, p_ref_invoice_id, v_uid
  ) RETURNING id INTO v_doc_id;

  -- insert items
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_line_no := v_line_no + 1;
    v_qty      := (v_line->>'quantity')::numeric;
    v_price    := (v_line->>'unit_price')::numeric;
    v_vat_type := v_line->>'vat_type';

    IF v_vat_type = 'include' THEN
      v_base     := ROUND((v_qty * v_price) / 1.07, 2);
      v_line_vat := ROUND((v_qty * v_price) - v_base, 2);
    ELSIF v_vat_type = 'exclude' THEN
      v_base     := ROUND(v_qty * v_price, 2);
      v_line_vat := ROUND(v_base * 0.07, 2);
    ELSE
      v_base     := ROUND(v_qty * v_price, 2);
      v_line_vat := 0;
    END IF;

    INSERT INTO public.sale_document_items (
      organization_id, sale_document_id, line_no,
      product_name, inventory_item_id,
      quantity, unit_price, vat_type,
      line_amount, vat_amount
    ) VALUES (
      p_organization_id, v_doc_id, v_line_no,
      v_line->>'product_name',
      NULLIF(v_line->>'inventory_item_id','')::uuid,
      v_qty, v_price, v_vat_type,
      v_base::numeric(18,2), v_line_vat::numeric(18,2)
    );
  END LOOP;

  RETURN v_doc_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_sale_document TO authenticated;

-- ── void / issue helpers ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_sale_document_status(
  p_organization_id uuid,
  p_doc_id          uuid,
  p_status          text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_role text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT role INTO v_role
  FROM public.organization_members
  WHERE organization_id = p_organization_id AND profile_id = v_uid;

  IF v_role NOT IN ('owner','admin') THEN RAISE EXCEPTION 'permission_denied'; END IF;

  UPDATE public.sale_documents
  SET status = p_status, updated_at = now()
  WHERE id = p_doc_id AND organization_id = p_organization_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_sale_document_status TO authenticated;

COMMIT;
