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

> **กฎเหล็ก (บังคับทั้งแอป)**: ทุกสีต้องมาจาก **PERPOS Standard Palette** ด้านล่างเท่านั้น
> ห้ามใส่ค่า hex นอกพาเลตต์ และห้ามแตะสีนอกชุดนี้ — สีถูกล็อกที่ระดับ Tailwind token
> (`packages/config-tailwind/tailwind.config.ts` + `apps/perpos/src/app/globals.css`)
> ดังนั้น `bg-blue-600`, `text-green-700`, `bg-amber-50` ฯลฯ จะ resolve เป็นสีพาเลตต์ให้อัตโนมัติ
> **ห้ามฮาร์ดโค้ด hex ใน className/style** (`#3b82f6`, `style={{color:'#10b981'}}`) — ใช้ utility class เสมอ

### Standard Palette (flat-UI) — สีมาตรฐานชุดเดียวของระบบ

| ชื่อ          | Hex                                                                      | บทบาท                                                        | ใช้ผ่าน Tailwind family                                   |
| ------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------ | --------------------------------------------------------- |
| **CHARCOAL**  | `#3C3B3D`                                                                | **primary / brand / info / title**                           | `blue-*`, `sky-*`, `cyan-*`, token `primary` · = gray-700 |
| ~~AQUA~~      | ~~`#4FC1E9`~~                                                            | **เลิกใช้** — แบรนด์เปลี่ยนเป็น CHARCOAL (โทน mono ไม่มีฟ้า) | —                                                         |
| BLUE JEANS    | `#5D9CEC`                                                                | accent น้ำเงิน (chart)                                       | —                                                         |
| PLUM          | `#8067B7`                                                                | สีม่วง (accent/หมวดหมู่)                                     | `indigo-*`, `violet-*`, `purple-*`                        |
| LAVENDER      | `#AC92EC`                                                                | ม่วงอ่อน                                                     | (เฉด 300–400 ของ `indigo`/`violet`)                       |
| PINK ROSE     | `#EC87C0`                                                                | ชมพู (accent/หมวดหมู่)                                       | `pink-*`, `rose-*`, `fuchsia-*`                           |
| **RUBY**      | `#D8334A`                                                                | **negative / error / destructive**                           | `red-*`, token `red`                                      |
| GRAPEFRUIT    | `#ED5565`                                                                | แดงอ่อน (chart)                                              | (เฉด 400 ของ `red`)                                       |
| BITTERSWEET   | `#FC6E51`                                                                | ส้ม (เตือน/รอง)                                              | `orange-*`, token `orange`                                |
| **SUNFLOWER** | `#FFCE54`                                                                | **warning**                                                  | `amber-*`, `yellow-*`                                     |
| STRAW         | `#E8CE4D`                                                                | เหลืองหม่น (chart)                                           | —                                                         |
| GRASS         | `#A0D468`                                                                | เขียวสด (chart/lime)                                         | `lime-*`                                                  |
| **MINT**      | `#48CFAD`                                                                | **positive / success**                                       | `green-*`, `emerald-*`, token `green`                     |
| TEAL          | `#A0CECB`                                                                | เขียวอมฟ้าหม่น                                               | `teal-*`                                                  |
| **Gray ramp** | `#F5F7FA` LIGHT · `#CCD1D9` MEDIUM · `#656D78` DARK · `#3C3B3D` CHARCOAL | พื้น/เส้น/ตัวอักษร                                           | `gray-*`, `slate-*`, `zinc-*`, `neutral-*`, `stone-*`     |

### Neutral / Surface (จาก gray ramp)

| Token                      | Value                 | ใช้ที่ไหน             |
| -------------------------- | --------------------- | --------------------- |
| `canvas` / `bg-white`      | `#ffffff`             | พื้นหลังหน้า, card    |
| `surface` (gray-50)        | `#f8fafc`             | hover row อ่อน        |
| `surface` (gray-100)       | `#f5f7fa` LIGHT GRAY  | card/panel, hover     |
| border (gray-200)          | `#e6e9ee`             | เส้นบาง               |
| border-strong (gray-300)   | `#ccd1d9` MEDIUM GRAY | divider, border เข้ม  |
| `ink-muted` (gray-400)     | `#9ca3af`             | disabled, empty state |
| `ink-secondary` (gray-500) | `#656d78` DARK GRAY   | label, secondary text |
| body text (gray-600)       | `#525866`             | ตัวอักษรเนื้อหา       |
| `ink` (gray-700/900)       | `#3c3b3d` / `#1a1a1b` | หัวข้อ, text หลัก     |

### Semantic — Financial Status

| Token         | Tailwind    | Hex                   | ใช้กับ                          |
| ------------- | ----------- | --------------------- | ------------------------------- |
| `positive`    | `green-600` | `#46BC9E` (MINT)      | รายรับ, กำไร, ยอดบวก            |
| `positive-bg` | `green-50`  | `#F2FCF9`             | badge พื้นหลัง รายรับ           |
| `negative`    | `red-600`   | `#C43448` (RUBY)      | รายจ่าย, ขาดทุน, ยอดลบ          |
| `negative-bg` | `red-50`    | `#FCF1F2`             | badge พื้นหลัง รายจ่าย          |
| `warning`     | `amber-600` | `#E6BB51` (SUNFLOWER) | รอดำเนินการ, ใกล้ครบกำหนด       |
| `warning-bg`  | `amber-50`  | `#FFFCF3`             | badge warning                   |
| `info`        | `blue-600`  | `#3C3B3D` (CHARCOAL)  | ข้อมูล, สถานะกำลังทำ (โทน mono) |
| `neutral`     | `gray-500`  | `#656D78`             | สถานะ neutral, ยกเลิก           |

### กฎการใช้สี

- **ใช้ Tailwind utility class เท่านั้น** (`bg-*`, `text-*`, `border-*`) — token ถูก map เข้าพาเลตต์แล้ว ห้ามฮาร์ดโค้ด hex
- **ห้ามใช้สีแดง (RUBY)** กับอะไรที่ไม่ใช่ "ผิดพลาด" หรือ "ยอดลบ" — ผู้ใช้จะตกใจ
- ยอดเงินลบให้แสดง `text-red-600` + ขึ้นต้นด้วย `−` (U+2212 minus sign) ไม่ใช่ hyphen
- ยอดเงินบวกที่สำคัญ (เช่น กำไรสุทธิ) ให้ใช้ `text-green-600` (= MINT)
- Badge สถานะ: ใช้ `bg-{color}-50 text-{color}-700 border border-{color}-200`
- **primary/brand = CHARCOAL `#3C3B3D`** (โทน mono — เลิกใช้ AQUA/ฟ้า) → ใช้ `bg-primary` / `text-primary` หรือ `bg-blue-600` / `text-blue-600` (blue/sky/cyan ถูก map เป็น charcoal แล้ว) · ปุ่ม primary, sidebar active, **title (h1/หัวข้อ ใช้ `text-primary`)** = charcoal · อย่าใช้ indigo เป็นแบรนด์ (indigo = PLUM ม่วง)

---

## 3. Typography — ตัวอักษร

### Scale

```css
/* Thai + system font stack */
font-family: "Sarabun", "Noto Sans Thai", ui-sans-serif, system-ui, sans-serif;
```

