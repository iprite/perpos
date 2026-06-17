# PERPOS Design System

> ระบบ ERP/บัญชี SME ไทย — สวยงาม ใช้งานง่าย แม่นยำสูง
>
> แรงบันดาลใจ: **Stripe** (ข้อมูลการเงิน, ตัวเลข) · **Linear** (SaaS dashboard, ความสะอาด) · **Emil Kowalski** (animation, ความละเอียดที่มองไม่เห็น)

---

## 1. Philosophy — ทำไม Design ถึงสำคัญกับ ERP?

ผู้ใช้งานระบบบัญชีเปิดหน้านี้วันละ 5–8 ชั่วโมง ทุกมิลลิวินาทีที่รู้สึก "ฝืด" สะสมเป็นความเครียด ทุกตัวเลขที่อ่านยากสะสมเป็นความผิดพลาด

**กฎ 3 ข้อ:**
1. **ตัวเลขต้องอ่านได้ในวิสายตาเดียว** — tabular figures, alignment, สีบ่งบอกสถานะ
2. **Interface ต้องรู้สึกเร็ว** — animation ไม่ได้ทำให้ดูดี มันทำให้รู้สึกว่า software ตอบสนอง
3. **สิ่งที่ไม่สำคัญต้องหายไป** — negative space คือ feature ไม่ใช่ waste

---

## 2. Color — สี

### Core Palette

| Token | Value | ใช้ที่ไหน |
|-------|-------|---------|
| `primary` | `#533afd` (indigo) | ปุ่ม primary, link, active state |
| `primary-hover` | `#4429e0` | hover ของ primary |
| `canvas` | `#ffffff` | พื้นหลังหน้า |
| `surface` | `#f9fafb` (gray-50) | card, panel |
| `surface-2` | `#f3f4f6` (gray-100) | hover row, nested container |
| `surface-3` | `#e5e7eb` (gray-200) | border, divider |
| `ink` | `#111827` (gray-900) | text หลัก |
| `ink-secondary` | `#6b7280` (gray-500) | label, placeholder, secondary text |
| `ink-muted` | `#9ca3af` (gray-400) | disabled text, empty state |

### Semantic — Financial Status

| Token | Value | ใช้กับ |
|-------|-------|-------|
| `positive` | `#16a34a` (green-600) | รายรับ, กำไร, ยอดบวก |
| `positive-bg` | `#f0fdf4` (green-50) | badge พื้นหลัง รายรับ |
| `negative` | `#dc2626` (red-600) | รายจ่าย, ขาดทุน, ยอดลบ |
| `negative-bg` | `#fef2f2` (red-50) | badge พื้นหลัง รายจ่าย |
| `warning` | `#d97706` (amber-600) | รอดำเนินการ, ใกล้ครบกำหนด |
| `warning-bg` | `#fffbeb` (amber-50) | badge warning |
| `neutral` | `#6b7280` (gray-500) | สถานะ neutral, ยกเลิก |

### กฎการใช้สี
- **ห้ามใช้สีแดง** กับอะไรที่ไม่ใช่ "ผิดพลาด" หรือ "ยอดลบ" — ผู้ใช้จะตกใจ
- ยอดเงินลบให้แสดง `text-red-600` + ขึ้นต้นด้วย `−` (U+2212 minus sign) ไม่ใช่ hyphen
- ยอดเงินบวกที่สำคัญ (เช่น กำไรสุทธิ) ให้ใช้ `text-green-600`
- Badge สถานะ: ใช้ `bg-{color}-50 text-{color}-700 border border-{color}-200`

---

## 3. Typography — ตัวอักษร

### Scale

```css
/* Thai + system font stack */
font-family: 'Sarabun', 'Noto Sans Thai', ui-sans-serif, system-ui, sans-serif;
```

| Use case | Class | Size | Weight |
|----------|-------|------|--------|
| Page title | `text-2xl font-semibold` | 24px | 600 |
| Section header | `text-lg font-semibold` | 18px | 600 |
| Card title | `text-base font-medium` | 16px | 500 |
| Body | `text-sm` | 14px | 400 |
| Label / caption | `text-xs` | 12px | 400–500 |
| Table header | `text-xs font-medium uppercase tracking-wide` | 12px | 500 |

