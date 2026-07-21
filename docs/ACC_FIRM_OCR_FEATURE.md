# ACC_FIRM OCR — ถอดบิล → บันทึกบัญชี + Self-improvement Loop

คัมภีร์ฟีเจอร์ OCR ของโมดูล `acc_firm` (สำนักงานบัญชี เช่น **jtacc**) — อ่านเอกสาร (ใบกำกับภาษี/ใบเสร็จ/บิล)
ด้วย Gemini แล้วสร้าง **ร่างสมุดรายวัน** ให้นักบัญชีตรวจ + **เรียนรู้จากการอนุมัติของคน** เพื่อให้แม่นขึ้นเรื่อย ๆ

> **โหมดการทำงาน: human-in-the-loop เสมอ** — ระบบไม่เคย auto-post
> AI เดาให้แม่นที่สุด + เติมค่าล่วงหน้า แต่ **คนกดอนุมัติทุกใบ**

---

## Pipeline (end-to-end)

```
[UI acc-firm/ocr] อัปโหลดไฟล์
   → storage bucket `client_documents` path = `<client_org_id>/<file>`
   → POST /api/acc-firm/ocr/jobs           → แถวใน ocr_processing_jobs (pending)
   → POST /api/acc-firm/ocr/jobs/process   → claim (pending|failed → processing) + ยิง Cloud Run
   → [ocr-worker] POST /process (x-worker-secret)
        1. download จาก storage (ตรวจ path ขึ้นต้นด้วย client_org_id — กัน cross-tenant)
        2. Gemini #1 OCR extract      → extracted_json (แปลง พ.ศ.→ค.ศ., แยก VAT/WHT)
        3. Gemini #2 classify         → รับ learned_mappings เข้าไปด้วย ★ loop
        4. reconcileWithLearnedMemory → ติดธง matched_from_memory / เตือนถ้าเดาต่างจากที่จำ
        5. Gemini #3 journal entry    → ตรวจ Dr=Cr, งวดปิดแล้วห้ามลง
        6. เขียน acc_journal_entries/acc_journal_lines (status=draft, source='ai')
   → [UI] นักบัญชีตรวจ/แก้ → POST /api/acc-firm/ocr/jobs/approve
        → โพสต์บัญชี + **สอนระบบ**: upsert ocr_vendor_mappings + insert ocr_feedback_logs ★ loop
```

## Self-improvement loop — ทำงานอย่างไร

| ขั้น            | เกิดอะไร                                                                                                                                                                                                                         | ที่ไหน                                                                                                                                   |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **สอน (write)** | ตอน approve → เก็บ "ผู้ขาย → บัญชีเดบิตหลัก" (บรรทัด debit ยอดสูงสุด) ลง `ocr_vendor_mappings` (upsert ด้วย `vendor_tax_id` ก่อน แล้วค่อย `vendor_name`, `use_count++`) + เก็บ diff AI-vs-คนลง `ocr_feedback_logs` (`is_edited`) | [approve/route.ts](../apps/perpos/src/app/api/acc-firm/ocr/jobs/approve/route.ts)                                                        |
| **จำ (read)**   | `getClientContext()` โหลด mapping ล่าสุด 50 รายการ (join `acc_accounts` เอา code/name) เรียงตาม `use_count` → ใส่เป็น `learned_mappings` ใน ClientContext                                                                        | [ocr.service.ts](../services/ocr-worker/src/ocr/ocr.service.ts) `getLearnedMappings`                                                     |
| **ใช้ (apply)** | `PROMPT_CLASSIFY` ข้อ 6 สั่งให้ **จับคู่ vendor ด้วย tax_id ก่อน แล้วค่อยชื่อ — เจอแล้วต้องใช้ account_code นั้นเป็นบัญชีเดบิตหลัก** (ยังต้องผ่านกฎ VAT/WHT/AP-vs-cash + ต้องอยู่ในผังบัญชี)                                     | `PROMPT_CLASSIFY`                                                                                                                        |
| **กันพลาด**     | `reconcileWithLearnedMemory()` — ถ้า AI เลือกบัญชีต่างจากที่เคยจำ → บังคับ `needs_review=true` + เหตุผลภาษาไทย ให้คนสังเกตก่อนกด                                                                                                 | `ocr.service.ts`                                                                                                                         |
| **แสดงผล**      | หน้า OCR: ป้าย `🧠 จำได้` บนแถวงาน + กล่องในหน้าตรวจ ("จัดประเภทจากผู้ขายที่ระบบเคยจำได้" / "ระบบจดจำผู้ขายของลูกค้ารายนี้แล้ว N ราย")                                                                                           | [ocr/page.tsx](<../apps/perpos/src/app/(hydrogen)/[orgSlug]/acc-firm/ocr/page.tsx>) + `client-context/route.ts` (`learned_vendor_count`) |
| **จัดการ**      | หน้า **ความจำของระบบ** — ดู/แก้/ลบ mapping ที่จำผิด + การ์ดสถิติความแม่นยำ (AI ถูกเลย % / ต้องแก้) + เทรนด์รายเดือน                                                                                                              | [ocr/memory/page.tsx](<../apps/perpos/src/app/(hydrogen)/[orgSlug]/acc-firm/ocr/memory/page.tsx>)                                        |