| Use case        | Class                                         | Size | Weight  |
| --------------- | --------------------------------------------- | ---- | ------- |
| Page title      | `text-2xl font-semibold`                      | 24px | 600     |
| Section header  | `text-lg font-semibold`                       | 18px | 600     |
| Card title      | `text-base font-medium`                       | 16px | 500     |
| Body            | `text-sm`                                     | 14px | 400     |
| Label / caption | `text-xs`                                     | 12px | 400–500 |
| Table header    | `text-xs font-medium uppercase tracking-wide` | 12px | 500     |

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
  opts?: { currency?: boolean; decimals?: number },
): string {
  const decimals = opts?.decimals ?? 2;
  const formatted = new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Math.abs(value));

  const prefix = value < 0 ? "−" : ""; // U+2212 not hyphen
  const suffix = opts?.currency ? " ฿" : "";
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
import { PageShell, PageCard } from "@/components/ui/page-shell";

<PageShell
  title="เงินเดือน"
  description="จัดการรอบจ่ายและสลิปพนักงาน"
  icon={<Wallet className="h-6 w-6" />}
  actions={<Button>เพิ่มรอบจ่าย</Button>} // optional, ชิดขวา
  width="default" // narrow | default | wide | full
  tabs={<TabNav />} // optional, แถบแท็บใต้ header
>
  <PageCard title="รายการ">...</PageCard>
</PageShell>;
```

- หัวข้อหน้า = `<h1>` ใน PageShell อยู่แล้ว (`text-2xl font-semibold text-gray-900`) — **อย่าเขียน `<h1>`/`text-xl font-bold` เอง** และอย่าใช้ `text-slate-900`
- `admin` import `AdminPage`/`AdminCard` ได้เหมือนเดิม (เป็น alias ของ `PageShell`/`PageCard`)

### Tab navigation (แถบแท็บในหน้า) — **ใช้ `<SegmentedControl>` (pill) เท่านั้น**

> **แท็บในหน้ามีมาตรฐานเดียว = pill** ไม่ว่าจะกี่แท็บ · ห้ามประกอบแถบแท็บเองจากกลุ่ม `<Button>`
> (เดิมมีสองแบบปนกัน — pill กับกล่อง `rounded-xl` + ปุ่ม ghost — หน้าที่เหมือนกันแต่หน้าตาคนละแบบ **รวมเป็น pill หมดแล้ว 2026-07**)

```tsx
import { SegmentedControl } from "@/components/ui/segmented";

// ✅ ถูก — pill, row เดียว, ล้นแล้วเลื่อนเอง, ไม่ต้องใส่ size (default sm = ขนาดของแท็บ/ตัวกรอง)
<SegmentedControl
  value={tab}
  onChange={setTab}
  options={TABS.map((t) => ({ value: t.key, label: t.label, icon: t.icon }))}
/>

// ❌ ห้าม — ประกอบแถบแท็บเอง
<div className="flex gap-1.5 overflow-x-auto rounded-xl border … bg-white p-1.5">
  {tabs.map(t => <Button variant={active === t.key ? "secondary" : "ghost"} …>{t.label}</Button>)}
</div>

// ❌ ห้าม — flex-wrap (ตก 2 บรรทัด)
<div className="flex flex-wrap gap-1.5 ...">
```

- **row เดียว ล้นแล้วเลื่อนซ้าย-ขวา** — `SegmentedControl` ทำให้ในตัวแล้ว (scrollbar ซ่อน, แต่ละแท็บ `shrink-0 whitespace-nowrap`) · **ห้าม wrap** เด็ดขาด (จอแคบแล้วดูรก + สูงไม่คงที่)
- ขนาด/ไอคอน/ความกว้าง ดูกฎเต็มใน **§7 SegmentedControl** — แท็บในหน้าใช้ default (`sm`) เสมอ ไม่ต้องส่ง `size`
- **ข้อยกเว้นเดียว**: แถบที่เป็น **navigation ข้ามหน้า** (แต่ละอันเป็น `<Link>`/`router.push` ไปคนละ URL) ไม่ใช่แท็บ — `SegmentedControl` เป็น radio-group ของ state ให้ใช้ลิงก์ตามปกติ

### Filter bar (แถบตัวกรอง) — บังคับ `<FilterBar>` + กฎ "อยู่บรรทัดเดียวจนกว่าจะไม่พอ"

> **กฎตัดสิน**: กลุ่มของสั้น ๆ ที่วางเรียงกัน (ตัวกรอง, ปุ่ม action, ชิป) ต้องใช้ **`flex-wrap`**
> — **ห้ามใช้ `flex-col` + `sm:/lg:flex-row`**

เหตุผล — สองวิธีนี้ "ตัดสินใจ" คนละอย่าง:

| วิธี                       | ตัดสินจาก                | ผลที่ได้                                                                                        |
| -------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------- |
| `flex-col` → `lg:flex-row` | **ความกว้างจอ**          | จอ 1000px ที่มีแค่ 3 ตัวกรองก็ยังถูกบังคับซ้อน 3 บรรทัด · จอ 1280px ที่มี 6 ตัวกรองกลับอัดจนล้น |
| **`flex-wrap`** ✅         | **เนื้อหาพอดีไหมจริง ๆ** | อยู่บรรทัดเดียวจนกว่าจะไม่พอ แล้วตกทีละตัว ไม่ใช่ตกยกแผง                                        |

จอไม่รู้ว่าเนื้อหากว้างเท่าไร แต่ `flex-wrap` รู้ → ใช้ breakpoint switch เฉพาะกับ **layout ของหน้า** (sidebar/คอลัมน์) ไม่ใช่กับ **กลุ่มของสั้น ๆ**

```tsx
import { FilterBar, FilterSearch, FilterClear } from '@/components/ui/filter-bar';

// ✅ ถูก
<FilterBar>
  <FilterSearch value={q} onChange={setQ} placeholder="ค้นหา ชื่อ / รหัสสินค้า" />
  <SegmentedControl value={kind} onChange={setKind} options={KIND_OPTIONS} />
  <CustomSelect value={status} onChange={setStatus} options={STATUS_OPTIONS} className="w-36" />
  <FilterClear onClick={reset} disabled={!hasFilter} />   {/* ชิดขวาอัตโนมัติ */}
</FilterBar>

// ❌ ห้าม — breakpoint switch (ตกยกแผงทั้งที่มีที่ว่าง)
<div className="flex flex-col gap-3 lg:flex-row lg:items-center">
```

**กฎความกว้างของลูกในแถว** (ผิดข้อนี้ = ตกบรรทัดทั้งที่ยังมีที่ว่าง):

- ช่องค้นหา **ห้าม `flex-1` เดี่ยว ๆ** — จะกินที่ทั้งแถวแล้วดันตัวอื่นตกบรรทัด · ใช้ `<FilterSearch>` (กว้างพอประมาณ ยืดได้จำกัด) หรือ `flex-1 min-w-[12rem] max-w-sm`
- select/pill: กำหนดความกว้างคงที่ (`w-36`/`w-40`) หรือปล่อยตามเนื้อหา + `shrink-0`
- ปุ่มล้างตัวกรองใช้ `<FilterClear>` (`ms-auto` ดันไปชิดขวาของแถว)
- ตัวกรองเกิน ~4 อัน → ซ่อนทั้งแถบไว้หลังปุ่มไอคอน `<Filter>` (ดูหัวข้อถัดไป) แทนที่จะปล่อยกินพื้นที่เหนือตารางตลอดเวลา

### Filter toggle (ตัวกรองหลังปุ่มไอคอน) — ท่ามาตรฐานของหน้าที่มีตาราง

หน้ารายการที่ตารางคือพระเอก **ให้ซ่อนแถบตัวกรองไว้หลังปุ่มไอคอน** — พื้นที่เหนือตารางมีค่ากว่าตัวกรองที่ผู้ใช้แตะนาน ๆ ครั้ง
(ตัวกรอง ≤2 อันที่ใช้ตลอดจะโชว์คาไว้ก็ได้ · เกินกว่านั้น หรือหน้ามีตารางสูงเต็มจอ → ซ่อน)

```tsx
const [showFilters, setShowFilters] = useState(false);
const hasFilter = !!filterA || !!filterB;      // มีตัวกรองค้างอยู่ไหม

