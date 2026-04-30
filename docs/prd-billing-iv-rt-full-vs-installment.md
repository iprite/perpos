# PRD: ออกใบแจ้งหนี้ (IV) / ใบเสร็จรับเงิน (RT) แบบชำระเต็มจำนวน vs แบ่งชำระ

## 1) ภาพรวม
ต้องการให้ทีม Sale ออกเอกสารการเงินได้ 2 รูปแบบ

1) **ชำระเต็มจำนวน (Full Payment)**
- เมื่อเลือกแบบนี้ **IV และ RT ต้องเหมือน QT 100%** (รายการบริการ, จำนวน, ราคา/หน่วย, มูลค่า, ยอดรวม, ส่วนลด, VAT/WHT ฯลฯ)
- **เปลี่ยนแค่ “หัวเอกสาร”** (ชื่อเอกสาร/เลขเอกสาร/ช่องอ้างอิง/วันครบกำหนด ตามประเภทเอกสาร)

2) **แบ่งชำระ (Installment / Partial Billing)**
- Sale ต้องกำหนดได้ว่า **แต่ละ “รายการบริการ” จะวางบิลเท่าไร**
- ใบ IV **ต้องแยกรายการบริการเหมือน QT** (ไม่รวมเป็น “ค่าบริการงวดที่ X” ก้อนเดียว)
- ใน IV ต้องระบุ **จำนวนเงินต่อหน่วยที่ต้องชำระ** ของแต่ละรายการบริการในออเดอร์

> คำย่อ: QT = Quotation (ใบเสนอราคา), IV = Invoice (ใบแจ้งหนี้), RT = Receipt (ใบเสร็จรับเงิน)

## 2) เป้าหมาย (Goals)
- ลดเวลาการออกเอกสาร IV/RT ให้ตรงตามรูปแบบบริษัท
- รองรับทั้งการเก็บเงินครั้งเดียว และการเก็บเงินหลายงวดแบบ “กำหนดต่อบริการ”
- ทำให้ IV/RT สามารถตรวจสอบย้อนกลับได้ว่าอ้างอิง QT/Order อะไร และเก็บเงินไปแล้วเท่าไรในแต่ละบริการ

## 3) ขอบเขตที่ไม่ทำ (Out of Scope)
- การออกใบกำกับภาษีเต็มรูปแบบ (Tax Invoice) หากต่างจาก RT ในเชิงกฎหมาย/รูปแบบเอกสาร
- การจัดการเครดิตโน้ต/คืนเงิน
- การทำ payment gateway อัตโนมัติ

## 4) ผู้ใช้งานและสิทธิ์ (Roles)
- **Sale**: เลือกโหมดชำระ, กำหนดรายการ/ยอดต่อหน่วยในกรณีแบ่งชำระ, ออก IV
- **Operation/Admin**: ยืนยันชำระเงิน (แนบสลิป), ออก RT จาก IV ที่ชำระแล้ว
- **Admin**: ดู/แก้ไข/ยกเลิกเอกสารตามสิทธิ์เดิม

## 5) คำจำกัดความ (Definitions)
### 5.1 Full Payment (ชำระเต็ม)
- “เหมือน QT 100%” หมายถึง:
  - โครงรายการบริการเหมือน QT (ชื่อ/คำอธิบาย/จำนวน/ราคา/มูลค่า)
  - ยอดรวม/ส่วนลด/VAT/WHT/สุทธิ เหมือน QT
  - ลำดับรายการเหมือน QT
- ต่างได้เฉพาะส่วนหัวเอกสาร เช่น:
  - `doc_title`: ใบเสนอราคา → ใบแจ้งหนี้ / ใบเสร็จรับเงิน
  - `doc_no`: QT-… → IV-… / RT-…
  - ช่องวันที่ครบกำหนด (IV) / วันที่รับชำระ (RT)
  - ฟิลด์อ้างอิงเอกสาร (เช่น อ้างอิง QT/Order)

### 5.2 Installment / Partial Billing (แบ่งชำระ)
- หนึ่ง “งวด/รอบวางบิล” = 1 ใบ IV
- ใบ IV ในโหมดนี้ต้องแสดงรายการบริการเหมือน QT/Order แต่ **unit_price คือ “ยอดต่อหน่วยที่ต้องชำระในงวดนี้”**
- การแบ่งชำระต่อบริการต้องมีการตรวจสอบว่า **ยอดที่วางบิลสะสมต่อบริการ** ไม่เกินยอดเต็มของบริการนั้น

