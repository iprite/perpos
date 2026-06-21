# คัมภีร์: แปลงหน้าเป็น Server Component (ลดอาการหน้าโหลดหน่วง)

> เป้าหมาย: ตัด client-fetch waterfall (`getSession` → `fetch /api` → render) ออก ให้ข้อมูลมากับ
> SSR HTML เลย · ทำเฉพาะหน้าที่**คุ้ม** — ไม่ sweep ทั้งแอป

## เมื่อไหร่ควรแปลง (และเมื่อไหร่ไม่)

| หน้าแบบ                                                   | ทำ               | ท่า                                                                                        |
| --------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------ |
| **display ล้วน** (dashboard, รายงาน, list อ่านอย่างเดียว) | ✅ คุ้มสุด       | full server                                                                                |
| **list + filter/pagination**                              | ✅               | searchParams-driven                                                                        |
| **display + live refresh (poll)**                         | ✅               | hybrid (server initial + client poll)                                                      |
| **CRUD หนัก** (create/edit/delete + dialog เยอะ)          | ⚠️ opportunistic | hybrid — แต่ client view กินพื้นที่ส่วนใหญ่อยู่ดี, gain น้อย ทำตอน touch โมดูลนั้นอยู่แล้ว |
| **ping/health สด, งานนับวินาที**                          | ❌ คง client     | SSR จะ block รอ network                                                                    |

> หมายเหตุ: `loading.tsx` (skeleton ตอน navigate) + AuthGuard ไม่บล็อก shell — **ครอบทุกหน้าอยู่แล้ว**
> ไม่ว่า server/client. การแปลงเป็น server แค่ "ขัดเงา" ตัด fetch แรกเพิ่ม

## โครงมาตรฐาน 3 ไฟล์

1. **แยก logic** → `lib/<area>/<x>.ts` — `compute…(client, opts)` รับ supabase client คืน data + export type
   (auth/role check เป็นหน้าที่ caller · เผื่อ reuse กับ route เดิม)
2. **page.tsx** → `async` server component: guard → fetch ตรง → render
3. **API route** → ลบถ้าไม่มี caller เหลือ · **คงไว้**ถ้า client view ยัง poll/refresh

## Auth — เลือก guard ให้ตรงโมเดล (สำคัญต่อความปลอดภัย)

มี **2 โมเดล** ในแอปนี้ — ใช้ผิด = data leak:

### A. Admin (super_admin) → service-role client (bypass RLS)

```ts
// lib/admin/guard.ts
const admin = await requireSuperAdminPage(); // getUser + role==='super_admin' → คืน admin client
const data = await computeX(admin);
```

ใช้กับหน้า `/admin/*` ที่ดูข้อมูลข้าม org ทั้งระบบ

### B. Per-org module member → RLS-scoped client (createSupabaseServerClient)

โมดูล B2B (tmc/crm/acc_firm/…) ใช้ **member + RLS** ไม่ใช่ super_admin:

```ts
// lib/<module>/guard.ts (server version ของ requireModuleMember)
const { rls, role } = await requireModuleMemberPage(orgId, "tmc"); // คืน server client (RLS ตาม session)
const data = await computeTmcDashboard(rls, range);
```

- `createSupabaseServerClient()` (cookie session) = RLS-scoped เทียบเท่า `createAuthedClient(token)` ฝั่ง API
- **ห้ามใช้ admin client (service role) กับข้อมูล per-org** — RLS จะถูก bypass → เห็นข้าม org
- ต้นแบบ: [`lib/tmc/guard.ts`](../apps/perpos/src/lib/tmc/guard.ts) + [`(hydrogen)/[orgSlug]/tmc/page.tsx`](<../apps/perpos/src/app/(hydrogen)/[orgSlug]/tmc/page.tsx>)

## ท่า searchParams (filter/pagination)

```tsx
export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const sp = await searchParams; // Next 15: searchParams เป็น Promise
  const data = await getX(client, { page: Number(sp.page ?? 1) });
  // ปุ่ม/filter = <Link href="?page=2"> หรือ client component เล็ก ๆ router.push(?…)
}
```

filter ที่ต้อง onChange (CustomSelect) → แยก client component จิ๋ว (`_filter.tsx`) push URL → server re-render
(loading.tsx โผล่ skeleton ระหว่างนั้น) · ต้นแบบ: [`admin/admin-audit/_filter.tsx`](<../apps/perpos/src/app/(hydrogen)/admin/admin-audit/_filter.tsx>)

## ท่า hybrid (poll / chart / interactive)

```tsx
// page.tsx (server) — ดึง initial
return <XView initialData={data} />;
// _view.tsx (client) — useState(initialData) + poll/chart/expand · ไม่มี waterfall โหลดรอบแรก
```

ต้นแบบ: [`admin/scheduler/_view.tsx`](<../apps/perpos/src/app/(hydrogen)/admin/scheduler/_view.tsx>) (poll),
[`admin/health/_view.tsx`](<../apps/perpos/src/app/(hydrogen)/admin/health/_view.tsx>) (filter+expand+poll),
[`admin/stt-cost/_view.tsx`](<../apps/perpos/src/app/(hydrogen)/admin/stt-cost/_view.tsx>) (chart+calc)

## กับดักที่เจอแล้ว (อย่าพลาดซ้ำ)

- **`<TableRow>` ใน server component** — ก่อนหน้านี้ `TableRow` แนบ `onKeyDown` เสมอ → RSC serialize ไม่ได้
  (แก้แล้วใน [table.tsx](../apps/perpos/src/components/ui/table.tsx) — แนบเฉพาะ row ที่ `clickable`/`onClick`).
  row ที่คลิกได้ยังต้องอยู่ใน client component
- **error handling** — server component ที่ throw จะเด้ง `error.tsx` (เพิ่ม error boundary ต่อ segment เช่น
  [`admin/error.tsx`](<../apps/perpos/src/app/(hydrogen)/admin/error.tsx>)) — ไม่ใช่ inline error เหมือน client
- **`searchParams`/`params` เป็น Promise** ใน Next 15 — ต้อง `await`
- **import ค่า (ไม่ใช่ component) จากไฟล์ `'use client'`** เข้า server component ได้ (เช่น `WIDTH_CLASS`) — ไม่ทำให้ทั้งไฟล์เป็น client
- **ลบ route แล้ว** ให้ `rm -rf .next/types/app/api/<path>` กัน tsc fail จาก generated type ค้าง

## Checklist

- [ ] `tsc --noEmit` = 0 · `pnpm lint` clean
- [ ] เลือก guard ถูกโมเดล (admin service-role **หรือ** member RLS)
- [ ] หน้า render เหมือนเดิม (เทียบ screenshot) + ไม่มี client fetch เดิมหลัง SSR (เช็ค network)
- [ ] route ที่ไม่มี caller → ลบ · ที่ยัง poll → คงไว้
