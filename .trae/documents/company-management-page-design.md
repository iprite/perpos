# Page Design Spec (Desktop-first)

## Global Styles

* Theme: Minimal / เน้นพื้นที่ว่าง (white space) สีหลักเทา-ขาว

* Background: #FFFFFF, Surface: #F8FAFC, Border: #E5E7EB

* Text: #111827 (primary), #6B7280 (secondary)

* Accent/Primary: #111827, Danger: #DC2626, Warning: #D97706, Success: #059669

* Typography: 14px base; H1 24/28, H2 18/24, Body 14/20, Caption 12/16

* Buttons: Primary (filled), Secondary (outline), Ghost (text)

  * Hover: เพิ่มความเข้มพื้นหลัง 5–8%, Focus ring 2px

* Links: underline on hover

## App Shell (ใช้กับทุกหน้าหลังล็อกอิน)

* Layout: CSS Grid แบบ 2 แถว/2 คอลัมน์

  * Row 1: Header สูง 56px

  * Row 2: Main content

  * Col 1: Sidebar กว้าง 240px (ยุบได้เป็น 72px)

  * Col 2: Content area (มี max-width 1200px และ padding 24px)

* Header: ซ้ายเป็นชื่อระบบ/โลโก้, ขวาเป็นไอคอนแจ้งเตือน + เมนูผู้ใช้ (ออกจากระบบ)

* Sidebar: เมนูหลัก (แดชบอร์ด, Service, นายจ้าง/ลูกค้า, ตัวแทน (Representative), คำสั่งซื้อ, แรงงานต่างด้าว, การดำเนินงาน, หนังสือมอบอำนาจ/คำขอ POA, การแจ้งเตือน)

### Sidebar Visibility ตาม Role
| Menu | admin | sale | operation | employer | representative |
|------|:-----:|:----:|:---------:|:--------:|:--------------:|
| แดชบอร์ด | ✓ | ✓ | ✓ | ✓ | – |
| Service | ✓ | ✓ | ◐ (ดู) | – | – |
| นายจ้าง/ลูกค้า | ✓ | ✓ | ◐ (ดู) | ◐ (ดูเฉพาะองค์กร) | ✓ (เฉพาะของตน) |
| ตัวแทน (Representative) | ✓ | ◐ (ดู) | ✓ | ◐ (ดูรายชื่อองค์กร) | – |
| คำสั่งซื้อ | ✓ | ✓ | ✓ | ◐ (ดูเฉพาะองค์กร) | – |
| แรงงานต่างด้าว | ✓ | ◐ (ดูสถานะ) | ✓ | ◐ (ดูเฉพาะองค์กร) | ✓ (เฉพาะของตน) |
| การดำเนินงาน | ✓ | ◐ (ดูสถานะ) | ✓ | ◐ (ดูเฉพาะองค์กร) | – |
| หนังสือมอบอำนาจ/คำขอ POA | ✓ | ◐ (ดู) | ✓ | ◐ (ดู/ดาวน์โหลด) | ✓ (เฉพาะ POA requests) |
| การแจ้งเตือน | ✓ | ✓ | ✓ | ✓ | – |

หมายเหตุ: สัญลักษณ์ ◐ คือ “อ่านอย่างเดียว/จำกัดขอบเขต” และการจำกัดขอบเขตต้องบังคับที่ฝั่งฐานข้อมูลด้วย (ไม่พึ่ง UI อย่างเดียว)

ข้อกำหนดเพิ่มเติมสำหรับ Representative
- หลังล็อกอิน Representative เห็นเมนูได้ 3 ส่วนเท่านั้น: “นายจ้าง/ลูกค้า (ของฉัน)”, “แรงงาน (ของฉัน)”, และ “คำขอ POA”
- การขอ POA แยกจากการจัดการข้อมูลนายจ้าง/แรงงาน โดยเลือกอ้างอิงข้อมูลที่มีอยู่ (และสามารถกดลิงก์ไปเพิ่มข้อมูลได้)