## 6) ปัญหาปัจจุบัน (Current Behavior)
ปัจจุบันระบบสามารถออก IV แบบ “งวด” โดยสร้าง `invoice_items` เป็นบรรทัดเดียว (เช่น “ค่าบริการ (งวดที่ 1)”) และใส่ยอดรวมเป็นก้อนเดียว ทำให้ไม่ตรง requirement “แยกรายการบริการเหมือน QT” ในกรณีแบ่งชำระ

## 7) ประสบการณ์ผู้ใช้ (User Stories)
### 7.1 Full Payment
1) ในหน้า Order/Manage Order, Sale กด “ออก IV” แล้วเลือก “ชำระเต็มจำนวน”
2) ระบบสร้าง IV โดยคัดลอกข้อมูลจาก QT (ถ้ามี) ให้เหมือน 100%
3) เมื่อยืนยันชำระเงินแล้ว ระบบออก RT ที่เหมือน IV (และเหมือน QT) 100%

### 7.2 แบ่งชำระ
1) Sale กด “ออก IV” แล้วเลือก “แบ่งชำระ”
2) ระบบแสดงตารางรายการบริการของออเดอร์ (เหมือน QT)
3) Sale กรอก “ยอดต่อหน่วยที่จะวางบิล” ของแต่ละรายการ (อาจเป็นบางรายการ หรือทุกรายการ)
4) ระบบคำนวณยอดรวมก่อน VAT/หลัง VAT/WHT และสร้าง IV ที่แยกรายการบริการ
5) ทำซ้ำได้หลายครั้งจนชำระครบ (ยอดสะสมต่อบริการไม่เกินยอดเต็ม)
6) RT ออกตาม IV ที่ชำระแล้ว (copy line items 1:1)

## 8) กติกาธุรกิจ (Business Rules)
### 8.1 แหล่งข้อมูลต้นทางของรายการ
- ถ้า `orders.source_quote_id` มีค่า: ใช้ `sales_quote_items` เป็น source หลักเพื่อให้ “เหมือน QT”
- ถ้าไม่มี QT: ใช้ `order_items` เป็น source

### 8.2 การออกเอกสาร (Document issuance)
- IV สามารถเป็น `draft` หรือ `issued` (ตามระบบเดิม) แต่ flow หลักคือออกเป็น `issued`
- RT ออกได้เมื่อ IV เป็น `paid_confirmed` เท่านั้น (ตามระบบเดิม)

### 8.3 Full Payment rules
- `invoice_items` ต้องเท่ากับรายการของ QT (หรือ order items ถ้าไม่มี QT)
- ยอดรวมของ IV/RT ต้องเท่ากับยอดรวมของ QT (รวมส่วนลด/VAT/WHT)
- ไม่อนุญาตให้ Sale ปรับราคา/จำนวนในโหมด Full (เพื่อคุม “เหมือน 100%”)

### 8.4 Installment rules (ต่อบริการ)
- แต่ละบริการ i มี “ยอดเต็ม” (Full Unit Price) = unit_price ต้นทาง (จาก QT item / order_item)
- แต่ละ IV รอบหนึ่ง ระบุ “ยอดต่อหน่วยที่จะวางบิล” (Billed Unit Price) สำหรับบริการ i
- เงื่อนไข:
  - `0 <= billed_unit_price_i <= remaining_unit_price_i`
  - `remaining_unit_price_i = full_unit_price_i - sum(billed_unit_price_i ของ IV ก่อนหน้า)`
  - ถ้า quantity > 1: คิดยอดเป็น `quantity * billed_unit_price_i`

> หมายเหตุ: ในเชิง UX อาจให้กรอกเป็น “ยอดรวมต่อบรรทัด” แล้วระบบแปลงเป็นต่อหน่วย แต่ข้อมูลที่ต้องเก็บตาม requirement คือ “จำนวนเงินต่อหน่วย”

