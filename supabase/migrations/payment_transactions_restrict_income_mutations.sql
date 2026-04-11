BEGIN;

DROP POLICY IF EXISTS "payment_transactions_internal_write" ON public.payment_transactions;

CREATE POLICY "payment_transactions_internal_write" ON public.payment_transactions
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','sale','operation') AND txn_type = 'EXPENSE')
WITH CHECK (public.current_role() IN ('admin','sale','operation') AND txn_type = 'EXPENSE');

NOTIFY pgrst, 'reload config';

COMMIT;
