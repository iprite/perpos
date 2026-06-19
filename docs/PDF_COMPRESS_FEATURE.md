# คัมภีร์: บีบขนาด PDF (kind `pdf_compress`)

> เอกสารอ้างอิงฉบับเต็มสำหรับ **ผู้ช่วย kind ที่ 2** ใต้ร่ม assistant — บีบไฟล์ PDF ให้เล็กลงโดยคงความชัดสำหรับอ่าน/ส่งต่อ
> สถานะ: **📋 แผนอนุมัติแล้ว — ยังไม่เริ่มเขียนโค้ด** (Phase 1)
>
> 📘 โครงร่ม (guard, home org, onboarding, seam, การเพิ่ม kind) → [`docs/ASSISTANT.md`](ASSISTANT.md)
> 📘 ต้นแบบ kind แรก (worker, quota, deliver, Drive) → [`docs/STT_MOM_FEATURE.md`](STT_MOM_FEATURE.md)
> เอกสารนี้เน้นเฉพาะ `pdf_compress` — ไม่ทำซ้ำเนื้อหาร่ม/STT

---

## 1. ภาพรวม

- **เป้าหมาย:** ผู้ใช้ส่ง PDF ทาง LINE → ได้ไฟล์ที่เล็กลง (ลดเฉลี่ย **50–80%**) กลับทาง LINE + บันทึกลง Google Drive
- **โมเดล:** B2C per-profile ใต้ร่ม "ผู้ช่วย AI" เหมือน STT — login ด้วย LINE, auto-onboard + trial
- **kind:** `pdf_compress` (module_key ใน `module_registry` + `ASSISTANT_KINDS`)
- **มิเตอร์:** "จำนวนหน้า" (page-based) — trial ฟรี **20 หน้า**

### Phase 1 — ขอบเขต (ตัดสินใจกับ user 2026-06-19)
| มิติ | Phase 1 | อนาคต (Phase 2+) |
|---|---|---|
| เครื่องมือบีบ | **Deterministic only** (Ghostscript + pikepdf) | + Gemini จำแนกหน้า (MRC), OCR reflow, super-resolution |
| ช่องทาง | **LINE เท่านั้น** (`/pdf`) | + หน้าเว็บ `/assistant/pdf` |
| โหมดบีบ | **fix เดียว** `/ebook` (~150dpi) | เลือกหลายโหมด (สมดุล/บีบหนัก) |
| billing | ไม่มี (ใช้ trial) | `pdf_plans`/`pdf_subscriptions` (Stripe per-profile) |
| onboarding | แจก trial 20 หน้าอัตโนมัติ | — |
| เพดานไฟล์ | **100MB / 500 หน้า** (tunable ผ่าน env) | — |

> **ตั้ง expectation กับลูกค้า:** "AI ช่วยตัดสินกลยุทธ์ให้ยังชัด แต่คนบีบจริงคือ Ghostscript/MuPDF" — Phase 1 ยังเป็น deterministic ล้วน, AI เข้ามา Phase 2

---

## 2. สถาปัตยกรรม — Flow (command-free + auto-detect + ถามยืนยัน)

**POLICY: ไม่ต้องพิมพ์คำสั่ง** — user โยนไฟล์เข้ามา ระบบดูชนิดเอง แล้วถาม Flex ยืนยันก่อนทำ
(เสียง/วิดีโอ → ถอดเสียง MoM · PDF → บีบขนาด) · webhook **ไม่โหลดไฟล์เอง** (กัน timeout) — worker โหลดจาก LINE เอง

