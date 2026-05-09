-- Purchase Documents Module
-- Covers: ใบสั่งซื้อ, ใบจ่ายมัดจำ, บันทึกซื้อสินค้า, บันทึกค่าใช้จ่ายและการจ่ายเงิน,
--         บันทึกรายจ่ายที่มีภาษีหัก ณ ที่จ่าย, ใบกำกับภาษีซื้อ, ใบรวมจ่าย,
--         รับใบลดหนี้, รับใบเพิ่มหนี้

BEGIN;

-- ── Tables ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.purchase_documents (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL,
  doc_type             text NOT NULL CHECK (doc_type IN (
                         'purchase_order','deposit_payment','goods_receipt',
                         'expense_record','wht_expense','purchase_tax_invoice',
                         'payment_summary','received_credit_note','received_debit_note'
                       )),
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
  ref_doc_id           uuid,
  created_by           uuid NOT NULL DEFAULT auth.uid(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT purchase_documents_org_fk     FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT purchase_documents_contact_fk FOREIGN KEY (contact_id)      REFERENCES public.contacts(id)     ON DELETE RESTRICT,
  UNIQUE (organization_id, doc_type, doc_number)
);

CREATE INDEX IF NOT EXISTS idx_purchase_documents_org_type ON public.purchase_documents (organization_id, doc_type);
CREATE INDEX IF NOT EXISTS idx_purchase_documents_org_date ON public.purchase_documents (organization_id, issue_date DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_documents_contact  ON public.purchase_documents (contact_id);

CREATE TABLE IF NOT EXISTS public.purchase_document_items (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL,
  purchase_document_id uuid NOT NULL,
  line_no              int NOT NULL,
  product_name         text NOT NULL,
  inventory_item_id    uuid,
  quantity             numeric(18,4) NOT NULL DEFAULT 1,
  unit_price           numeric(18,2) NOT NULL DEFAULT 0,
  vat_type             text NOT NULL DEFAULT 'exclude' CHECK (vat_type IN ('include','exclude','none')),
  line_amount          numeric(18,2) NOT NULL DEFAULT 0,
  vat_amount           numeric(18,2) NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT purchase_document_items_doc_fk FOREIGN KEY (purchase_document_id) REFERENCES public.purchase_documents(id) ON DELETE CASCADE,
  CONSTRAINT purchase_document_items_org_fk FOREIGN KEY (organization_id)       REFERENCES public.organizations(id)   ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_purchase_document_items_doc ON public.purchase_document_items (purchase_document_id);
CREATE INDEX IF NOT EXISTS idx_purchase_document_items_org ON public.purchase_document_items (organization_id);

-- ── updated_at trigger ────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_purchase_documents_updated_at ON public.purchase_documents;
CREATE TRIGGER trg_purchase_documents_updated_at
  BEFORE UPDATE ON public.purchase_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.purchase_documents       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_document_items  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pdoc_select ON public.purchase_documents;
CREATE POLICY pdoc_select ON public.purchase_documents FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = purchase_documents.organization_id
      AND om.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS pdoc_insert ON public.purchase_documents;
CREATE POLICY pdoc_insert ON public.purchase_documents FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = purchase_documents.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner','admin')
  ));

DROP POLICY IF EXISTS pdoc_update ON public.purchase_documents;
CREATE POLICY pdoc_update ON public.purchase_documents FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = purchase_documents.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner','admin')
  ));

DROP POLICY IF EXISTS pdoc_delete ON public.purchase_documents;
CREATE POLICY pdoc_delete ON public.purchase_documents FOR DELETE
  USING (
    status = 'draft'
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = purchase_documents.organization_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner','admin')
    )
  );

DROP POLICY IF EXISTS pdoc_items_select ON public.purchase_document_items;
CREATE POLICY pdoc_items_select ON public.purchase_document_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = purchase_document_items.organization_id
      AND om.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS pdoc_items_insert ON public.purchase_document_items;
CREATE POLICY pdoc_items_insert ON public.purchase_document_items FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = purchase_document_items.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner','admin')
  ));

DROP POLICY IF EXISTS pdoc_items_delete ON public.purchase_document_items;
CREATE POLICY pdoc_items_delete ON public.purchase_document_items FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = purchase_document_items.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner','admin')
  ));

REVOKE ALL ON public.purchase_documents      FROM anon;
REVOKE ALL ON public.purchase_document_items FROM anon;

-- ── create_purchase_document RPC ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_purchase_document(
  p_organization_id  uuid,
  p_doc_type         text,
  p_contact_id       uuid,
  p_issue_date       date,
  p_due_date         date,
  p_status           text,
  p_withholding_tax  numeric,
  p_notes            text,
  p_items            jsonb,
  p_ref_doc_id       uuid DEFAULT NULL
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
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT role INTO v_role
  FROM public.organization_members
  WHERE organization_id = p_organization_id AND user_id = v_uid;

  IF v_role IS NULL THEN RAISE EXCEPTION 'not_member'; END IF;
  IF v_role NOT IN ('owner','admin') THEN RAISE EXCEPTION 'permission_denied'; END IF;

  IF p_doc_type NOT IN (
    'purchase_order','deposit_payment','goods_receipt',
    'expense_record','wht_expense','purchase_tax_invoice',
    'payment_summary','received_credit_note','received_debit_note'
  ) THEN
    RAISE EXCEPTION 'invalid_doc_type:%', p_doc_type;
  END IF;

  IF p_doc_type = 'purchase_order' THEN
    IF p_status NOT IN ('draft','issued','approved','received','cancelled','voided') THEN
      RAISE EXCEPTION 'invalid_status:%', p_status;
    END IF;
  ELSE
    IF p_status NOT IN ('draft','issued','voided') THEN
      RAISE EXCEPTION 'invalid_status:%', p_status;
    END IF;
  END IF;

  v_prefix := CASE p_doc_type
    WHEN 'purchase_order'        THEN 'PO'
    WHEN 'deposit_payment'       THEN 'DEPAY'
    WHEN 'goods_receipt'         THEN 'GR'
    WHEN 'expense_record'        THEN 'EXP'
    WHEN 'wht_expense'           THEN 'WHTEXP'
    WHEN 'purchase_tax_invoice'  THEN 'PTINV'
    WHEN 'payment_summary'       THEN 'PAYSUM'
    WHEN 'received_credit_note'  THEN 'RCN'
    WHEN 'received_debit_note'   THEN 'RDN'
    ELSE 'PDOC'
  END;

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

  INSERT INTO public.purchase_documents (
    organization_id, doc_type, contact_id, doc_number,
    issue_date, due_date, status,
    sub_total, vat_amount, total_amount, withholding_tax,
    notes, ref_doc_id, created_by
  ) VALUES (
    p_organization_id, p_doc_type, p_contact_id, v_doc_number,
    p_issue_date, p_due_date, p_status,
    v_sub, v_vat, v_total, p_withholding_tax,
    p_notes, p_ref_doc_id, v_uid
  ) RETURNING id INTO v_doc_id;

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

    INSERT INTO public.purchase_document_items (
      organization_id, purchase_document_id, line_no,
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

GRANT EXECUTE ON FUNCTION public.create_purchase_document TO authenticated;

-- ── status update helper ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_purchase_document_status(
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
  WHERE organization_id = p_organization_id AND user_id = v_uid;

  IF v_role NOT IN ('owner','admin') THEN RAISE EXCEPTION 'permission_denied'; END IF;

  UPDATE public.purchase_documents
  SET status = p_status, updated_at = now()
  WHERE id = p_doc_id AND organization_id = p_organization_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_purchase_document_status TO authenticated;

COMMIT;