* Responsive: โหมดเดสก์ท็อปเป็นหลัก; ที่หน้าจอแคบให้ Sidebar เป็น drawer

***

## 1) หน้าเข้าสู่ระบบ (/login)

### Meta Information

* Title: เข้าสู่ระบบ | Company Management

* Description: เข้าสู่ระบบเพื่อจัดการข้อมูลบริษัทและเอกสาร

* OG: title/description เหมือนกัน

### Layout

* Flexbox จัดกึ่งกลางหน้า (centered card) พื้นหลังสีขาว/เทาอ่อน

### Page Structure

* Brand header (ชื่อระบบ)

* Login Card (กว้าง \~420px)

### Sections & Components

* ฟิลด์: อีเมล, รหัสผ่าน

* ปุ่ม: เข้าสู่ระบบ (Primary)

* สถานะ: แสดง error inline ใต้ฟิลด์ และ loading บนปุ่ม

***

## 2) แดชบอร์ด (/)

### Meta Information

* Title: แดชบอร์ด | ExApp

* Description: ระบบจัดการเอกสารแรงงานต่างด้าว

### Layout

* Content ใช้ Grid 12 คอลัมน์; card spacing 16px

### Page Structure

* Page header: ชื่อหน้า + breadcrumb (ถ้ามี)

* Summary cards

* ตาราง/ลิสต์ “เอกสารใกล้หมดอายุ”

### Sections & Components

* Summary Cards (3 ใบ):

  * “หมดอายุภายใน 30 วัน”, “หมดอายุแล้ว”, “การแจ้งเตือนยังไม่อ่าน”

  * คลิกแล้วพาไป /documents หรือ /notifications พร้อม filter

* Expiring Documents List:

  * ตาราง: ชื่อเอกสาร, ประเภท, วันหมดอายุ, สถานะ

  * ปุ่มลัด: “ดูทั้งหมด” ไป /documents

***

## 3) พนักงานและโครงสร้างบริษัท (/employees)

### Meta Information

* Title: พนักงาน | Company Management

* Description: รายชื่อพนักงานและรายละเอียด

### Layout

* Top bar (ค้นหา) + ตารางเต็มความกว้าง

### Page Structure

* Toolbar: ค้นหา (search input)

* Table: รายการพนักงาน

* Side panel / modal: รายละเอียดพนักงาน (เมื่อคลิกแถว)

### Sections & Components

* Employee Table columns: ชื่อ, แผนก, ตำแหน่ง, อีเมล

* Employee Detail panel:

  * ข้อมูลพื้นฐานตาม PRD

***

## 4) เอกสารบริษัท (/documents)

### Meta Information

* Title: เอกสารบริษัท | Company Management

* Description: อัปโหลด จัดเก็บ และติดตามวันหมดอายุเอกสาร

### Layout

* แบ่ง 2 ส่วน: Toolbar + Table (stacked)

### Page Structure

* Toolbar:

  * Search

  * Filter: สถานะ (ทั้งหมด/ใกล้หมดอายุ/หมดอายุแล้ว)

  * ปุ่ม “อัปโหลดเอกสาร” (Primary)

* Documents Table

* Upload/Edit Modal

### Sections & Components

* Documents Table columns: ชื่อเอกสาร, ประเภท, วันหมดอายุ, เจ้าของ/หน่วยงาน, การกระทำ

* Actions ต่อแถว:

  * ดาวน์โหลด

  * เปิดดูรายละเอียด

* Upload/Edit Modal fields:
  * ชื่อเอกสาร, ประเภท, วันหมดอายุ (date picker)
  * Google Drive link (required) + ปุ่ม “เปิดลิงก์” (ตรวจสอบเบื้องต้นว่าเป็น URL)
  * (optional) เก็บ `fileId` จาก URL เพื่อใช้อ้างอิงในอนาคต
  * ปุ่ม บันทึก/ยกเลิก

* State:

  * Badge สถานะ: ใกล้หมดอายุ (warning), หมดอายุแล้ว (danger)

***

## 5) การแจ้งเตือนเอกสารหมดอายุ (/notifications)

