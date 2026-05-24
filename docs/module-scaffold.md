# Module Scaffold Guide

คู่มือสำหรับนักพัฒนาที่ต้องการสร้าง **Specific Module** ใหม่ใน PERPOS

> **Specific Module** = module ที่สร้างเฉพาะสำหรับองค์กรหนึ่ง (เหมือน TMC Management)  
> ซ่อนจาก Module Manager ขององค์กรอื่น ต้องเปิดใช้งานโดย super_admin เท่านั้น

---

## สถาปัตยกรรม

```
organizations
  └── org_module_settings (module_key, is_enabled)   ← เปิด/ปิด module ต่อ org
        └── module_members (user_id, module_role)     ← สมาชิกและสิทธิ์ต่อ module
```

ทุก module route handler เรียก `requireModuleMember(req, orgId, moduleKey)` แทนการเขียน auth ใหม่

---

## Checklist

### 1. ลงทะเบียน Module ใน `src/lib/modules.ts`

```typescript
// เพิ่มใน ALL_MODULES array
{
  key:      "my_module",          // snake_case, ตรงกับ org_module_settings.module_key
  label:    "My Module",
  href:     "/my-module",         // relative ต่อ /:orgSlug
  specific: true,                 // ซ่อนจาก org อื่น
  match: (p) => {
    const seg = p.split("/").filter(Boolean);
    return seg.length >= 2 && seg[1] === "my-module";
  },
  roles: [
    { key: "owner",   label: "Owner",   canWrite: true  },
    { key: "manager", label: "Manager", canWrite: true  },
    { key: "viewer",  label: "Viewer",  canWrite: false },
  ],
},
```

```typescript
// เพิ่ม menus ใน MODULE_MENUS
MODULE_MENUS["my_module"] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "reports",   label: "รายงาน"   },
];
```

---

### 2. เปิดใช้งาน Module ใน Supabase (super_admin เท่านั้น)

เปิด Admin Console → จัดการ Modules → เลือกองค์กร → เปิด module

หรือ SQL:
```sql
INSERT INTO org_module_settings (organization_id, module_key, is_enabled, allowed_roles)
VALUES ('<org_id>', 'my_module', true, ARRAY['owner','admin'])
ON CONFLICT (organization_id, module_key) DO UPDATE SET is_enabled = true;
```

---

### 3. สร้าง Migration — ตาราง DB

ไฟล์: `supabase/migrations/YYYYMMDDHHMMSS_my_module_tables.sql`

```sql
-- ตาราง data หลักของ module
CREATE TABLE my_module_records (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by uuid        NOT NULL REFERENCES profiles(id),
  title      text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE my_module_records ENABLE ROW LEVEL SECURITY;

-- SELECT: สมาชิกองค์กรดูได้
CREATE POLICY "my_module_records_select"
  ON my_module_records FOR SELECT
  USING (is_org_member(org_id, auth.uid()));

-- INSERT/UPDATE/DELETE: เฉพาะสมาชิก module ที่ canWrite
-- (ตรวจสอบผ่าน module_members ใน API layer ไม่ต้องใส่ใน RLS ซ้ำซ้อน)
CREATE POLICY "my_module_records_write"
  ON my_module_records FOR ALL
  USING (is_org_admin(org_id, auth.uid()));
```

> **หมายเหตุ:** RLS policy ป้องกัน org isolation เสมอ  
> การเช็ค canWrite ทำใน API layer ผ่าน `canModuleWrite(moduleKey, moduleRole)`

---

### 4. สร้าง API Route Handler

ไฟล์: `src/app/api/my-module/[resource]/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireModuleMember } from '../../_lib/module-auth';
import { createAdminClient } from '../../_lib/supabase';
import { canModuleWrite } from '@/lib/modules';
import { setAuditContext } from '../../_lib/audit';

const MY_MODULE_ORG_ID = process.env.MY_MODULE_ORG_ID!; // หรือ hardcode org id

export async function GET(req: NextRequest) {
  const auth = await requireModuleMember(req, MY_MODULE_ORG_ID, 'my_module');
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('my_module_records')
    .select('*')
    .eq('org_id', auth.orgId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ records: data });
}

export async function POST(req: NextRequest) {
  const auth = await requireModuleMember(req, MY_MODULE_ORG_ID, 'my_module');
  if (!auth.ok) return auth.res;

  // Check write permission using module role
  if (!canModuleWrite('my_module', auth.moduleRole)) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์แก้ไขข้อมูล' }, { status: 403 });
  }

  const body = await req.json();
  const admin = createAdminClient();

  // Wire audit context before mutation
  await setAuditContext(req, auth.userId, auth.orgId);

  const { data, error } = await admin
    .from('my_module_records')
    .insert({ org_id: auth.orgId, created_by: auth.userId, title: body.title })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ record: data }, { status: 201 });
}
```