### หน้าจัดการความจำ — `/{orgSlug}/acc-firm/ocr/memory`

เข้าจากปุ่ม **"ความจำของระบบ"** บนหน้าคิวงาน OCR · แก้ปัญหา "จำผิดแล้วแก้ไม่ได้"
(เดิมต้องรอบิลใบถัดไปจากผู้ขายรายนั้นแล้ว approve ทับเท่านั้น)

- **การ์ดสถิติ** — ผู้ขายที่จำได้ · **AI ถูกเลย %** (`total-edited)/total` จาก `ocr_feedback_logs`) · รับได้เลย · ต้องแก้
- **เทรนด์รายเดือน** — ย้อนหลัง 6 เดือน ดูว่า loop ทำให้ดีขึ้นจริงไหม (ซ่อนถ้ายังไม่มีข้อมูล)
- **ตารางผู้ขาย → บัญชี** คลิกแถว → dialog แก้บัญชี / ลบความจำ (ลบ = ผู้ขายรายนั้นถูกวิเคราะห์ใหม่ตั้งแต่ต้น)
- **API** [`/api/acc-firm/ocr/mappings`](../apps/perpos/src/app/api/acc-firm/ocr/mappings/route.ts) `GET`(list+stats) / `PATCH`(แก้บัญชี) / `DELETE`
  · fetch logic แยกที่ [lib/acc-firm/ocr-memory.ts](../apps/perpos/src/lib/acc-firm/ocr-memory.ts)
  · guard: `requireModuleMember(acc_firm)` + viewer แก้ไม่ได้ + **IDOR** — mapping ต้องอยู่ใน client org ที่เป็น
  engagement `active` ของสำนักงานนี้ และบัญชีใหม่ต้องอยู่ในผังบัญชีของ client org เดียวกัน (กันชี้ข้ามองค์กร)

**ผลทดสอบจริง (jtacc / ทดสอบ-บริษัท A, 2026-07-21):**
ใบที่ 1 ผู้ขาย "บริษัท ไทยออฟฟิศ ซัพพลาย จำกัด" → AI เลือก `5500` (`matched_from_memory=false`) ·
สอนให้เป็น `5900` · ใบที่ 2 ผู้ขายเดิม → AI เลือก **`5900`** เอง (`matched_from_memory=true`) และบัญชีสมดุลถูกต้อง
(Dr 5900 5,000 / Dr 1150 ภาษีซื้อ 350 / Cr 1020 เงินฝากธนาคาร 5,350) ⇒ loop ปิดครบ

---

## ตาราง / Storage

