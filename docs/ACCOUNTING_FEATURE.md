# ACCOUNTING — โมดูลบัญชี/ภาษี (คัมภีร์)

โมดูล **shared** ระดับ org (`accounting`) — ออกเอกสารขาย, บันทึกใบกำกับซื้อ, ลงบัญชีอัตโนมัติ, ปิดงวด, ยื่นภาษี
เป้าหมายที่ตั้งไว้: สำนักงานบัญชี (jtacc) ย้ายลูกค้าจาก PEAK มาใช้ โดยลูกค้าออกเอกสารขายเอง

> ⚠️ **โมดูลนี้ผิดแล้วเสียเงินจริง/ผิดกฎหมายจริง** — ทุกกฎในไฟล์นี้อ้างประมวลรัษฎากร แก้โดยไม่เข้าใจกฎหมายไม่ได้
> unit test ที่กันของแพงพังอยู่ที่ [`accounting-rules.test.ts`](../apps/perpos/src/lib/accounting/accounting-rules.test.ts) — แก้ logic แล้วต้องรันผ่าน

---

## 1. หลักคิดที่ห้ามพัง (invariants)

| กฎ                                | ทำไม                                                                                                     | อยู่ที่ไหน                                                           |
| --------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **snapshot ตอนออกเอกสาร**         | เอกสารภาษีที่ออกไปแล้วห้ามเปลี่ยนย้อนหลัง — ที่อยู่/ชื่อ/เลขผู้เสียภาษีจึง **copy ลงแถว** ไม่ใช่ join สด | `seller_*` / `buyer_*` ใน `acc_documents` + `acc_purchase_documents` |
| **จุดรับรู้รายได้จุดเดียวต่อดีล** | ออกใบกำกับ + ใบเสร็จของดีลเดียวกัน ถ้าลงบัญชีทั้งคู่ = รายได้/VAT เบิ้ล                                  | `shouldPostSalesJournal()` + unique index ต่อ `source_ref_id`        |
| **ฉบับร่างไม่ใช่หลักฐานภาษี**     | draft ไม่เข้า ภ.พ.30 และไม่เข้า KPI — แต่เอกสารภาษี default = `sent` (กันลืมยื่น)                        | `recompute` ของ tax-filings + `selectBillingDocuments()`             |
| **เลขที่เอกสารห้ามซ้ำ/ห้ามข้าม**  | เลขใบกำกับซ้ำ = ความผิดตาม ม.86/4                                                                        | RPC `next_acc_doc_number()` (atomic) + `acc_doc_sequences`           |
| **เอกสารที่ออกแล้วลบไม่ได้**      | พ.ร.บ.การบัญชี ม.14 เก็บ 5 ปี                                                                            | DELETE = hard delete เฉพาะ draft · นอกนั้น soft-delete / void        |

### กฎหมายที่ถูก encode ไว้ในโค้ด

- **ม.86/4** ฟิลด์บังคับบนใบกำกับภาษี → `isTaxDocument()` + snapshot fields + `book_number` (เล่มที่)
- **ม.86/9 / 86/10** ใบเพิ่มหนี้ / ใบลดหนี้ ต้องอ้างใบกำกับเดิม → `requiresRefDocument()` + `ref_document_id` (FK `ON DELETE RESTRICT`)
- **ม.86/6** ใบกำกับอย่างย่อ + ใบเสร็จธรรมดา → เครดิตภาษีซื้อไม่ได้ → `canClaimPurchaseVat()`
- **ม.82/3** ภาษีซื้อใช้ได้ภายใน 6 เดือน → `tax_year`/`tax_month` แยกจาก `issue_date` (เลื่อนงวดได้)
- **ม.82/5** ภาษีซื้อต้องห้าม → `is_vat_claimable=false` + `non_claimable_note`
- **ประกาศอธิบดีฯ ฉบับ 89** รูปแบบรายงานภาษีซื้อ → `purchase-tax-report.ts`

---

## 2. ชนิดเอกสารขาย (9 ชนิด) + จุดลงบัญชี

`quotation` · `billing_note` · `invoice` · `delivery_note` · `tax_invoice` · `receipt_tax_invoice` · `receipt` · `credit_note` · `debit_note`

**ใครลงบัญชี** (`shouldPostSalesJournal(docType, orgIsVatRegistered)`):

- org **จด VAT** → ลงเฉพาะ `tax_invoice` / `receipt_tax_invoice` / `credit_note` / `debit_note`
- org **ไม่จด VAT** → ลง `invoice` / `receipt` แทน (ออกใบกำกับไม่ได้)
- ที่เหลือ = เอกสารประกอบ ไม่ลงบัญชี