```
1. user โยนไฟล์ PDF เข้ามา (ไม่ต้องพิมพ์คำสั่ง)
      → webhook: ตรวจ msg.type==='file' + นามสกุล .pdf + checkPdfAccess
      → ส่ง Flex "ได้รับไฟล์ PDF — บีบขนาดไหม?" [บีบขนาดเลย] [ไม่เป็นไร]
        (postback pdffile:<messageId> / pdfcancel)

2. user แตะ "บีบขนาดเลย"  → handlePdfConfirm
      → INSERT assistant_jobs (kind=pdf_compress, source=line, line_message_id)
      → reply "รับไฟล์แล้ว — กำลังบีบ" → triggerPdfWorker (claim + POST worker /process)

3. worker /process (fire-and-forget 202):
      → downloadLineContent(line_message_id)  ← worker โหลดเอง (เลี่ยง webhook timeout + Cloud Run 32MB cap)
      → compressPdf (python pikepdf+pillow, ตรวจเพดาน 100MB/500หน้า, นับหน้า)
      → upload bucket assistant_pdf/<orgId>/<jobId>-compressed.pdf
      → update assistant_jobs.pdf_meta {output_path,pages,size_before,size_after,ratio,no_gain}
      → callback /api/assistant/pdf/deliver

4. deliver → signed URL 48h → push Flex ผล (ก่อน/หลัง + % + ปุ่มดาวน์โหลด [+ Drive P1f])
```

**กฎ:**
- บีบแล้วไม่เล็กลง (PDF optimize มาแล้ว) → ส่งไฟล์เดิม + แจ้ง "เล็กที่สุดแล้ว" (no_gain)
- worker ล้ม/ไฟล์เสีย/เกินเพดาน → status=failed + deliver push Flex error (UserFacingError = ข้อความตรง)
- legacy `/mom` command (session path) ยังทำงาน — แต่ช่องทางหลัก = โยนไฟล์
- **P1c ยังไม่หักโควต้า/ไม่นับหน้าใน Flex ยืนยัน** (quota = P1e ที่ worker · การ์ดยืนยันแบบมีจำนวนหน้า = P1d ถ้าต้องการ)

**⚠️ reply-token 30s:** การนับหน้าต้องเกิดก่อน reply — ไฟล์ใหญ่ดาวน์โหลดช้าอาจเกิน → fallback: reply "กำลังตรวจไฟล์…" แล้ว **push** การ์ดยืนยันทีหลัง (pattern เดียวกับ mom-deliver)

---

## 3. Infrastructure & Deployment

### pdf-compress-worker (Cloud Run `perpos-pdf-compress-worker`, asia-southeast1)
- **Node Express (TS) + spawn python3** — HTTP/bucket/secret layer เป็น TS, งานบีบเป็น Python (`compress.py`) spawn เหมือนเดิมที่เคย spawn gs · endpoints: `GET /health`+`/healthz`, `POST /compress-raw` (P1b standalone), `POST /compress` (P1c job flow) — `x-worker-secret`
- **`--memory 4Gi --cpu 2 --concurrency 2 --no-cpu-throttling`** · concurrency ต่ำกัน OOM (แต่ละ req ถือ buffer)
- **engine = pikepdf + Pillow** (ลงผ่าน apt trixie: `python3-pikepdf python3-pil`) — **ไม่ใช้ ghostscript** (gs flatten transparency → กล่องดำใน Apple Preview · ดู §10)
- **วิธีบีบ = surgical** (`compress.py`): iterate ทุก image object (รวมที่ซ้อนใน Form XObject) → downsample เฉพาะรูป max side ≥ `PDF_MIN_IMAGE_SIDE`(450) เป็น `PDF_TARGET_MAX_PX`(1400) JPEG q`PDF_JPEG_QUALITY`(78) · **ข้ามรูปเล็ก (โลโก้/ไอคอน) + stencil mask + เก็บ /SMask** → คง transparency/โลโก้ครบ · เพดาน `PDF_MAX_MB`/`PDF_MAX_PAGES` (python เช็ค)
- ผลจริง: deck 49MB→6.2MB (**88%**) โลโก้+transparency ครบ ไม่มีกล่องดำ
- secrets: `WORKER_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN`
- env: `APP_BASE_URL=https://app.perpos.ai` (callback `pdf/deliver`) · `PDF_MAX_MB=100` · `PDF_MAX_PAGES=500`