### 8.5 VAT/WHT/ส่วนลด
- โหมด Full: ใช้ค่าจาก QT แบบ snapshot 100%
- โหมดแบ่งชำระ:
  - `subtotal` = ผลรวม `quantity * billed_unit_price` ของทุกบริการใน IV
  - `discount_total` ค่า default = 0 (จนกว่าจะมี requirement ส่วนลดรายงวด)
  - `vat_amount`/`wht_amount` คำนวณจาก subtotal ตาม setting ของ Order (include_vat/vat_rate/wht_rate) หรือกำหนดให้ยึดค่าจาก QT หากต้องการ strict เหมือนเอกสารต้นทาง

## 9) โครงข้อมูล (Data Model) ที่แนะนำ
> เป้าหมายคือทำให้: (1) Full = copy QT 100% (2) Installment = track ยอดสะสมต่อ service line ได้

### 9.1 เพิ่มฟิลด์ใน `invoices`
- `payment_mode` (text enum): `full` | `installment`
- `source_quote_id` (uuid, nullable): คัดลอกจาก `orders.source_quote_id` ตอนสร้าง (เพื่อ snapshot reference)

### 9.2 เพิ่มฟิลด์ใน `invoice_items`
- `source_quote_item_id` (uuid, nullable)
- `source_order_item_id` (uuid, nullable)
- `full_unit_price` (numeric, nullable): ราคาเต็มต่อหน่วยจากต้นทาง (ไว้ตรวจ remaining/ทำ report)

> หมายเหตุ: `unit_price` ใน `invoice_items` จะเป็น “ยอดต่อหน่วยที่วางบิลในเอกสารนี้” ตาม requirement

### 9.3 (ทางเลือก) ตารางสรุปการวางบิลต่อบริการ
ถ้าต้องการทำ report/validation ให้เร็ว แนะนำเพิ่ม materialized view หรือ table เช่น `order_item_billing_summary` หรือทำเป็น RPC ที่ sum จาก `invoice_items` ตาม `source_order_item_id`

## 10) API/Flow ที่ต้องมี
### 10.1 สร้าง IV แบบ Full
**POST** `/api/invoices/create-from-order-full`
- input: `{ orderId }`
- logic:
  - โหลด Order → หา `source_quote_id`
  - ถ้ามี quote: copy `sales_quote_items` → `invoice_items`
  - ถ้าไม่มี quote: copy `order_items` → `invoice_items`
  - totals: copy จาก QT (ถ้ามี) หรือคำนวณจาก order_items
  - set `payment_mode='full'`, `status='issued'`

### 10.2 สร้าง IV แบบแบ่งชำระ (ต่อบริการ)
**POST** `/api/invoices/create-from-order-installment-by-items`
- input ตัวอย่าง:
  ```json
  {
    "orderId": "...",
    "installmentNo": 2,
    "items": [
      {"sourceOrderItemId": "...", "billedUnitPrice": 1500},
      {"sourceOrderItemId": "...", "billedUnitPrice": 0}
    ]
  }
  ```
- logic:
  - โหลด order_items (หรือ quote_items ถ้าจะยึด QT เป็น source)
  - validate remaining ต่อ item (ไม่ให้เกิน)
  - สร้าง invoice_items หลายบรรทัดเหมือน QT/Order แต่ `unit_price = billedUnitPrice`
  - สร้าง IV ด้วย `payment_mode='installment'`, `installment_no` ตามรอบ

### 10.3 ยืนยันชำระ/ออก RT
- ใช้ของเดิม:
  - `/api/invoices/confirm-payment` (เปลี่ยนสถานะ IV เป็น `paid_confirmed`)
  - `/api/receipts/from-invoice` (copy invoice_items → receipt_items)

## 11) หน้าจอ/UX ที่ต้องมี
### 11.1 จุดเริ่มต้น “ออกใบแจ้งหนี้”
- ในหน้า Order / Manage Order เพิ่ม action “ออกใบแจ้งหนี้ (IV)”
- Modal/Drawer:
  - เลือกโหมด: `ชำระเต็มจำนวน` | `แบ่งชำระ`

### 11.2 โหมดชำระเต็มจำนวน
- แสดง preview รายการจาก QT (readonly)
- ปุ่ม “สร้าง IV”
- ข้อความกำกับ: “IV/RT จะเหมือน QT 100% (เปลี่ยนเฉพาะหัวเอกสาร)”