**สายแปลงเอกสาร** (`documents/[id]/convert`): `quotation → invoice → tax_invoice → receipt` · **ห้ามแปลง `tax_invoice → receipt_tax_invoice`** (จะกลายเป็นใบกำกับ 2 ใบต่อดีล = VAT เบิ้ล) · กันซ้ำอีกชั้นด้วย `converted_from_id` + unique index

**สถานะ `overdue`** ตั้งให้อัตโนมัติโดย scheduler (tier t60, วันละหลายรอบ): เอกสารที่มี `due_date` เลยวันนี้ + สถานะยัง `sent`/`accepted` → `overdue` · `paid`/`void`/`draft` ไม่แตะ (ตรงกับ state machine)

**KPI/ยอดขายหน้าเว็บ** ต้องใช้ `selectBillingDocuments()` + `billingSign()` จาก [`sales-journal.ts`](../apps/perpos/src/lib/accounting/sales-journal.ts) — กฎเดียวกับ auto journal (ตัด draft/void, ตัดสายที่แปลงต่อกันเหลือใบต้นทางใบเดียว, ใบลดหนี้ติดลบ) **ห้ามคำนวณ KPI เองจาก `doc_type` ตรง ๆ** ไม่งั้นการ์ดกับสมุดรายวันจะไม่ตรงกัน

---

## 3. ผังบัญชีที่ auto journal ใช้ (ผิดตัวเดียว = งบผิด)

| ขา      | ขาย (`sales-journal.ts`)                     | ซื้อ (`purchase-journal.ts`)                                         |
| ------- | -------------------------------------------- | -------------------------------------------------------------------- |
| **Dr**  | 1100 ลูกหนี้ / 1010 เงินสด · 1160 WHT ถูกหัก | 5xxx ค่าใช้จ่ายตามบรรทัด · 1150 ภาษีซื้อ                             |
| **Cr**  | 4100 รายได้ · 4200 รายได้อื่น · 2150 ภาษีขาย | 2100 เจ้าหนี้                                                        |
| **WHT** | —                                            | 2212 (ภ.ง.ด.53 นิติบุคคล) / 2211 (ภ.ง.ด.3 บุคคล) เลือกจาก `wht_form` |

- ใบลดหนี้ = กลับข้าง (reverse) ของรายการเดิม
- **2220 = ประกันสังคมค้างจ่าย ห้ามใช้กับ WHT** (เคยพลาดมาแล้ว)
- ทุกการลงบัญชี **idempotent** — unique index `acc_journal_entries(org_id, source, source_ref_id)` แยกตาม `source` · เรียกซ้ำได้ ไม่เบิ้ล

---

## 4. เอกสารซื้อ (`acc_purchase_documents`)

บันทึก **ใบกำกับที่ได้รับจากผู้ขาย** → ลงบัญชีอัตโนมัติ + เป็นฐานภาษีซื้อของ ภ.พ.30 (เดิมกรอกมือทุกเดือน)

- `doc_number` = เลขบนบิล**ของผู้ขาย** ไม่ได้ generate เอง · unique `(org_id, contact_id, doc_number)`
- ยอดยึด**ตามหน้าบิล** (`computePurchaseLines` ใช้ `amount` ที่กรอก) — บิลจริงปัดเศษไม่ตรงสูตรเรา · server ตรวจแค่ `subtotal + vat = total`
- `tax_year`/`tax_month` แยกจาก `issue_date` → เลื่อนงวดได้ตาม ม.82/3
- ลบได้เฉพาะที่ยังไม่ลงบัญชี · ลงแล้วให้ `status='void'`
- **จาก OCR:** [`purchase-from-ocr.ts`](../apps/perpos/src/lib/accounting/purchase-from-ocr.ts) — idempotent ต่อ `ocr_job_id`, resolve ผู้ขายจาก tax_id → ชื่อ, **ผูก journal เดิมที่ ocr-worker สร้างไว้ ไม่สร้างใบใหม่**, บิลที่ไม่สมดุลปฏิเสธ

---

## 5. โครงสร้างไฟล์

