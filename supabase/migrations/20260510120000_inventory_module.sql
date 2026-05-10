-- หน่วยนับ
CREATE TABLE IF NOT EXISTS public.product_units (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code            text NOT NULL,
  name            text NOT NULL,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, code)
);
ALTER TABLE public.product_units ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_member_all" ON public.product_units;
CREATE POLICY "org_member_all" ON public.product_units FOR ALL TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()));

-- ใบเบิกสินค้า
CREATE TABLE IF NOT EXISTS public.stock_requisitions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  doc_number      text NOT NULL,
  doc_date        date NOT NULL,
  requester       text,
  department      text,
  notes           text,
  status          text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','issued','cancelled')),
  created_by      uuid NOT NULL DEFAULT auth.uid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.stock_requisitions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_member_all" ON public.stock_requisitions;
CREATE POLICY "org_member_all" ON public.stock_requisitions FOR ALL TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.stock_requisition_items (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id       uuid NOT NULL REFERENCES public.stock_requisitions(id) ON DELETE CASCADE,
  inventory_item_id    uuid REFERENCES public.inventory_items(id),
  product_name         text NOT NULL,
  qty                  numeric(18,6) NOT NULL DEFAULT 1,
  unit                 text NOT NULL DEFAULT 'EA',
  issued_qty           numeric(18,6) NOT NULL DEFAULT 0,
  notes                text,
  sort_order           int NOT NULL DEFAULT 0
);

-- ใบส่งคืนเบิกสินค้า
CREATE TABLE IF NOT EXISTS public.stock_returns (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requisition_id  uuid REFERENCES public.stock_requisitions(id),
  doc_number      text NOT NULL,
  doc_date        date NOT NULL,
  notes           text,
  status          text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','completed','cancelled')),
  created_by      uuid NOT NULL DEFAULT auth.uid(),
  created_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.stock_returns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_member_all" ON public.stock_returns;
CREATE POLICY "org_member_all" ON public.stock_returns FOR ALL TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.stock_return_items (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id            uuid NOT NULL REFERENCES public.stock_returns(id) ON DELETE CASCADE,
  inventory_item_id    uuid REFERENCES public.inventory_items(id),
  product_name         text NOT NULL,
  qty                  numeric(18,6) NOT NULL DEFAULT 1,
  unit                 text NOT NULL DEFAULT 'EA',
  sort_order           int NOT NULL DEFAULT 0
);
