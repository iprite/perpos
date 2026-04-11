# Page / Component Design: Table Template (Rows per page + Pagination)

> แนวทางนี้เป็น Desktop-first และออกแบบให้ใช้ซ้ำได้ทุกหน้าตาราง

## 1) Global Styles (Design Tokens)
- Base background: ขาว/เทาอ่อน (ตามธีมเดิมของแอป)
- Typography:
  - Label/Helper: ขนาดเล็ก สีเทา (เช่น `text-gray-600`) สำหรับ “Rows per page”, “Page x of y”
  - Value: ตัวหนาเล็กน้อยสำหรับค่าที่เลือกใน Select
- Control sizing:
  - Select: สูงกะทัดรัด (sm), กว้างพอดีตัวเลข
  - Pagination buttons: ไอคอนในปุ่มขอบเส้น (outline), disabled เป็นสีเทา
- Spacing:
  - Footer bar padding แนวตั้ง ~ 16px (เช่น `py-4`)
  - ช่องว่างระหว่างกลุ่มซ้าย/ขวาให้เห็นเป็น 2 โซนชัดเจน

## 2) Page Meta Information (สำหรับหน้ารายการแบบตาราง)
- Title: ชื่อโมดูล + “List” (เช่น “Products List”)
- Description: อธิบายสั้น ๆ ว่าเป็นหน้ารายการแบบตาราง
- Open Graph: ใช้ค่าเริ่มต้นของแอป (ไม่ต้องมีภาพเฉพาะ)

## 3) Page Structure (หน้ารายการแบบตาราง)
- โครงหลัก: แบบการ์ด (Widget/Card) ครอบ “Filters (ถ้ามี)” + “Table” + “Table Footer Bar (Rows per page + Pagination)”
- การจัดวาง: แนวตั้งซ้อน (stacked sections)
  1) Header/Title ของการ์ด
  2) Filters (ถ้ามี)
  3) ตาราง
  4) แถบส่วนท้ายตาราง (Table Template)

## 4) Sections & Components

### 4.1 Table Template (ส่วนท้ายตารางมาตรฐาน)
**ตำแหน่ง**: อยู่ใต้ตารางเสมอ (ท้ายการ์ด/ท้าย section)

**Layout**: Flexbox แบบ 2 ฝั่ง (ซ้าย/ขวา)
- Left group: “Rows per page” + Select
- Right group: (ตัวเลือก) “Page X of Y” + ปุ่มควบคุมหน้า

**องค์ประกอบ**
1) Rows per page label
- Desktop: แสดงข้อความ “Rows per page”
- Responsive: ซ่อน label ได้เมื่อหน้าจอแคบ เพื่อประหยัดพื้นที่ (เหลือเฉพาะ select)

2) Rows per page select
- ตัวเลือกเริ่มต้น: 5, 10, 15, 20, 25
- Interaction:
  - เมื่อเปลี่ยนค่า ต้องอัปเดตจำนวนแถวต่อหน้า และรีเรนเดอร์ตารางให้สอดคล้องทันที

3) Pagination text (ตัวเลือก)
- แสดง “Page {current} of {totalPages}”
- Responsive: ซ่อนได้บนจอเล็ก

4) Pagination controls
- ปุ่ม: หน้าแรก, ก่อนหน้า, ถัดไป, หน้าสุดท้าย (ไอคอน)
- State:
  - Disabled หน้าแรก/ก่อนหน้า เมื่ออยู่หน้าแรก
  - Disabled ถัดไป/หน้าสุดท้าย เมื่ออยู่หน้าสุดท้าย
- Accessibility:
  - มี aria-label ชัดเจนทุกปุ่ม

## 5) จุดรวมศูนย์เพื่อใช้ซ้ำทั้งแอป (Single Source of Truth)
- ให้ทุกตารางเรียกใช้คอมโพเนนต์ส่วนกลางเดียวกันสำหรับส่วนท้ายตาราง
- จุดอ้างอิงในโค้ดปัจจุบัน:
  - `@core/components/table/pagination` (แถบ Rows per page + pagination)
- กติกาการใช้งาน:
  - ห้ามทำ UI pagination ซ้ำในระดับหน้า
  - หากต้องปรับดีไซน์/พฤติกรรม ให้แก้ที่คอมโพเนนต์ส่วนกลางเท่านั้น เพื่อให้ทุกตารางอัปเดตพร้อมกัน
