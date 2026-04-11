BEGIN;

INSERT INTO storage.buckets (id, name, public)
VALUES ('order-refunds', 'order-refunds', true)
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload config';

COMMIT;