### Financial Figures — กฎสำคัญที่สุด

ตัวเลขการเงินทุกตัวต้อง **tabular figures + right-aligned**:

```tsx
// ✅ ถูกต้อง — tabular figures กันตัวเลขขยับ
<span className="font-mono tabular-nums text-right">
  {formatAmount(amount)}
</span>

// หรือใช้ CSS class
.financial-figure {
  font-variant-numeric: tabular-nums;
  text-align: right;
  font-family: ui-monospace, 'SF Mono', 'Fira Code', monospace;
}

// ❌ ผิด — proportional figures ทำให้คอลัมน์ตัวเลขไม่ตรงกัน
<span className="text-right">1,234.56</span>
```

### Number Formatting (Thai context)

```typescript
// formatter มาตรฐาน PERPOS
export function formatAmount(
  value: number,
  opts?: { currency?: boolean; decimals?: number }
): string {
  const decimals = opts?.decimals ?? 2;
  const formatted = new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Math.abs(value));

  const prefix = value < 0 ? '−' : ''; // U+2212 not hyphen
  const suffix = opts?.currency ? ' ฿' : '';
  return `${prefix}${formatted}${suffix}`;
}

// ตัวอย่างผลลัพธ์:
// formatAmount(1234567.89, { currency: true }) → "1,234,567.89 ฿"
// formatAmount(-50000) → "−50,000.00"
```

---

## 4. Layout — โครงสร้างหน้า

### PageShell — เปลือกหน้ามาตรฐาน (บังคับใช้ทุกหน้าใหม่)

> **กฎ**: ทุกหน้าใน `(hydrogen)/*` (admin · ผู้ช่วย AI · ERP/biz) ต้องห่อด้วย `<PageShell>` จาก `@/components/ui/page-shell` — ห้ามเขียน container width / header / padding เอง

`HydrogenLayout` ใส่ padding รอบนอกให้แล้ว (`px-4 md:px-5 lg:px-6`) — หน้าลูก **ห้าม** ใส่ `px-6 py-6` / `p-4 md:p-6` ซ้ำ (double padding) ให้ `<PageShell>` คุม container + header + spacing แทน

```tsx
import { PageShell, PageCard } from '@/components/ui/page-shell';

<PageShell
  title="เงินเดือน"
  description="จัดการรอบจ่ายและสลิปพนักงาน"
  icon={<Wallet className="h-6 w-6" />}
  actions={<Button>เพิ่มรอบจ่าย</Button>}   // optional, ชิดขวา
  width="default"                            // narrow | default | wide | full
  tabs={<TabNav/>}                           // optional, แถบแท็บใต้ header
>
  <PageCard title="รายการ">...</PageCard>
</PageShell>
```

- หัวข้อหน้า = `<h1>` ใน PageShell อยู่แล้ว (`text-2xl font-semibold text-gray-900`) — **อย่าเขียน `<h1>`/`text-xl font-bold` เอง** และอย่าใช้ `text-slate-900`
- `admin` import `AdminPage`/`AdminCard` ได้เหมือนเดิม (เป็น alias ของ `PageShell`/`PageCard`)

### Dashboard Page Template

```
┌─────────────────────────────────────────────────────┐
│ Page Header: Title + [Action buttons top-right]      │  h-14, border-b
├───────────┬─────────────────────────────────────────┤
│ Sidebar   │ Content Area                             │
│ (shared)  │  ┌─ Filter Bar ──────────────────────┐   │
│           │  │ [Search] [Select] [DatePicker] [+] │  │  h-12, bg-surface
│           │  └────────────────────────────────────┘  │
│           │  ┌─ Main Content ─────────────────────┐  │
│           │  │ Table / Cards / Form               │  │
│           │  └────────────────────────────────────┘  │
└───────────┴─────────────────────────────────────────┘
```

### Spacing System

```
gap-1  = 4px   — inline icon gap
gap-2  = 8px   — tight group (label+input)
gap-3  = 12px  — form row gap
gap-4  = 16px  — section gap
gap-6  = 24px  — card padding
gap-8  = 32px  — page section separation
```