---

### 5. สร้าง `_lib.ts` สำหรับ module (optional)

ถ้า module มี type และ helper เยอะ ให้สร้าง `src/app/api/my-module/_lib.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createAuthedClient } from '../_lib/supabase';
import { requireModuleMember, ModuleAuth } from '../_lib/module-auth';

export const MY_MODULE_ORG_ID = '...uuid...';

export type MyModuleRole = 'owner' | 'manager' | 'viewer';

export interface MyModuleAuth extends Omit<ModuleAuth, 'moduleRole'> {
  role: MyModuleRole;
}

export async function requireMyModuleMember(
  req: NextRequest,
): Promise<MyModuleAuth | { ok: false; res: NextResponse }> {
  const result = await requireModuleMember(req, MY_MODULE_ORG_ID, 'my_module');
  if (!result.ok) return result;
  return { ...result, role: result.moduleRole as MyModuleRole };
}

export function canWrite(role: MyModuleRole) {
  return ['owner', 'manager'].includes(role);
}
```

---

### 6. สร้าง Frontend Pages

ไฟล์: `src/app/(hydrogen)/[orgSlug]/my-module/page.tsx`

```typescript
// ตรวจสอบ module access ฝั่ง client ผ่าน session role
// API layer รักษาความปลอดภัยจริง — client check เป็นแค่ UX guard
```

---

### 7. เพิ่ม Menu Items

ใน `src/layouts/hydrogen/menu-items.tsx` เพิ่ม function:

```typescript
function buildMyModuleMenuItems(org: string): MenuItem[] {
  const p = (path: string) => `/${org}/my-module/${path}`;
  return [
    { name: "My Module", roles: allRoles },
    { name: "Dashboard", href: `/${org}/my-module`, icon: <LayoutDashboard className="h-5 w-5" />, roles: allRoles },
    { name: "รายงาน",    href: p("reports"),         icon: <BarChart3 className="h-5 w-5" />,       roles: allRoles },
  ];
}
```

แล้วเพิ่มใน `buildMenuItems()`:
```typescript
case "my-module": return buildMyModuleMenuItems(org ?? "");
```

---

### 8. เพิ่มสมาชิก Module

Admin Console → **Module Members** → เลือกองค์กร + module → เพิ่มสมาชิก

หรือ API:
```bash
curl -X POST https://perpos.io/api/admin/module-members \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"orgId":"<org_id>","moduleKey":"my_module","userId":"<user_id>","moduleRole":"manager"}'
```

---

### 9. เพิ่ม Audit Trigger (ถ้าต้องการ)

ใน migration:
```sql
CREATE TRIGGER my_module_records_audit
  AFTER INSERT OR UPDATE OR DELETE ON my_module_records
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log_changes();
```

ดู `docs/audit.md` สำหรับรายละเอียด

---

## Checklist สรุป

| ขั้นตอน | ไฟล์ | สถานะ |
|---------|------|-------|
| ลงทะเบียนใน `ALL_MODULES` | `src/lib/modules.ts` | |
| เพิ่ม `MODULE_MENUS` | `src/lib/modules.ts` | |
| สร้าง migration | `supabase/migrations/` | |
| เพิ่ม audit trigger | migration | optional |
| สร้าง API routes | `src/app/api/<module>/` | |
| สร้าง `_lib.ts` | `src/app/api/<module>/_lib.ts` | optional |
| สร้าง frontend pages | `src/app/(hydrogen)/[org]/<module>/` | |
| เพิ่ม menu items | `src/layouts/hydrogen/menu-items.tsx` | |
| เปิดใช้งานใน Admin Console | org_module_settings | |
| เพิ่มสมาชิก | module_members | |

---

## Environment Variables ที่ต้องเพิ่ม

```env
# ถ้า org ID ต้องการแยกต่างหาก
MY_MODULE_ORG_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

---

## ตัวอย่าง Module ที่มีอยู่แล้ว

| Module | org ID | specific | _lib.ts |
|--------|--------|---------|---------|
| TMC Management | `1f52618c-09c4-49c5-a929-ea5060f26e7d` | ✅ | `src/app/api/tmc/_lib.ts` |
