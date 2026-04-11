# ขั้นตอนเชื่อมต่อ/ติดตั้ง: Supabase Storage สำหรับเอกสาร

## 1) สร้าง Buckets (แนะนำ private)
แนะนำแยก bucket ตามกลุ่มข้อมูล:
- `documents` (order/customer/worker)
- `order-slips` (slip ชำระเงิน)
- `order-refunds` (slip คืนเงิน/ยกเลิก)

ตั้งค่าเป็น private แล้วใช้ signed URL ผ่าน API (ปลอดภัยกว่า public URL)

## 2) Storage Policies (RLS บน storage.objects)
กำหนด policy ให้:
- role ภายใน (admin/sale/operation) สามารถอ่าน/เขียนได้
- employer/representative อ่านได้เฉพาะ object ที่เกี่ยวข้องกับลูกค้าตัวเอง (ถ้าต้องการเปิดให้เห็น)

หมายเหตุ: ในรอบนี้ระบบใช้ API ฝั่ง server + service role ในการอัปโหลดและออก signed URL โดยตรวจสิทธิ์จากตารางเอกสารก่อน

## 3) Environment Variables
ฝั่ง server ต้องมี:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
ฝั่ง client ต้องมี:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## 4) API ที่ใช้
- `POST /api/storage/upload` (multipart): อัปโหลดไฟล์ลง Supabase Storage + insert record ลงตารางเอกสาร
- `POST /api/storage/signed-url` (json): ขอ signed URL เพื่อเปิดดู/ดาวน์โหลด โดยตรวจสิทธิ์ผ่าน RLS ก่อน

## 5) การทดสอบ
- เปิด `/orders` → รายละเอียด → แท็บ “รายการเอกสาร”
- เพิ่มเอกสาร → ดู popup → ดาวน์โหลด
- อัปโหลดสลิปชำระเงิน/ยกเลิก แล้วดูในแท็บเอกสาร

