BEGIN;

INSERT INTO storage.buckets (id, name, public)
VALUES ('worker_profile_pics', 'worker_profile_pics', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "worker_profile_pics_public_read" ON storage.objects;
CREATE POLICY "worker_profile_pics_public_read" ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'worker_profile_pics');

DROP POLICY IF EXISTS "worker_profile_pics_authenticated_insert" ON storage.objects;
CREATE POLICY "worker_profile_pics_authenticated_insert" ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'worker_profile_pics'
  AND public.current_role() IN ('admin','sale','operation','representative')
);

DROP POLICY IF EXISTS "worker_profile_pics_authenticated_update" ON storage.objects;
CREATE POLICY "worker_profile_pics_authenticated_update" ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'worker_profile_pics'
  AND public.current_role() IN ('admin','sale','operation','representative')
)
WITH CHECK (
  bucket_id = 'worker_profile_pics'
  AND public.current_role() IN ('admin','sale','operation','representative')
);

DROP POLICY IF EXISTS "worker_profile_pics_authenticated_delete" ON storage.objects;
CREATE POLICY "worker_profile_pics_authenticated_delete" ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'worker_profile_pics'
  AND public.current_role() IN ('admin','sale','operation','representative')
);

NOTIFY pgrst, 'reload config';

COMMIT;