**กฎ:**
- Page padding: `px-6 py-4` (desktop), `px-4 py-3` (mobile)
- Card padding: `p-6`
- Table cell: `px-4 py-3`
- Form group: `space-y-4`

---

## 5. Data Tables — ตารางข้อมูล

ตารางคือหัวใจของ ERP ต้องอ่านเร็ว อ่านถูก:

### กฎบังคับ — Standard DataTable

> **ห้ามเขียน raw `<table>` หรือ CSS-grid ปลอมเป็นตารางเด็ดขาด** — ทุกตารางต้องใช้ primitives จาก `@/components/ui/table`

```tsx
import {
  Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell,
  TableEmpty, TableLoading,
} from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/badge';

<Table stickyHeader maxHeight="70vh">
  <TableHeader sticky>
    <TableRow>
      <TableHead>รายการ</TableHead>
      <TableHead align="center">สถานะ</TableHead>
      <TableHead align="right">จำนวนเงิน</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    {loading ? (
      <TableLoading colSpan={3} />
    ) : rows.length === 0 ? (
      <TableEmpty colSpan={3}>ยังไม่มีข้อมูล</TableEmpty>
    ) : rows.map((r) => (
      <TableRow key={r.id} clickable onClick={() => openDetail(r)}>
        <TableCell>{r.name}</TableCell>
        <TableCell align="center"><StatusBadge tone="success">สำเร็จ</StatusBadge></TableCell>
        <TableCell align="right" tabular>{fmt(r.amount)}</TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>
```

**กฎเหล็ก:**
1. **เลื่อนซ้าย-ขวาได้ ไม่บีบคอลัมน์** — cell default `whitespace-nowrap` แล้ว wrapper scroll เอง · ห้ามตั้ง fixed `grid-cols-[px]` · cell ข้อความยาว (JSON/note) ใช้ `<TableCell wrap>` เป็น escape hatch
2. **Badge ไม่ wrap** — ใช้ `<StatusBadge tone=…>` เท่านั้น (มี `whitespace-nowrap` ในตัว) ห้ามเขียน `<span className="…rounded-full…">` มือ
3. **คลิกที่ row เพื่อดู/แก้ไข** — `<TableRow clickable onClick>` เปิด detail/edit dialog · **ไม่มีคอลัมน์ปุ่ม action ในแถว** · ปุ่มลบ/แก้ย้ายไปไว้ใน footer ของ dialog
4. คอลัมน์เงิน/จำนวน → `align="right" tabular` เสมอ
5. empty/loading → `<TableEmpty>` / `<TableLoading>` (ห้าม spinner กลางจอ)
6. **`<Table>` ใน grid/flex column ต้องให้คอลัมน์ยุบได้** — ถ้าวาง `<Table>` (หรือของกว้างอื่น) ไว้ใน grid/flex item (เช่น 2-column workspace `lg:grid-cols-12` + `col-span-*`) คอลัมน์นั้น **ต้องมี `min-w-0` หรือ `overflow-hidden/auto`** ไม่งั้นบนมือถือ (ยุบเหลือคอลัมน์เดียว) ความกว้างตารางจะดัน track ให้กว้างเกิน viewport → ทั้งหน้า scroll แนวนอน. สาเหตุ: grid/flex item ค่า default `min-width: auto` ยุบต่ำกว่า content ไม่ได้ — การตั้ง `min-w-0` (หรือ `overflow≠visible` ที่ทำให้ auto min-size = 0) แก้ได้. **ข้อยกเว้น**: table ที่วางตรงใน `PageShell`/`PageCard` (block เต็มแถว) ไม่ต้องทำอะไร — block ไม่มีปัญหานี้

ตัวอย่าง structure ดิบ (อ้างอิงเท่านั้น — โค้ดจริงใช้ primitives ด้านบน):