core `compressPdf(bytes)` ([pdf.service.ts](../services/pdf-compress-worker/src/pdf/pdf.service.ts)) → spawn `compress.py`:
```
1. เขียน bytes → temp in.pdf
2. spawn python3 compress.py in.pdf out.pdf  (pikepdf+Pillow surgical, ตรวจเพดาน, นับหน้า)
   → stdout JSON {pages, size_before, size_after, no_gain, ratio} · exit 2 = UserFacingError
3. อ่าน out.pdf → คืน { bytes, pages, sizeBefore, sizeAfter, noGain, ratio } · cleanup temp เสมอ
```
- **P1b** `/compress-raw`: raw PDF in → compressed out (สถิติใน header `x-pdf-*`) — ⚠️ จำกัด ~32MB (Cloud Run request body cap)
- **P1c** `/compress`: { path } (P1c จะเป็น jobId) → download bucket → compressPdf → upload → callback `/api/assistant/pdf/deliver` — เลี่ยง cap 32MB

### App (Vercel)
- route ใหม่ `POST /api/assistant/pdf/deliver` (worker callback)
- `jobs/process` generic-ify → router ตาม kind (`stt`→stt-worker, `pdf_compress`→pdf-worker)

---

## 4. Database (Supabase `zftnyipifpaiqzukiyzi`)

**reuse generic:** `assistant_jobs` (kind=`pdf_compress`), `assistant_line_sessions`, `personal_module_grants`

**ตารางใหม่ (แยกจาก stt เด็ดขาด):**
```sql
-- โควต้า page-based ต่อ profile
pdf_quota (
  profile_id  uuid PK REFERENCES profiles(id),
  limit_pages int NOT NULL DEFAULT 20,   -- trial
  used_pages  int NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
)
-- ledger debit/refund
pdf_usage_transactions ( id, profile_id, job_id, kind text /*debit|refund*/, pages int, created_at )
-- default trial (admin ปรับได้)
pdf_settings ( id bool PK DEFAULT true, default_quota_pages int DEFAULT 20 )
```
- RPC `consume_pdf_quota(p_profile uuid, p_pages int)` / `refund_pdf_job(p_job uuid)` — SECURITY DEFINER, atomic reserve+refund, idempotent refund
- **REVOKE EXECUTE จาก `anon`, `authenticated`** (service-role only — บทเรียน RPC) + RLS ทุกตารางใหม่

**คอลัมน์เพิ่มใน `assistant_jobs`:** `pdf_drive_url text` (reuse pattern `mom_drive_url`) · ข้อมูลเฉพาะ pdf อื่นเก็บใน `metadata` jsonb (pages, size_before, size_after, ratio, no_gain)

**migration:** `module_registry` += row `pdf_compress` · bucket `assistant_pdf` (private)

---

## 5. LINE — คำสั่ง & Flex

### คำสั่ง
| คำสั่ง | หน้าที่ | gate |
|---|---|---|
| `/pdf` | ส่ง PDF → บีบ → ได้ไฟล์เล็กกลับ | `checkSttAccess` (ขยายเป็น kind-aware: grant `pdf_compress`) |

### การ์ดยืนยัน (ก่อนบีบ)
header CHARCOAL `#3C3B3D` พื้นเรียบ (ตาม [line-flex-card-guide](line-flex-card-guide.md)):
```
บีบไฟล์ PDF
─────────────
📄 เอกสาร.pdf
จำนวนหน้า       12 หน้า
ขนาดปัจจุบัน     8.4 MB
จะใช้โควต้า      12 หน้า
คงเหลือหลังบีบ   8 / 20
─────────────
[ ยืนยันบีบ ]   [ ยกเลิก ]   ← postback action=pdf_confirm / pdf_cancel
```
- **โควต้าไม่พอ** (pages > remaining): ซ่อนปุ่มยืนยัน + แจ้ง "โควต้าเหลือ X หน้า ไม่พอ" (Phase 1 ยังไม่มีปุ่มซื้อ)

