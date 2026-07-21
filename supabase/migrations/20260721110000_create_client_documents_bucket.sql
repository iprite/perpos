-- Migration: 20260721110000_create_client_documents_bucket.sql
-- Provision the `client_documents` storage bucket used by the acc_firm OCR pipeline.
--
-- The whole OCR feature already references this bucket:
--   - upload UI      : supabase.storage.from('client_documents').upload(`${clientOrgId}/...`)
--   - review UI      : .createSignedUrl(path)
--   - ocr-worker     : admin.storage.from('client_documents').download(path)
-- ...but the bucket was never created, so every upload failed with "Bucket not found"
-- and the feature could never run. Private bucket + RLS scoped by the first path
-- segment, which is always the client org id (the worker also asserts this).

INSERT INTO storage.buckets (id, name, public)
VALUES ('client_documents', 'client_documents', false)
ON CONFLICT (id) DO NOTHING;

-- Read: any active acc_firm module member of a firm that owns this client folder.
DROP POLICY IF EXISTS client_documents_read ON storage.objects;
CREATE POLICY client_documents_read ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'client_documents'
    AND EXISTS (
      SELECT 1
      FROM public.acc_firm_clients c
      JOIN public.module_members mm ON mm.org_id = c.firm_org_id
      WHERE c.client_org_id::text = (storage.foldername(name))[1]
        AND c.status = 'active'
        AND mm.module_key = 'acc_firm'
        AND mm.user_id = auth.uid()
        AND mm.is_active = true
    )
  );

-- Write (upload/update/delete): same, but viewers are excluded.
DROP POLICY IF EXISTS client_documents_write ON storage.objects;
CREATE POLICY client_documents_write ON storage.objects
  FOR ALL
  TO authenticated
  USING (
    bucket_id = 'client_documents'
    AND EXISTS (
      SELECT 1
      FROM public.acc_firm_clients c
      JOIN public.module_members mm ON mm.org_id = c.firm_org_id
      WHERE c.client_org_id::text = (storage.foldername(name))[1]
        AND c.status = 'active'
        AND mm.module_key = 'acc_firm'
        AND mm.user_id = auth.uid()
        AND mm.is_active = true
        AND mm.module_role <> 'viewer'
    )
  )
  WITH CHECK (
    bucket_id = 'client_documents'
    AND EXISTS (
      SELECT 1
      FROM public.acc_firm_clients c
      JOIN public.module_members mm ON mm.org_id = c.firm_org_id
      WHERE c.client_org_id::text = (storage.foldername(name))[1]
        AND c.status = 'active'
        AND mm.module_key = 'acc_firm'
        AND mm.user_id = auth.uid()
        AND mm.is_active = true
        AND mm.module_role <> 'viewer'
    )
  );
