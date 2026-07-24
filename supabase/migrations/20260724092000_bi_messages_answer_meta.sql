-- ===========================================================================
-- bi (Business Intelligence) — เก็บ "ส่วนประกอบคำตอบ" ลง bi_messages
-- ---------------------------------------------------------------------------
-- ปัญหา: คำตอบที่โหลดจากประวัติแชทแสดงไม่ครบ 5 ส่วนตาม contract §3.3 เพราะ
--        bi_messages เก็บแค่ content/metric_key/params/chart_spec/result_rows/
--        result_row_count — ไม่มี definition_line (§3.1 กฎข้อ 5 บังคับว่า
--        "ทุกคำตอบต้องแสดงบรรทัดนิยาม"), follow_ups, work, truncated
-- แก้:   เพิ่มคอลัมน์ answer_meta jsonb (ก้อนเดียว, ขยาย shape ได้ไม่ต้อง ALTER อีก)
--
-- ไฟล์นี้เป็น ALTER แยก — ไม่แก้ 20260724090000_bi_schema.sql / 20260724091000
-- idempotent ทั้งไฟล์ · ไม่แตะตารางอื่นนอกจาก bi_messages + index ของ bi_query_log
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1) answer_meta — ส่วนประกอบคำตอบที่ต้อง replay ได้จากประวัติ
-- ---------------------------------------------------------------------------
ALTER TABLE public.bi_messages
  ADD COLUMN IF NOT EXISTS answer_meta jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.bi_messages.answer_meta IS
'ส่วนประกอบคำตอบสำหรับ replay จากประวัติ (contract §3.3) — shape ที่ล็อกไว้:
{
  "definition_line": text,          -- บรรทัดนิยาม+ช่วงเวลา (§3.1 กฎข้อ 5 — ต้องมีทุกคำตอบ)
  "follow_ups": text[],             -- คำถามต่อยอด
  "work": {                         -- panel "ดูวิธีคำนวณ" (§3.3 ข้อ 5)
    "sql": text,                    --   SQL ที่รันจริง (ไม่ใช่ข้อมูลธุรกิจ → เก็บได้)
    "params": jsonb,                --   พารามิเตอร์ filter (ระดับเดียวกับคอลัมน์ params)
    "row_count": int,
    "elapsed_ms": int
  },
  "truncated": boolean,             -- ผลถูกตัดแถวหรือไม่
  "answer_status": text             -- answered|clarify|no_match|refused|error
}
role=''user'' ใช้ ''{}''::jsonb. ห้ามใส่ข้อมูลรายแถว (rows/result_rows/sample_rows)
ลงที่นี่ — trigger fn_bi_strip_sensitive_rows จะล้างทิ้งสำหรับ metric no_summarize.';

-- ---------------------------------------------------------------------------
-- 2) trigger กันข้อมูลอ่อนไหว — ขยายให้ครอบ answer_meta
-- ---------------------------------------------------------------------------
-- การประเมิน work.params สำหรับ metric no_summarize=true:
--   · work.sql = SQL ที่รันจริง (มี placeholder ไม่ใช่ค่าข้อมูล) → เก็บได้
--   · work.params = ค่า filter ที่ผู้ใช้ใส่ (ช่วงเวลา/รหัสลูกค้า/สาขา) = "เงื่อนไขการค้นหา"
--     ไม่ใช่ "ผลลัพธ์รายแถว" และเป็นข้อมูลชั้นเดียวกับคอลัมน์ bi_messages.params
--     ที่ schema เดิมตั้งใจเก็บไว้อยู่แล้ว (trigger เดิมล้างเฉพาะ result_rows)
--     → **ไม่ล้าง** จะทำให้ audit/"ดูวิธีคำนวณ" ใช้ไม่ได้ และไม่ได้ลดความเสี่ยงจริง
--       (คนที่เห็นแถวนี้ = เจ้าของ thread คนเดียวกับที่พิมพ์ filter นั้นเอง — RLS S1)
--   · ความเสี่ยงจริงคือ API เผลอยัด "แถวข้อมูล" ลง answer_meta (เช่น work.rows /
--     preview) แล้วเลี่ยงการล้าง result_rows ไปโดยไม่ตั้งใจ → ชั้น DB ล้าง key
--     กลุ่มแถวข้อมูลทิ้งเสมอสำหรับ metric no_summarize
--   · definition_line / follow_ups / truncated / answer_status / work.{sql,params,
--     row_count,elapsed_ms} **คงไว้เสมอ** (ล้างแล้วปัญหาเดิมกลับมา)
CREATE OR REPLACE FUNCTION public.fn_bi_strip_sensitive_rows()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sensitive boolean := false;
BEGIN
  IF NEW.metric_key IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM public.bi_metrics m
                    WHERE m.key = NEW.metric_key AND m.no_summarize)
      INTO v_sensitive;
  END IF;

  IF v_sensitive AND NEW.result_rows IS NOT NULL THEN
    NEW.result_rows := NULL;
  END IF;

  IF v_sensitive AND NEW.answer_meta IS NOT NULL
     AND jsonb_typeof(NEW.answer_meta) = 'object' THEN
    -- ล้างเฉพาะ key ที่พาแถวข้อมูลมา (ทั้งระดับบนและใน work) ที่เหลือคงไว้ครบ
    NEW.answer_meta := NEW.answer_meta - 'rows' - 'result_rows' - 'sample_rows' - 'preview_rows';
    IF jsonb_typeof(NEW.answer_meta -> 'work') = 'object' THEN
      NEW.answer_meta := jsonb_set(
        NEW.answer_meta, '{work}',
        (NEW.answer_meta -> 'work') - 'rows' - 'result_rows' - 'sample_rows' - 'preview_rows',
        false
      );
    END IF;
  END IF;

  RETURN NEW;
END; $$;

-- trigger เดิม (trg_bi_messages_strip_rows) ผูกกับฟังก์ชันนี้อยู่แล้ว —
-- สร้างซ้ำแบบ idempotent เผื่อกรณี schema เดิมยังไม่ถูก apply ตามลำดับ
DROP TRIGGER IF EXISTS trg_bi_messages_strip_rows ON public.bi_messages;
CREATE TRIGGER trg_bi_messages_strip_rows
  BEFORE INSERT OR UPDATE ON public.bi_messages
  FOR EACH ROW EXECUTE FUNCTION public.fn_bi_strip_sensitive_rows();

-- ---------------------------------------------------------------------------
-- 3) index ที่ api-designer เสนอ — bi_query_log(message_id)
--    (log โตเร็ว; หน้า detail/feedback ค้นจาก message_id)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS bi_query_log_message_idx
  ON public.bi_query_log (message_id)
  WHERE message_id IS NOT NULL;

-- หมายเหตุสิทธิ์: bi_messages / bi_query_log ถูก REVOKE ALL … FROM anon, authenticated
-- ตั้งแต่ 20260724090000 แล้ว → คอลัมน์/ดัชนีใหม่ไม่ต้อง GRANT เพิ่ม