### Meta Information

* Title: การแจ้งเตือน | Company Management

* Description: ติดตามการแจ้งเตือนเอกสารใกล้หมดอายุและหมดอายุแล้ว

### Layout

* List-based layout: ซ้ายเป็นรายการ, ขวาเป็นรายละเอียด (2-column) สำหรับเดสก์ท็อป

### Page Structure

* Toolbar: filter (ทั้งหมด/ยังไม่อ่าน/อ่านแล้ว)

* Notification List (เรียงล่าสุด)

* Detail Panel

### Sections & Components

* Notification item:

  * ไอคอนระดับความรุนแรง + ข้อความสั้น + เวลา

  * สถานะอ่านแล้ว (ลดความเข้มสี)

* Detail panel:

  * ข้อความเต็ม + ลิงก์ไปหน้าเอกสาร (/documents พร้อม filter หรือเปิดเอกสารนั้น)

  * ปุ่ม “ทำเครื่องหมายว่าอ่านแล้ว”

***

## 6) ตัวแทน (Representative) (/representatives)

### Meta Information
* Title: ตัวแทน | Company Management
* Description: จัดการรายชื่อผู้แทนของนายจ้าง/ลูกค้า และกำหนดขอบเขตสิทธิ์

### Layout
* Top toolbar + Table + Side panel/Modal (เหมือนหน้าลูกค้า)

### Page Structure
* Toolbar:
  * Search (ชื่อ/เบอร์/อีเมล)
  * Filter: นายจ้าง/ลูกค้า (เลือกองค์กร)
  * Filter: สถานะบัญชี (active/inactive/invited)
  * ปุ่ม “เพิ่มตัวแทน” (Primary)
* Representatives Table
* Create/Edit Modal
* View Scope Panel (แสดงขอบเขตงาน/คำสั่งซื้อที่อนุญาต)

### Sections & Components
* Representatives Table columns: ชื่อ, นายจ้าง/ลูกค้า, เบอร์โทร, อีเมล, สถานะ, การกระทำ
* Actions ต่อแถว:
  * ดูรายละเอียด/แก้ไข
  * เปิด/ปิดการใช้งาน
  * ส่งคำเชิญ/รีเซ็ตรหัสผ่าน (ถ้ามีบัญชี)
  * กำหนดขอบเขตงาน (เช่น จำกัดตามคำสั่งซื้อ)
* Create/Edit Modal fields:
  * นายจ้าง/ลูกค้า (required)
  * ชื่อ-สกุล (required)
  * เบอร์โทร, อีเมล
  * หมายเหตุ
  * สวิตช์ “อนุญาตเข้าใช้งานระบบ” (สร้างบัญชี role=representative)
* Permission note:
  * ตัวแทนที่ “เข้าใช้งานระบบได้” ต้องเห็นเฉพาะคำสั่งซื้อ/งานที่ถูกกำหนดให้เท่านั้น

***

## 7) คำสั่งซื้อ (Orders) (/orders)

### Meta Information
* Title: คำสั่งซื้อ | Company Management
* Description: สร้างคำสั่งซื้อ ทำใบเสนอราคา ส่งอนุมัติ และติดตามสถานะ

### Layout
* List + Detail (เดสก์ท็อป): ซ้ายตารางรายการ, ขวาเป็นรายละเอียดคำสั่งซื้อ/ใบเสนอราคา

### Page Structure
* Toolbar:
  * Search (เลขคำสั่งซื้อ/ชื่อลูกค้า)
  * Filter: status (draft/pending_approval/approved/in_progress/completed)
  * ปุ่ม “สร้างคำสั่งซื้อ” (Primary)
* Orders Table
* Order Detail tabs:
  * ภาพรวม
  * รายการบริการ/ใบเสนอราคา
  * แรงงาน
  * การดำเนินงาน
  * เอกสาร/ไฟล์

