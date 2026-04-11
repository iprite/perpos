## 1.Architecture design
```mermaid
graph TD
  A["User Browser"] --> B["React Frontend Application"]
  B --> C["Workers Page UI"]
  C --> D["Worker Add/Edit Popup Modal"]
  B --> E["Existing Data Layer (Supabase ผ่าน SDK ตามระบบเดิม)"]

  subgraph "Frontend Layer"
    B
    C
    D
  end

  subgraph "Service Layer (Existing)"
    E
  end
```

## 2.Technology Description
- Frontend: React@18 + (UI/Modal component ตามระบบเดิม)
- Backend: ไม่มีการเพิ่มบริการใหม่ (ใช้ Supabase/โครงเดิม)

## 3.Route definitions
| Route | Purpose |
|-------|---------|
| /workers | หน้าแรงงาน + ตารางรายการ + เปิด Worker Add/Edit เป็น Popup Modal |

## 4.API definitions (If it includes backend services)
ไม่มีการเพิ่ม/เปลี่ยน API ใหม่สำหรับงานนี้ (คงการ create/update/delete workers ตามเดิม)

## 6.Data model(if applicable)
ไม่มีการเปลี่ยนแปลง data model สำหรับงานนี้