### 11.3 โหมดแบ่งชำระ
- ตารางรายการบริการ (เหมือน QT): ชื่อ/รายละเอียด/จำนวน/ราคาเต็มต่อหน่วย/คงเหลือต่อหน่วย/ยอดต่อหน่วยที่จะวางบิล (input)
- คำนวณรวมแบบ realtime: subtotal, VAT, WHT, grand_total
- UX ช่วยกรอก:
  - ปุ่ม “ใส่เท่ากันทุกบรรทัด” (optional)
  - ปุ่ม “ใส่เฉพาะบรรทัดที่เลือก” (optional)
- Validation:
  - ไม่ให้กรอกติดลบ
  - ไม่ให้กรอกเกิน remaining ต่อหน่วย
  - ไม่ให้ยอดรวมเป็น 0

## 12) เอกสาร PDF (Output Requirements)
### 12.1 Full Payment: ต้องเหมือน QT 100%
- แนะนำให้ทำ “template กลาง” สำหรับส่วน body (seller/customer/items/totals)
- เปลี่ยนเฉพาะส่วนหัว:
  - ชื่อเอกสาร: ใบแจ้งหนี้ / ใบเสร็จรับเงิน
  - เลขเอกสาร: IV-… / RT-…
  - ฟิลด์เฉพาะเอกสาร (due date / paid date)

### 12.2 Installment: รายการเหมือน QT แต่ราคาต่อหน่วยเป็นยอดที่จะชำระ
- แสดงรายการทุกบรรทัดเหมือน QT
- `ราคา` ในตาราง = billed unit price
- `มูลค่า` = billed unit price * quantity
- อ้างอิง: แสดงเลข QT/Order ในหมายเหตุหรือช่อง reference

## 13) รายงาน/การตรวจสอบ (Reporting & Audit)
- ในหน้ารายการ IV/RT แนะนำเพิ่ม badge แสดงโหมด: `Full` / `Installment`
- ในหน้า IV detail แสดง “ยอดเต็มต่อหน่วย / ยอดคงเหลือต่อหน่วย” ต่อบรรทัด (สำหรับโหมดแบ่งชำระ)
- ทำให้ตรวจสอบย้อนหลังได้: invoice_items ต้องมี source (quote_item/order_item) เพื่อ trace

## 14) Acceptance Criteria
### 14.1 Full Payment
- เมื่อสร้าง IV แบบ Full จากออเดอร์ที่มี QT:
  - จำนวนบรรทัดใน IV = จำนวนบรรทัดใน QT
  - ชื่อ/คำอธิบาย/จำนวน/ราคา/มูลค่า ของทุกบรรทัดตรงกับ QT
  - subtotal/discount/VAT/WHT/grand_total ตรงกับ QT
- เมื่อออก RT จาก IV ที่ชำระแล้ว:
  - RT line items และ totals ตรงกับ IV (และจึงตรงกับ QT)

### 14.2 Installment
- Sale สามารถกำหนด billed unit price ต่อรายการบริการ และสร้าง IV ได้
- IV แสดงรายการแยกตามบริการเหมือน QT/Order ไม่รวมเป็นบรรทัดเดียว
- ระบบไม่อนุญาต billed unit price เกิน remaining ต่อหน่วย
- เมื่อสร้าง IV หลายใบต่อ order เดียว:
  - ยอดสะสมต่อบริการไม่เกินยอดเต็ม
  - RT ที่ออกจากแต่ละ IV แสดงบรรทัดเหมือน IV นั้น

## 15) หมายเหตุการเชื่อมกับของเดิม (Implementation Notes)
- ปัจจุบันมีตาราง `invoices/invoice_items/invoice_payments` และ PDF route ของ IV/RT แล้ว
- งานหลักคือ:
  - เพิ่ม metadata ให้ invoices/invoice_items เพื่อรองรับการ “copy แบบ 100%” และ “ติดตามยอดสะสมต่อบริการ”
  - เพิ่ม endpoint สร้าง IV แบบ full และแบบ installment-by-items
  - ปรับ UI จุดออก IV จากออเดอร์ให้เลือกโหมด และกรอก per-item billed unit price

