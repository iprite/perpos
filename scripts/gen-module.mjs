import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const KEY_RE = /^[a-z][a-z0-9_-]{1,48}[a-z0-9]$/;
const SLUG_RE = /^[a-z][a-z0-9-]{0,48}[a-z0-9]$|^[a-z]$/;

const [,, key, label, slug, isSpecificStr, forOrgSlugsStr] = process.argv;

if (!key || !label || !slug) {
  console.log(`
❌ ข้อมูลไม่ครบถ้วน!
Usage:
  pnpm gen-module <key> <label> <slug> [is_specific] [for_org_slugs]

Arguments:
  key          : รหัสโมดูลตัวเล็กคั่นด้วย underscore/hyphen (เช่น just_me)
  label        : ชื่อโมดูลแสดงผล (เช่น "Just Me")
  slug         : Slug URL ของโมดูล (เช่น just-me)
  is_specific  : โมดูลเฉพาะองค์กรหรือไม่ (true/false) ค่าเริ่มต้นคือ true
  for_org_slugs: สลักขององค์กรที่ผูกโมดูลนี้ (คั่นด้วย comma เช่น p2psolutions) (ไม่บังคับ)

Example:
  pnpm gen-module just_me "Just Me" just-me true justme
`);
  process.exit(1);
}

if (!KEY_RE.test(key)) {
  console.error(`❌ Error: key "${key}" ไม่ถูกต้อง (ต้องเป็นอักษรภาษาอังกฤษตัวเล็ก ตัวเลข _ หรือ - ความยาว 2-50 ตัวอักษร)`);
  process.exit(1);
}

if (!SLUG_RE.test(slug)) {
  console.error(`❌ Error: slug "${slug}" ไม่ถูกต้อง (ต้องเป็นอักษรภาษาอังกฤษตัวเล็ก ตัวเลข หรือ - เท่านั้น)`);
  process.exit(1);
}

const isSpecific = isSpecificStr !== 'false';
const forOrgSlugs = forOrgSlugsStr ? forOrgSlugsStr.split(',').map(s => s.trim()).filter(Boolean) : [];

// Guard: specific modules without forOrgSlugs have no org-level lock —
// they can be enabled for ANY org by any admin, which is almost never intended.
if (isSpecific && forOrgSlugs.length === 0) {
  console.warn(`
⚠️  คำเตือน: คุณกำลังสร้าง specific module "${key}" โดยไม่ระบุ for_org_slugs
   ซึ่งหมายความว่า admin สามารถเปิด module นี้ให้ org ใดก็ได้โดยไม่มีการล็อก
   ถ้าต้องการล็อกเฉพาะ org ให้ระบุ:
     pnpm gen-module ${key} "${label}" ${slug} true <org-slug1>,<org-slug2>

   กด Ctrl+C เพื่อยกเลิก หรือรอ 5 วินาทีเพื่อดำเนินการต่อโดยไม่มีการล็อก...
`);
  await new Promise(resolve => setTimeout(resolve, 5000));
}

