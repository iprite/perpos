-- นับยอดเปิดลิงก์เอกสารแบบ atomic — เดิมหน้า public เขียน view_count = <ค่าที่ caller ส่ง> + 1
-- โดย caller ส่ง 0 เสมอ → ยอดค้างที่ 1 ตลอด และถ้าเปิดพร้อมกันหลายคนก็ทับกันอยู่ดี
CREATE OR REPLACE FUNCTION public.bump_document_share_view(p_token text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.acc_document_shares
     SET view_count = view_count + 1,
         last_viewed_at = now()
   WHERE token = p_token
     AND revoked_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.bump_document_share_view(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bump_document_share_view(text) TO service_role;
