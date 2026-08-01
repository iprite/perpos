-- ── แก้การนับต้นทุน AI ซ้ำสองรอบ ──────────────────────────────────────────────
-- บั๊กที่เจอตอนรีวิว: ฟีเจอร์ที่ "มีตาราง log ของตัวเอง" และ "เรียก AI ผ่าน aiChat/aiEmbed"
-- จะถูกนับ 2 ครั้งต่อ 1 คำขอ — ครั้งหนึ่งจาก trigger บนตาราง log อีกครั้งจาก recordUsage
-- ที่ฝังใน lib/ai/client.ts
--
--   bi.ask            : trigger บน bi_query_log     + aiChat(intent) + aiChat(answer) + aiEmbed
--   acc_firm.*        : trigger บน acc_firm_ai_log  + aiChat(narrate)
--
-- เลือกให้ **ชั้นแอป (aiChat/aiEmbed) เป็นแหล่งจริง** แล้วถอด trigger สองตัวนี้ทิ้ง เพราะ
--   · แม่นกว่า — บันทึกทุกครั้งที่เรียกโมเดล แยกตามโมเดลจริง (flash/pro/embedding คนละราคา)
--   · ครบกว่า — bi_query_log เก็บแค่ token_in/token_out ของ intent+answer
--     ส่วนค่า embedding (usage.embedTokens) ไม่เคยถูกเขียนลง token_in เลย → trigger นับขาด
--   · org ยังผูกถูก — route ห่อด้วย withUsageContext() แล้ว (lib/usage/context.ts)
--
-- ⚠️ trigger ของ assistant_jobs **ต้องอยู่ต่อ** — stt-worker บน Cloud Run เรียก Gemini เอง
--    ไม่ได้ผ่าน aiChat ฝั่งแอป ถ้าถอดออกจะไม่มีใครนับต้นทุน STT เลย
--
-- แถวเก่าที่ backfill มาจาก 2 ตารางนี้ยังอยู่ครบ (เป็นประวัติก่อนหน้า ไม่ซ้ำกับของใหม่
-- เพราะโค้ดที่ยิง recordUsage เพิ่งขึ้นพร้อมกัน)

BEGIN;

DROP TRIGGER IF EXISTS usage_event_bi_query ON public.bi_query_log;
DROP FUNCTION IF EXISTS public.usage_event_from_bi_query();

DROP TRIGGER IF EXISTS usage_event_acc_firm_ai ON public.acc_firm_ai_log;
DROP FUNCTION IF EXISTS public.usage_event_from_acc_firm_ai();

COMMIT;