| ชื่อ                                        | หน้าที่                                                                                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ocr_processing_jobs`                       | งาน OCR (firm_org_id, client_org_id, document_url, status, extracted_json, classified_json, draft_journal_id, triggered_by)                             |
| `ocr_vendor_mappings`                       | **ความจำของ loop** — org_id, vendor_name/vendor_tax_id, `debit_account_id → acc_accounts`, use_count, last_used_at (unique ต่อ org+name และ org+tax_id) |
| `ocr_feedback_logs`                         | diff "AI เสนอ vs คนอนุมัติ" (original/approved classified+journal, is_edited) — ฐานสำหรับปรับปรุงระยะยาว                                                |
| `acc_journal_entries` / `acc_journal_lines` | ปลายทางบัญชีจริง (`source='ai'`, `source_ref_id=job.id`)                                                                                                |
| bucket `client_documents`                   | ไฟล์เอกสารต้นฉบับ (private) path = `<client_org_id>/<file>` · RLS ผูกกับ `acc_firm_clients` + `module_members`                                          |

---

## กับดักที่แก้แล้ว (อย่าให้เกิดซ้ำ)

1. **bucket `client_documents` ไม่เคยถูกสร้าง** → อัปโหลดพังทุกครั้ง ("Bucket not found") ⇒ ฟีเจอร์ไม่เคยรันได้เลย
   (migration `20260721110000`). ถ้าย้าย environment ใหม่ **ต้องสร้าง bucket + policy ด้วย**
2. **`WORKER_SECRET` ใน Secret Manager มี trailing newline** แต่ `ocr-worker` เทียบแบบไม่ `.trim()` →
   ตอบ **401 ทุก request** (header ใส่ newline ไม่ได้) ⇒ pipeline ตายสนิท. แก้โดย `.trim()` ทั้งสองฝั่งใน
   [main.ts](../services/ocr-worker/src/main.ts) เหมือน stt-worker — **worker ใหม่ทุกตัวต้องทำแบบนี้**
3. **schema drift ของ loop**: `ocr_vendor_mappings.debit_account_id` เคยชี้ `accounts(id)` (legacy) ทั้งที่
   approve route เขียน `acc_accounts.id` → FK violation ถูก `try/catch` กลืนเงียบ ⇒ ระบบ "ไม่เคยจำอะไรได้"
   (migration `20260721100000` repoint → `acc_accounts` / `acc_contacts`)
4. **loop เปิดค้าง**: prompt อ้าง "Historical Mappings" แต่ `getClientContext` ไม่เคยส่งให้ →
   การแก้ของนักบัญชีไม่เคยย้อนกลับมาช่วย. ปิดด้วย `getLearnedMappings()` + `PROMPT_CLASSIFY` ข้อ 6
5. มี `getClientContext` **สองตัว** — ของ worker ([ocr.service.ts](../services/ocr-worker/src/ocr/ocr.service.ts), ตัวที่ใช้จำแนกจริง)
   กับของแอป ([lib/ai/gemini.ts](../apps/perpos/src/lib/ai/gemini.ts), ใช้ป้อน UI เท่านั้น) — **แก้ loop ต้องแก้ฝั่ง worker**

## Deploy

```bash
cd services/ocr-worker
gcloud run deploy perpos-ocr-worker --source . --region asia-southeast1 --project perpos \
  --memory 1Gi --cpu 1 --min-instances 0 --max-instances 5 --timeout 540 --concurrency 10 \
  --allow-unauthenticated \
  --set-secrets "WORKER_SECRET=WORKER_SECRET:latest,GEMINI_API_KEY=GEMINI_API_KEY:latest,SUPABASE_URL=SUPABASE_URL:latest,SUPABASE_SERVICE_ROLE_KEY=SUPABASE_SERVICE_ROLE_KEY:latest,SENTRY_DSN=SENTRY_DSN:latest"
```

ฝั่ง Vercel ต้องมี `OCR_WORKER_URL` + `WORKER_SECRET` · โมเดล = `gemini-2.5-flash` (ต้องเป็น **paid tier**)

## งานต่อยอด (ยังไม่ทำ)

- ป้อน `ocr_feedback_logs` (ตัวอย่างที่คนแก้) เข้า prompt เป็น few-shot / embedding — ตอนนี้ใช้ vendor mapping ตรงตัวอย่างเดียว
- เรียนรู้ระดับ "รายการสินค้า → บัญชี" (ตอนนี้จำที่ระดับผู้ขายเท่านั้น)
- ตั้ง `acc_firm_client_configs` ต่อลูกค้า (ตอนนี้ยังไม่มีแถว → ใช้ default: vat_registered=true, wht=true, accrual)
