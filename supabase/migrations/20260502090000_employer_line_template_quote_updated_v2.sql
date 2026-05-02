BEGIN;

UPDATE public.employer_line_templates
SET template_text = 'ใบเสนอราคา {quoteNo}\nสถานะ: {status}\n{amount}',
    updated_at = NOW()
WHERE event_key = 'quote_updated';

NOTIFY pgrst, 'reload schema';

COMMIT;