```tsx
// Structure
<table className="w-full text-sm">
  <thead>
    <tr className="border-b border-surface-3 bg-surface">
      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-ink-secondary">
        รายการ
      </th>
      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-ink-secondary">
        จำนวนเงิน
      </th>
    </tr>
  </thead>
  <tbody className="divide-y divide-surface-3">
    <tr className="hover:bg-surface-2 transition-colors duration-150">
      <td className="px-4 py-3 text-ink">ชื่อรายการ</td>
      <td className="px-4 py-3 text-right font-mono tabular-nums">1,234.56</td>
    </tr>
  </tbody>
  <tfoot>
    {/* ยอดรวมล่างสุด — border-t-2 เพื่อแยกชัด */}
    <tr className="border-t-2 border-surface-3 bg-surface font-semibold">
      <td className="px-4 py-3">รวม</td>
      <td className="px-4 py-3 text-right font-mono tabular-nums">10,000.00</td>
    </tr>
  </tfoot>
</table>
```

### Column Alignment Rules

| Column type | Alignment | Class |
|-------------|-----------|-------|
| Text (ชื่อ, รายการ) | Left | `text-left` |
| Number (ยอดเงิน, จำนวน) | **Right** | `text-right tabular-nums` |
| Date | Center หรือ Left | `text-center` |
| Status badge | Center | `text-center` |
| Actions | Right | `text-right` |

### Row Hover
```css
/* ✅ เสมอ — ผู้ใช้ต้องรู้ว่า row ไหนกำลัง hover */
.row { @apply hover:bg-gray-50 transition-colors duration-150; }
```

---

## 6. Status Badges — ป้ายสถานะ

```tsx
// Base pattern
<span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium
  border border-{color}-200 bg-{color}-50 text-{color}-700">
  สถานะ
</span>

// Presets
const statusBadge = {
  draft:       'bg-gray-50 text-gray-700 border-gray-200',
  pending:     'bg-amber-50 text-amber-700 border-amber-200',
  processing:  'bg-blue-50 text-blue-700 border-blue-200',
  completed:   'bg-green-50 text-green-700 border-green-200',
  posted:      'bg-emerald-50 text-emerald-700 border-emerald-200',
  failed:      'bg-red-50 text-red-700 border-red-200',
  cancelled:   'bg-gray-50 text-gray-500 border-gray-200',
  void:        'bg-gray-50 text-gray-400 border-gray-100',
  overdue:     'bg-red-50 text-red-700 border-red-200',
};
```

---

## 7. Forms — แบบฟอร์ม

### Layout Pattern
```tsx
// Single column (modal/drawer)
<div className="space-y-4">
  <div>
    <Label htmlFor="name">ชื่อ *</Label>
    <Input id="name" placeholder="กรอกชื่อ" className="mt-1" />
  </div>
</div>

// Two column (full page form)
<div className="grid grid-cols-2 gap-4">
  <div>...</div>
  <div>...</div>
</div>

// Group คำอธิบาย
<p className="text-xs text-ink-secondary mt-1">คำอธิบาย</p>
```

### Validation State
```tsx
// Error
<Input className="border-red-500 focus:ring-red-500" />
<p className="text-xs text-red-600 mt-1">ข้อความ error</p>

// Success (เฉพาะกรณีสำคัญ)
<Input className="border-green-500" />
```

### Journal Entry Form (เฉพาะบัญชี)
- แสดง Dr/Cr เป็น 2 คอลัมน์ separate — อย่า merge เป็น ±
- ยอด Dr ทั้งหมด = ยอด Cr ทั้งหมด → show balance indicator
- ถ้า unbalanced → ปุ่ม submit disabled + banner แดง "ยอดไม่สมดุล"

---

## 8. Empty States

```tsx
// Pattern มาตรฐาน
<div className="flex flex-col items-center justify-center py-16 text-center">
  <div className="mb-4 rounded-full bg-surface-2 p-4">
    <IconName className="h-8 w-8 text-ink-muted" />
  </div>
  <h3 className="text-sm font-medium text-ink">ยังไม่มีข้อมูล</h3>
  <p className="mt-1 text-sm text-ink-secondary">
    คำอธิบายสั้นๆ ว่าต้องทำอะไร
  </p>
  <Button className="mt-4" size="sm">
    + เพิ่มรายการแรก
  </Button>
</div>
```

