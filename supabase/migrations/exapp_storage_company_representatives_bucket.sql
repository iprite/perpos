BEGIN;

INSERT INTO storage.buckets (id, name, public)
VALUES ('company-representatives', 'company-representatives', true)
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload config';

COMMIT;