| ชั้น        | ที่อยู่                                                                                                                                                                     |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| หน้าเว็บ    | `(hydrogen)/[orgSlug]/accounting/*` — documents · purchase-documents · journal · entries · accounts · contacts · products · assets · reports · tax · tax-closing · settings |
| API         | `api/accounting/*` (30 route) — guard = `requireAccountingMember` + `canWrite*` ใน [`_lib.ts`](../apps/perpos/src/app/api/accounting/_lib.ts)                               |
| business    | `lib/accounting/*.ts` — fetch logic + กฎบัญชี (แยกจาก route เพื่อ reuse กับ SSR)                                                                                            |
| เอกสารพิมพ์ | [`document-html.ts`](../apps/perpos/src/lib/accounting/document-html.ts) → HTML A4 → pdf-renderer (Cloud Run) · `bahtText()` = จำนวนเงินเป็นตัวอักษร (แหล่งเดียว ห้าม copy) |
| paging      | [`paging.ts`](../apps/perpos/src/lib/accounting/paging.ts) — PostgREST ตัดที่ 1,000 แถวเงียบ ๆ → ทุก list ต้องคืน `total` + `truncated` และ UI ต้องมีปุ่ม "โหลดเพิ่ม"       |

### สิทธิ์ (backstage vs frontstage)

- ฝั่ง **หลังบ้าน** (ลงบัญชี/ปิดงวด/ภาษี/เอกสารซื้อ) = `accountant` เท่านั้น — **super_admin bypass ได้** (`canWriteBackstage(auth)` รับ auth object ไม่ใช่ role string)
- ฝั่ง **หน้าร้าน** (เอกสารขาย/ลูกค้า/สินค้า) = owner/accountant/staff เขียน · viewer อ่าน
- client-side ต้องสะท้อนกฎเดียวกันที่ [`role-context.tsx`](<../apps/perpos/src/app/(hydrogen)/[orgSlug]/accounting/_components/role-context.tsx>) ไม่งั้นปุ่มหายทั้งที่ API ยอม

---

## 6. ตาราง (migration)

| ตาราง                                       | หมายเหตุ                                                                                                         |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `acc_documents` / `acc_document_lines`      | เอกสารขาย 9 ชนิด + snapshot ม.86/4 + `book_number`/`vat_rate`/`ref_document_id`/`issued_at` · line มี `unit`     |
| `acc_purchase_documents` / `_lines`         | ใบกำกับซื้อ + `is_vat_claimable` + `wht_form` + `ocr_job_id`                                                     |
| `acc_doc_sequences`                         | เลขรันเอกสารต่อ (org, kind, ปี) · RLS deny-all · เข้าถึงผ่าน RPC `next_acc_doc_number()` (service_role) เท่านั้น |
| `acc_journal_entries` / `acc_journal_lines` | สมุดรายวัน · unique partial index กัน auto journal เบิ้ล                                                         |
| `acc_periods` · `acc_org_settings`          | งวดบัญชี (ปิด/เปิด) · ตั้งค่า org (จด VAT ไหม, `branch`, prefix เลขเอกสารทั้ง 9 ชนิด)                            |

migration ล่าสุด: `20260721120000` (branch) · `20260721130000` (doc types + ม.86/4) · `20260721140000` (purchase docs) · `20260721150000` (sequences + soft delete)

---

## 7. กับดักที่แก้แล้ว (อย่าทำซ้ำ)

- **PATCH เอกสารแล้ว `unit` หาย** — การ replace บรรทัดต้อง carry ทุกฟิลด์ ไม่ใช่เฉพาะที่ส่งมา
- **เปลี่ยน `contact_id` แล้ว snapshot ผู้ซื้อไม่ตาม** — ต้อง re-snapshot (และต้อง select `contact_id` เดิมมาเทียบ)
- **convert เป็น `receipt_tax_invoice`** → ใบกำกับ 2 ใบ/ดีล = VAT เบิ้ล (แก้เป็น `receipt`)
- **WHT ลง 2220** (ประกันสังคม) แทน 2212/2211
- **ภ.พ.30 นับ VAT ขายซ้ำ** — ต้องกรองเฉพาะเอกสารภาษี + หักใบลดหนี้ + ตัด draft (แต่ต้องเตือน `draft_notice` กันยื่นขาด)
- **`bahtText(21)` = "ยี่สิบหนึ่ง"** — กฎ "เอ็ด" ต้องดูหลักในกลุ่มล้าน ไม่ใช่แค่หลักหน่วย
- **KPI นับเฉพาะ `doc_type='invoice'`** — org ที่ออกใบกำกับเห็นยอด 0 (ใช้ `selectBillingDocuments()` แทน)
- **super_admin ติด 403 ทั้งหลังบ้าน** — guard เทียบ role string อย่างเดียว ไม่ดู `isSuperAdmin`
- **RLS คืนค่าว่างของ client org** — org ที่ยังไม่ provision (ไม่มีผังบัญชี/member) → ใช้ `/api/acc-firm/provision`
- **`PDF_RENDER_URL` ชี้ `exapp-pdf-renderer`** — ต้องเป็น `perpos-pdf-renderer` (คนละแอป)