**กฎ:**
- ต้องมี icon ที่ relate กับ content
- ต้องมี CTA (Call to Action) ชัดเจน — อย่าปล่อยให้ user ไม่รู้จะทำอะไร
- ข้อความอธิบายต้องบอกว่า "ต้องทำอะไร" ไม่ใช่แค่ "ไม่มีข้อมูล"

---

## 9. Loading States

### Skeleton (ดีที่สุดสำหรับ table/list)
```tsx
// ใช้ Skeleton component แทน spinner สำหรับ content areas
<div className="animate-pulse space-y-3">
  {[...Array(5)].map((_, i) => (
    <div key={i} className="h-12 rounded bg-surface-2" />
  ))}
</div>
```

### Spinner (เฉพาะ action/mutation)
```tsx
// ปุ่มกำลังโหลด — ไม่มี isLoading prop ใน Button, ใช้ text แทน
<Button disabled={loading}>
  {loading ? 'กำลังบันทึก…' : 'บันทึก'}
</Button>

// ถ้าต้องการ spinner icon
<Button disabled={loading}>
  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
  บันทึก
</Button>
```

**กฎ:**
- **Skeleton** — ใช้กับ initial page load / list / table
- **Spinner** — ใช้กับ user-triggered action (save, submit, delete)
- ห้ามแสดง blank ขาวๆ ระหว่าง load

---

## 10. Animation — ดู `@SKILL:design-engineering`

ดูรายละเอียดในไฟล์ `.claude/skills/design-engineering.md`

**สรุปสำหรับ PERPOS:**

```css
/* ตัวแปร animation มาตรฐาน */
:root {
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  --ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
}

/* Dialog/Modal */
.dialog-content {
  animation: dialogEnter 250ms var(--ease-out);
}
@keyframes dialogEnter {
  from { opacity: 0; transform: scale(0.96) translateY(-8px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}

/* Dropdown / Select */
.dropdown {
  animation: dropdownEnter 180ms var(--ease-out);
  transform-origin: var(--radix-popover-content-transform-origin);
}
@keyframes dropdownEnter {
  from { opacity: 0; transform: scale(0.96); }
  to   { opacity: 1; transform: scale(1); }
}

/* Row เพิ่มใหม่ */
.new-row {
  animation: rowEnter 200ms var(--ease-out);
}
@keyframes rowEnter {
  from { opacity: 0; transform: translateX(-8px); }
  to   { opacity: 1; transform: translateX(0); }
}
```

**กฎ PERPOS-specific:**
- ตาราง: hover transition `150ms` เท่านั้น — เร็วที่สุด ใช้ทั้งวัน
- Modal: `250ms` — ไม่ต่ำกว่า (user ต้อง read context)
- Toast: enter `300ms ease-out`, exit `200ms ease-in`
- ปุ่มทุกปุ่ม: `:active { transform: scale(0.97); transition: 120ms ease-out; }`

---

## 11. Financial Dashboard Patterns — จาก Stripe

### KPI Cards (Metric tiles)

```tsx
<div className="rounded-lg border border-surface-3 bg-white p-6">
  <div className="flex items-center justify-between">
    <p className="text-sm font-medium text-ink-secondary">รายรับเดือนนี้</p>
    <TrendingUpIcon className="h-4 w-4 text-green-500" />
  </div>
  {/* ตัวเลขใหญ่ — tabular, right-aligned ถ้ามีหลายตัว */}
  <p className="mt-2 text-3xl font-semibold tabular-nums text-ink">
    ฿1,234,567
  </p>
  {/* Delta */}
  <p className="mt-1 text-xs text-green-600">
    +12.5% จากเดือนที่แล้ว
  </p>
</div>
```

**กฎ KPI:**
- ตัวเลข KPI ใช้ `text-2xl` หรือ `text-3xl` — ใหญ่พอเห็นจากมุมห้อง
- Delta สีเขียวถ้าบวก, สีแดงถ้าลบ — ใช้ U+2212 สำหรับ minus
- Icon ควร reflect ความหมาย (trending up/down, wallet, receipt)

### Chart Colors (sequential)

ถ้าต้องใช้ chart ใน PERPOS ใช้ sequential palette นี้:
```
primary series:  #533afd
series 2:        #818cf8 (indigo-400)
series 3:        #a5b4fc (indigo-300)
positive series: #16a34a
negative series: #dc2626
neutral:         #9ca3af
```

