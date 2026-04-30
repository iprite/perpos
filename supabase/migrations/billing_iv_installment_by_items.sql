BEGIN;

ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS payment_mode TEXT NOT NULL DEFAULT 'installment';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'invoices_payment_mode_chk'
  ) THEN
    ALTER TABLE public.invoices
    ADD CONSTRAINT invoices_payment_mode_chk
    CHECK (payment_mode IN ('full','installment'));
  END IF;
END $$;

ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS source_quote_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'invoices_source_quote_id_fkey'
  ) THEN
    ALTER TABLE public.invoices
    ADD CONSTRAINT invoices_source_quote_id_fkey
    FOREIGN KEY (source_quote_id)
    REFERENCES public.sales_quotes(id)
    ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_invoices_source_quote_id ON public.invoices(source_quote_id);
CREATE INDEX IF NOT EXISTS idx_invoices_payment_mode ON public.invoices(payment_mode);

ALTER TABLE public.invoice_items
ADD COLUMN IF NOT EXISTS source_quote_item_id UUID,
ADD COLUMN IF NOT EXISTS source_order_item_id UUID,
ADD COLUMN IF NOT EXISTS full_unit_price NUMERIC(12,2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'invoice_items_source_quote_item_id_fkey'
  ) THEN
    ALTER TABLE public.invoice_items
    ADD CONSTRAINT invoice_items_source_quote_item_id_fkey
    FOREIGN KEY (source_quote_item_id)
    REFERENCES public.sales_quote_items(id)
    ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'invoice_items_source_order_item_id_fkey'
  ) THEN
    ALTER TABLE public.invoice_items
    ADD CONSTRAINT invoice_items_source_order_item_id_fkey
    FOREIGN KEY (source_order_item_id)
    REFERENCES public.order_items(id)
    ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_invoice_items_source_quote_item_id ON public.invoice_items(source_quote_item_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_source_order_item_id ON public.invoice_items(source_order_item_id);

UPDATE public.invoices i
SET source_quote_id = o.source_quote_id
FROM public.orders o
WHERE o.id = i.order_id
  AND i.source_quote_id IS NULL
  AND o.source_quote_id IS NOT NULL;

NOTIFY pgrst, 'reload config';

COMMIT;