### การ์ดผลลัพธ์
ขนาดเดิม → ขนาดใหม่ (− %), ปุ่ม "ดาวน์โหลด" + "เปิดใน Drive" (ถ้า upload สำเร็จ) + หมายเหตุ PDPA "บันทึกลง Google Drive ของคุณแล้ว"

> **postback เป็นของใหม่** — `/mom` ไม่มี postback flow ต้องเพิ่ม handler รับ LINE `postback` event ใน webhook

---

## 6. แผนคำนวณ cost (`lib/assistant/pdf-cost.ts`)

**Phase 1 แทบไม่มี cost ผันแปร** — ไม่มี token AI. ต้นทุน = Cloud Run compute + storage egress (เศษสตางค์/หน้า) โครง env-driven ตาม [`stt-cost.ts`](../apps/perpos/src/lib/assistant/stt-cost.ts):

```ts
export interface PdfPricing {
  cloudRunVcpuUsdPerSec:  number; // ~0.000024 (asia-southeast1)
  cloudRunGibUsdPerSec:   number; // ~0.0000025
  secondsPerPage:         number; // ~0.5 (Ghostscript ประมาณการ)
  workerGib:              number; // 4
  storageEgressUsdPerGb:  number; // ~0.12
  usdThbRate:             number; // 35
}
// ต่อหน้า ≈ secondsPerPage × (vcpu + gib×workerGib) ≈ ~0.00002 USD/หน้า
```
- ฐานคิด = ledger `pdf_usage_transactions` (net debit pages) เหมือน stt
- `scripts/pdf-cost-report.mjs` (sync ค่าคงที่กับ pdf-cost.ts) + หน้า `admin/pdf-cost`
- **Phase 2:** cost จริงโผล่ตอนใช้ Gemini per-page vision → เพิ่ม field `geminiImageInputUsdPerM` + tokens/หน้า (โครง env รองรับแล้ว)

---

## 7. Google Drive — reuse `saveToDrive` 100%

`saveToDrive` ([`lib/google/drive.ts`](../apps/perpos/src/lib/google/drive.ts)) ออกแบบ category-based เผื่อ "ฟีเจอร์อื่นโยนไฟล์" → ไม่ต้องแตะ drive.ts / OAuth (ดู [project-google-drive-storage]):

```ts
// ใน /api/assistant/pdf/deliver (มี pdfBytes ผลลัพธ์)
const driveUrl = await Promise.race([
  saveToDrive(admin, profileId, {
    categoryKey: 'pdf', categoryName: 'เอกสาร PDF',  // → "Perpos Assistant/เอกสาร PDF/"
    fileName: `${origName}-compressed.pdf`, mimeType: 'application/pdf', bytes: pdfBytes,
  }),
  timeout(15_000, null),   // กัน Drive ค้าง block LINE
]);
```
- **best-effort** — ไม่เชื่อม/พลาด → `null` ไม่ block การส่ง LINE
- **auto-on ถ้าเชื่อม Google แล้ว** (Phase 1) · toggle `save_pdf_to_drive` ใน `meeting_calendar_settings` เพิ่มเมื่อมีหน้าเว็บ
- `drive.file` scope = ไฟล์เป็นของผู้ใช้ถาวร (PDPA ดี) — ต้องระบุในข้อความ

---

## 8. Code Map (เป้าหมาย Phase 1)