<PageShell
  actions={
    <>
      {/* สลับมุมมอง (ถ้ามี) → SegmentedControl · แล้วค่อยปุ่มกรอง · ปุ่ม primary ขวาสุดเสมอ */}
      <Button
        variant={showFilters || hasFilter ? "secondary" : "outline"}
        size="icon" title="ตัวกรอง" className="relative"
        onClick={() => setShowFilters((v) => !v)}
      >
        <Filter className="h-4 w-4" />
        {hasFilter && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-500" />}
      </Button>
      <Button onClick={openAdd}><Plus className="h-4 w-4" /> เพิ่มรายการ</Button>
    </>
  }
>
  {showFilters && (
    <FilterBar>
      …ตัวกรอง…
      <FilterClear disabled={!hasFilter} onClick={resetAll} />
    </FilterBar>
  )}
```

- **จุดสีเหลืองมุมปุ่มบังคับ** เมื่อ `hasFilter` — ไม่งั้นผู้ใช้ลืมว่ากรองค้างแล้วงงว่าข้อมูลหาย · ปุ่มเป็น `secondary` เมื่อเปิดแถบหรือกรองค้าง
- ต้นแบบจริง: [petty-cash](<apps/perpos/src/app/(hydrogen)/[orgSlug]/tmc/petty-cash/page.tsx>) · [tmc/stays](<apps/perpos/src/app/(hydrogen)/[orgSlug]/tmc/stays/page.tsx>)

### สลับมุมมอง การ์ด ↔ ตาราง

หน้ารายการที่มีทั้งมุมมองการ์ด (อ่านทีละรายการ) และตาราง (กวาดสายตาเทียบกัน) ให้สลับด้วย **`<SegmentedControl>` บน `PageShell actions`** (ไม่ใช่แถวแยกเหนือตาราง)

```tsx
const [view, setView] = useState<"card" | "table">("card");
<SegmentedControl
  value={view}
  onChange={setView}
  ariaLabel="รูปแบบการแสดงผล"
  options={[
    { value: "card", label: "การ์ด", icon: <LayoutGrid className="h-4 w-4" /> },
    { value: "table", label: "ตาราง", icon: <Rows3 className="h-4 w-4" /> },
  ]}
/>;
```

- **แถบแบ่งหน้าใช้ตัวเดียวกันทั้งสองมุมมอง** — `usePagination(rows, { pageSize: view === "table" ? 20 : 12, resetKey: view })` (การ์ดก็ต้องแบ่งหน้า ห้ามเรนเดอร์ทั้ง list รวด)
- มุมมองตารางไม่มีคอลัมน์ปุ่ม action (§5 ข้อ 3) → ถ้าการ์ดมีปุ่มลบ ให้ย้ายปุ่มลบไปไว้ใน footer ของ dialog แก้ไข (`className="mr-auto"`) เพื่อให้สองมุมมองทำงานได้เท่ากัน

### ตารางที่อยู่ล่างสุดของหน้า — สูงสุดแค่ขอบ browser (บังคับ)

**ตารางที่เป็นของชิ้นสุดท้ายของหน้า (ไม่มี section อื่นต่อท้ายนอกจากแถบแบ่งหน้า) ต้องยืดสูงจนสุดขอบล่างของ browser แล้วเลื่อนในตัวเอง** — ไม่ใช่ปล่อยให้ทั้งหน้าเลื่อนจนหัวคอลัมน์หลุดจอ และไม่ใช่จบตารางกลางจอทิ้งพื้นที่ว่างข้างล่าง

```tsx
<Table stickyHeader fillViewport>
  <TableHeader sticky>…</TableHeader>
  …
</Table>
<TablePager pager={pager} />
```

- `fillViewport` **วัดตำแหน่งจริงของตารางให้เอง** (`getBoundingClientRect` + resize + ทุกครั้งที่ re-render) → ของเหนือตารางยุบ/กางได้ (แถบตัวกรอง, การ์ดสรุป) ก็ยังพอดีเสมอ · **ห้ามเดา `calc(100vh - Nrem)` เอง** — เลขจะผิดทันทีที่ layout เปลี่ยน
- กันที่ให้ของใต้ตารางไว้ 72px (แถบแบ่งหน้า + ระยะขอบล่าง) — ถ้าใต้ตารางมีของมากกว่านั้น ส่งตัวเลขเอง: `fillViewport={120}`
- ต้องมาคู่ `stickyHeader` + `<TableHeader sticky>` เสมอ (ตารางเลื่อนเองแล้วหัวคอลัมน์ต้องค้าง)
- **ไม่ใช้กับตารางที่ไม่ได้อยู่ล่างสุด** (มี section/การ์ดต่อท้าย) หรือตารางสั้นคงที่ในการ์ดสรุป — ปล่อยให้สูงตามเนื้อหา

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
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
  TableLoading,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";

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
    ) : (
      rows.map((r) => (
        <TableRow key={r.id} clickable onClick={() => openDetail(r)}>
          <TableCell>{r.name}</TableCell>
          <TableCell align="center">
            <StatusBadge tone="success">สำเร็จ</StatusBadge>
          </TableCell>
          <TableCell align="right" tabular>
            {fmt(r.amount)}
          </TableCell>
        </TableRow>
      ))
    )}
  </TableBody>
</Table>;
```

**กฎเหล็ก:**

1. **เลื่อนซ้าย-ขวาได้ ไม่บีบคอลัมน์** — cell default `whitespace-nowrap` แล้ว wrapper scroll เอง · ห้ามตั้ง fixed `grid-cols-[px]` · cell ข้อความยาว (JSON/note) ใช้ `<TableCell wrap>` เป็น escape hatch
2. **Badge ไม่ wrap** — ใช้ `<StatusBadge tone=…>` เท่านั้น (มี `whitespace-nowrap` ในตัว) ห้ามเขียน `<span className="…rounded-full…">` มือ
3. **คลิกที่ row เพื่อดู/แก้ไข** — `<TableRow clickable onClick>` เปิด detail/edit dialog · **ไม่มีคอลัมน์ปุ่ม action ในแถว** · ปุ่มลบ/แก้ย้ายไปไว้ใน footer ของ dialog
4. คอลัมน์เงิน/ตัวเลขล้วน → `align="right" tabular` เสมอ (= `font-mono`+`tabular-nums`) · **แต่เซลล์ที่ผสมเลข+คำไทย** (เช่น "2 วัน", "ไม่จำกัด") **ห้ามใช้ `tabular`** → ดูกฎข้อ 8
5. empty/loading → `<TableEmpty>` / `<TableLoading>` (ห้าม spinner กลางจอ)
6. **`<Table>` ใน grid/flex column ต้องให้คอลัมน์ยุบได้** — ถ้าวาง `<Table>` (หรือของกว้างอื่น) ไว้ใน grid/flex item (เช่น 2-column workspace `lg:grid-cols-12` + `col-span-*`) คอลัมน์นั้น **ต้องมี `min-w-0` หรือ `overflow-hidden/auto`** ไม่งั้นบนมือถือ (ยุบเหลือคอลัมน์เดียว) ความกว้างตารางจะดัน track ให้กว้างเกิน viewport → ทั้งหน้า scroll แนวนอน. สาเหตุ: grid/flex item ค่า default `min-width: auto` ยุบต่ำกว่า content ไม่ได้ — การตั้ง `min-w-0` (หรือ `overflow≠visible` ที่ทำให้ auto min-size = 0) แก้ได้. **ข้อยกเว้น**: table ที่วางตรงใน `PageShell`/`PageCard` (block เต็มแถว) ไม่ต้องทำอะไร — block ไม่มีปัญหานี้
7. **ห้าม card ซ้อน card — `<Table>` เป็น "การ์ด" ในตัวอยู่แล้ว** (`rounded-xl border border-gray-200 bg-white`). **ห้ามห่อ `<Table>` ในกล่อง bordered card อีกชั้น** (`<div className="rounded-xl border … bg-white shadow-sm">`) — จะเห็นเส้นขอบ/การ์ดซ้อนกัน (ชัดเป็นพิเศษเมื่อมี title header ในกล่อง). **pattern ถูก**: ถ้าต้องมีหัวข้อ → ทำเป็น **heading เหนือตาราง** (`<div className="mb-2.5 px-1 text-sm font-semibold text-gray-900">หัวข้อ</div>`) แล้ววาง `<Table className="shadow-sm">` ยืนเดี่ยว (Table = การ์ด, `shadow-sm` ให้เงา) · ถ้าจำเป็นต้องวางตารางในการ์ดจริง ๆ (เช่น `SectionCard`/`PageCard` ที่มี title+ปุ่ม action) → ทำตาราง **flush**: `<Table className="rounded-none border-0 shadow-none">` (ตารางไม่มีขอบของตัวเอง, การ์ดด้านนอกเป็นขอบเดียว)
8. **`tabular` prop = `font-mono` → ตัวอักษรไทยเพี้ยน** (monospace stack ไม่มี glyph ไทย → "วัน"/"ไม่จำกัด"/"ไม่มีเพดาน" หลุดไป fallback ไม่ตรง body font). ดังนั้นใช้ `tabular` เฉพาะ **เงิน + ตัวเลข/รหัสล้วน** (`1,234.56 ฿`, `PAY-2026-04`) · เซลล์ที่ **ผสมเลข+คำไทย** ใช้ `align="right" className="tabular-nums"` แทน (เลขยังเรียงตรงด้วย tabular figures แต่ฟอนต์ทั้งเซลล์ = body ตรงกับ Thai) — **ห้ามใส่ `tabular`**
9. **ตารางที่อยู่ล่างสุดของหน้า → `<Table stickyHeader fillViewport>`** — สูงสุดแค่ขอบล่างของ browser แล้วเลื่อนในตัวเอง (ดูกฎเต็มใน §4 "ตารางที่อยู่ล่างสุดของหน้า") · ห้ามเดา `calc(100vh - Nrem)` เอง

ตัวอย่าง structure ดิบ (อ้างอิงเท่านั้น — โค้ดจริงใช้ primitives ด้านบน):

```tsx
// Structure
<table className="w-full text-sm">
  <thead>
    <tr className="border-surface-3 bg-surface border-b">
      <th className="text-ink-secondary px-4 py-3 text-left text-xs font-medium uppercase tracking-wide">
        รายการ
      </th>
      <th className="text-ink-secondary px-4 py-3 text-right text-xs font-medium uppercase tracking-wide">
        จำนวนเงิน
      </th>
    </tr>
  </thead>
  <tbody className="divide-surface-3 divide-y">
    <tr className="hover:bg-surface-2 transition-colors duration-150">
      <td className="text-ink px-4 py-3">ชื่อรายการ</td>
      <td className="px-4 py-3 text-right font-mono tabular-nums">1,234.56</td>
    </tr>
  </tbody>
  <tfoot>
    {/* ยอดรวมล่างสุด — border-t-2 เพื่อแยกชัด */}
    <tr className="border-surface-3 bg-surface border-t-2 font-semibold">
      <td className="px-4 py-3">รวม</td>
      <td className="px-4 py-3 text-right font-mono tabular-nums">10,000.00</td>
    </tr>
  </tfoot>
</table>
```

### 5.1 Pagination — แถบแบ่งหน้า (บังคับ, หน้าตาเดียวทั้งแอป)

> **กฎ**: ทุกตารางที่รายการ "อาจยาวเกินหนึ่งหน้าจอ" ต้องมีแถบแบ่งหน้า และต้องเป็น
> `@/components/ui/table-pager` เท่านั้น — **ห้ามประกอบปุ่ม ‹ › / "ก่อนหน้า–ถัดไป" / "หน้า X / Y" เอง**
> (เดิมมี 4 แบบปนกันทั้งแอป — pill เลขหน้า, ‹ ›, ปุ่ม outline ไทย, load-more — **รวมเป็นแบบเดียวแล้ว 2026-07-29**)

**หน้าตามาตรฐาน** (มาจาก `PagerBar` ที่เดียว — ทุกท่าใช้ร่วมกัน):
ซ้าย = `แสดง {from}–{to} จาก {total} {unit}` (`text-xs text-gray-500`) ·
ขวา = `‹` + เลขหน้าแบบย่อ (`1 … 4 5 6 … 20`) + `›` เป็นปุ่ม `size="icon"` สูง `h-8` ·
หน้าปัจจุบัน = `variant="default"` (charcoal) · หน้าอื่น = `ghost` · **ซ่อนตัวเองอัตโนมัติเมื่อมีหน้าเดียว**

**เลือก 1 ใน 3 ท่า ตามที่มาของข้อมูล** (หน้าตาออกมาเหมือนกันหมด):

| ที่มาของข้อมูล                            | ใช้                              | ตัวอย่าง                        |
| ----------------------------------------- | -------------------------------- | ------------------------------- |
| ได้ข้อมูลมาครบแล้ว กรองฝั่ง client        | `usePagination` + `<TablePager>` | ทะเบียนลูกค้า, สมุดรายวัน       |
| fetch ทีละหน้าจาก API (client component)  | `<ControlledTablePager>`         | `/admin/audit`, `jaquar/stock`  |
| หน้า SSR ที่ `page` อยู่ใน `searchParams` | `<LinkTablePager>`               | `/admin/issues`, `/admin/leads` |

```tsx
// ท่า 1 — client-side (ที่ใช้บ่อยที่สุด)
const pager = usePagination(filtered);           // default 10 แถว/หน้า
<TableBody>{pager.rows.map(...)}</TableBody>
</Table>
<TablePager pager={pager} unit="ราย" />          // unit = คำเรียกแถว (default "รายการ")

// ท่า 2 — fetch ทีละหน้า
<ControlledTablePager page={page} pageSize={LIMIT} total={total} onPageChange={load} loading={loading} />

// ท่า 3 — SSR searchParams (query = ตัวกรองอื่นที่ต้องคงไว้ · page ใส่ให้เอง)
<LinkTablePager page={page} pageSize={limit} total={total} query={{ status, type }} />
```

**กฎย่อย:**

- ส่ง **แถวที่ผ่านตัวกรองแล้ว** เข้า `usePagination` เสมอ — ไม่ใช่ raw list (ไม่งั้น "แสดง x–y จาก N" โกหก)
- `total` ของท่า 2/3 ต้องเป็นยอด**ทั้งหมดที่ตรงเงื่อนไข**จาก API ไม่ใช่จำนวนแถวของหน้านี้
- `<Table>` ที่เป็น JSX root เดี่ยว ๆ → ห่อคู่กับ pager ด้วย `<div className="space-y-3">`
- **hook ต้องอยู่ระดับ component เสมอ** — ห้ามวางใต้ early return (`if (!x) return …`) หรือในฟังก์ชันซ้อน
  (ผิดกฎ hooks · `pnpm lint` จับได้ ให้ยกการคำนวณ source + hook ขึ้นเหนือ guard)
- list ที่มาจาก PostgREST และอาจถูกตัด 1,000 แถว → จัดการ `truncated` ที่ชั้น fetch **ก่อน** (ดู `lib/accounting/paging.ts`)
  แล้วค่อยแบ่งหน้า · ปุ่ม **"โหลดเพิ่ม"** ใช้ได้เฉพาะกรณีนี้ (ต่อท้าย list) — ไม่ใช่แทนแถบแบ่งหน้า

**ยกเว้น — ตารางที่ไม่ต้องมีแถบแบ่งหน้า** (จำนวนแถวถูกจำกัดโดยธรรมชาติ):

- **ตัวแก้บรรทัดเอกสารในฟอร์ม** (บรรทัดใบกำกับ, ไซซ์สินค้า) — ผู้ใช้ต้องเห็น/แก้ทุกบรรทัดพร้อมกัน · แบ่งหน้า = ผิด
- **ตารางสรุป/รายงาน** ที่แถวมาจากมิติคงที่ — งบกำไรขาดทุน/งบดุล, ยอดตามเดือน/ช่องทาง/หมวด/บริษัท, เมทริกซ์สิทธิ์
  (งบทดลอง + แยกประเภท **ไม่เข้าข้อนี้** — แถวยาวตามผังบัญชี/รายการเดินบัญชี ต้องมีแถบ)
- **การ์ดสรุปหน้าแรก** ที่ `.slice(0, N)` อยู่แล้ว (รายการล่าสุด 5–15 แถว)
- **รายละเอียดของ "หนึ่งรายการ"** — บรรทัดของบิลใบเดียว, งานพิมพ์ของออเดอร์เดียว, ยาของผู้ป่วยรายเดียว
- **แถวที่ซ้อนอยู่ในกลุ่ม** (`grouped.map(([g, list]) => …)`) — แบ่งหน้าที่ระดับกลุ่มไม่ได้ ต้องรื้อโครงก่อน
- **ตาราง config/master สั้นคงที่** (rate-limit routes, แพ็กโทเคน)

> เวลาเพิ่มตารางใหม่แล้วไม่แน่ใจ: ถามว่า "แถวโตตามจำนวนข้อมูลที่ผู้ใช้ป้อนไหม" — ถ้าใช่ ต้องมีแถบแบ่งหน้า

### Column Alignment Rules

| Column type             | Alignment        | Class                     |
| ----------------------- | ---------------- | ------------------------- |
| Text (ชื่อ, รายการ)     | Left             | `text-left`               |
| Number (ยอดเงิน, จำนวน) | **Right**        | `text-right tabular-nums` |
| Date                    | Center หรือ Left | `text-center`             |
| Status badge            | Center           | `text-center`             |
| Actions                 | Right            | `text-right`              |

### Row Hover

```css
/* ✅ เสมอ — ผู้ใช้ต้องรู้ว่า row ไหนกำลัง hover */
.row {
  @apply transition-colors duration-150 hover:bg-gray-50;
}
```

---

## 6. Status Badges — ป้ายสถานะ

```tsx
// Base pattern
<span className="border-{color}-200 bg-{color}-50 text-{color}-700 inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium">
  สถานะ
</span>;

// Presets
const statusBadge = {
  draft: "bg-gray-50 text-gray-700 border-gray-200",
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  processing: "bg-blue-50 text-blue-700 border-blue-200",
  completed: "bg-green-50 text-green-700 border-green-200",
  posted: "bg-emerald-50 text-emerald-700 border-emerald-200",
  failed: "bg-red-50 text-red-700 border-red-200",
  cancelled: "bg-gray-50 text-gray-500 border-gray-200",
  void: "bg-gray-50 text-gray-400 border-gray-100",
  overdue: "bg-red-50 text-red-700 border-red-200",
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

### SegmentedControl (Pill) — ตัวเลือก 2–3 อย่าง (บังคับ)

> **กฎ**: ทุกที่ที่มีตัวเลือก **2–3 อย่างที่ต้องเลือกอันใดอันหนึ่ง** (mutually exclusive) — เช่น ฿/% (ส่วนลด),
> รายรับ/รายจ่าย, สินค้า/บริการ, ชนิดเอกสาร — **ต้องใช้ `<SegmentedControl>`** จาก `@/components/ui/segmented`
> (pill แบบ workspace switcher Admin/Suite/Flow) — **ห้ามทำกลุ่มปุ่ม toggle เอง** (`grid grid-cols-2` + `<Button>` คู่สลับ variant)

```tsx
import { SegmentedControl } from "@/components/ui/segmented";

<SegmentedControl
  value={kind}
  onChange={setKind}
  fullWidth // optional: กระจายเต็มแถว (เท่ากันทุกตัว)
  options={[
    {
      value: "income",
      label: "รายรับ",
      icon: <ArrowDownLeft className="h-4 w-4" />,
      activeClassName: "bg-green-600",
    },
    {
      value: "expense",
      label: "รายจ่าย",
      icon: <ArrowUpRight className="h-4 w-4" />,
      activeClassName: "bg-red-600",
    },
  ]}
/>;
```

- pill: container `rounded-full border bg-gray-50 p-0.5` · active = `bg-primary text-white` (charcoal) ·
  inactive = `text-gray-600 hover:bg-gray-100` · `activeClassName` override สีตาม semantic
- ใช้กับ **ตัวเลือกที่เห็นทั้งหมดพร้อมกันได้** (ปกติ 2–5 อัน) — ทั้งตัวเลือกในฟอร์ม, ตัวกรอง, และ **แท็บในหน้า** (§4 ใช้ตัวนี้ตัวเดียว)
- ค่าจาก list ยาว/ไม่จำกัด → `<CustomSelect>` · boolean on/off ล้วนที่ไม่ต้องมี label สองข้าง → toggle/switch

#### ขนาด — เลือกตาม "บริบทที่วาง" ไม่ใช่ตามความชอบ (บังคับ)

| size               | สูง   | ใช้เมื่อ                                                                          |
| ------------------ | ----- | --------------------------------------------------------------------------------- |
| **`sm`** (default) | `h-7` | **ตัวกรอง / แท็บ / สลับมุมมองในหน้า** — กรณีที่เจอบ่อยที่สุด                      |
| `md`               | `h-9` | เป็น **form control ในฟอร์ม** (สูงเท่า `Input`/`CustomSelect` ที่อยู่แถวเดียวกัน) |
| `xs`               | `h-6` | inline ใน **แถวตาราง** / ช่องแคบ                                                  |

- **default = `sm`** — ไม่ต้องใส่ `size` เมื่อใช้เป็นตัวกรอง/แท็บ · ใส่ `size="md"` **เฉพาะ**ตอนวางคู่กับ `Input`/`CustomSelect` ในฟอร์ม (ถ้าไม่ใส่จะเตี้ยกว่าช่องข้าง ๆ)
- **ห้ามใช้ `md` เป็นตัวกรองในหน้า** — ใหญ่เกิน กินพื้นที่เหนือตาราง (กับดักที่เคยเจอ: default เดิมเป็น `md` ทำให้ทุกหน้าที่ไม่ใส่ `size` บวมหมด)
- **ไอคอนย่อให้พอดีขนาดอัตโนมัติ** — ผู้เรียกส่ง `h-4 w-4` มาได้เลย component override ให้เอง ไม่ต้องไล่ปรับรายจุด
- **pill กว้างเท่าเนื้อหาเสมอ** (`w-fit` ในตัว) — วางใน `flex flex-col` / grid ได้โดยไม่ถูกยืดเต็มแถว · ถ้าอยากให้เต็มแถวจริง ๆ ใช้ `fullWidth`
- ล้นจอ → **เลื่อนแนวนอนในตัว** (scrollbar ซ่อน) ไม่ตกบรรทัด

---

### FileDropzone — ช่องรับไฟล์ (บังคับทั้งแอป)

ทุกที่ที่ผู้ใช้ต้อง "เลือกไฟล์" ต้องเป็นพื้นที่ที่ **ลากไฟล์มาวางได้** ไม่ใช่ปุ่ม `Choose File` ของเบราว์เซอร์
(ภาษาอังกฤษปนหน้าจอไทย + อยู่นอกพาเลตต์ + ผู้ใช้ที่ลากไฟล์มาแล้ววางไม่ได้จะงง)

```tsx
import { FileDropzone } from "@/components/ui/file-dropzone";

<FileDropzone value={file} onChange={setFile} accept="application/pdf,image/*" maxSizeMb={50} />
<FileDropzone multiple onFiles={addFiles} accept={ACCEPT} />   // หลายไฟล์
```

- กล่องเส้นประ `border-2 border-dashed border-gray-300` → ตอนลากผ่านเป็น `border-primary`
- เลือกไฟล์แล้ว (โหมดไฟล์เดียว) → เปลี่ยนเป็น **การ์ดไฟล์ + ขนาด + ปุ่ม ✕** ไม่ต้องเห็นพื้นที่ลากค้างไว้
- ไฟล์ผิดชนิด/ใหญ่เกิน → ข้อความไทยสีแดงใต้กล่อง **ไม่ใช่ toast** (ผู้ใช้กำลังมองที่กล่องอยู่แล้ว)
- ❌ ห้าม `<input type="file">` ที่มองเห็น · ❌ ห้ามประกอบ `onDragOver`/`onDrop` เอง · ❌ ห้าม `file:` utility ของ Tailwind

---

## 8. Empty States

```tsx
// Pattern มาตรฐาน
<div className="flex flex-col items-center justify-center py-16 text-center">
  <div className="bg-surface-2 mb-4 rounded-full p-4">
    <IconName className="text-ink-muted h-8 w-8" />
  </div>
  <h3 className="text-ink text-sm font-medium">ยังไม่มีข้อมูล</h3>
  <p className="text-ink-secondary mt-1 text-sm">คำอธิบายสั้นๆ ว่าต้องทำอะไร</p>
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
    <div key={i} className="bg-surface-2 h-12 rounded" />
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
  from {
    opacity: 0;
    transform: scale(0.96) translateY(-8px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

/* Dropdown / Select */
.dropdown {
  animation: dropdownEnter 180ms var(--ease-out);
  transform-origin: var(--radix-popover-content-transform-origin);
}
@keyframes dropdownEnter {
  from {
    opacity: 0;
    transform: scale(0.96);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

/* Row เพิ่มใหม่ */
.new-row {
  animation: rowEnter 200ms var(--ease-out);
}
@keyframes rowEnter {
  from {
    opacity: 0;
    transform: translateX(-8px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
```

**กฎ PERPOS-specific:**

- ตาราง: hover transition `150ms` เท่านั้น — เร็วที่สุด ใช้ทั้งวัน
- Modal: `250ms` — ไม่ต่ำกว่า (user ต้อง read context)
- Toast: enter `300ms ease-out`, exit `200ms ease-in`
- ปุ่มทุกปุ่ม: `:active { transform: scale(0.97); transition: 120ms ease-out; }`

---

## 11. Financial Dashboard Patterns — จาก Stripe

### KPI / Summary Cards — ใช้ `<StatCard>` เท่านั้น

> **กฎบังคับ**: การ์ดตัวเลขสรุป (รายรับรวม, คงเหลือ, จำนวนรายการ, KPI tile ฯลฯ) ทุกใบต้องใช้ `<StatCard>` จาก `@/components/ui/stat-card` — **ห้ามเขียนการ์ดพื้นพาสเทลเต็มใบเอง** (`bg-green-50 ... border-green-100` ครอบทั้งใบ ทำให้ dashboard ดูรก/"AI" และตัวเลขมักล้น)

```tsx
import { StatCard } from '@/components/ui/stat-card';

// แถวสรุปการเงิน — มือถือ stack เต็มแถว (ตัวเลขเต็มไม่ล้น), จอใหญ่ 3 คอลัมน์
<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
  <StatCard icon={<TrendingUp className="h-4 w-4" />}   label="รายรับรวม"  value="2,971,327.90 ฿" tone="positive" valueColored />
  <StatCard icon={<TrendingDown className="h-4 w-4" />} label="รายจ่ายรวม" value="1,895,599.43 ฿" tone="negative" valueColored />
  <StatCard icon={<Wallet className="h-4 w-4" />}       label="คงเหลือ"    value="1,075,728.47 ฿" tone={bal>=0?'info':'negative'} valueColored />
</div>

// KPI tile (เมตริกผสม) — สีอยู่ที่ชิปไอคอน, ตัวเลขสีเข้ม (ไม่ใส่ valueColored)
<StatCard icon={<Landmark className="h-4 w-4" />} label="รายรับสุทธิ" value="฿1.1M" sub="รับ 3.0M / จ่าย 1.9M" tone="info" />
```

`tone`: `neutral | primary | positive | negative | warning | info` (สีของชิปไอคอน + ตัวเลขเมื่อ `valueColored`)

**กฎ StatCard:**

- ดีไซน์: การ์ดขาว เส้นบาง เงาจาง — สีบอกสถานะอยู่ที่ **ชิปไอคอน + ตัวเลข** ไม่ใช่พื้นทั้งใบ
- ตัวเลข `tabular-nums` + responsive `text-xl sm:text-2xl` (มีในตัว) — **ห้าม truncate ตัวเลขเงิน**
- กันล้น: ใส่ค่าเต็มหลักล้านในกริด `grid-cols-1 sm:grid-cols-3` (มือถือเต็มแถว) · ถ้าเป็น KPI tile แน่น ๆ ให้ย่อค่าเป็น `฿1.1M` แล้วเก็บค่าเต็มไว้ใน `sub`
- Delta/ค่ารอง → ใส่ใน `sub` · ยอดลบใช้ U+2212 (`−`) ไม่ใช่ hyphen
- StatCard มี `min-w-0` ในตัว → วางใน grid/flex column ได้ปลอดภัย (ดู §5 ข้อ 6)

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
{
  copied ? <CheckIcon className="h-4 w-4 text-green-500" /> : <CopyIcon className="h-4 w-4" />;
}
```

### Row delete confirmation

```tsx
// สองขั้นตอน: คลิกครั้งแรก → ยืนยัน (สีเปลี่ยนเป็นแดง); คลิกอีกครั้ง → ลบ
// หรือใช้ AlertDialog สำหรับข้อมูลสำคัญ
```

### Form auto-save indicator

```tsx
// แสดง "บันทึกอัตโนมัติแล้ว" เล็กๆ ตรงมุม — ไม่ใช่ toast เพราะ noisy เกินไป
<span
  className={cn(
    "text-xs transition-opacity duration-300",
    saved ? "text-green-600 opacity-100" : "opacity-0",
  )}
>
  ✓ บันทึกแล้ว
</span>
```

---

## 13. Dialog / Popup Standard — มาตรฐาน Popup บังคับใช้ทั้งระบบ

> **กฎเด็ดขาด**: ทุก Dialog ใน PERPOS ต้องใช้โครงสร้างนี้เท่านั้น — ห้ามเขียน `max-h`, `overflow-y-auto`, หรือ padding บน `DialogContent` โดยตรง

### โครงสร้างบังคับ

```tsx
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent size="lg">
    <DialogHeader>
      <DialogTitle>หัวข้อ</DialogTitle>
    </DialogHeader>
    <DialogBody>{/* เนื้อหา/ฟอร์ม — ส่วนเดียวที่ scroll */}</DialogBody>
    <DialogFooter>
      <Button variant="outline" onClick={() => setOpen(false)}>
        ยกเลิก
      </Button>
      <Button onClick={handleSave}>บันทึก</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>;
```

### กลไก Sticky Header/Footer

`DialogContent` = `flex flex-col max-h-[85vh] overflow-hidden` → header/footer `shrink-0` จึง pinned อัตโนมัติ มีเฉพาะ `DialogBody` ที่ `flex-1 overflow-y-auto` — ไม่ต้องใช้ `position:sticky`

### Width Scale (prop `size`, default `lg`)

| size   | max-w          | ใช้กับ                   |
| ------ | -------------- | ------------------------ |
| `sm`   | `max-w-sm`     | ยืนยันลบ / ข้อความสั้น   |
| `md`   | `max-w-md`     | ฟอร์มสั้น 1 คอลัมน์      |
| `lg`   | `max-w-lg`     | ฟอร์มมาตรฐาน (default)   |
| `xl`   | `max-w-2xl`    | ฟอร์ม 2 คอลัมน์ / detail |
| `2xl`  | `max-w-3xl`    | ตาราง/เนื้อหากว้าง       |
| `3xl`  | `max-w-4xl`    | กว้างพิเศษ               |
| `full` | `max-w-[95vw]` | viewer (OCR ฯลฯ)         |

ทุก size บนมือถือ = `w-[calc(100vw-2rem)]` อัตโนมัติ

### Dialog ที่มีปุ่ม Destructive (ลบ/อันตราย)

```tsx
// ปุ่ม destructive ชิดซ้าย — ใช้ className="mr-auto" ภายใน DialogFooter
<DialogFooter>
  <Button variant="destructive" className="mr-auto" onClick={handleDelete}>
    ลบ
  </Button>
  <Button variant="outline" onClick={() => setOpen(false)}>
    ยกเลิก
  </Button>
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
    <DialogBody>{/* form fields */}</DialogBody>
    <DialogFooter>
      <Button type="submit">บันทึก</Button>
    </DialogFooter>
  </form>
</DialogContent>
```

### Anti-patterns — ห้ามทำกับ Dialog

| Anti-pattern                                                | ทำไม                                       | ทำแทนด้วย                                    |
| ----------------------------------------------------------- | ------------------------------------------ | -------------------------------------------- |
| `<DialogContent className="max-h-[90vh] overflow-y-auto">`  | scroll อยู่ใน `DialogBody` แล้ว            | ลบ max-h/overflow ออก ใช้ `size` แทน         |
| `<DialogContent className="p-6">`                           | padding อยู่ใน Header/Body/Footer แล้ว     | ลบ p ออก ใช้ `size` แทน                      |
| ไม่มี `<DialogBody>`                                        | dialog จะไม่มี padding และ scroll ไม่ทำงาน | ห่อเนื้อหาด้วย `<DialogBody>` เสมอ           |
| Footer แบบ `<div className="flex justify-end gap-2 pt-2">`  | ไม่ sticky, style ไม่สม่ำเสมอ              | ใช้ `<DialogFooter>` เสมอ                    |
| Nested `<div>` เพื่อ justify-between สำหรับปุ่ม destructive | ซับซ้อนเกินจำเป็น                          | ใช้ `className="mr-auto"` บนปุ่ม destructive |

---

## 13.5 เอกสารภาษีที่พิมพ์ (A4) — กฎเฉพาะ

เอกสารที่ **ออกให้ลูกค้า/ใช้เป็นหลักฐานภาษี** (ใบกำกับภาษี ใบเสร็จ ใบลด/เพิ่มหนี้ ฯลฯ) ไม่ใช่หน้าจอ — เป็นกระดาษ A4
ต้นแบบเดียวของทั้งระบบ = [`lib/accounting/document-html.ts`](apps/perpos/src/lib/accounting/document-html.ts) (HTML → pdf-renderer)

- **พาเลตต์หน้าจอไม่บังคับกับเอกสารพิมพ์** — เอกสารพิมพ์ใช้ขาว/ดำ/เส้นเทาเป็นหลัก (พิมพ์ขาวดำต้องอ่านออก) เหมือน wht-pdf / pp30 / mom-html
- **ต้องมีครบตาม ม.86/4**: คำว่า "ใบกำกับภาษี", ชื่อ-ที่อยู่-เลขประจำตัวผู้เสียภาษี + **สาขา** ของทั้งผู้ขายและผู้ซื้อ, เลขที่/เล่มที่, วันที่ออก, รายการ+หน่วยนับ, มูลค่า, VAT แยกบรรทัด
- **ต้นฉบับ / สำเนา** ต้องพิมพ์กำกับบนหน้าเอกสาร (ORIGINAL / COPY) — สลับด้วย query ไม่ใช่สร้างไฟล์คนละแบบ
- **จำนวนเงินเป็นตัวอักษร** ใช้ `bahtText()` จากไฟล์เดียวกัน — ห้าม copy ไปไว้ที่ component (เคยเพี้ยน "ยี่สิบหนึ่ง")
- ตัวเลขในเอกสารใช้ tabular figures + ชิดขวาเหมือนบนหน้าจอ (§3)
- ค่าที่มาจากผู้ใช้ต้อง escape ก่อนต่อเป็น HTML เสมอ

## 14. Anti-patterns — ห้ามทำ

| Anti-pattern                    | ทำไม                                            | ทำแทนด้วย                                                 |
| ------------------------------- | ----------------------------------------------- | --------------------------------------------------------- |
| `transition: all`               | Animate ทุก property รวม layout                 | ระบุ property ที่ต้องการ                                  |
| ตัวเลขไม่ใช้ `tabular-nums`     | คอลัมน์ตัวเลขขยับ อ่านยาก                       | `font-mono tabular-nums` เสมอ                             |
| ยอดลบใช้ `-` (hyphen)           | ไม่ใช่ minus sign จริง                          | ใช้ `−` (U+2212)                                          |
| Badge สีแดงสำหรับ "ฉบับร่าง"    | ทำให้ตกใจ                                       | `gray` สำหรับ neutral status                              |
| Spinner บน initial load         | UX แย่กว่า skeleton                             | Skeleton ทุกครั้ง                                         |
| ปุ่มไม่ disabled ระหว่าง submit | Double submit, data corruption                  | `disabled={loading}` เสมอ                                 |
| Empty state ไม่มี CTA           | User ไม่รู้จะทำอะไร                             | มี CTA ทุก empty state                                    |
| Modal เปิดเร็วเกิน (< 150ms)    | ตาตาม content ไม่ทัน                            | `250ms` minimum                                           |
| `ease-in` บน dropdown           | รู้สึกช้าตั้งแต่ต้น                             | `ease-out` เสมอ                                           |
| ตัวหนังสือซ้ายบนยอดเงิน         | อ่านเปรียบเทียบยาก                              | Right-align เสมอ                                          |
| สีในตารางมากกว่า 3 สี           | สับสน, chaos                                    | ≤ 3 สีต่อ component                                       |
| Label สั้นเกิน (เช่น "จำนวน")   | กำกวมสำหรับ ERP                                 | ระบุให้ชัด "จำนวนเงิน (฿)"                                |
| KPI/การ์ดยอดรวมคิดกฎเอง         | ตัวเลขบนการ์ดขัดกับสมุดรายวัน                   | ใช้ตัวช่วยกลางของโดเมน (บัญชี = `selectBillingDocuments`) |
| ยอดรวมจาก list ที่อาจถูกตัดแถว  | PostgREST ตัด 1,000 แถวเงียบ ๆ → ยอดต่ำกว่าจริง | เตือน `truncated` + ปุ่ม "โหลดเพิ่ม"                      |

---

## 14. Thai Language UI — กฎเฉพาะ

- ใช้ **ภาษาไทยทั้งหมด** ใน UI label, placeholder, error message, empty state
- หน่วยเงิน: `฿` ตามหลังตัวเลขด้วย space `1,234.56 ฿` หรือ `฿1,234.56` (ใช้รูปแบบเดียวกันทั้ง app)
- วันที่: แสดงปี พ.ศ. ใน UI-facing text เสมอ (ใช้ `ThaiDatePicker`) แต่เก็บ CE ใน database
- "บันทึก" ไม่ใช่ "Save", "ยกเลิก" ไม่ใช่ "Cancel" — ยกเว้น technical terms ที่ไม่มีคำไทย

---

## Changelog

| วันที่     | การเปลี่ยนแปลง                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-06-06 | สร้าง DESIGN.md จาก Stripe + Linear + Emil Kowalski                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-06-17 | เพิ่ม §13 Dialog / Popup Standard — sticky header/footer, size prop, DialogBody บังคับทั้งระบบ                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-06-17 | §2 ล็อก PERPOS Standard Palette (flat-UI) ทั้งแอป — override Tailwind token (AQUA=primary) + migrate ฮาร์ดโค้ด hex (รวม LINE flex cards) · ยกเว้นเอกสารพิมพ์ (wht-pdf, pp30/wht-cert preview, mom-html) คงสีเดิม                                                                                                                                                                                                                                                                    |
| 2026-07-21 | เพิ่ม §13.5 เอกสารภาษีที่พิมพ์ (A4) — ม.86/4, ต้นฉบับ/สำเนา, `bahtText` แหล่งเดียว · เพิ่ม anti-pattern: KPI คิดกฎเอง + ยอดรวมจาก list ที่ถูกตัดแถว                                                                                                                                                                                                                                                                                                                                 |
| 2026-07-28 | **แท็บในหน้ารวมเป็นมาตรฐานเดียว = `<SegmentedControl>` (pill)** — เลิกแถบแท็บที่ประกอบเองจากกลุ่ม `<Button>` · §7 เพิ่มตารางขนาด (default = `sm` สำหรับแท็บ/ตัวกรอง · `md` เฉพาะ form control · `xs` inline ในตาราง) + pill `w-fit` ไม่ถูกยืด + ไอคอนย่อตามขนาดอัตโนมัติ                                                                                                                                                                                                            |
| 2026-07-29 | เพิ่ม **`<FileDropzone>` เป็นมาตรฐานเดียวของการเลือกไฟล์ทั้งแอป** (§7) — เลิก `<input type="file">` ที่มองเห็น + เลิกประกอบ dropzone เอง · migrate 7 จุดเดิม (acc-firm OCR/vault, assistant STT, just-me OCR, tmc purchase, jaquar CSV, bank reconcile CSV, avatar)                                                                                                                                                                                                                 |
| 2026-06-17 | เปลี่ยน **primary/brand = CHARCOAL `#3C3B3D`** (โทน mono เลิก AQUA) — blue/sky/cyan → charcoal scale, token primary/blue → charcoal, title (h1/PageShell/Title) ใช้ `text-primary` · สี accent อื่น (PLUM/PINK/MINT/RUBY/SUNFLOWER) คงเดิม                                                                                                                                                                                                                                          |
| 2026-07-29 | เพิ่ม §4 **Filter toggle** (ซ่อนตัวกรองหลังปุ่มไอคอน + จุดเตือนเมื่อกรองค้าง), **สลับมุมมองการ์ด↔ตาราง** (`SegmentedControl` บน `PageShell actions` + แบ่งหน้าใช้ตัวเดียวกัน), **ตารางที่อยู่ล่างสุดของหน้าต้องสูงสุดแค่ขอบ browser** — เพิ่ม prop `fillViewport` ใน `<Table>` (วัดตำแหน่งจริงให้เอง ห้ามเดา `calc(100vh - Nrem)`) — ถอดจาก petty-cash + tmc/stays                                                                                                                  |
| 2026-07-29 | **รวมแถบแบ่งหน้าเป็นมาตรฐานเดียวทั้งแอป (§5.1)** — เดิมมี 4 แบบปนกัน (pill เลขหน้า / `‹ ›` / ปุ่ม outline "ก่อนหน้า–ถัดไป" / load-more) · `table-pager.tsx` คุมหน้าตาที่เดียวผ่าน `PagerBar` แล้วแตกเป็น 3 ท่าตามที่มาข้อมูล (`TablePager` / `ControlledTablePager` / `LinkTablePager`) · migrate ad-hoc 5 จุด (admin audit/admin-audit/issues/leads, jaquar stock) + เพิ่มแถบให้ตารางที่ยังไม่มีอีก 72 จุด · ระบุตารางที่ยกเว้น (ตัวแก้บรรทัดเอกสาร / ตารางสรุป / การ์ดสรุป slice) |
