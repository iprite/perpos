# PRD: จัดเก็บเอกสารด้วย Supabase Storage (ยกเลิก GCS)

## เป้าหมาย
- ยกเลิกการจัดเก็บเอกสารบน GCS/Google Drive สำหรับ flow ใหม่
- ให้เอกสารทั้งหมดถูกจัดเก็บบน **Supabase Storage**
- UI เปิดดู/ดาวน์โหลดเอกสารในระบบได้ (เปิดเป็น popup ไม่เปิดแท็บใหม่)

## ขอบเขตเอกสาร
**ต้องอยู่บน Supabase Storage**
- เอกสารออเดอร์: `order_documents`
- เอกสารนายจ้าง: `customer_documents`
- เอกสารแรงงาน: `worker_documents`
- Slip ชำระเงิน: `order_payments`
- Slip คืนเงิน/เอกสารยกเลิก: `order_refunds`

**หมายเหตุ (Backward compatible)**
- เอกสารเดิมที่เป็นลิงก์ Google Drive ยังสามารถ “แสดงผล/เปิดดู” ได้ (ถ้ามีอยู่ใน DB)
- แต่ flow เพิ่มเอกสารใหม่จะเป็น Supabase Storage เท่านั้น

## ข้อกำหนดหลัก
### 1) อัปโหลดเอกสาร
- ผู้ใช้ภายใน (admin/sale/operation) อัปโหลดไฟล์ (image/pdf)
- ระบุ `doc_type` และ optional `expiry_date` (สำหรับเอกสารนายจ้าง/แรงงาน)
- ไฟล์ต้องถูกอัปโหลดเข้า bucket ของ Supabase Storage และ DB ต้องเก็บ metadata ของไฟล์

### 2) โครงสร้าง path (prefix)
- ทุกไฟล์ต้องมี prefix ตามนายจ้าง (customer)
- ตัวอย่าง path:
  - `customers/{customerId}/orders/{orderId}/documents/{timestamp}-{docType}-{filename}`
  - `customers/{customerId}/workers/{workerId}/documents/{timestamp}-{docType}-{filename}`
  - `customers/{customerId}/payments/{orderId}/installment-{n}-{timestamp}-{filename}`
  - `customers/{customerId}/refunds/{orderId}/{timestamp}-{filename}`

### 3) การเปิดดู/ดาวน์โหลด (แนะนำ Signed URL)
- UI กด “ดู” เปิด popup viewer ในหน้าเดียว
- UI กด “ดาวน์โหลด” ให้ดาวน์โหลดไฟล์
- แนะนำ bucket เป็น private และสร้าง **signed URL** แบบอายุสั้นเมื่อกดดู/ดาวน์โหลด

## UI/UX
### หน้าออเดอร์ → รายละเอียด → แท็บ “รายการเอกสาร”
- Slip ชำระเงิน: แสดงรายการ + ปุ่ม “ดู slip” (popup)
- Slip คืนเงิน/ยกเลิก: แสดงรายการ + ปุ่ม “ดู slip” (popup)
- เอกสารอื่นๆ: แสดงรายการ + ปุ่ม “เพิ่มเอกสาร” (อัปโหลดไฟล์)

## ข้อมูลใน DB
### ตารางเอกสาร (customer_documents/worker_documents/order_documents)
- เก็บ metadata สำหรับ Supabase Storage:
  - `storage_provider` = `supabase`
  - `storage_bucket`, `storage_path`
  - `file_name`, `mime_type`, `size_bytes`
- คงคอลัมน์ Drive ไว้เพื่อรองรับข้อมูลเก่า (ถ้ามี)

### ตาราง slip (order_payments/order_refunds)
- เก็บ metadata สำหรับไฟล์ slip บน storage:
  - `slip_storage_provider` = `supabase`
  - `slip_storage_bucket`, `slip_storage_path`
  - `slip_file_name`, `slip_mime_type`, `slip_size_bytes`

## Success Criteria
- เพิ่มเอกสาร/สลิปใหม่แล้วเก็บลง Supabase Storage ได้
- ดู/ดาวน์โหลดจาก UI ได้ผ่าน popup
- การเข้าถึงเอกสารถูกจำกัดตามสิทธิ์ในระบบ (RLS/role)

