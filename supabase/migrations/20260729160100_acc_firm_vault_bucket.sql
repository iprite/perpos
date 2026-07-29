-- Storage bucket `acc_vault` — คลังเอกสารลูกค้าของสำนักงานบัญชี
-- spec §6 / D5: bucket ใหม่แยกจาก `client_documents` (ของเดิม policy ผูก prefix = client_org_id
-- ซึ่งใช้กับ vault ไม่ได้ เพราะลูกค้า vault ไม่จำเป็นต้องมี org ใน perpos)
--
-- path convention: {firm_org_id}/{client_id}/{fiscal_year}/{category_code}/{uuid}.{ext}
--   → foldername[1] = firm_org_id  ⇒ ใช้เป็นด่าน tenant isolation ระดับ storage
-- ห้ามใส่ชื่อลูกค้า/เลขบัตรใน path (PDPA)

INSERT INTO storage.buckets (id, name, public)
VALUES ('acc_vault', 'acc_vault', false)
ON CONFLICT (id) DO NOTHING;

-- safe cast: path segment แรกที่ไม่ใช่ uuid ต้อง "ไม่ผ่าน" ไม่ใช่ "ระเบิด"
-- (ถ้า cast ตรง ๆ ใน policy แล้วมีไฟล์ path เพี้ยน จะ raise 22P02 ทำให้ query ทั้งชุดพัง)
CREATE OR REPLACE FUNCTION public.acc_firm_member_path(p_segment text, p_writer boolean)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
BEGIN
  BEGIN
    v_id := p_segment::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;
  RETURN CASE WHEN p_writer THEN acc_firm_writer(v_id) ELSE acc_firm_member(v_id) END;
END;
$$;

-- อ่าน: active acc_firm module member ของ firm ที่เป็นเจ้าของโฟลเดอร์
-- (การดาวน์โหลดจริงออก signed URL ≤ 60 วิ ผ่าน API ที่เขียน access log — policy นี้เป็นชั้นสอง)
DROP POLICY IF EXISTS acc_vault_read ON storage.objects;
CREATE POLICY acc_vault_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'acc_vault'
    AND public.acc_firm_member_path((storage.foldername(name))[1], false)
  );

-- เขียน/ลบ: เหมือนกันแต่ตัด viewer ออก
DROP POLICY IF EXISTS acc_vault_write ON storage.objects;
CREATE POLICY acc_vault_write ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'acc_vault'
    AND public.acc_firm_member_path((storage.foldername(name))[1], true)
  )
  WITH CHECK (
    bucket_id = 'acc_vault'
    AND public.acc_firm_member_path((storage.foldername(name))[1], true)
  );