| ไฟล์ | งาน |
|---|---|
| `supabase/migrations/<ts>_pdf_compress.sql` | module_registry, pdf_quota/usage/settings, RPC+REVOKE, bucket, assistant_jobs.pdf_drive_url |
| [`lib/assistant/kinds.ts`](../apps/perpos/src/lib/assistant/kinds.ts) | `ASSISTANT_KINDS=['stt','pdf_compress']` |
| [`api/line/_provision.ts`](../apps/perpos/src/app/api/line/_provision.ts) | grant `pdf_compress` + `ensurePdfQuota(20)` |
| `lib/assistant/pdf-cost.ts` (ใหม่) | cost model |
| `scripts/pdf-cost-report.mjs` (ใหม่) | admin cost report |
| `api/admin/pdf-quota/route.ts` (ใหม่) | **superadmin ตั้งโควต้ารายคน** (GET/PUT limit_pages) — §9 |
| `api/admin/pdf-settings/route.ts` (ใหม่) | **superadmin ตั้ง trial เริ่มต้น** (default_quota_pages) — §9 |
| `(hydrogen)/admin/pdf-users/page.tsx` (ใหม่) | **หน้าจัดการผู้ใช้+โควต้า** — §9 |
| `api/admin/pdf-{stats,jobs,cost}` + หน้าคู่ (ใหม่) | สถิติ/job/cost (เบา) — §9 |
| `menu-items.tsx` | เพิ่มลิงก์หน้า admin pdf-* |
| `services/pdf-compress-worker/` (ใหม่) | worker §3 |
| [`api/line/webhook/route.ts`](../apps/perpos/src/app/api/line/webhook/route.ts) | `/pdf`, รับไฟล์+นับหน้า, การ์ดยืนยัน, postback handler, `checkSttAccess` kind-aware |
| `api/assistant/pdf/deliver/route.ts` (ใหม่) | callback → อัป job → Drive → Flex ผล |
| [`api/assistant/jobs/process/route.ts`](../apps/perpos/src/app/api/assistant/jobs/process/route.ts) | router ตาม kind (generic-ify) |
| [`api/assistant/scheduler/route.ts`](../apps/perpos/src/app/api/assistant/scheduler/route.ts) | stuck-sweep + refund + PDPA cleanup สำหรับ pdf_compress |
| `lib/line/*` (`/help` flex) | เพิ่มบรรทัด `/pdf` |

---

## 9. Admin Console (superadmin) — ตั้ง/จัดการโควต้า

mirror โครง STT admin (`admin/stt-users` + `api/admin/stt-{quota,settings,users,stats,jobs,cost}`) — ทุก endpoint = `requireAdmin` (super_admin) + `logAdminAction` (audit)

### Phase 1 — ต้องมี (หัวใจที่ผู้ใช้ถาม)
| ส่วน | ไฟล์ | หน้าที่ |
|---|---|---|
| **ตั้งโควต้ารายคน** | `api/admin/pdf-quota` (GET/PUT) | `GET ?profileId` → `{limit_pages, used_pages, remaining, usage[]}` · `PUT {profileId, limitPages}` → upsert `pdf_quota` (ปรับ/เติมหน้า) · MAX_LIMIT กันพลาด · audit |
| **ตั้ง trial เริ่มต้น** | `api/admin/pdf-settings` (GET/PUT) | `PUT {defaultQuotaPages}` → `pdf_settings.default_quota_pages` (ผู้ใช้ใหม่ใช้ค่านี้ตอน provision) |
| **หน้าจัดการ** | `(hydrogen)/admin/pdf-users/page.tsx` | ตารางผู้ใช้ที่มี grant `pdf_compress` + โควต้า (limit/used/remaining) · คลิกแถว → Dialog ตั้ง `limitPages` (ปุ่มเติม +20/+50/กำหนดเอง) · เปิด/ปิด grant |

**กฎ UI (ตาม standard):** หน้า admin ใช้ `AdminPage`/`AdminCard` (alias PageShell) · ตาราง `@/components/ui/table` (§5) · Dialog §13 · ปุ่ม `@/components/ui/button` · **เพิ่มลิงก์ใน `menu-items.tsx`** (กฎ: หน้าใหม่ต้องเพิ่มเมนู)

### Phase 1 — มอนิเตอร์/troubleshoot (ยืนยันเข้า Phase 1)
| ส่วน | ไฟล์ | หน้าที่ |
|---|---|---|
| สถิติ | `admin/pdf-stats` + `api/admin/pdf-stats` | จำนวน job, หน้ารวม, อัตราบีบเฉลี่ย, แยกสำเร็จ/ล้ม |
| job list | `admin/pdf-jobs` + `api/admin/pdf-jobs` | ดู/รีเซ็ต job ค้าง (troubleshoot worker) |
| cost | `admin/pdf-cost` + `api/admin/pdf-cost` | รายงานต้นทุน (จาก `pdf-cost.ts` §6) |