### Sections & Components
* Orders Table columns: เลขที่, นายจ้าง/ลูกค้า, สถานะ, ยอดรวม, อัปเดตล่าสุด
* Order Detail (ภาพรวม): ข้อมูลลูกค้า, สถานะ, timeline การอนุมัติ
* ใบเสนอราคา (Service Line Items):
  * ตารางรายการบริการ: บริการ, รายละเอียด, จำนวน, ราคา/หน่วย, รวม
  * Summary: subtotal/discount/total
  * Actions:
    * “ออกใบสรุปรายการบริการ/ใบเสนอราคา” (สร้างไฟล์)
    * “ส่งขออนุมัติ” (Sale)
    * “อนุมัติ/ปฏิเสธ” (Admin)
    * เมื่อออกเอกสารแล้ว แสดงลิงก์ Google Drive ของเอกสาร (เปิดในแท็บใหม่)
* State rules (UI):
  * `draft`: แก้ไขรายการบริการได้
  * `pending_approval`: ล็อกการแก้ไขรายการบริการ (อ่านอย่างเดียว)
  * `approved`: Operation กด “เริ่มดำเนินงาน” ได้

***

## 8) คำขอหนังสือมอบอำนาจ (POA Requests) (/poa-requests)

### Meta Information
* Title: คำขอหนังสือมอบอำนาจ | Company Management
* Description: ตัวแทนส่งคำขอ POA และทีม Operation ออกหนังสือจากระบบ

### Layout
* List + Detail + Attachment panel

### Page Structure
* Toolbar:
  * Filter: นายจ้าง/ลูกค้า
  * Filter: ประเภทคำขอ (POA request type)
  * Filter: status (submitted/need_info/issued/rejected)
  * ปุ่ม “สร้างคำขอ POA” (Primary) (เฉพาะ representative)
* Requests List
* Request Detail:
  * ข้อมูลผู้มอบอำนาจ/ผู้รับมอบอำนาจ
  * เอกสารแนบ
  * สถานะและหมายเหตุ
  * Actions ตาม role

### Sections & Components
* Create Request (Representative):
  * เลือกนายจ้าง/ลูกค้า (จากรายการ “ของฉัน”)
  * เลือก “รายการคำขอ/เหตุผล” จาก POA Request List (มีราคากำหนดไว้)
  * ระบุจำนวนแรงงาน (ตัวเลข)
  * ระบุเหตุผลเพิ่มเติม (free text) (optional)
  * ระบบแสดงราคาแบบ real-time ก่อนกดยืนยัน
    * base price + (per-worker price × จำนวนแรงงาน)
    * สรุปยอด: unit/base, per-worker, total
  * แนบลิงก์เอกสารประกอบ (Google Drive)
  * (optional) เลือกแรงงานที่เกี่ยวข้อง (จากรายการ “ของฉัน”) เพื่ออ้างอิงในเคสที่ต้องระบุรายชื่อ
  * ถ้าข้อมูลนายจ้าง/แรงงานยังไม่ครบ แสดงลิงก์ไป “เพิ่มนายจ้าง” และ “เพิ่มแรงงาน”
* Review (Operation): ขอข้อมูลเพิ่ม, ออกหนังสือ (generate), แนบลิงก์ไฟล์หนังสือมอบอำนาจ (Google Drive), เปลี่ยนสถานะเป็น issued
* Customer visibility: นายจ้าง/ลูกค้าเห็นสถานะ POA ที่เกี่ยวข้องกับองค์กรตน

#### POA Request List (Pricing Catalog)
* ผู้ดูแลระบบกำหนดรายการประเภทคำขอ (name/description) และราคา (base price, per-worker price)
* ใช้เป็นตัวเลือกในฟอร์มสร้างคำขอ และแสดงในตารางรายการเพื่อให้เห็นว่า “ขออะไร” และ “ราคาเท่าไร”

#### POA Requests List (Table)
* Columns (Representative view): เลขที่, นายจ้าง/ลูกค้า, ประเภทคำขอ, จำนวนแรงงาน, ราคา, สถานะ, วันที่สร้าง
* Columns (Operation view): เพิ่ม “เหตุผล” (ย่อ) และ “เอกสารแนบครบไหม”
* Row click: เปิดรายละเอียด