// Helper to convert snake/kebab to PascalCase
function toPascalCase(str) {
  return str
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .split(/[_-]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}
const pascalName = toPascalCase(key);

// Formatted timestamp for Supabase migrations (YYYYMMDDHHMMSS)
const date = new Date();
const pad = (n) => String(n).padStart(2, '0');
const timestamp = date.getUTCFullYear() +
  pad(date.getUTCMonth() + 1) +
  pad(date.getUTCDate()) +
  pad(date.getUTCHours()) +
  pad(date.getUTCMinutes()) +
  pad(date.getUTCSeconds());

const dateStr = date.toISOString().split('T')[0];

// File Paths
const pageDir = path.join(rootDir, 'apps', 'perpos', 'src', 'app', '(hydrogen)', '[orgSlug]', slug);
const pagePath = path.join(pageDir, 'page.tsx');

const apiDir = path.join(rootDir, 'apps', 'perpos', 'src', 'app', 'api', slug);
const apiRoutePath = path.join(apiDir, 'route.ts');
const apiLibPath = path.join(apiDir, '_lib.ts');

const migrationDir = path.join(rootDir, 'supabase', 'migrations');
const migrationPath = path.join(migrationDir, `${timestamp}_init_${key}.sql`);

// ─────────────────────────────────────────────────────────────────────────────
// Templates
// ─────────────────────────────────────────────────────────────────────────────

const pageTemplate = `'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { LayoutGrid, Loader2, AlertCircle } from 'lucide-react';

export default function ${pascalName}Page() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any[]>([]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // 1. ดึงข้อมูล ID ขององค์กรจาก Slug URL
      const { data: org, error: orgErr } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', orgSlug)
        .single();

      if (orgErr) throw new Error('ไม่พบข้อมูลองค์กร');

      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error('กรุณาเข้าสู่ระบบใหม่');

      // 2. ดึงข้อมูลจาก API Route ของโมดูล
      const res = await fetch(\`/api/${slug}?orgId=\${org.id}\`, {
        headers: { Authorization: \`Bearer \${token}\` },
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'เกิดข้อผิดพลาดในการโหลดข้อมูล');
      }

      const json = await res.json();
      setData(json.records || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [supabase, orgSlug]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2 border-b pb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <LayoutGrid className="w-5 h-5 text-indigo-500" />
            ${label}
          </h1>
          <p className="text-sm text-slate-500">โมดูลการทำงานเฉพาะองค์กร (${label})</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
          {loading ? 'กำลังโหลด…' : 'รีเฟรช'}
        </Button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
          <span>{error}</span>
        </div>
      ) : (
        <div className="bg-white rounded-xl border p-6 text-center space-y-4">
          <p className="text-slate-600 font-medium">เชื่อมต่อระบบโมดูล ${label} สำเร็จเรียบร้อยแล้ว!</p>
          <div className="max-w-md mx-auto p-4 bg-slate-50 border rounded-lg text-left text-xs font-mono text-slate-500 space-y-1">
            <p>• Module Key: ${key}</p>
            <p>• URL Path: /{orgSlug}/${slug}</p>
            <p>• API Route: /api/${slug}</p>
            <p>• Records loaded: {data.length} records</p>
          </div>
        </div>
      )}
    </div>
  );
}
`;

const apiRouteTemplate = `import { NextRequest, NextResponse } from 'next/server';
import { requireModuleMember } from '../_lib/module-auth';
import { createAdminClient } from '../_lib/supabase';
import { canModuleWrite } from '@/lib/modules';
import { setAuditContext } from '../_lib/audit';

export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get('orgId');
  if (!orgId) return NextResponse.json({ error: 'missing orgId' }, { status: 400 });

  // 1. ยืนยันสิทธิ์สมาชิกองค์กรและสิทธิ์เข้าถึงโมดูล
  const auth = await requireModuleMember(req, orgId, '${key}');
  if (!auth.ok) return auth.res;

  // 2. Query ข้อมูล (ใช้ createAdminClient เพื่อบายพาส RLS)
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('${key}_records')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (error) {
    // ถ้าตารางยังไม่ได้สร้างจริงใน DB ให้ส่งอาร์เรย์ว่างไปก่อนเพื่อให้หน้าบ้านทำงานได้ไม่พัง
    if (error.code === 'P0001' || error.message.includes('does not exist')) {
      return NextResponse.json({ records: [] });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ records: data ?? [] });
}

export async function POST(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get('orgId');
  if (!orgId) return NextResponse.json({ error: 'missing orgId' }, { status: 400 });

  // 1. ยืนยันสิทธิ์เข้าใช้โมดูล
  const auth = await requireModuleMember(req, orgId, '${key}');
  if (!auth.ok) return auth.res;

  // 2. เช็คสิทธิ์การเขียนข้อมูล
  if (!canModuleWrite('${key}', auth.moduleRole)) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์เขียนข้อมูลในโมดูลนี้' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { title } = body;
  if (!title || typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'missing title' }, { status: 400 });
  }

  const admin = createAdminClient();

  // 3. กำหนด Audit Context ก่อนสั่งเขียนข้อมูลใน DB
  await setAuditContext(req, auth.userId, auth.orgId);

  // 4. บันทึกข้อมูล
  const { data, error } = await admin
    .from('${key}_records')
    .insert({
      org_id:     auth.orgId,
      created_by: auth.userId,
      title:      title.trim(),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ record: data }, { status: 201 });
}
`;

const apiLibTemplate = `import { NextRequest, NextResponse } from 'next/server';
import { requireModuleMember, ModuleAuth } from '../_lib/module-auth';

export const MODULE_KEY = '${key}';
export type ${pascalName}Role = 'owner' | 'manager' | 'viewer';

export interface ${pascalName}Auth extends Omit<ModuleAuth, 'moduleRole'> {
  role: ${pascalName}Role;
}

export async function require${pascalName}Member(
  req: NextRequest,
  orgId: string,
): Promise<${pascalName}Auth | { ok: false; res: NextResponse }> {
  const result = await requireModuleMember(req, orgId, MODULE_KEY);
  if (!result.ok) return result;
  return { ...result, role: result.moduleRole as ${pascalName}Role };
}

export function canWrite(role: ${pascalName}Role): boolean {
  return ['owner', 'manager'].includes(role);
}
`;

let orgSettingsInsertSql = '';
if (!isSpecific) {
  orgSettingsInsertSql = `
-- Enable for existing organizations by default
INSERT INTO org_module_settings (organization_id, module_key, is_enabled, allowed_roles)
SELECT id, '${key}', true, ARRAY['owner','admin','team_lead','team_member']::text[]
FROM organizations
ON CONFLICT (organization_id, module_key) DO NOTHING;`;
} else if (forOrgSlugs.length > 0) {
  orgSettingsInsertSql = `
-- Enable for specific organizations by default
INSERT INTO org_module_settings (organization_id, module_key, is_enabled, allowed_roles)
SELECT id, '${key}', true, ARRAY['owner','admin','team_lead','team_member']::text[]
FROM organizations
WHERE slug = ANY (ARRAY[${forOrgSlugs.map(s => `'${s}'`).join(', ')}]::text[])
ON CONFLICT (organization_id, module_key) DO NOTHING;`;
}

const sqlTemplate = `-- Initial migration for ${label} module (${key})
-- Created at: ${dateStr}

CREATE TABLE IF NOT EXISTS ${key}_records (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by uuid        NOT NULL REFERENCES profiles(id),
  title      text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE ${key}_records ENABLE ROW LEVEL SECURITY;

-- SELECT Policy: สมาชิกองค์กรสามารถดูข้อมูลได้ทุกคน
CREATE POLICY "${key}_records_select"
  ON ${key}_records FOR SELECT
  USING (is_org_member(org_id, auth.uid()));

-- WRITE Policy: ผู้ใช้ที่เป็น admin หรือเจ้าหน้าที่ที่เช็คสิทธิ์ผ่าน API layer
CREATE POLICY "${key}_records_write"
  ON ${key}_records FOR ALL
  USING (is_org_admin(org_id, auth.uid()));

-- สร้าง Index เพื่อความเร็วในการคิวรี่แยกองค์กร (Tenant Isolation Performance)
CREATE INDEX IF NOT EXISTS ${key}_records_org_id_idx ON ${key}_records(org_id);

-- ผูก Audit log trigger หากต้องการติดตามประวัติแก้ไข (Uncomment ด้านล่างเมื่อเปิดใช้)
-- CREATE TRIGGER ${key}_records_audit
--   AFTER INSERT OR UPDATE OR DELETE ON ${key}_records
--   FOR EACH ROW EXECUTE FUNCTION fn_audit_log_changes();

-- Register module in module_registry
INSERT INTO module_registry (key, label, href_slug, description, is_specific, is_builtin, is_active, sort_order)
VALUES ('${key}', '${label}', '${slug}', 'โมดูลการทำงานเฉพาะองค์กร ${label}', ${isSpecific}, false, true, 100)
ON CONFLICT (key) DO NOTHING;

${orgSettingsInsertSql}
`;

// ─────────────────────────────────────────────────────────────────────────────
// Write files
// ─────────────────────────────────────────────────────────────────────────────

try {
  // Ensure directories exist
  fs.mkdirSync(pageDir, { recursive: true });
  fs.mkdirSync(apiDir, { recursive: true });
  fs.mkdirSync(migrationDir, { recursive: true });

  // Write template files
  fs.writeFileSync(pagePath, pageTemplate, 'utf8');
  fs.writeFileSync(apiRoutePath, apiRouteTemplate, 'utf8');
  fs.writeFileSync(apiLibPath, apiLibTemplate, 'utf8');
  fs.writeFileSync(migrationPath, sqlTemplate, 'utf8');

  // ─── Automating code registration ───
  console.log('Modifying apps/perpos/src/lib/modules.ts...');
  const modulesFilePath = path.join(rootDir, 'apps', 'perpos', 'src', 'lib', 'modules.ts');
  let modulesContent = fs.readFileSync(modulesFilePath, 'utf8');

  // 1. Insert into ALL_MODULES
  const allModulesPattern = /\];\s*\n\nexport const ALL_MODULE_KEYS/m;
  const allModulesReplacement = `  {
    key: "${key}",
    label: "${label}",
    href: "/${slug}",
    specific: ${isSpecific},
    ${forOrgSlugs.length > 0 ? `forOrgSlugs: [${forOrgSlugs.map(s => `"${s}"`).join(', ')}],` : ''}
    match: (p) => {
      const seg = p.split("/").filter(Boolean);
      return seg.length >= 2 && seg[1] === "${slug}";
    },
    roles: [
      { key: "owner",   label: "Owner",   canWrite: true  },
      { key: "manager", label: "Manager", canWrite: true  },
      { key: "viewer",  label: "Viewer",  canWrite: false },
    ],
  },
];

export const ALL_MODULE_KEYS`;

  if (modulesContent.includes(`key: "${key}"`)) {
    console.log(`⚠️ Module "${key}" already registered in ALL_MODULES.`);
  } else {
    modulesContent = modulesContent.replace(allModulesPattern, allModulesReplacement);
  }

  // 2. Insert into MODULE_MENUS
  const moduleMenusPattern = /\};\s*\n\nexport const MODULE_LABELS/m;
  const moduleMenusReplacement = `  ${key}: [
    { key: "dashboard", label: "Dashboard" },
  ],
};

export const MODULE_LABELS`;

  if (modulesContent.includes(`${key}: [`)) {
    console.log(`⚠️ Module "${key}" already has menu definition in MODULE_MENUS.`);
  } else {
    modulesContent = modulesContent.replace(moduleMenusPattern, moduleMenusReplacement);
  }

  fs.writeFileSync(modulesFilePath, modulesContent, 'utf8');
  console.log('✅ apps/perpos/src/lib/modules.ts updated.');

  console.log('Modifying apps/perpos/src/layouts/hydrogen/menu-items.tsx...');
  const menuItemsRealFilePath = path.join(rootDir, 'apps', 'perpos', 'src', 'layouts', 'hydrogen', 'menu-items.tsx');
  let menuItemsContent = fs.readFileSync(menuItemsRealFilePath, 'utf8');

  // 1. Add builder function before "// ─── Context picker"
  const builderFunction = `function build${pascalName}MenuItems(org: string, labels: Record<string, string> = {}): MenuItem[] {
  const l = (key: string, fallback: string) => labels[key] || fallback;
  return [
    { name: "${label}" },
    { name: l("dashboard", "Dashboard"), href: \`/\${org}/${slug}\`, icon: <LayoutDashboard className="h-5 w-5" /> },
  ];
}

\n`;

  if (menuItemsContent.includes(`function build${pascalName}MenuItems`)) {
    console.log(`⚠️ Menu builder for "${pascalName}" already exists.`);
  } else {
    const contextPickerPattern = /\/\/ ─── Context picker/m;
    menuItemsContent = menuItemsContent.replace(contextPickerPattern, `${builderFunction}// ─── Context picker`);
  }

  // 2. Add path segment check in pickMenuContext
  const contextPattern = /if\s*\(mod\s*===\s*"accounting"\)/;
  const contextReplacement = `if (mod === "${slug}") return "${key}";\n    if (mod === "accounting")`;
  if (menuItemsContent.includes(`if (mod === "${slug}")`)) {
    console.log(`⚠️ Route picker context for "${slug}" already exists.`);
  } else {
    menuItemsContent = menuItemsContent.replace(contextPattern, contextReplacement);
  }

  // 3. Add context mapping in getMenuItems
  const menuItemsPattern = /buildUserMenuItems\(org,\s*menuLabels\.accounting\s*\?\?\s*\{\}\);/;
  const menuItemsReplacement = `context === "${key}" ? build${pascalName}MenuItems(org, menuLabels.${key} ?? {}) :\n    buildUserMenuItems(org, menuLabels.accounting ?? {});`;
  if (menuItemsContent.includes(`context === "${key}"`)) {
    console.log(`⚠️ Menu items rendering for "${key}" already exists.`);
  } else {
    menuItemsContent = menuItemsContent.replace(menuItemsPattern, menuItemsReplacement);
  }

  fs.writeFileSync(menuItemsRealFilePath, menuItemsContent, 'utf8');
  console.log('✅ apps/perpos/src/layouts/hydrogen/menu-items.tsx updated.');

  // ─── Automating DB Migration ───
  try {
    console.log('Applying database migration on remote Supabase database...');
    execSync(`supabase db query --linked -f "${migrationPath}"`, { stdio: 'inherit' });
    console.log('✅ Remote Supabase database migration applied successfully!');
  } catch (dbErr) {
    console.warn('⚠️ Warning: Failed to apply database migration via Supabase CLI. You may need to run it manually.');
  }

  console.log(`
✅ สร้างไฟล์โครงสร้างโมดูล "${label}" และเปิดใช้งานในระบบเรียบร้อยแล้ว!

📂 ไฟล์ที่ถูกสร้าง:
  1. Frontend Page : apps/perpos/src/app/(hydrogen)/[orgSlug]/${slug}/page.tsx
  2. API Route     : apps/perpos/src/app/api/${slug}/route.ts
  3. API Lib Helper: apps/perpos/src/app/api/${slug}/_lib.ts
  4. DB Migration  : supabase/migrations/${timestamp}_init_${key}.sql

👉 ขั้นตอนการเปิดใช้งานโมดูลในระบบต่อ:

1. ลงทะเบียนโมดูลใน "apps/perpos/src/lib/modules.ts"
   เพิ่มข้อมูลนี้ในอาเรย์ ALL_MODULES:

   {
     key: "${key}",
     label: "${label}",
     href: "/${slug}",
     specific: ${isSpecific},
     match: (p) => {
       const seg = p.split("/").filter(Boolean);
       return seg.length >= 2 && seg[1] === "${slug}";
     },
     roles: [
       { key: "owner",   label: "Owner",   canWrite: true  },
       { key: "manager", label: "Manager", canWrite: true  },
       { key: "viewer",  label: "Viewer",  canWrite: false },
     ],
   },

   และเพิ่ม menus ใน MODULE_MENUS:

   ${key}: [
     { key: "dashboard", label: "Dashboard" },
   ],

2. เพิ่ม Menu Items ใน "apps/perpos/src/layouts/hydrogen/menu-items.tsx"
   สร้างฟังก์ชันเมนูด้านซ้าย:

   function build${pascalName}MenuItems(org: string): MenuItem[] {
     const p = (path: string) => \`/\${org}/${slug}/\${path}\`;
     return [
       { name: "${label}" },
       { name: "Dashboard", href: \`/\${org}/${slug}\`, icon: <LayoutGrid className="h-5 w-5" /> },
     ];
   }

   และเรียกใช้ใน buildMenuItems() / getMenuItems() สลับเมนู:
   
   case "${slug}": return build${pascalName}MenuItems(org ?? "");

   และใน pickMenuContext():
   
   if (mod === "${slug}") return "${key}";

3. ทำการ Migrate Database:
   รันคำสั่ง: pnpm supabase db push หรือรัน SQL ในไฟล์ migrations ใน Supabase SQL editor
`);

} catch (err) {
  console.error('❌ เกิดข้อผิดพลาดในการเขียนไฟล์:', err.message);
  process.exit(1);
}