### Phase 3 (เมื่อมี billing)
- `admin/pdf-billing` + `api/admin/pdf-billing` — subscription/payment (ตอนเปิด Stripe)

> **หมายเหตุ:** การ "เติมโควต้า" ให้ผู้ใช้ = `PUT pdf-quota {limitPages}` ปรับ `limit_pages` ขึ้น (ไม่แตะ `used_pages`) — admin bypass การจ่ายเงิน เหมือน stt

---

## 10. ⚠️ กับดักที่คาดไว้ (กันพลาดล่วงหน้า)

1. **OOM ที่ 100MB/500 หน้า** — deploy worker 4Gi + เพดาน tunable (`PDF_MAX_MB`/`PDF_MAX_PAGES`) ปรับลงเร็วได้ถ้าเจอ
2. **LINE content API จำกัดขนาดไฟล์เอง** — cap 100MB อาจเป็นทฤษฎี ต้องเทสจริงว่า LINE ปล่อยไฟล์ผู้ใช้ใหญ่แค่ไหน
3. **reply-token 30s ตอนนับหน้า** — ไฟล์ใหญ่ → fallback push การ์ดยืนยัน (§2)
4. **postback flow ใหม่** — webhook ต้อง handle `postback` event (ของเดิมมีแต่ message)
5. **หักโควต้าตอนยืนยันเท่านั้น** — กันหักแล้ว worker ล้มไม่ refund / กันอัปไฟล์เล่นแล้วเสียโควต้า
6. **อย่าปน `stt_quota`** — pdf ใช้ `pdf_quota` แยก (มิเตอร์คนละหน่วย: หน้า vs วินาที)
7. **REVOKE RPC** — `consume_pdf_quota`/`refund_pdf_job` service-role only (อย่าลืม REVOKE anon+authenticated)
8. **PDPA cleanup** — ลบ PDF ต้นฉบับใน bucket เมื่อ job ถึงสถานะสุดท้าย + ผลลัพธ์เก่า >48 ชม. (เหมือน stt)

---

## 11. งานที่ยังเหลือ / Phase ถัดไป

- **Phase 1 (นี้):** deterministic + LINE + trial — ดู §8
- **Phase 2:** Gemini จำแนกหน้า (MRC บีบต่อหน้าให้ชัดขึ้น) + OCR reflow (scan→text, ลด >90%)
- **Phase 3:** หน้าเว็บ `/assistant/pdf` (อัป/ดูผล/ดาวน์โหลด) + tab ใน assistant layout + billing (`pdf_plans`/`pdf_subscriptions`)
- **Phase 4 (ชั่งคุ้ม):** super-resolution กู้ความชัดหลัง downsample (ต้อง GPU instance)

---

## 12. แผนย่อย Phase 1 — ทำทีละก้อน (incremental build order)

แต่ละก้อน **deploy + เทสจบในตัว** ต่อยอดกัน · จัดลำดับให้ "ของเสี่ยงสุด" (worker บีบจริง) มาพิสูจน์เร็ว ก่อนห่อ LINE/quota/admin