---

## 12. Micro-interactions — สิ่งที่มองไม่เห็น แต่รู้สึกได้

### Copy to clipboard
```tsx
const [copied, setCopied] = useState(false);
// ... copy logic ...
setCopied(true);
setTimeout(() => setCopied(false), 2000);

// UI: icon เปลี่ยนจาก Copy → Check เป็นเวลา 2 วิ
{copied ? <CheckIcon className="h-4 w-4 text-green-500" /> : <CopyIcon className="h-4 w-4" />}
```

### Row delete confirmation
```tsx
// สองขั้นตอน: คลิกครั้งแรก → ยืนยัน (สีเปลี่ยนเป็นแดง); คลิกอีกครั้ง → ลบ
// หรือใช้ AlertDialog สำหรับข้อมูลสำคัญ
```

### Form auto-save indicator
```tsx
// แสดง "บันทึกอัตโนมัติแล้ว" เล็กๆ ตรงมุม — ไม่ใช่ toast เพราะ noisy เกินไป
<span className={cn(
  "text-xs transition-opacity duration-300",
  saved ? "opacity-100 text-green-600" : "opacity-0"
)}>
  ✓ บันทึกแล้ว
</span>
```

---

## 13. Dialog / Popup Standard — มาตรฐาน Popup บังคับใช้ทั้งระบบ

> **กฎเด็ดขาด**: ทุก Dialog ใน PERPOS ต้องใช้โครงสร้างนี้เท่านั้น — ห้ามเขียน `max-h`, `overflow-y-auto`, หรือ padding บน `DialogContent` โดยตรง

### โครงสร้างบังคับ

```tsx
import {
  Dialog, DialogContent, DialogBody, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';

<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent size="lg">
    <DialogHeader>
      <DialogTitle>หัวข้อ</DialogTitle>
    </DialogHeader>
    <DialogBody>
      {/* เนื้อหา/ฟอร์ม — ส่วนเดียวที่ scroll */}
    </DialogBody>
    <DialogFooter>
      <Button variant="outline" onClick={() => setOpen(false)}>ยกเลิก</Button>
      <Button onClick={handleSave}>บันทึก</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### กลไก Sticky Header/Footer
`DialogContent` = `flex flex-col max-h-[85vh] overflow-hidden` → header/footer `shrink-0` จึง pinned อัตโนมัติ มีเฉพาะ `DialogBody` ที่ `flex-1 overflow-y-auto` — ไม่ต้องใช้ `position:sticky`

### Width Scale (prop `size`, default `lg`)

| size | max-w | ใช้กับ |
|------|-------|--------|
| `sm` | `max-w-sm` | ยืนยันลบ / ข้อความสั้น |
| `md` | `max-w-md` | ฟอร์มสั้น 1 คอลัมน์ |
| `lg` | `max-w-lg` | ฟอร์มมาตรฐาน (default) |
| `xl` | `max-w-2xl` | ฟอร์ม 2 คอลัมน์ / detail |
| `2xl` | `max-w-3xl` | ตาราง/เนื้อหากว้าง |
| `3xl` | `max-w-4xl` | กว้างพิเศษ |
| `full` | `max-w-[95vw]` | viewer (OCR ฯลฯ) |

ทุก size บนมือถือ = `w-[calc(100vw-2rem)]` อัตโนมัติ

### Dialog ที่มีปุ่ม Destructive (ลบ/อันตราย)

```tsx
// ปุ่ม destructive ชิดซ้าย — ใช้ className="mr-auto" ภายใน DialogFooter
<DialogFooter>
  <Button variant="destructive" className="mr-auto" onClick={handleDelete}>
    ลบ
  </Button>
  <Button variant="outline" onClick={() => setOpen(false)}>ยกเลิก</Button>
  <Button onClick={handleSave}>บันทึก</Button>