#### Request Detail (Pricing)
* แสดง breakdown ราคา: base / per-worker / worker_count / total
* แสดง snapshot ราคาที่ใช้ตอนส่งคำขอ (ไม่เปลี่ยนตามการปรับราคาในอนาคต)

***

## 10) นายจ้าง/ลูกค้าของฉัน (My Customers) (/my-customers)

### Meta Information
* Title: นายจ้าง/ลูกค้าของฉัน | Company Management
* Description: Representative จัดการรายชื่อนายจ้าง/ลูกค้าของตน

### Layout
* Toolbar + Table + Create/Edit Modal

### Page Structure
* Toolbar:
  * Search (ชื่อบริษัท/ผู้ติดต่อ)
  * ปุ่ม “เพิ่มนายจ้าง/ลูกค้า” (Primary)
* Table
* Create/Edit Modal

### Sections & Components
* Table columns: ชื่อบริษัท, ผู้ติดต่อ, เบอร์โทร, อีเมล, อัปเดตล่าสุด
* Modal fields: ชื่อบริษัท (required), ผู้ติดต่อ, เบอร์, อีเมล, หมายเหตุ

***

## 11) แรงงานของฉัน (My Workers) (/my-workers)

### Meta Information
* Title: แรงงานของฉัน | Company Management
* Description: Representative จัดการรายการแรงงานของตนเพื่อใช้อ้างอิงในคำขอ POA

### Layout
* Toolbar + Table + Side panel/Modal

### Page Structure
* Toolbar:
  * Search (ชื่อ/เลขพาสปอร์ต)
  * Filter: นายจ้าง/ลูกค้า (ของฉัน)
  * ปุ่ม “เพิ่มแรงงาน” (Primary)
* Workers Table
* Worker Detail panel (เอกสาร + วันหมดอายุ + ลิงก์ Drive)

### Sections & Components
* Table columns: ชื่อแรงงาน, สัญชาติ, นายจ้าง/ลูกค้า, สถานะเอกสารหลัก, วันหมดอายุใกล้สุด
* Detail fields: ข้อมูลพื้นฐาน + เอกสารสำคัญ (doc_type, expiry_date, drive link)

***

## 9) พอร์ทัลนายจ้าง/ลูกค้า (Customer Portal) (/portal)

### Meta Information
* Title: พอร์ทัลนายจ้าง/ลูกค้า | Company Management
* Description: ดูคำสั่งซื้อ สถานะ และรายการแรงงานของตน

### Layout
* 2-column cards + tables (เรียบง่าย เน้นอ่านเร็ว)

### Page Structure
* Summary cards: คำสั่งซื้อกำลังดำเนินงาน, งานที่รอเอกสาร, เอกสารใกล้หมดอายุ
* Orders list (เฉพาะขององค์กร)
* Workers list (เฉพาะขององค์กร)
* Notification widget (เอกสารใกล้หมดอายุ)

### Sections & Components
* Orders: เปิดดูรายละเอียดได้แบบอ่านอย่างเดียว
* Workers: ตารางแรงงาน + สถานะเอกสารสำคัญ + วันหมดอายุ + ปุ่มเปิดเอกสาร (ลิงก์ Google Drive)
* Notifications: เน้น “ต้องทำอะไรต่อ” และลิงก์ไป worker/document ที่เกี่ยวข้อง

***

## Document Link Pattern (ใช้ร่วมกันทุกหน้า)
* รูปแบบข้อมูล: เก็บ `drive_web_view_link` (จำเป็น) และ `drive_file_id` (ถ้าถอดได้)
* Validation (UI): ต้องเป็น URL ของ `drive.google.com` หรือ `docs.google.com` และเปิดได้ในแท็บใหม่
* Actions:
  * “เปิดเอกสาร” (new tab)
  * “คัดลอกลิงก์”
* Security note: หลีกเลี่ยงการใช้ลิงก์ public; จัดการ permission ที่ Google Drive และบังคับสิทธิ์ข้อมูลด้วย role ในระบบ