| ก้อน | ขอบเขต | ส่งมอบ/เทสยังไง | ขึ้นกับ |
|---|---|---|---|
| **P1a — Foundation (DB+seam)** | migration ครบ (module_registry, pdf_quota/usage/settings, RPC consume/refund + REVOKE, bucket `assistant_pdf`, `assistant_jobs.pdf_drive_url`) + `kinds.ts` (`['stt','pdf_compress']`) + `_provision` (grant + ensurePdfQuota 20) | provision user ใหม่ → มี grant + row `pdf_quota` 20 หน้า · `tsc` ผ่าน · ยังไม่มี behavior user เห็น | — |
| **P1b — Worker standalone** | `services/pdf-compress-worker` (ghostscript `/ebook` + pikepdf) + deploy Cloud Run 4Gi | curl `POST /compress` ใส่ PDF จริง → ได้ไฟล์เล็กลง 50–80% (manual trigger เหมือน STT doc §8) · **พิสูจน์ core value + เช็ค OOM/cap** | P1a (bucket) |
| **P1c — LINE command-free + confirm-on-drop** ✅ | โยนไฟล์ → auto-detect ชนิด → Flex ถามยืนยัน (postback `pdffile:`/`pdfcancel`→handlePdfConfirm) → INSERT job → triggerPdfWorker → worker download LINE+บีบ+upload → `pdf/deliver` Flex ผล+ดาวน์โหลด · ถอด /pdf command, /mom legacy | โยน PDF ทาง LINE → ถาม → ได้ไฟล์บีบกลับ · **vertical slice แรกที่ user ใช้ได้** | P1a, P1b |
| **P1d — (ทางเลือก) การ์ดยืนยันแบบมีจำนวนหน้า/ขนาด** | ให้ worker นับหน้าก่อนแล้วส่งการ์ด "X หน้า ใช้ X โควต้า" ก่อนบีบจริง (ต้อง download ก่อน → 2-hop) — ทำเมื่ออยากโชว์ page/quota ก่อน | เห็นจำนวนหน้า+โควต้าก่อนยืนยัน | P1c, P1e |
| **P1e — Quota enforcement** | `consume_pdf_quota` ตอนยืนยัน + `refund_pdf_job` (worker ล้ม/ไม่เล็กลง) + การ์ดโชว์คงเหลือ + บล็อกเมื่อไม่พอ (ซ่อนปุ่มยืนยัน) | บีบจนเกิน 20 หน้า → ถูกบล็อก · worker ล้ม → โควต้าคืน · `pdf_usage_transactions` มี ledger ครบ | P1d |
| **P1f — Google Drive** | `saveToDrive` ใน `pdf/deliver` (timeout 15s, best-effort) + `pdf_drive_url` + ปุ่ม "เปิดใน Drive" + ข้อความ PDPA | เชื่อม Google แล้วบีบ → ไฟล์โผล่ใน Drive "เอกสาร PDF" · ไม่เชื่อม → ไม่ block LINE | P1c |
| **P1g — Scheduler (ความทน)** ✅ | ขั้น 4.7: stuck 'processing' >15นาที → fail+refund_pdf_job+แจ้ง · requeue pending → triggerPdfWorker (giveup 30นาที) · PDPA ลบไฟล์ >48ชม. (pdf_meta=null) · กัน pdf ออกจาก STT section | PR #27 merged | P1e |
| **P1h — Admin: ตั้ง/จัดการโควต้า** | `api/admin/pdf-quota` (GET/PUT) + `pdf-settings` (default trial) + หน้า `admin/pdf-users` (ตาราง+Dialog ตั้ง limit_pages/+20/+50, เปิดปิด grant) + เมนู | superadmin เปิด `admin/pdf-users` → เห็นผู้ใช้ → ตั้ง/เติมโควต้าได้ · เปลี่ยน trial default | P1a |
| **P1i — Admin: monitor + cost** | `lib/assistant/pdf-cost.ts` + `scripts/pdf-cost-report.mjs` + หน้า/api `admin/pdf-stats`, `admin/pdf-jobs`, `admin/pdf-cost` + เมนู | ดูสถิติ/อัตราบีบ · รีเซ็ต job ค้างจากหน้า · เห็นต้นทุนต่อหน้า | P1a, P1g |

**ลำดับแนะนำ:** P1a → P1b → P1c (ได้ของใช้จริงเร็วสุด) → P1d → P1e → P1f → P1g → P1h → P1i
**Milestone ปล่อยใช้ได้:** จบ **P1f** = ผู้ใช้บีบ PDF ทาง LINE + เก็บ Drive + มี quota ครบ (P1g–P1i = ความทน + admin tooling เสริม)