</DialogFooter>
```

### Dialog ที่มี Form (form ต้องครอบ body+footer)

```tsx
<DialogContent size="lg">
  <DialogHeader>
    <DialogTitle>หัวข้อ</DialogTitle>
  </DialogHeader>
  <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
    <DialogBody>
      {/* form fields */}
    </DialogBody>
    <DialogFooter>
      <Button type="submit">บันทึก</Button>
    </DialogFooter>
  </form>
</DialogContent>
```

### Anti-patterns — ห้ามทำกับ Dialog

| Anti-pattern | ทำไม | ทำแทนด้วย |
|---|---|---|
| `<DialogContent className="max-h-[90vh] overflow-y-auto">` | scroll อยู่ใน `DialogBody` แล้ว | ลบ max-h/overflow ออก ใช้ `size` แทน |
| `<DialogContent className="p-6">` | padding อยู่ใน Header/Body/Footer แล้ว | ลบ p ออก ใช้ `size` แทน |
| ไม่มี `<DialogBody>` | dialog จะไม่มี padding และ scroll ไม่ทำงาน | ห่อเนื้อหาด้วย `<DialogBody>` เสมอ |
| Footer แบบ `<div className="flex justify-end gap-2 pt-2">` | ไม่ sticky, style ไม่สม่ำเสมอ | ใช้ `<DialogFooter>` เสมอ |
| Nested `<div>` เพื่อ justify-between สำหรับปุ่ม destructive | ซับซ้อนเกินจำเป็น | ใช้ `className="mr-auto"` บนปุ่ม destructive |

---

## 14. Anti-patterns — ห้ามทำ

| Anti-pattern | ทำไม | ทำแทนด้วย |
|---|---|---|
| `transition: all` | Animate ทุก property รวม layout | ระบุ property ที่ต้องการ |
| ตัวเลขไม่ใช้ `tabular-nums` | คอลัมน์ตัวเลขขยับ อ่านยาก | `font-mono tabular-nums` เสมอ |
| ยอดลบใช้ `-` (hyphen) | ไม่ใช่ minus sign จริง | ใช้ `−` (U+2212) |
| Badge สีแดงสำหรับ "ฉบับร่าง" | ทำให้ตกใจ | `gray` สำหรับ neutral status |
| Spinner บน initial load | UX แย่กว่า skeleton | Skeleton ทุกครั้ง |
| ปุ่มไม่ disabled ระหว่าง submit | Double submit, data corruption | `disabled={loading}` เสมอ |
| Empty state ไม่มี CTA | User ไม่รู้จะทำอะไร | มี CTA ทุก empty state |
| Modal เปิดเร็วเกิน (< 150ms) | ตาตาม content ไม่ทัน | `250ms` minimum |
| `ease-in` บน dropdown | รู้สึกช้าตั้งแต่ต้น | `ease-out` เสมอ |
| ตัวหนังสือซ้ายบนยอดเงิน | อ่านเปรียบเทียบยาก | Right-align เสมอ |
| สีในตารางมากกว่า 3 สี | สับสน, chaos | ≤ 3 สีต่อ component |
| Label สั้นเกิน (เช่น "จำนวน") | กำกวมสำหรับ ERP | ระบุให้ชัด "จำนวนเงิน (฿)" |

---

## 14. Thai Language UI — กฎเฉพาะ

- ใช้ **ภาษาไทยทั้งหมด** ใน UI label, placeholder, error message, empty state
- หน่วยเงิน: `฿` ตามหลังตัวเลขด้วย space `1,234.56 ฿` หรือ `฿1,234.56` (ใช้รูปแบบเดียวกันทั้ง app)
- วันที่: แสดงปี พ.ศ. ใน UI-facing text เสมอ (ใช้ `ThaiDatePicker`) แต่เก็บ CE ใน database
- "บันทึก" ไม่ใช่ "Save", "ยกเลิก" ไม่ใช่ "Cancel" — ยกเว้น technical terms ที่ไม่มีคำไทย

---

## Changelog

| วันที่ | การเปลี่ยนแปลง |
|--------|--------------|
| 2026-06-06 | สร้าง DESIGN.md จาก Stripe + Linear + Emil Kowalski |
| 2026-06-17 | เพิ่ม §13 Dialog / Popup Standard — sticky header/footer, size prop, DialogBody บังคับทั้งระบบ |
