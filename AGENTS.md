# AGENTS.md — PERPOS

คู่มือสำหรับ AI agents ที่ทำงานกับ codebase นี้

> 📘 **ผู้ช่วย AI (assistant umbrella — per-profile, B2C, kind-based):** อ่านคัมภีร์ร่มที่ [`docs/ASSISTANT.md`](docs/ASSISTANT.md) — สถาปัตยกรรม per-kind, guard, home org, onboarding, billing, วิธีเพิ่มผู้ช่วยตัวใหม่ ก่อนแตะส่วน `/assistant`
> 📘 **STT/MoM เฉพาะทาง (worker, Gemini, PDF, duration, quota):** อ่าน [`docs/STT_MOM_FEATURE.md`](docs/STT_MOM_FEATURE.md) — deploy, DB schema, code map, กับดักที่แก้แล้ว
> 📘 **จัดซื้อครุภัณฑ์ภาครัฐ (gov_procure — pipeline 6 stage, per-org p2p-x-89):** อ่าน [`docs/GOV_PROCURE_FEATURE.md`](docs/GOV_PROCURE_FEATURE.md) — state machine, field-level finance-lock, AI/LINE, provisioning + cutover status, กับดักที่แก้แล้ว, **§8 แคตตาล็อกสินค้า AI** (5 ตารางใหม่ `gov_procure_catalog*`/`_products`, 14 API route, AI enrich chunked, PDF 2 เทมเพลต — บน branch `feat/gov-procure-catalog` ยังไม่ merge)
> 📘 **บัญชี/ภาษี (accounting — เอกสารขาย 9 ชนิด, ใบกำกับซื้อ, auto journal, ภ.พ.30):** อ่าน [`docs/ACCOUNTING_FEATURE.md`](docs/ACCOUNTING_FEATURE.md) — invariant ที่ห้ามพัง (snapshot/จุดรับรู้รายได้/เลขเอกสาร), ผังบัญชีที่ auto journal ใช้, สิทธิ์หลังบ้าน, กับดักที่แก้แล้ว — **อ่านก่อนแตะ `/accounting` ทุกครั้ง**
> 📘 **OCR ถอดบิล→บันทึกบัญชี (acc_firm, self-improvement loop):** อ่าน [`docs/ACC_FIRM_OCR_FEATURE.md`](docs/ACC_FIRM_OCR_FEATURE.md) — pipeline 3 สเต็ป Gemini, loop จำผู้ขาย→บัญชีจากการอนุมัติของคน (human-in-the-loop เสมอ), bucket/secret/FK กับดักที่แก้แล้ว
> 📘 **คลังเอกสารลูกค้า (`acc_firm` → `/acc-firm/vault`, per-org `jtacc`):** อ่าน [`docs/ACC_FIRM_VAULT_FEATURE.md`](docs/ACC_FIRM_VAULT_FEATURE.md) — 11 ตาราง `acc_firm_vault_*` + bucket private `acc_vault`, **invariant ที่ห้ามพัง**: `retention_until` คำนวณโดย trigger เท่านั้น (ทุก UPDATE) · เอกสารที่บันทึกแล้วลบไม่ได้ ต้องเดิน `pending_purge → purged` และเก็บ metadata+sha256 ตลอด · `legal_hold` ปลดได้เฉพาะ owner · ไฟล์เข้าถึงผ่าน signed URL ≤60 วิ **ที่เขียน access log ก่อนเสมอ** · access log/audit เป็น append-only (REVOKE จาก service*role ด้วย) · **ทะเบียนลูกค้า = `acc_firm_service_clients` ตัวเดียวของทั้ง acc_firm** (ลูกค้าไม่ต้องมี org · หน้าเดียว `/acc-firm/clients` — เมนู "ลูกค้าบริการ" ถูกยุบรวมแล้ว 2026-07-29, URL เดิม redirect) · `acc_firm_clients` = "การเชื่อมระบบ" (engagement) ของลูกค้าในทะเบียน ผูกกันด้วย `client_org_id` — **invariant: engagement ต้องมีแถวในทะเบียนเสมอ** (POST `/api/acc-firm/clients` บังคับ `serviceClientId`) และ OCR/ตรวจปิดงวด/storage policy ยัง join ด้วย `client_org_id` เหมือนเดิม · **Dashboard `/acc-firm` รวม "รายงานรวม" เดิมเป็น 3 แท็บ** (ภาพรวมลูกค้า/งานค้าง/ปฏิทินภาษี) — `/acc-firm/reports` redirect, API `reports`+`tax-calendar` ยังใช้อยู่ · **กลุ่ม LINE ของลูกค้า (§4.5)**: 1 ลูกค้า = 1 กลุ่ม · ผูกด้วยรหัส `PP-XXXXXX` ที่ทีมสร้างแล้วเอาไปพิมพ์ในกลุ่ม (ใช้ครั้งเดียว/หมดอายุ 24 ชม.) · **กลุ่มที่ยังไม่ผูก บอทเงียบเสมอ** · ส่งอัปเดต 5 หัวข้อเปิด-ปิดรายลูกค้า (doc_received/tax_due/tax_filed/billing/announce) — งานอัตโนมัติ dedup ด้วย `dedup_key` — Phase 2 ที่เหลือ (purge approval/incident/RoPA) + Phase 3 (AI classify/LIFF) ยังไม่ทำ
> 📘 **สำนักงานบัญชีเข้าทำบัญชีให้ org ลูกค้า (firm access — `acc_firm` × `accounting`):** อ่าน [`docs/ACC_FIRM_CLIENT_ACCESS.md`](docs/ACC_FIRM_CLIENT_ACCESS.md) — พนักงานสำนักงาน (jtacc) เปิด `/[clientSlug]/accounting/*`ได้โดย**ไม่ต้องเป็นสมาชิก`organization\*members` ของลูกค้า** สิทธิ์ผูกกับ **engagement** (`acc_firm_clients` status=`active`) แทน · **invariant ที่ห้ามพัง**: สำนักงาน**ไม่มีทางได้ `owner`** (เพดาน `accountant`— ตั้งค่าองค์กร/VAT ของลูกค้ายังเป็นของลูกค้า) · ขอบเขต =`FIRM_ACCESS_MODULES`=`accounting`เท่านั้น · **membership จริงชนะเสมอ** (ลอง`module_members`ก่อน ค่อย fallback) · **guard ฝั่งหน้าเว็บกับ API ต้องเรียก`resolveFirmAccess()`ตัวเดียวกัน** ไม่งั้นได้ "หน้าเปิดได้แต่ 403" · org ลูกค้าที่เข้าผ่านสำนักงานติดธง`viaFirm` — **ห้ามโผล่ใน org switcher / ห้ามเป็น active org** (`ownMemberships()`) · **ร่องรอยการแก้ไข**: ทุก mutation ของ `accounting`เขียน`audit_logs` (`business_action`+`on_behalf_of_org_id`= ทำในนามสำนักงานใด) — **ห้ามพึ่ง session GUC`set_audit_context`หา actor** (connection pool ทำให้บันทึกผิดคน) ·`audit_logs`append-only (REVOKE update/delete จาก service_role ด้วย) · route ใหม่ที่เขียนข้อมูลต้องเรียก`logAccountingAudit`— มีเทสกันลืม`audit-coverage.test.ts`
> 📘 **บริษัทโฮลดิ้ง (`p2p_group`— per-org`p2pholding`, Phase 1):** อ่าน [`docs/P2P_GROUP_FEATURE.md`](docs/P2P_GROUP_FEATURE.md) — 8 ตาราง `p2pg\**`, 7 หน้า (ภาพรวมกลุ่ม/ทะเบียนบริษัท/ตัวเลขรายเดือน/งบรวม/เงินลงทุน-ปันผล/รายการระหว่างกัน/เงินสด-ธนาคาร), **invariant ที่ห้ามพัง**: `org*ref_id`ตั้งได้เฉพาะ super_admin ทาง DB (ผูกแล้ว = อ่านงบข้าม org ผ่าน service-role) · เงินที่ยังไม่มีข้อมูล =`NULL`ไม่ใช่ 0 · สูตรอยู่ที่`lib/p2p-group/metrics.ts`ที่เดียว · รายได้ auto ต้องใช้`selectBillingDocuments`เดียวกับสมุดรายวัน · **route.ts ห้าม export อะไรนอกจาก handler** (config อยู่`api/p2p-group/\_configs.ts`) — ยังไม่มี AI/LINE (Phase 2)
> 📘 **ผู้ช่วยวิเคราะห์ธุรกิจ (BI Chat + แดชบอร์ดปักหมุด, module `bi`, shared, org `p2p-x-89`):** อ่าน [`docs/BI_FEATURE.md`](docs/BI_FEATURE.md) — semantic layer (`bi_metrics`) เป็นหัวใจ, flow 6 สเต็ป, RPC `run_bi_metric`/`match_bi_metrics`, **ข้อผูกพันถาวร**: ตาราง `bi*\_`ถูก REVOKE จาก authenticated ⇒ ทุก read path ต้องกรอง`created*by`เอง + สิทธิ์เขียน`bi\*metrics`= service-role เท่านั้นตลอดไป, verified 14 / draft 15 metric (gov_procure) + **scope`tmc` 12 metric ใหม่ (ยัง draft — §9.5)**, **Phase 3 (แดชบอร์ดปักหมุด + drill-down + เทียบช่วงก่อน) เสร็จแล้ว apply prod แล้ว\*\* (โควตาการ์ดแยกจากโควตาคำถาม AI โดยสมบูรณ์), กับดักที่แก้แล้ว (S1 data leak/BLOCKER-1/2/D1 หลุดเป็นระยะ), LINE (Phase 2, เลื่อนไปหลัง Phase 3)/Free-form SQL (Phase 5) ยังไม่ทำ
> 📘 **ผู้ช่วยขาย TMC (LINE @tmcvilla — RAG ตอบลูกค้าเรื่องเข้าพัก + ส่งต่อแอดมิน):** อ่าน [`docs/TMC\*SALES_BOT_FEATURE.md`](docs/TMC_SALES_BOT_FEATURE.md) — 6 ตาราง `tmc_kb\**`/`tmc*chat\**`, หน้า `/[orgSlug]/tmc/sales-bot`, **invariant ที่ห้ามพัง**: @tmcvilla คนละ channel กับบอท PERPOS (`TMC*LINE_CHANNEL\*\_`↔`/api/line/tmc/webhook`เท่านั้น **ห้ามใช้ปนกัน**) · บอทตอบจากคลังความรู้เท่านั้น ห้ามเดา (prompt บังคับ`[[NO_ANSWER]]`) · เรื่องห้องว่าง/จอง/โอนเงิน/ต่อรองราคา **ต้องส่งต่อคนเสมอ** · embedding ต้อง `gemini-embedding-001`/768 ทั้ง ingestion+query · `tmc_kb_chunks`RLS deny-all +`match_tmc_kb_chunks`บังคับ`p_org_id`· หลัง escalate บอทต้องเงียบตาม`human_mode_minutes`· ราคา/เงื่อนไขอยู่ในคลังความรู้ ห้ามฮาร์ดโค้ด — **2 ทริกเกอร์ส่งต่อ**: ลูกค้าขอคุยกับคน / บอทตอบไม่ได้ → push Flex เข้า **กลุ่ม LINE ของทีมแอดมินที่อยู่กับบอท PERPOS** (ไม่ใช่ @tmcvilla — OA นั้นคุยกับลูกค้า 1:1 เท่านั้น) ผูกด้วยรหัส`TMC-XXXXXX`ที่รับใน`/api/line/webhook`(ใช้ครั้งเดียว/หมดอายุ 24 ชม. · **กลุ่มที่ยังไม่ผูก บอทเงียบเสมอ** · บอทถูกเตะออก = ปลดผูกอัตโนมัติ) แล้วแอดมินคุยต่อกับลูกค้าใน LINE OA Manager · **เช็คห้องว่างจาก`tmc_stays`จริง** (แกะวันที่ด้วย Gemini ที่รู้วันนี้ →`RENTABLE_VILLAS`TMC7/TMC1/TMC5 · **ห้ามคำนวณราคาในโค้ด** โค้ดบอกแค่ว่าง/ไม่ว่าง+วันในสัปดาห์ ราคาหยิบจากคลัง) · **ส่งรูปห้องพักได้** (bucket`tmc-villa`, JPEG เท่านั้นเพราะ LINE ไม่รองรับ webp · หมวดรูปติดโดย Gemini vision) · **แท็ก @perpos ในกลุ่มที่ผูกแล้ว + พิมพ์ข้อมูล → AI เรียบเรียงเป็นร่าง (`tmc_kb_drafts`) → ส่งการ์ดทวน + ปุ่มยืนยันในกลุ่ม → กดยืนยันถึงเขียนคลังจริง** (ยืนยันซ้ำไม่เขียนซ้ำ/ข้ามกลุ่มไม่ได้/หมดอายุ 24 ชม. · เก็บ `source_note`+`previous_content` ไว้กู้คืนเสมอ) · **กฎประจำตัวบอท (`tmc_bot_rules`, §6.4)** = คำสั่งวิธีพูด/ข้อห้ามที่เข้า prompt **ทุกข้อความ ไม่ผ่าน retrieval** (เช่น "เรียกลูกค้าว่าคุณท่าน") — สั่งได้ทั้งหน้าเว็บ (แท็บ "กฎประจำตัว") และแท็ก @perpos ในกลุ่ม (AI แยกเองว่าเป็นข้อมูลหรือกฎ → การ์ดทวน → ยืนยัน) · เพดาน 20 ข้อ/200 ตัวอักษร · **กฎห้ามลบล้างกติกาความถูกต้อง** — `isUnsafeRule()` ปฏิเสธกฎที่สั่งให้เดา/ยืนยันจอง/ให้เลขบัญชี/ไม่ส่งต่อคน ตั้งแต่ต้นทาง
> 📘 **บริหารโครงการรับเหมา (`just_me`— per-org`justme`, สำรวจ→BOQ→ใบเสนอราคา→PR/เทียบราคา→รับของ→เบิกใช้→เทียบงบ→วางบิล):** อ่าน [`docs/JUST_ME_PROJECT_FEATURE.md`](docs/JUST_ME_PROJECT_FEATURE.md) — 15 ตาราง `just_me*_`+ 5 view ฝั่งขาย, 7 หน้าใหม่ใต้`/[orgSlug]/just-me`, **invariant ที่ห้ามพัง**: (1) ด่านต้นทุน/margin อยู่ที่ DB (`just*me_has_cost_access`+ policy แยก`\_select/\_insert/\_update/\_delete`**ห้าม`FOR ALL`**) **และ route ที่ใช้ service-role ต้อง `stripCost()` เองเสมอ** (`COST_FIELDS`ใน`api/just-me/\_lib.ts`= แหล่งเดียว) — viewer = ผู้รับเหมาช่วงตัวจริง (2) BOQ ที่ approved แก้/ลบไม่ได้ (trigger) ต้องทำ revision ใหม่ · 1 โครงการมี approved ได้ใบเดียว ·`budget_cost`/`contract_amount`เขียนจาก`approveBoq()` ทางเดียว (3) **ห้ามแตะ trigger ต้นทุนเฉลี่ยของคลัง** (`just_me_movement_cost*_`) — ผูกโครงการผ่านคอลัมน์ใหม่บน `stock_movements`เท่านั้น · ห้ามเขียน`total_cost`เอง (4) **สูตรเงินทุกตัวอยู่`lib/just-me/project-metrics.ts`ที่เดียว** (40 เทส) ห้ามคำนวณในหน้า · ไม่มีข้อมูล =`NULL`ไม่ใช่ 0 · เลขเอกสารขาย/รายได้ออกโดย module`accounting` เท่านั้น — ยังไม่ทำ: AI ถอด BOQ จากแบบ, LINE เตือนราคาวัสดุขยับ, ต่อค่าแรงจาก clock-in-out, เทียบ BOQ ข้าม revision
> 📘 **PERPOS Mail (webmail · `mail.perpos.ai`) — 🔄 ตั้งแต่ 2026-08-17 = _เครื่องมือภายใน_ ไม่ใช่ผลิตภัณฑ์ขาย** (ใช้เองในบริษัท + exworker · ให้ตัวแทนมีอีเมลองค์กรเพื่อความน่าเชื่อถือ · โควตา 200 MB/คน · เกณฑ์ = ต้นทุนต่ำสุด) — **ไม่ทำแล้ว: M0 หน้าหลังบ้านลูกค้า `/[orgSlug]/mail/*`, ย้ายโฮสต์มาไทย, ยืนยันโดเมนลูกค้ารายราย** · แผนเมลขาออก: [`docs/MAIL_SELF_DELIVERY_PLAN.md`](docs/MAIL_SELF_DELIVERY_PLAN.md) — **relay ฟรีของ Brevo แปะโลโก้ท้ายเมล = ขัดกับเป้าหมายความน่าเชื่อถือโดยตรง ต้องตัดสินใจก่อนแจกกล่องให้ตัวแทน** · อ่าน [`docs/MAIL_WEBMAIL_HANDOFF.md`](docs/MAIL_WEBMAIL_HANDOFF.md) (สถานะ/สิ่งที่ทำไปแล้ว/กับดัก) · [`docs/MAIL_UI_SPEC.md`](docs/MAIL_UI_SPEC.md) (UI) · [`docs/MAIL_HANDOFF.md`](docs/MAIL_HANDOFF.md) (เมลเซิร์ฟเวอร์ Stalwart + §G วิธีเรียก JMAP admin API) · [`docs/MAIL_SELF_DELIVERY_PLAN.md`](docs/MAIL_SELF_DELIVERY_PLAN.md) (ทำแล้ว — ส่งตรงพอร์ต 25 จาก SG `62.146.233.27` IP สะอาด · SPF/DKIM/DMARC pass 2026-08-18) — **invariant ที่ห้ามพัง**: (0) **URL บนโดเมนเมลคือ `/` และ `/login` ไม่ใช่ `/mail`** — middleware rewrite ให้ (ไฟล์ route ยังอยู่ที่ `(mail)/mail/*`) · ลิงก์ทุกอันต้องประกอบจาก `mailBasePath(host)` ([lib/mail/base-path.ts](apps/perpos/src/lib/mail/base-path.ts)) **ห้ามฮาร์ดโค้ด `/mail`** เพราะ dev/โดเมนอื่นยังใช้ `/mail` (1) **ลูกค้าเมลไม่ต้องมีบัญชี PERPOS** ตัวตน = mail account ที่ผ่าน OAuth ของ Stalwart เท่านั้น ⇒ route group `app/(mail)/` **ห้ามมี AuthGuard/RouteRoleGuard/org switcher/ลิงก์ข้ามไป Suite-Flow** และห้ามอ่าน profile/org ในโซนนี้ (2) **สามชื่อคนละหน้าที่**: `mail.perpos.ai` = เว็บแอป webmail (perpos instance บน VPS, เมฆส้ม) · `mailserver.perpos.ai` = เมลเซิร์ฟเวอร์ Stalwart (MX/PTR/HELO — **เครื่องเดียวกัน** ตั้งแต่ 2026-08-19, เมฆเทา) · `login.perpos.ai` = หน้า OAuth ที่ลูกค้าเห็น (`MAIL_OAUTH_ISSUER`, Caddy proxy → Stalwart :8080) — `MAIL_APP_BASE_URL` (เว็บ) ต้องแยกจาก `APP_BASE_URL` (Suite/Flow) เพราะ instance เดียวเสิร์ฟทั้งคู่ · ⚠️ `/etc/hosts` บนเครื่องห้ามชี้ `mailserver.perpos.ai` → 127.0.1.1 (container จะเรียกตัวเอง) (3) **HTML ของเมลแสดงใน `<iframe srcDoc>` sandbox ที่ห้ามมี `allow-same-origin` เด็ดขาด** (มี `allow-scripts` เดี่ยว ๆ ได้ — frame เป็น opaque origin ใช้รันสคริปต์วัดความสูงของเราตัวเดียวผ่าน CSP `script-src 'nonce-…'` ที่สุ่มใหม่ทุกฉบับ · เทส `sanitize.test.ts` คุม) + CSP ใน srcdoc ทุกใบ (4) cookie session เข้ารหัส `SameSite=strict` path `/api/mail` · `MAIL_SESSION_SECRET` = **base64 ของ 32 ไบต์** (ผิดรูปแบบ = `readMailConfig()` คืน null → หน้า "ยังไม่ได้ตั้งค่า" ไม่ใช่ 500) (5) ป้ายกล่องเมลอยู่ที่ `lib/mail/boxes.ts` แหล่งเดียว · แถวรายการ = **เธรด** ⇒ ลบ/เก็บ/อ่านแล้วต้องส่ง `by:"thread"` (6) ลบ/เก็บเป็น optimistic + คิวเลิกทำ 8 วิ — flush ด้วย `pagehide` เท่านั้น **ห้ามใช้ `visibilitychange`** (สลับแท็บ = ลบทันที) (7) ทุก route `dynamic = "force-dynamic"` + `Cache-Control: private, no-store` (instance เดียวเสิร์ฟหลายคน) · Sentry ต้อง scrub `/api/mail/*` ([lib/observability/scrub-mail.ts](apps/perpos/src/lib/observability/scrub-mail.ts)) เพราะ query พกชื่อไฟล์แนบ (8) **`/admin/mail` (หลังบ้านของเรา, super_admin) เห็นได้แค่ metadata** — ด่านจริงคือ `ADMIN_OBJECTS` ใน [lib/mail/admin-api.ts](apps/perpos/src/lib/mail/admin-api.ts) **ห้ามเพิ่ม `Email/*`/`Mailbox/*`/`MessageContents` เข้าไป** · สร้าง/ลบโดเมนกับกล่องเมลได้จากหน้านี้ (`x:Domain/set`+`x:Account/set`) — **รหัสผ่านกล่องเมลระบบสุ่มเสมอ แสดงครั้งเดียว ห้ามเก็บ/log** (ลืม = ตั้งใหม่เท่านั้น) · Sentry scrub ครอบ `/api/admin/mail/*` ด้วย · ไฟล์นี้ใช้ API key ของแอดมิน จึง**ห้ามถูกเรียกจากโซน `(mail)` หรือ `/api/mail/*`** (คนละขั้วกับกฎใน `lib/mail/jmap.ts`) (9) **โฟลเดอร์/กฎกรองอยู่บนเมลเซิร์ฟเวอร์ล้วน ห้ามมีตารางใน Supabase** — นิยามกฎฝังใน `# PERPOS-RULES-V1 <base64>` บรรทัดแรกของสคริปต์ Sieve · **สคริปต์เดียวชื่อ `perpos` อัปเดตทับตลอด** (สคริปต์ที่ active ลบไม่ได้) · สคริปต์ที่ไม่มีบรรทัดนั้น = ของคนอื่น **ห้ามเขียนทับจนผู้ใช้ยืนยัน** · `fileinto` อ้าง **path ไม่ใช่ id** ⇒ โฟลเดอร์เปลี่ยนชื่อ/ย้าย/ถูกลบ ต้อง `refreshMailRulesScript()` ทุกครั้ง · ค่าที่ผู้ใช้พิมพ์ต้องผ่าน `escapeSieveString` เสมอ — **สถานะ (2026-08-17): M1 อ่าน · M2 เขียน/ตอบ/ส่งต่อ · **M3 ครบแล้ว** (มือถือ + มุมมองรายการ + **โฟลเดอร์ที่ผู้ใช้สร้างเอง** + **กฎกรองอัตโนมัติ `/rules`** — ป้ายกำกับตัดทิ้งถาวร) · M4 `/admin/mail` (เพิ่ม-ลบโดเมน + ตัวช่วยตั้ง DNS ตรวจสด · สร้าง-แก้-ลบกล่องเมล + ตั้งรหัสใหม่ + นามแฝง) · หน้า `/account` แบ่งเป็นเมนูย่อย 4 อัน (โปรไฟล์/ลายเซ็น/รหัสผ่าน/ภาษา · **กล่องที่มีนามแฝงตั้งชื่อที่แสดง + ลายเซ็นแยกรายที่อยู่ + เลือกที่อยู่เริ่มต้นได้**) ให้ผู้ใช้แก้ชื่อที่แสดง/รูปโปรไฟล์/**ลายเซ็น**/รหัสผ่านเอง — ลายเซ็นต่อท้ายด้วยบรรทัด `-- ` มาตรฐาน (`applySignature` ใน [lib/mail/compose.ts](apps/perpos/src/lib/mail/compose.ts)) ใส่ตอนเขียนใหม่/ตอบ/ส่งต่อเท่านั้น **ห้ามใส่ซ้ำตอนเปิดร่างเดิมหรือเปิดกล่องกลับหลังส่งไม่สำเร็จ** · **ตอบ/ส่งต่อส่งออกจากที่อยู่ที่เขาส่งหา** (`pickIdentityForReply`, ปิดได้ที่ `/account`) · เปลี่ยนช่อง "จาก" กลางคัน = สลับลายเซ็นด้วย `swapSignature` ที่แทนที่**เฉพาะบล็อกที่ระบบใส่** ห้ามทับข้อความที่ผู้ใช้พิมพ์ (**รูปเก็บใน FileNode ของกล่องเมลเอง ห้ามย้ายไป Supabase**) · **ความชอบส่วนตัว (มุมมองรายการ + ความกว้างคอลัมน์รายการที่ลากตัวแบ่งเอง + **ภาษา th/en** + **ลายเซ็นท้ายเมล**) เก็บใน `perpos-prefs.json` ของ FileNode เดียวกัน ⇒ จำรายผู้ใช้ ตามไปทุกเครื่อง** — localStorage เป็นแค่แคชกันจอวูบ · **ภาษา (2026-08-19)**: พจนานุกรม `lib/mail/i18n/messages/*.ts` ทุกคีย์มี `{th,en}` คู่กัน · component ใช้ `useMailT()` จาก `components/mail/mail-locale.tsx` · **ข้อความใหม่ในเว็บเมลห้ามพิมพ์ไทยลง JSX ตรง ๆ ต้องลงพจนานุกรม** · ตั้งที่ `/account` · cookie `perpos_mail_locale` ให้ SSR รู้ก่อน paint · `exworker.co.th` ย้ายมาใช้จริงแล้ว (เมลออกทาง Resend) — **งานถัดไป = M4 contact/ปฏิทิน (ไม่เร่ง) หรือแผนเมลขาออก · อ่าน [`docs/MAIL_WEBMAIL_HANDOFF.md`](docs/MAIL_WEBMAIL_HANDOFF.md) ก่อนเริ่ม** · ~~M0 หลังบ้านลูกค้า~~ ยกเลิก (เมลเป็นเครื่องมือภายใน ไม่ใช่ผลิตภัณฑ์ขาย)**

---

## ภาพรวมโปรเจกต์

**PERPOS** — ระบบบัญชีและ ERP สำหรับธุรกิจ SME ประเทศไทย พร้อม LINE Bot assistant

- Frontend + Backend: Next.js 15 (App Router), React 19, TypeScript
- **API routes อยู่ใน `apps/perpos/src/app/api/` (Next.js Route Handlers)**
- Database: Supabase (PostgreSQL) พร้อม Row Level Security
- Auth: Supabase Auth — **LINE Login เท่านั้น** (signin มีปุ่ม LINE ปุ่มเดียว · `/line/login` → `/line/callback` bridge เข้า session ด้วย magic-link · Supabase ไม่มี LINE provider จึงทำ OAuth เอง · login แล้วเข้าแอปเลย ไม่ต้องตั้ง password). **Google ถูกถอดแล้ว** (2026-07 — GoogleAuthView + `/signin?admin=1` ลบทิ้ง, google identity ของ iprite ลบแล้วสลับเป็น email identity, ปิด provider ใน dashboard ได้เลย) — ทุกคนรวม super_admin login ผ่าน LINE. magic-link claim (`/web`) ยังมีอยู่ · email/password เหลือเป็นกลไกเบื้องหลัง (ไม่มี UI) ตามดีไซน์ shared auth pool
  - **shared auth pool (Supabase consolidation):** `auth.users` ใช้ร่วมกับ exapp/riekchang (tag `user_metadata.app`; perpos = untagged) — admin surface ที่แตะ auth admin API (delete/reset-password) ต้อง guard "target มีแถวใน `public.profiles`" เสมอ กัน mutate ข้าม app · ทุก createUser ของ perpos สร้าง untagged
  - **LINE Login channel ต้องอยู่ provider เดียวกับ Messaging channel** — `userId` ถึงตรงกับ `line_user_id` ที่เก็บไว้ (ถ้าคนละ provider จะ provision เป็นคนละคน) · callback URL ที่ต้องลงทะเบียนใน LINE console = `${APP_BASE_URL}/line/callback`
- UI: Rizzui, Tailwind CSS, Radix UI
- Monorepo: pnpm workspaces + Turbo

> **กฎสำคัญ**: API logic ทั้งหมดอยู่ใน `apps/perpos/src/app/api/` เท่านั้น — ไม่มี Nest.js backend แล้ว

---

## โครงสร้าง Monorepo

```
perpos/
├── apps/perpos/                    # Next.js app (port 3005) — Frontend + API
│   └── src/
│       ├── app/
│       │   ├── (hydrogen)/         # Protected pages (ต้อง login)
│       │   ├── (auth)/             # Login, signup
│       │   └── api/                # API Route Handlers (Next.js)
│       │       ├── admin/          # Users, Delivery, NewsAgent, Modules
│       │       ├── line/           # LINE Bot webhook, link-token, unlink
│       │       ├── assistant/      # Scheduler (cron trigger)
│       │       ├── org/            # Organization invites
│       │       ├── tmc/            # TMC Management endpoints
│       │       └── google-drive/   # Google Drive OAuth
│       ├── components/             # Shared UI components
│       └── lib/                    # Utilities, Supabase clients, actions
├── packages/
│   ├── config-tailwind/            # Shared Tailwind config
│   ├── config-typescript/
│   └── isomorphic-core/            # Shared components
├── services/
│   ├── pdf-renderer/               # PDF microservice — Express + Playwright (Cloud Run, port 8080)
│   ├── ocr-worker/                 # AI bookkeeping worker — Express + Gemini (Cloud Run, port 8080)
│   ├── stt-worker/                 # Speech-to-text worker — Express + Gemini Files API (Cloud Run, port 8080)
│   └── pdf-compress-worker/        # PDF compression worker — Express + spawn python3 (pikepdf+Pillow) (Cloud Run, port 8080)
└── supabase/
    └── migrations/                 # Migration SQL files
```

---

## คำสั่ง Development

```bash
# ติดตั้ง dependencies (จาก root)
pnpm install

# รัน Next.js app (frontend + API)
pnpm starter:dev       # port 3005

# รัน PDF microservice (services/pdf-renderer)
pnpm pdf:dev           # port 8080
# หรือ: cd services/pdf-renderer && pnpm dev

# รัน OCR worker (services/ocr-worker)
pnpm ocr-worker:dev    # port 8080
# หรือ: cd services/ocr-worker && pnpm dev

# รัน STT worker (services/stt-worker) — แกะเสียงเป็นข้อความ
pnpm stt-worker:dev    # port 8080
# หรือ: cd services/stt-worker && pnpm dev

# Type check
cd apps/perpos && pnpm exec tsc --noEmit
cd services/pdf-renderer && pnpm type-check

# Lint
pnpm lint

# Build
pnpm build
```

---

## App Router Structure (`apps/perpos/src/app/`)

| Path                    | หน้าที่                                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| `(hydrogen)/`           | Protected routes (ต้อง login)                                                                   |
| `(hydrogen)/assistant/` | ผู้ช่วย AI (per-profile) — แกะเสียง→MoM + usage + billing                                       |
| `(hydrogen)/admin/`     | Admin console                                                                                   |
| `(hydrogen)/sales/`     | ใบเสนอราคา, ใบแจ้งหนี้, ใบเสร็จ                                                                 |
| `(hydrogen)/purchase/`  | ใบสั่งซื้อ, บันทึกค่าใช้จ่าย                                                                    |
| `(hydrogen)/finance/`   | บัญชีธนาคาร, เช็ค, ภาษีหัก ณ ที่จ่าย                                                            |
| `(hydrogen)/journal/`   | สมุดรายวัน                                                                                      |
| `(hydrogen)/accounts/`  | ผังบัญชี                                                                                        |
| `(hydrogen)/inventory/` | สินค้า, สต๊อก                                                                                   |
| `(hydrogen)/payroll/`   | เงินเดือน, พนักงาน                                                                              |
| `(hydrogen)/tax/`       | ภาษีมูลค่าเพิ่ม, ภาษีหัก ณ ที่จ่าย                                                              |
| `(auth)/`               | Login, signup                                                                                   |
| `(mail)/`               | **PERPOS Mail** (webmail) — `/mail`, `/mail/login` · shell ของตัวเอง ไม่มี AuthGuard ของ PERPOS |

---

## API Endpoints — Next.js Route Handlers (`apps/perpos/src/app/api/`)

| Endpoint                              | Method         | File                                      | หน้าที่                                                                                                                                                                                                                 |
| ------------------------------------- | -------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/line/webhook`                   | POST           | `line/webhook/route.ts`                   | LINE Bot webhook หลัก                                                                                                                                                                                                   |
| `/api/line/link-token`                | POST           | `line/link-token/route.ts`                | สร้าง token ผูกบัญชี LINE                                                                                                                                                                                               |
| `/api/line/unlink`                    | POST           | `line/unlink/route.ts`                    | ยกเลิกผูกบัญชี LINE                                                                                                                                                                                                     |
| `/api/assistant/scheduler`            | POST           | `assistant/scheduler/route.ts`            | Cron trigger สำหรับแจ้งเตือน task                                                                                                                                                                                       |
| `/api/admin/users/list`               | GET            | `admin/users/list/route.ts`               | รายชื่อ users                                                                                                                                                                                                           |
| `/api/admin/users/invite`             | POST           | `admin/users/invite/route.ts`             | เชิญ user                                                                                                                                                                                                               |
| `/api/admin/users/delete`             | POST           | `admin/users/delete/route.ts`             | ลบ user                                                                                                                                                                                                                 |
| `/api/admin/users/permissions`        | GET/PUT        | `admin/users/permissions/route.ts`        | จัดการสิทธิ์                                                                                                                                                                                                            |
| `/api/admin/users/orgs`               | GET/PUT/DELETE | `admin/users/orgs/route.ts`               | จัดการ org memberships                                                                                                                                                                                                  |
| `/api/admin/modules`                  | GET/PUT        | `admin/modules/route.ts`                  | ตั้งค่า module ต่อ org                                                                                                                                                                                                  |
| `/api/google-drive/connect`           | POST           | `google-drive/connect/route.ts`           | เชื่อม Google Drive+Calendar                                                                                                                                                                                            |
| `/api/google-drive/callback`          | GET            | `google-drive/callback/route.ts`          | OAuth callback                                                                                                                                                                                                          |
| `/api/google-drive/disconnect`        | POST           | `google-drive/disconnect/route.ts`        | ยกเลิกการเชื่อม                                                                                                                                                                                                         |
| `/api/google-drive/status`            | GET            | `google-drive/status/route.ts`            | ตรวจสถานะการเชื่อม                                                                                                                                                                                                      |
| `/api/org/invite`                     | POST           | `org/invite/route.ts`                     | เชิญเข้า organization                                                                                                                                                                                                   |
| `/api/public/demo-request`            | POST/OPTIONS   | `public/demo-request/route.ts`            | รับฟอร์ม "ขอเดโม" จาก landing (public+CORS, honeypot) → insert `demo_requests` + push LINE แจ้ง super_admin                                                                                                             |
| `/api/assistant/jobs`                 | GET/POST       | `assistant/jobs/route.ts`                 | สร้าง/ดึงงาน (generic, kind=stt)                                                                                                                                                                                        |
| `/api/assistant/jobs/process`         | POST           | `assistant/jobs/process/route.ts`         | claim job + ยิงไป stt-worker                                                                                                                                                                                            |
| `/api/assistant/stt/mom-deliver`      | POST           | `assistant/stt/mom-deliver/route.ts`      | worker callback → PDF → LINE (มี alias เดิม `transcribe/mom-deliver`)                                                                                                                                                   |
| `/api/tmc/*`                          | various        | `tmc/*/route.ts`                          | TMC Management endpoints                                                                                                                                                                                                |
| `/api/accounting/documents`           | GET/POST       | `accounting/documents/route.ts`           | เอกสารขาย 9 ชนิด (+`[id]`, `[id]/convert`, `[id]/pdf`) — เลขที่ผ่าน RPC, snapshot ม.86/4                                                                                                                                |
| `/api/accounting/purchase-documents`  | GET/POST       | `accounting/purchase-documents/route.ts`  | ทะเบียนใบกำกับซื้อ (+`[id]` PATCH `action:"post"` = ลงบัญชี) → ฐานภาษีซื้อ ภ.พ.30                                                                                                                                       |
| `/api/accounting/purchase-tax-report` | GET            | `accounting/purchase-tax-report/route.ts` | รายงานภาษีซื้อ (ประกาศอธิบดีฯ ฉบับ 89) ตามงวดภาษี                                                                                                                                                                       |
| `/api/bi/ask`                         | POST           | `bi/ask/route.ts`                         | ผู้ช่วยวิเคราะห์ธุรกิจ — orchestrator 6 สเต็ป (intent→metric resolve→run→answer+chart) ดู `docs/BI_FEATURE.md`                                                                                                          |
| `/api/bi/threads`                     | GET/POST       | `bi/threads/route.ts` (+`[id]`)           | ประวัติแชท BI ต่อ org ต่อ user                                                                                                                                                                                          |
| `/api/bi/feedback`                    | POST           | `bi/feedback/route.ts`                    | 👍/👎 ต่อคำตอบ                                                                                                                                                                                                          |
| `/api/bi/metrics`                     | GET            | `bi/metrics/route.ts`                     | metric ที่ verified + role เห็นได้ (ทำ "คำถามตัวอย่าง")                                                                                                                                                                 |
| `/api/mail/*`                         | various        | `mail/*/route.ts`                         | **PERPOS Mail** — `oauth/{start,callback,disconnect}` · `account` · `mailboxes` · `messages`(+`[id]`,`bulk`,`undo`) · `attachments/[blobId]` · ห่อด้วย `withMailSession` ใน `api/mail/_lib.ts` (ไม่ใช้ auth ของ PERPOS) |

**Auth helpers** (`app/api/_lib/`):

- `requireAdmin(req)` — Bearer token + `profiles.role = 'admin'`
- `requireUser(req)` — Bearer token + active user
- `CronAuthGuard` — `CRON_SECRET` via `Authorization` header หรือ `x-vercel-cron-secret`

---

## LINE Bot Commands

ทุกคำสั่ง **ต้องขึ้นต้นด้วย `/`** · ข้อความอิสระ (ไม่ขึ้นต้น `/`) ที่ "ดูเป็นคำถาม" → **ผู้ช่วยโฟล์ (Flow RAG)** ตอบ (ดูหัวข้อด้านล่าง) · ข้อความที่ไม่เข้าเงื่อนไขถูก ignore

| คำสั่ง                                    | หน้าที่                                                                                                                                                                          | Permission Key                                       |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `/help`                                   | แสดงคำสั่งทั้งหมด                                                                                                                                                                | —                                                    |
| `/link <token>`                           | ผูกบัญชี LINE                                                                                                                                                                    | —                                                    |
| `/รายรับ <จำนวน> <โน้ต>`                  | บันทึกรายรับ                                                                                                                                                                     | `bot.finance.income_add`                             |
| `/รายจ่าย <จำนวน> <โน้ต>`                 | บันทึกรายจ่าย                                                                                                                                                                    | `bot.finance.expense_add`                            |
| `/mom`                                    | ส่งไฟล์เสียง → ได้รายงานการประชุม (MoM) PDF กลับทาง LINE                                                                                                                         | `bot.assistant.transcribe` (ผู้ช่วย AI, per-profile) |
| `/web`                                    | รับ magic link เข้าเว็บผู้ช่วย AI                                                                                                                                                | —                                                    |
| `/แจ้งปัญหา` `/bug` `/report` `<ข้อความ>` | แจ้งปัญหา/บั๊กเข้า Issue Tracker (`system_issues`, source=line, status=open) → push แจ้ง super_admin · ทุก LINE user ใช้ได้ (provisioned) · dedup ต่อ message + rate-limit 5/วัน | —                                                    |

**หมายเหตุ:** Admin role ข้ามการเช็ค permission ทั้งหมด · คำสั่ง Task Manager เดิม (`/t /tk /d /a /ap`) + ปฏิทิน (`/นัด /วันนี้`) **ยกเลิก/ลบโค้ดแล้ว** (module assistant เดิม + ตาราง `tasks`/`calendar_events` ไม่มีช่องทางสร้างแล้ว)

### ผู้ช่วยโฟล์ (Flow RAG) — บอทตอบคำถามสินค้าด้วย RAG

บอทตอบคำถามเกี่ยวกับ **PERPOS / Flow / Suite** แบบสนทนาบน LINE — ดึงความรู้จาก vector DB (pgvector) + ตอบด้วย Gemini

- **ใครใช้ได้:** ทุกคนที่แอด OA — **ไม่ต้องผูกบัญชี** (pre-sales/ถามก่อนซื้อ) · branch วางก่อนด่าน profile ใน webhook
- **ทริกเกอร์:** free text ที่ผ่าน `isProductQuestion()` (heuristic: มีเครื่องหมาย/คำถาม หรือคำโดเมน PERPOS) เท่านั้น → กันทักทาย/สแปม + คุมต้นทุน
- **flow:** `isProductQuestion` → `incr_flow_chat_usage` (rate-limit 30/คน/วัน) → `answerFlowQuestion()` (embed query → **`match_kb_hybrid` top-20** → **rerank เหลือ 5** → Gemini) → `replyText` **inline** (webhook `maxDuration=30`, latency ~3–5 วิ)
- **hybrid search (2026-08-20):** RPC [`match_kb_hybrid`](supabase/migrations/20260820120000_flow_rag_hybrid_search.sql) = เวกเตอร์ + คำสำคัญ รวมอันดับด้วย **RRF** (k=60) · สายคำสำคัญใช้ **pg_trgm** (`word_similarity` ระดับตัวอักษร ⇒ ใช้กับไทยที่ไม่มีช่องว่างได้ — **ห้ามเปลี่ยนไป `to_tsvector` เพราะ Postgres ไม่มีตัวตัดคำไทย**) + คำละติน/ตัวเลขจากคำถาม โดย**ตัดคำที่โผล่เกิน 40% ของคลังทิ้ง** (`flow`/`perpos` ไม่ช่วยแยกแยะ) · **ทั้งสองสายต้องมีด่านของตัวเองเสมอ** (`min_similarity` 0.6 / `lex_min_similarity` 0.45) ไม่งั้นคำถามนอกเรื่องได้ context ติดมือกลับไปทุกครั้ง · ⚠️ pg_trgm อยู่ schema `extensions` ⇒ ฟังก์ชันต้อง `SET search_path = public, extensions` · **ไม่มี GIN trgm index โดยตั้งใจ** (เรียกเป็นฟังก์ชันจึงใช้ index ไม่ได้ · 40 chunk seq scan ~5 ms) · `match_kb_chunks` เดิมยังอยู่แต่ไม่มี caller แล้ว
- **reranker (2026-08-20):** ชั้นคัดกรองที่สอง [`lib/ai/rerank.ts`](apps/perpos/src/lib/ai/rerank.ts) ใช้ร่วมกับผู้ช่วยขาย TMC — cosine บอกแค่ "เรื่องใกล้กัน" ไม่ได้บอกว่า "ตอบคำถามนี้ได้" · **fail-open เสมอ** (พัง/ช้าเกิน 6 วิ = ใช้ลำดับ retrieval เดิม) ⇒ **ด่าน off-topic ยังเป็น `MIN_SIMILARITY` ของผู้เรียก ห้ามลดเพราะ "มี reranker แล้ว"**
- **embedding:** `gemini-embedding-001` (768 มิติ, `RETRIEVAL_QUERY`/`RETRIEVAL_DOCUMENT`) · **answer:** `gemini-2.5-flash` (`thinkingBudget:0` → เร็วขึ้น ~4 เท่า) · guardrail: ตอบจาก context เท่านั้น ไม่มี→ปฏิเสธสุภาพ + ชวนติดต่อ
- **Knowledge base:** เขียนเองที่ [`docs/knowledge/*.md`](docs/knowledge/) (about/flow/suite/pricing/privacy/pdpa/security) — แก้แล้ว **ต้อง re-embed:** `pnpm kb:embed` ([scripts/kb-embed.mjs](scripts/kb-embed.mjs), อ่าน key จาก `apps/perpos/.env.local`)
- **DB:** `kb_chunks` (vector(768) + hnsw) · `flow_chat_usage` (rate-limit) · RPC `match_kb_chunks` / `upsert_kb_chunk` / `incr_flow_chat_usage` (SECURITY DEFINER, service role เท่านั้น) — migration [`flow_rag_kb.sql`](supabase/migrations/flow_rag_kb.sql)
- **code:** [`lib/assistant/flow-rag.ts`](apps/perpos/src/lib/assistant/flow-rag.ts) (`isProductQuestion`/`retrieveContext`/`answerFlowQuestion`) + `handleFlowChat()` ใน [webhook](apps/perpos/src/app/api/line/webhook/route.ts)
- **หมายเหตุ:** free-text path ยัง**ไม่มี dedup ต่อ `line_message_id`** (ต่างจาก mom/pdf) — เสี่ยง LINE redeliver → ตอบซ้ำ (ความเสี่ยงต่ำเพราะ redelivery default ปิด) ถ้าจะเปิด redelivery ให้เพิ่ม dedup ก่อน · **GEMINI_API_KEY ต้องรองรับ `gemini-embedding-001`** (text-embedding-004 ใช้ไม่ได้กับ key ปัจจุบัน)

**Auto-onboarding (LINE-first / B2C):** เมื่อมี `follow` event (แอด OA) → `provisionLineUser` ([api/line/\_provision.ts](apps/perpos/src/app/api/line/_provision.ts)) สร้าง shadow auth user (email `line.<id>@stt-line.perpos.io`) → trigger สร้าง profile → personal org (= "home org" เก็บไฟล์) + member(owner) + **`personal_module_grants('stt')` (ผู้ช่วย AI, per-profile)** + stt_quota(300นาที = trial) + line_active_org_id → push welcome Flex. idempotent. พิมพ์ `/mom` ได้ทันที — **ไม่แจกโมดูล B2B ใด ๆ**

**2 ผลิตภัณฑ์ที่ขาย (Suite / Flow) + 1 เครื่องมือภายใน (Mail):** Suite = ERP ต่อ org · Flow = ผู้ช่วย AI ต่อ profile · **Mail = กล่องเมลของเราเองและ exworker (เลิกขายแล้ว 2026-08-17)** — ยังคงแยกโดเมน/แยก auth เหมือนเดิม ไม่มีลิงก์เชื่อมกัน (ดู 📘 ด้านบน)

**โมเดล B2B vs B2C (LINE login เท่านั้น — ใช้กับ Suite/Flow · Mail ไม่เกี่ยว):**

- **B2C = ผู้ช่วย AI (key ภายใน `stt`)** — บริการ per-profile (umbrella, ตอนนี้ = ถอดเสียง→MoM, อนาคตเพิ่มตัวช่วยอื่น). subscription แยก (฿99/เดือน, trial 300 นาที), per-profile quota. **URL top-level `/assistant` (= หน้าการใช้งาน, default), `/assistant/stt` (ถอดเสียง), `/assistant/billing` — ไม่มี [org]**. gate = `requireAssistantUser` (เว็บ) / `checkSttAccess` (LINE) = grant `stt` หรือ `bot.assistant.transcribe` หรือ super_admin · ด่านเก็บเงิน = `stt_quota` ที่ stt-worker · **ทุกคนที่แอด LINE ได้อัตโนมัติ** · guard resolve "home org" ภายในไว้เก็บไฟล์/เรียก worker (ไม่โผล่ใน URL)
- **B2B = ERP**: shared (accounting/payroll) + tailor-made (tmc/crm/acc_firm/…) — ระดับ org, **superadmin เปิดให้ต่อ org เท่านั้น** (`admin/modules` = `requireAdmin` = super_admin) · **module `assistant` เดิม (Task Manager) ถูกยกเลิกทิ้งหมดแล้ว**
- **สลับ STT ↔ ERP**: header มีปุ่ม **"ผู้ช่วย AI"** (→ `/assistant`) + org switcher (ERP) · B2C เห็นแค่ผู้ช่วย · B2B เห็นทั้งคู่ · super_admin → `/admin` (เลือกเข้า org/assistant)
- **redirect หลัง login**: ผู้ช่วย AI / Perpos Flow (B2C) เป็น default หลักของทุกคน > ERP (B2B, เฉพาะ org-only ที่ไม่มีผู้ช่วย) > no-org · super_admin → /admin
- **`assistant` ใน path/route group** = ผู้ช่วย AI per-profile (`(hydrogen)/assistant/*`, อยู่ใน SYSTEM_SEGMENTS — ไม่ใช่ org slug). API: generic `/api/assistant/{jobs,jobs/process,quota,stats}` + STT-เฉพาะ `/api/assistant/stt/{mom-pdf,mom-deliver,checkout,portal}` · guard per-profile (`requireAssistantUser` → kind-aware ผ่าน `ASSISTANT_KINDS` ใน [lib/assistant/kinds.ts](apps/perpos/src/lib/assistant/kinds.ts))
- หมายเหตุ: job hub = **`assistant_jobs`** (generic, มีคอลัมน์ `kind`) · ของที่เป็น STT แท้คงชื่อ `stt_*` (`stt_quota/stt_subscriptions/stt_plans`) + `stt-worker` + bucket `assistant_audio` + `kind='stt'` — user-facing = "ผู้ช่วย AI" ทั้งหมด

---

## Issue Tracker — ติดตามปัญหาทั้งระบบ (admin + LINE + agent ใช้ฐานเดียวกัน)

ระบบ tracking ปัญหา (bug/user-error/config-infra/feature-gap) ที่ **คนและ AI agent ใช้ร่วมกัน** — single source of truth = ตาราง `system_issues`.

- **เลขอ้างอิง** type-prefix นับแยกต่อ prefix (RPC `next_issue_ref`): `BUG-`(bug) `OPS-`(config_infra) `UX-`(user_error) `FEAT-`(feature_gap) · **immutable** (freeze ตอนสร้าง, type เปลี่ยนได้แต่ ref คงเดิม)
- **3 ช่องทางแจ้ง:** (1) **LINE** — `/แจ้งปัญหา`·`/bug`·`/report <ข้อความ>` ([webhook](apps/perpos/src/app/api/line/webhook/route.ts) `handleReportIssue`: ทุก LINE user แจ้งได้, dedup ต่อ `line_message_id` + rate-limit 5/วัน, `status=open`) · (2) **admin** กรอกเองที่ `/admin/issues` · (3) **agent** (Fix Factory) ตอนรับเคส
- **status lifecycle:** `open → triaging → diagnosing → fixing → verifying → fixed → deployed → closed` (+ `blocked/wontfix/duplicate/handoff_feature`) · **`fixed` = แก้เสร็จใน branch ยังไม่ deploy** ≠ `deployed` (ขึ้น prod) — agent หยุดที่ `fixed`, คนปิด (deployed/closed) เอง
- **หน้า admin** `(hydrogen)/admin/issues/*` (super_admin, SSR) — dashboard (MTTR/เปิดค้าง/by source) + list/filter + detail/timeline + ปุ่มคัดลอกคำสั่ง `/fix-issue <ref>`
- **API** (`requireAdmin`): `POST /api/admin/issues` (สร้าง) · `PATCH /api/admin/issues/[ref]` (เปลี่ยนสถานะ/แก้/โน้ต → timeline event + เมื่อ deployed/closed & source=line → push แจ้งผู้รายงาน กลับ LINE = close-the-loop)
- **agent เขียนผ่าน RPC เท่านั้น** (parameterized, ห้ามต่อ raw SQL): `agent_create_issue(...)` / `agent_log_issue(ref, status?, root_cause?, …)` — SECURITY DEFINER, service-role · fix-issue skill ขยับสถานะทุก phase สด + commit อ้าง ref `(BUG-12)`
- **fetch logic** = [lib/admin/issues.ts](apps/perpos/src/lib/admin/issues.ts) (`listIssues`/`getIssueByRef`/`getIssueStats`) · ตาราง: `system_issues` · `system_issue_events` · `issue_counters` · `issue_report_usage` (RLS deny-all, super_admin/agent ผ่าน service-role)

---

## ต้นทุนการใช้งาน (Usage Metering) — ฐานสำหรับออกแบบราคาขาย

หน้า **`/admin/usage`** (super_admin, SSR) รวม "ทุกอย่างที่เสียเงินตามการใช้งาน" เพื่อดู unit economics จริง

- **แยก 2 โมเดลเด็ดขาดด้วย `usage_events.scope` (binding)** — Flow เป็นบริการ **per-profile** จึงคิดต้นทุน
  **ต่อผู้ใช้ ไม่ใช่ต่อองค์กร** (org_id ที่ติดมากับงาน = home org ไว้เก็บไฟล์เท่านั้น)
  - `scope='flow'` → แท็บ **"ต่อผู้ใช้ (Flow)"** (RPC `admin_usage_by_user`) · `scope='suite'` → แท็บ **"ต่อองค์กร (Suite)"** (`admin_usage_by_org`)
  - ตั้งโดย **trigger `trg_usage_events_scope` เท่านั้น** (feature ขึ้นต้น `assistant.` หรือ org เป็น `organizations.is_personal`)
    — **ห้ามให้ผู้เรียกส่ง scope เอง** และห้ามคิดต้นทุน Flow เป็นของ org
  - `organizations.is_personal` = org "พื้นที่ส่วนตัว" ที่ provisioning สร้าง · `ensurePersonalOrg`/`resolveHomeOrg`
    **ห้าม fallback ไป org ลูกค้า** (บั๊กเดิม: super_admin ที่เป็น owner ของ `justme` ทำให้ต้นทุน STT/PDF ส่วนตัว
    กองที่ลูกค้า จน justme กลายเป็น org ที่แพงที่สุดทั้งที่ไม่เคยเรียก worker) — migration `20260802120000_usage_scope_flow_suite`
  - ปันส่วนต้นทุนคงที่: `pro_rata` เฉลี่ยข้าม **ทั้ง org และผู้ใช้** (Vercel/Supabase รับใช้ทั้งสองฝั่ง) · `per_org` แจกเฉพาะ org

- **ตารางกลาง `usage_events`** (append-only, RLS deny-all, service-role เท่านั้น) — 1 แถว = 1 ต้นทุนที่เกิดขึ้น
  (`org_id`/`profile_id`/`service`/`feature`/`resource`/`quantity`/`unit`/tokens/`cost_usd`/`ref_table`+`ref_id`)
  - **`cost_usd` ถูก freeze ตอนเขียน** — แก้ราคาวันนี้ต้องไม่ย้อนเปลี่ยนต้นทุนเดือนก่อน
  - `usage_events_ref_uniq (ref_table, ref_id, feature)` กันนับซ้ำเวลา trigger ยิงซ้ำ/backfill ทับ
  - `org_id` เป็น NULL ได้ = ต้นทุนที่ยังผูกเจ้าของไม่ได้ → **ไม่แสดงเป็นแถวในตาราง** แต่ยังนับใน
    `totals` + ขึ้นแถบเตือนสีเหลืองเสมอ (`totals.unattributedUsd` — **ห้ามตัดทิ้งจากยอดรวม**)
- **2 ทางที่ข้อมูลไหลเข้า**
  1. **DB trigger — เฉพาะงานที่ Cloud Run worker เรียก Gemini เอง** (ไม่ผ่าน `aiChat` ฝั่งแอป
     → `recordUsage` มองไม่เห็น) มี 2 ตาราง: `assistant_jobs` (stt + pdf_compress) · `ocr_processing_jobs`
     → **worker ไม่ต้อง redeploy** · ทุกตัวมี `EXCEPTION WHEN OTHERS` (metering พังห้ามทำให้งานที่เสร็จแล้ว rollback)
     · `kind='pdf_compress'` = `compute` ไม่ใช่ `gemini` (ไม่เรียก AI) · STT/OCR นับ **ทั้ง Gemini และ compute ของ worker**
     · ⚠️ `gemini:ocr_job` ยังเป็น **ค่าประมาณ** เพราะ `ocr_processing_jobs` ไม่มีคอลัมน์ token —
     ถ้าจะให้เป๊ะต้องให้ ocr-worker เก็บ `usageMetadata` แล้วเปลี่ยน trigger มาคิดจาก token จริง
     - ⚠️ **ห้ามเพิ่ม trigger ให้ตารางที่ฟีเจอร์นั้นเรียก AI ผ่าน `aiChat`/`aiEmbed` อยู่แล้ว** — จะนับซ้ำ 2 เท่า
       (เคยพลาดมาแล้วกับ `bi_query_log` + `acc_firm_ai_log` → ถอด trigger ทิ้งใน migration `..._fix_double_count`)
  2. **`recordUsage()`** ([lib/usage/record.ts](apps/perpos/src/lib/usage/record.ts)) = **แหล่งนับต้นทุน AI หลัก** —
     ต่อไว้ที่ `aiChat`/`aiEmbed` ([lib/ai/client.ts](apps/perpos/src/lib/ai/client.ts)) · `sendLineMessages` · reply ของบอท PERPOS + @tmcvilla
     - เขียนจริงผ่าน `after()` ของ Next 15 (**ห้ามเปลี่ยนเป็น `void insert()` ลอย ๆ** — บน Vercel ฟังก์ชันถูก freeze ตอนตอบ event จะหาย)
     - merge บริบทจาก ambient context **ก่อน** เลื่อนงาน (AsyncLocalStorage หายหลัง response)
- **บริบทเจ้าของต้นทุนใช้ ambient context** ([lib/usage/context.ts](apps/perpos/src/lib/usage/context.ts)) — ห่อ handler ด้วย
  `withUsageContext({ orgId, profileId, feature }, fn)` ครั้งเดียว แล้ว `recordUsage` ที่อยู่ลึกแค่ไหนก็ผูก org ถูก
  (ต่อไว้แล้ว: `bi/ask` · `line/webhook` (ตั้งต่อ event ด้วย `setUsageContext` — ลูปมี `continue` หลายสิบจุด
  ห่อ callback ไม่ไหว) · `line/tmc/webhook` · `acc-firm/close-check` · `gov-procure/ai/{brief,anomaly}` ·
  `gov-procure/catalogs/[id]/enrich/run` · `just-me/ai/{quote-summary,project-health}`)
  — **route ใหม่ที่เรียก AI/LINE ต้องห่อด้วย ไม่งั้นต้นทุนไปกอง "ไม่ระบุองค์กร"**
- **สูตรเงินมีเทสคุม** ([lib/admin/usage.test.ts](apps/perpos/src/lib/admin/usage.test.ts)) — `prorateFixedCosts` เฉลี่ยต้นทุนคงที่
  ตาม **วันที่ทับกับเดือนนั้นจริง** (ห้ามใช้ `days/30` รวบเดียว — ช่วง 90 วันจะกวาดของ 4 เดือนมาเต็มจำนวน)
- **ราคา/สมมติฐานแก้ได้จากหน้าเว็บ ไม่ต้อง deploy**: `usage_prices` (ราคาต่อหน่วยรายทรัพยากร) · `usage_settings` (เรต USD→THB + ตัวคูณราคาขาย) ·
  `usage_fixed_costs` (Vercel/Supabase/โดเมน รายเดือน → ปันส่วนเข้า org แบบ `pro_rata`/`per_org`/`none`) — เขียนผ่าน `/api/admin/usage` (`requireAdmin`)
- **สอบทานกับบิล GCP จริง (ก.ค. 2026)** — ราคาต่อ token ที่ตั้งไว้ถูกทุกตัว · `usd_thb_rate` = **33.5535**
  (= `currency_conversion_rate` ที่ Google ใช้ออกบิลจริง ไม่ใช่ 35 · ปรับจาก 33.35 เมื่อ 2026-08-08 ให้ตรงกับ
  export → ยอดในแท็บโครงสร้างพื้นฐานตรงกับคอนโซลเป๊ะ) · Cloud Run มี **ส่วนลด spending-based 15.2%**
  ต้องคิดเป็นเรตสุทธิ
  - ⚠️ **บิล GCP ทั้งใบไม่ใช่ของ perpos** — GCP project `perpos` แชร์กับ `exapp-clip-renderer` ซึ่งกิน
    **98.6% ของค่า Cloud Run** (฿958 จาก ฿972 ในเดือน ก.ค.) · ต้นทุน GCP ของ perpos จริง ๆ ≈ ฿104/เดือน
    **เวลาอ่านบิลต้องแยกด้วย `service_name` จาก Cloud Monitoring เสมอ ห้ามเหมาทั้งใบ**
- **แท็บ "โครงสร้างพื้นฐาน" ครอบทุกแอป — perpos = จุดควบคุมกลาง** (ตาราง `infra_costs`)
  **billing account เหลือใบเดียว = `perpos` (01A657-0A41D8-3265B1)** — ย้าย project ของ exapp
  (`exworker-435807`, `gen-lang-client-0897830354`) มาผูกใบนี้แล้ว 2026-08-02 บัญชี `exapp`
  (0110AE-…) เหลือ 0 project · ค่าใช้จ่ายก่อนวันย้ายยังอยู่ใบเก่า · **แอปใหม่ให้ผูกใบ perpos เสมอ**
  (บิลใบเดียว = ส่วนลด spending-based กองเดียว + BigQuery export ชุดเดียวครบทุกแอป)
  - **2 source ที่เป็นตัวเลขคนละชุดของเดือนเดียวกัน — ห้ามบวกรวมกัน** (หน้าเว็บสลับดูทีละอันด้วย `?src=`)
    1. `monitoring` — `pnpm infra:sync [YYYY-MM]` วนทุก project ที่ระบุใน `GCP_PROJECTS`
       (default `perpos:perpos,exworker-435807:exapp`) → **ค่าประมาณ** ของ Cloud Run เท่านั้น
       (usage × เรตใน `usage_prices`) · แอปตัดสินจาก prefix ชื่อ service ก่อน ไม่มี prefix ค่อยตกเป็น
       แอปเจ้าของ project (`post-worker`/`drive-sync` → exapp)
    2. `billing_export` — `pnpm billing:sync [YYYY-MM]` อ่าน **บิลจริงหักเครดิตแล้ว** จาก BigQuery
       (`perpos.billing_export.gcp_billing_export_v1_*`) ครบทุกบริการ (Gemini/Storage/Network) แยก SKU
       · เขียนแบบ **ลบทั้งเดือนแล้วใส่ใหม่** เพราะ Google ปรับยอดย้อนหลังได้
       · **แอปตัดสินจาก label `app` บนตัว service ก่อน** (`labels` ใน export) แล้วค่อยตกไปที่ mapping ตาม
       project — เพราะ GCP project `perpos` มี `exapp-clip-renderer` อยู่ด้วย ถ้าดูตาม project อย่างเดียว
       ค่า instance-based CPU ของ exapp (~฿51/เดือน) จะถูกนับเป็นของ perpos · **service ใหม่ทุกตัวต้องติด
       `--update-labels app=perpos|exapp` ตอน deploy** (ติดครบ 8 ตัวแล้ว 2026-08-08) · ⚠️ label **มีผลกับ
       usage หลังวันที่ติดเท่านั้น ไม่ย้อนหลัง** — แถวเก่ายังตกไปใช้ mapping ตาม project เหมือนเดิม
       · ⚠️ **คอลัมน์ `cost` ใน export เป็นสกุลเงินของ billing account (ของเรา = THB) ไม่ใช่ USD** —
       ต้องหารด้วย `currency_conversion_rate` ที่มาในแถวนั้นเสมอ (= เรตที่ Google ใช้ออกบิลเดือนนั้นจริง
       · บัญชีสกุล USD จะได้ rate = 1) ไม่งั้นหน้าเว็บที่คูณ `usd_thb_rate` ซ้ำจะโชว์สูงเกินจริง ~33 เท่า
       — เคยพลาดมาแล้ว: Gemini ส.ค. จริง ฿23.7 แต่ขึ้นเป็น ฿782 (แก้ 2026-08-08)
       · บิลมีบรรทัดติดลบตามปกติ (`Invoice / Billing Adjustment`, `Rounding Error`) → `infra_costs.cost_usd`
       **ห้ามมี CHECK >= 0** (ถอดแล้ว migration `20260808090000_infra_costs_allow_negative`) และห้ามกรองทิ้ง
  - ⚠️ BigQuery export **ต้องเปิดในคอนโซลเท่านั้น** (ไม่มีคำสั่ง gcloud) และ **ไม่ backfill** —
    เปิดไว้แล้วที่บัญชี perpos → `perpos.billing_export` (2026-08-01) ครอบทุก project แล้ว
    · ถ้าอนาคตแยก billing account อีกใบ **ต้องเปิด export ของใบนั้นด้วย** และปลายทางเลือกได้เฉพาะ
    project ที่อยู่ใต้บัญชีนั้น (ยิงข้ามบัญชีไม่ได้) → สคริปต์ต้องอ่านหลาย dataset
  - **sync อัตโนมัติรายวันแล้ว (2026-08-08)** — scheduler tier `t1440` เรียก `runDailyCostSync()`
    ([lib/admin/cost-sync.ts](apps/perpos/src/lib/admin/cost-sync.ts) — port ตรรกะเดียวกับสคริปต์มือทั้งสองตัว)
    ทั้ง `billing_export` + `monitoring` เดือนปัจจุบัน (+เดือนก่อนช่วง 3 วันแรกของเดือน เพราะ export lag
    และ Google ปรับยอดย้อนหลังได้) · auth ด้วย **service account key read-only ใน env `GCP_SYNC_SA_KEY`**
    (เซ็น JWT ด้วย node:crypto แลก token เอง — ไม่มี dependency เพิ่ม) · **ไม่ตั้ง env = เงียบ ไม่ error**
    · เหตุที่ต้องมี: ท่อ billing_export วางเสร็จ 2 ส.ค. แต่ "ลืมรัน" จนไม่มีข้อมูลเข้า DB เลย
    ตอบคำถาม "cost Gemini มาจากไหน" ไม่ได้ทั้งเดือน · สคริปต์มือ (`pnpm billing:sync`/`infra:sync`
    ยืม token จาก `gcloud` ของเครื่อง dev) ยังใช้ backfill/เดือนย้อนหลังได้เหมือนเดิม
    หน้าเว็บอ่านจาก snapshot ในตารางอย่างเดียว
  - **บทเรียนราคาแพงที่เจอจากตรงนี้**: `exapp-clip-renderer` เป็น 8 vCPU + `--no-cpu-throttling`
    แต่ถูก Cloud Scheduler ปลุกทุก 10 นาทีด้วย watchdog ที่ทำแค่ SELECT+UPDATE → **฿886/เดือน (92%
    ของบิล exapp)** ทั้งที่ render จริงเดือนละ ~11 ครั้ง · ย้ายไป `pg_cron` แล้ว (schema `exapp`
    ใช้ Supabase project เดียวกัน) — **service ที่เปิด `--no-cpu-throttling` ห้ามให้ cron ปลุกถี่ ๆ
    ด้วยงานเบา ๆ** ให้ดูคอลัมน์ "฿/request" ในแท็บโครงสร้างพื้นฐานเป็นสัญญาณเตือน
  - **gemini-3-pro โผล่ในบิลแต่ไม่ได้มาจากโค้ด perpos** (เราใช้ 2.5-flash + embedding-001) — น่าจะเป็น
    AI Studio playground หรือแอปอื่นที่ใช้ key เดียวกัน · ใส่ราคาไว้แล้วกันนับเป็น 0
- **ยอดรวมทุกช่องมาจาก SQL aggregate** (RPC `admin_usage_by_org` / `admin_usage_by_user` / `admin_usage_by_feature` / `admin_usage_daily`, service-role เท่านั้น)
  — **ห้าม sum array ฝั่ง JS** เพราะ PostgREST ตัด 1,000 แถวเงียบ ๆ · fetch logic = [lib/admin/usage.ts](apps/perpos/src/lib/admin/usage.ts)

---

## Database Schema (Supabase)

### ตารางหลัก

| Table | หน้าที่ |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `profiles` | Users (id, email, role, line_user_id, is_active) |
| `user_permissions` | สิทธิ์รายฟังก์ชัน (user_id, function_key, allowed) |
| `tasks` | AI Task Manager (profile_id, title, status, priority, due_at, remind_at) |
| `calendar_events` | นัดหมาย LINE Bot (profile_id, starts_at, title) |
| `finance_entries` | รายรับ/รายจ่าย LINE Bot (profile_id, entry_type, amount) |
| `assistant_jobs` (เดิม `transcription_jobs`) | job hub ใต้ร่ม assistant (kind, profile_id, source web/line, status, transcript_json, duration_seconds) — kind=`stt` ปัจจุบัน |
| `stt_quota` | โควต้าแกะเสียงต่อคน (profile_id, limit_seconds default 18000=300นาที, used_seconds) — admin ปรับ limit ได้ |
| `stt_usage_transactions` | ledger การใช้โควต้า (debit/refund) — RPC `consume_stt_quota`/`refund_stt_quota` (service role) atomic reserve+refund; quota บังคับใช้ที่ stt-worker (วัดความยาวด้วย music-metadata ก่อนเรียก Gemini) · API: `GET /api/assistant/quota`, `GET                   | PUT /api/admin/stt-quota` |
| `kb_chunks` | Knowledge base ผู้ช่วยโฟล์ (RAG) — source/heading/content + embedding vector(768) + hnsw · embed ด้วย `pnpm kb:embed` |
| `flow_chat_usage` | rate-limit ผู้ช่วยโฟล์ (line_user_id, day, count) — RPC `incr_flow_chat_usage` |
| `system_issues` | **Issue Tracker** — ปัญหาทั้งระบบ (ref BUG-/OPS-/UX-/FEAT- immutable, type/severity/status/area[]/root_cause/fix_summary/branch/source admin\|agent\|line\|signal/reported_by/dedup_key) · ดูหัวข้อ "Issue Tracker" ด้านล่าง |
| `system_issue_events` | timeline ของแต่ละ issue (status_change/edited/note) · `issue_counters` (เลขต่อ prefix) · `issue_report_usage` (rate-limit แจ้งผ่าน LINE) |
| `line_link_tokens` | token ผูกบัญชี LINE (expires 10 นาที) |
| `google_drive_tokens` | OAuth tokens Google Drive |
| `organizations` | บริษัท/องค์กร |
| `organization_members` | สมาชิกองค์กร |
| `orders` / `order_items` | ออเดอร์ขาย |
| `sales_quotes` / `sales_invoices` | ใบเสนอราคา / ใบแจ้งหนี้ |
| `customers` / `workers` | ลูกค้า / พนักงาน |
| `acc_documents` / `acc_document_lines` | เอกสารขาย 9 ชนิด + snapshot ผู้ขาย/ผู้ซื้อ (ม.86/4) + `ref_document_id` (ใบลด/เพิ่มหนี้) — ดู [`docs/ACCOUNTING_FEATURE.md`](docs/ACCOUNTING_FEATURE.md) |
| `acc_purchase_documents` / `_lines` | ใบกำกับภาษีซื้อที่ได้รับจากผู้ขาย + `is_vat_claimable` (ม.82/5) + `wht_form` (ภ.ง.ด.3/53) + `ocr_job_id` |
| `acc_document_shares` | ลิงก์สาธารณะส่งเอกสารให้ลูกค้า (`/d/<token>`) — token 192-bit, เพิกถอน/หมดอายุได้, RLS deny-all (service role เท่านั้น) |
| `acc_doc_sequences` | เลขรันเอกสารต่อ (org, ชนิด, ปี) — RLS deny-all, จ่ายเลขผ่าน RPC `next_acc_doc_number()` แบบ atomic เท่านั้น |
| `demo_requests` | Lead "ขอเดโม" จากหน้า landing (name, phone, product, source, status new→contacted→…) — เขียนผ่าน `/api/public/demo-request`, ดูที่ `/admin/leads` (RLS deny-all, service role) |
| `bi_metrics` | semantic layer ของผู้ช่วยวิเคราะห์ธุรกิจ (ไม่มี `org_id` — นิยามกลาง) + `bi_threads`/`bi_messages`/`bi_dashboards`/`bi_dashboard_items`/`bi_query_log`/`bi_usage_daily` (REVOKE จาก anon/authenticated ทุกตัว) — ดู [`docs/BI_FEATURE.md`](docs/BI_FEATURE.md) |

### tasks table (status values)

`pending` → `in_progress` → `completed` / `cancelled` / `postponed`

### tasks table (priority values)

`low` | `medium` | `high` | `urgent`

---

## Supabase Clients

```typescript
// Browser (client components)
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

// Server (server components, API routes)
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Admin — bypass RLS (API routes only, ใช้ service role key)
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
```

---

## Library (`apps/perpos/src/lib/`)

| Path                                    | หน้าที่                                                                          |
| --------------------------------------- | -------------------------------------------------------------------------------- |
| `lib/assistant/stt-trigger.ts`          | triggerSttWorker — atomic claim job + ยิงไป stt-worker                           |
| `lib/assistant/mom-html.ts`             | buildMomHtml + MOM_FOOTER_TEMPLATE (ใช้ร่วม mom-pdf/mom-deliver)                 |
| `lib/assistant/stt-cost.ts`             | โมเดลราคา Gemini สำหรับคิดต้นทุนต่อ job                                          |
| `lib/assistant/flow-rag.ts`             | ผู้ช่วยโฟล์ (RAG) — isProductQuestion + retrieveContext + answerFlowQuestion     |
| `lib/ai/rerank.ts`                      | reranker ของ RAG (flow-rag + tmc sales-bot) — คัด top-k ด้วย Gemini · fail-open  |
| `lib/accounting/sales-journal.ts`       | จุดรับรู้รายได้ฝั่งขาย + `selectBillingDocuments`/`billingSign` (กฎเดียวกับ KPI) |
| `lib/accounting/purchase-journal.ts`    | ลงบัญชีฝั่งซื้อ (Dr ค่าใช้จ่าย+ภาษีซื้อ / Cr เจ้าหนี้+WHT) idempotent            |
| `lib/accounting/document-html.ts`       | HTML A4 ของเอกสารภาษี (ส่งเข้า pdf-renderer) + `bahtText` แหล่งเดียว             |
| `lib/accounting/paging.ts`              | กัน PostgREST ตัด 1,000 แถวเงียบ — คืน `total` + `truncated`                     |
| `lib/mail/{jmap,session,oauth}.ts`      | PERPOS Mail — เรียก JMAP · cookie session เข้ารหัส · OAuth+PKCE กับ Stalwart     |
| `lib/mail/{sanitize,srcdoc}.ts`         | ล้าง HTML ของเมล + ประกอบ srcdoc ที่มี CSP (ด่านกัน XSS ของบานอ่าน)              |
| `lib/mail/{messages,boxes}.ts`          | แปลง JMAP ↔ DTO + fetch logic ที่เดียว · ป้าย/ลำดับกล่องเมลแหล่งเดียว            |
| `lib/observability/scrub-mail.ts`       | ตัด query/body/breadcrumb ของ `/api/mail/*` ก่อนส่ง Sentry                       |
| `lib/line/send-messages.ts`             | Push/multicast LINE messages                                                     |
| `lib/google/drive.ts`                   | Google Drive OAuth + upload                                                      |
| `lib/supabase/{client,server,admin}.ts` | Supabase clients                                                                 |

---

## Environment Variables

| Variable                              | หน้าที่                                                                                                                                                                                                          | จำเป็น              |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`            | Supabase project URL                                                                                                                                                                                             | ✅                  |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`       | Supabase anon key                                                                                                                                                                                                | ✅                  |
| `SUPABASE_SERVICE_ROLE_KEY`           | Supabase service role (server only)                                                                                                                                                                              | ✅                  |
| `LINE_MESSAGING_CHANNEL_SECRET`       | LINE webhook signature verify                                                                                                                                                                                    | ✅                  |
| `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN` | ส่งข้อความ LINE                                                                                                                                                                                                  | ✅                  |
| `LINE_LOGIN_CHANNEL_ID`               | LINE Login (เข้าเว็บด้วย LINE) — channel ID                                                                                                                                                                      | LINE login          |
| `LINE_LOGIN_CHANNEL_SECRET`           | LINE Login — channel secret                                                                                                                                                                                      | LINE login          |
| `TMC_LINE_CHANNEL_SECRET`             | LINE OA @tmcvilla (ผู้ช่วยขาย TMC) — verify webhook signature · **คนละ channel กับบอท PERPOS**                                                                                                                   | tmc sales bot       |
| `TMC_LINE_CHANNEL_ACCESS_TOKEN`       | LINE OA @tmcvilla — reply/push/ดึงโปรไฟล์ลูกค้า                                                                                                                                                                  | tmc sales bot       |
| `TMC_BOT_ORG_SLUG`                    | ระบุ org เจ้าของ @tmcvilla (ไม่ต้องตั้งถ้ามี org เดียวที่เปิด module `tmc`)                                                                                                                                      | optional            |
| `CRON_SECRET`                         | ป้องกัน scheduler endpoint                                                                                                                                                                                       | ✅                  |
| `PDF_RENDER_URL`                      | PDF microservice URL — ต้องเป็น **perpos-pdf-renderer** (อย่าชี้ `exapp-pdf-renderer` คนละแอป)                                                                                                                   | optional            |
| `PDF_SERVICE_SECRET`                  | PDF service auth                                                                                                                                                                                                 | optional            |
| `OCR_WORKER_URL`                      | URL ของ ocr-worker (Cloud Run) สำหรับ AI bookkeeping                                                                                                                                                             | acc_firm            |
| `STT_WORKER_URL`                      | URL ของ stt-worker (Cloud Run) สำหรับแกะเสียงเป็นข้อความ                                                                                                                                                         | assistant           |
| `WORKER_SECRET`                       | shared secret เรียก ocr-worker/stt-worker (`x-worker-secret`)                                                                                                                                                    | acc_firm/assistant  |
| `GEMINI_API_KEY`                      | Gemini OCR/classify/journal + speech-to-text (ตั้งที่ ocr-worker + stt-worker)                                                                                                                                   | acc_firm/assistant  |
| `GCP_SYNC_SA_KEY`                     | service account key JSON (read-only: BigQuery jobUser+dataViewer, Monitoring viewer) สำหรับ sync บิล GCP รายวันใน scheduler — ไม่ตั้ง = ข้ามงานนี้เงียบ ๆ                                                        | optional            |
| `SMTP_*`                              | Email invite                                                                                                                                                                                                     | optional            |
| `MAIL_JMAP_URL`                       | JMAP endpoint ของ Stalwart — prod = `https://mailserver.perpos.ai/jmap/`                                                                                                                                         | PERPOS Mail         |
| `MAIL_OAUTH_ISSUER`                   | issuer ของ OAuth — prod = `https://login.perpos.ai` (alias ของเครื่องเมล · ชื่อที่ลูกค้าเห็นตอนกรอกรหัสผ่าน)                                                                                                     | PERPOS Mail         |
| `MAIL_OAUTH_CLIENT_ID`                | public client + PKCE (ลงทะเบียนด้วย `POST <issuer>/auth/register` · redirect ต้องตรงเป๊ะ)                                                                                                                        | PERPOS Mail         |
| `MAIL_SESSION_SECRET`                 | **base64 ของ 32 ไบต์** (หลายคีย์คั่น `,` = หมุนคีย์ได้) — ผิดรูปแบบ = ระบบถือว่ายังไม่ตั้งค่า                                                                                                                    | PERPOS Mail         |
| `MAIL_APP_BASE_URL`                   | โดเมนของ webmail (`https://mail.perpos.ai`) ใช้ประกอบ `redirect_uri` — **ห้ามใช้ `APP_BASE_URL` ร่วมกับ Suite/Flow** (ไม่ตั้ง = fallback ไปตัวนั้น)                                                              | PERPOS Mail         |
| `MAIL_ADMIN_API_KEY`                  | API key ของแอดมิน Stalwart — ใช้เฉพาะ `/admin/mail` (หลังบ้านของเรา) ผ่าน [lib/mail/admin-api.ts](apps/perpos/src/lib/mail/admin-api.ts) · **ห้ามใช้ในเส้นทางของลูกค้า** · ไม่ตั้ง = หน้าขึ้น "ยังไม่ได้ตั้งค่า" | PERPOS Mail (admin) |

---

## Notification Scheduler

Endpoint: `POST /api/assistant/scheduler`

- ป้องกันด้วย `Authorization: Bearer <CRON_SECRET>` หรือ `x-vercel-cron-secret`
- **ตัวรันหลัก (ตั้งแต่ 2026-08-19) = worker process `perpos-worker` ใน docker compose** — loop ทุก 60 วิ ([src/worker/scheduler-worker.ts](apps/perpos/src/worker/scheduler-worker.ts) → `runScheduler()` ใน [lib/scheduler/run.ts](apps/perpos/src/lib/scheduler/run.ts)) · CI bundle ด้วย esbuild (`pnpm build:worker` → `apps/perpos/worker/scheduler-worker.js` ในก้อน artifact เดียวกับแอป) · **ห้ามมี `next/*` import ในเส้นทางของ `lib/scheduler/run.ts`** · endpoint HTTP ยังอยู่ไว้ยิงมือ/สำรอง (crontab เดิมถอดออกแล้ว · Google Cloud Scheduler PAUSED)
  - **กันรันซ้อน**: single-flight ใน process + **lease ใน DB** (`scheduler_leases` · RPC `scheduler_acquire_lease`/`scheduler_release_lease`, TTL 20 นาที) — worker 2 ตัว/HTTP ยิงพร้อมกัน = ตัวหลังข้ามรอบ (`skipped:"locked"`) · RPC พัง = fail-open (งานทุกตัว idempotent)
  - **graceful shutdown**: SIGTERM → รอรอบปัจจุบันจบ (เพดาน 100 วิ) แล้ว exit · compose `stop_grace_period: 120s` · crash → `restart: unless-stopped` · เฝ้าด้วย `EXPECTED_CONTAINERS` (`container:perpos-worker`) ไม่ใช่ `cron:` แล้ว
- Logic (เหลือเฉพาะงาน STT — task/briefing/follow-up เดิมถูกลบแล้ว):
  - Stuck STT jobs (`processing` ค้าง) → mark failed + refund quota + แจ้ง LINE
  - Requeue pending STT jobs (worker ไม่ว่าง/trigger พลาด) → ยิงซ้ำ, เกิน 30 นาที = ยอมแพ้
  - PDPA cleanup → ลบไฟล์เสียงดิบเมื่อ job ถึงสถานะสุดท้าย + ลบ PDF/transcript เมื่อเก่า >48 ชม.
- **Tier gating (ลด Active CPU บน Vercel Fluid)**: งานกู้คืน/เตือนที่ time-sensitive (stuck/requeue STT+PDF, recall lifecycle, calendar reminder 5 นาที) รัน **ทุกรอบ** · งาน cleanup/sweep ที่ไม่เร่งด่วน gate ให้รันห่างขึ้นด้วยตาราง `scheduler_tier_runs` (เก็บ last-run ต่อ tier, gate ด้วย elapsed time จึง robust กับทุก cron cadence): **t5** (calendar sync, auto top-up) · **t15** (PDPA/privacy cleanups, purge recall media) · **t60** (`webhook_event`/`file_links` cleanup, token expiry sweep, **เอกสารขายเลยกำหนดชำระ → `overdue` อัตโนมัติ**) · idempotent — mark tier หลังงานสำเร็จ, crash ก่อน mark = retry รอบหน้า

---

## Conventions

- **Migration**: เพิ่มไฟล์ `.sql` ใน `supabase/migrations/` ชื่อ `YYYYMMDDHHMMSS_description.sql`
- **RLS**: ทุก table ใหม่ต้อง enable RLS และมี policy
- **API routes**: ใช้ `createAdminClient()` จาก `app/api/_lib/supabase.ts` เสมอ (ไม่ใช้ anon key ใน Route Handlers)
- **Permission check**: เช็คผ่าน `user_permissions` table, admin role bypass ทั้งหมด
- **LINE reply**: ใช้ `replyText()` / `replyFlex()` ใน webhook — ใช้ token ได้ครั้งเดียว
- **LINE push**: ใช้ `sendLineMessages()` จาก `lib/line/send-messages.ts`
- **LINE Flex Card**: ทุกการ์ดต้องตามคัมภีร์ [`docs/line-flex-card-guide.md`](docs/line-flex-card-guide.md) — header CHARCOAL `#3C3B3D` พื้นเรียบ (ห้าม gradient), token สีจาก DESIGN.md §2, ต้นแบบ = `buildLinkConfirmFlex` / `buildBotFlex`
- **Unit test (vitest)**: กฎที่ "ผิดแล้วเสียเงิน/ผิดกฎหมาย" มีเทสคุมที่ [`lib/accounting/accounting-rules.test.ts`](apps/perpos/src/lib/accounting/accounting-rules.test.ts) — แตะ logic บัญชี/ภาษีแล้วต้อง `pnpm exec vitest run` ผ่านก่อน commit
- **List ที่ดึงจาก Supabase**: PostgREST ตัดที่ 1,000 แถว **เงียบ ๆ** → ใช้ `normalizePage`/`toPaged` ([lib/accounting/paging.ts](apps/perpos/src/lib/accounting/paging.ts)) คืน `total`+`truncated` และ UI ต้องเตือน + มีปุ่ม "โหลดเพิ่ม" · **ห้ามคิดยอดรวม/KPI จาก array ที่อาจถูกตัด**
- **Google OAuth verification (อนุมัติแล้ว 2026-07-24 — binding)**: project `perpos` (120863058985) ผ่านการรับรองแล้ว · scope ที่อนุมัติ = **`calendar.events`** (sensitive) · **`drive.file`** เป็น non-sensitive (per-file access) จึงไม่ต้องผ่านด่าน sensitive-scope · **สิ่งที่ทำให้ต้องยื่นรับรองใหม่:** (1) เพิ่ม scope ใหม่ (2) แก้ค่า OAuth consent screen (ชื่อแอป/โลโก้/โดเมน/ลิงก์นโยบาย) — **ห้ามแตะสองอย่างนี้แล้ว deploy เงียบ ๆ** ต้องยื่น verification ใหม่ก่อน · การรับรองนี้สืบทอดไม่ได้ (ขึ้น project เดียว) · ฐานที่ใช้ยื่น = [นโยบาย §6–§8](apps/landing-astro/src/lib/legal.ts) (Google data / Limited Use / มาตรการปกป้องข้อมูล) — แก้นโยบายให้ขัดกับที่ยื่นไว้ = เสี่ยงถูกเพิกถอน
- **AI provider (ผูกกับ Google API verification — binding)**: ผู้ให้บริการโมเดล AI ของระบบคือ **Gemini เท่านั้น** (paid tier) · **OpenAI ถูกถอดออกแล้ว (2026-07)** พร้อม **ฟีเจอร์ข่าวทั้งก้อน** (`lib/news/`, `admin/news-agent/*`, `admin/delivery/*`, prompt `news-agent.v1.txt`, คำสั่ง LINE `/ข่าว`) · เรารับรองกับ Google ว่าไม่ส่งข้อมูลให้ ผู้ให้บริการ AI บุคคลที่สามรายอื่น และไม่มีข้อมูล Google Workspace ไหลเข้าโมเดลใด ๆ (`drive.file` = เขียนอย่างเดียว · prompt ของ stt-worker เป็น static ห้ามแทรกข้อมูลปฏิทิน) — **ก่อนเพิ่ม provider ใหม่หรือส่งข้อมูล Google เข้า AI ต้องอัปเดต [นโยบาย §7 Limited Use](apps/landing-astro/src/lib/legal.ts) และแจ้ง Google ก่อนเสมอ**
- **Commit**: ไม่ push จนกว่าจะสั่ง
- **Merge policy (2026-07-21)**: `main` **ไม่มี required status check / ไม่บังคับ up-to-date / ไม่บังคับ review** แล้ว → สั่ง push เมื่อไร ให้ `gh pr create` + `gh pr merge --squash --delete-branch` **ต่อได้ทันทีในเทิร์นเดียว ห้ามนั่งรอ CI** · GitHub Actions ยังรันอยู่เป็นสัญญาณย้อนหลัง (แดงแล้วค่อยแก้เป็นคอมมิตใหม่)
- **ด่านคุณภาพย้ายมาอยู่ก่อน push** — ต้องรัน `pnpm exec tsc --noEmit` + `pnpm lint` + `pnpm exec vitest run` **ในโฟลเดอร์ worktree ที่แก้โค้ดจริง** (กับดักที่เคยเจอ: ไปรันใน worktree หลักที่ยังเป็น main → ผ่านหมดแต่ CI แดง)

---

## Page Load Performance — มาตรฐานบังคับ (binding)

> **กฎบังคับทั้งแอป** (ปัจจุบัน + โค้ดใหม่ทุกชิ้น): หน้าต้องไม่ "หน่วงก่อนข้อมูลขึ้น"
> คัมภีร์เต็ม + ตัวอย่าง + กับดัก: [`docs/SERVER_COMPONENT_PATTERN.md`](docs/SERVER_COMPONENT_PATTERN.md) — **อ่านก่อนสร้าง/แก้หน้าใด ๆ**

**MUST (ต้องทำ):**

1. **ทุก route group ต้องมี `loading.tsx`** — baseline `(hydrogen)/loading.tsx` + รายโซน (admin/assistant/[orgSlug]) มีอยู่แล้ว · **ห้ามลบ** · section ใหม่ที่ layout ต่างจากเดิม → เพิ่ม `loading.tsx` ของตัวเอง (skeleton ตาม DESIGN.md §9 — ห้าม spinner กลางจอ)
2. **หน้า display ใหม่ = Server Component** — ดึงข้อมูลตอน SSR (ห้าม `'use client'` + `getSession()` + `fetch('/api/...')` ตอน mount ถ้าหน้านั้นแค่แสดงผล) · เลือกท่าตามชนิดหน้า:
   - display ล้วน → full server component
   - list + filter/pagination → **searchParams-driven** (filter/page อยู่ใน URL)
   - display + poll/chart/interactive → **hybrid** (server ดึง initial → client view)
3. **เลือก auth guard ให้ตรงโมเดล** (ผิด = data leak):
   - หน้า `/admin/*` (ข้ามทั้งระบบ) → `requireSuperAdminPage()` ([lib/admin/guard.ts](apps/perpos/src/lib/admin/guard.ts)) = service-role
   - หน้าโมดูล per-org (tmc/crm/acc_firm/…) → **member + RLS** (`getModuleRoleForCurrentUser` + `createSupabaseServerClient`) · **ห้ามใช้ admin service-role client กับข้อมูล per-org**
4. **แยก fetch logic** ไป `lib/<area>/<x>.ts` (reuse กับ route เดิม) · route ที่ไม่มี caller เหลือ → ลบ · ที่ client view ยัง poll → คงไว้
5. **AuthGuard ต้องไม่บล็อก shell** — gate เฉพาะ content area (โครงปัจจุบันใน [(hydrogen)/layout.tsx](<apps/perpos/src/app/(hydrogen)/layout.tsx>) — อย่าย้าย AuthGuard ออกมาครอบทั้ง shell)

**MUST NOT / ข้อยกเว้นที่ตั้งใจ (ห้ามแปลงเป็น server โดยไม่จำเป็น):**

- หน้า **ping/health สด** (เช่น `/admin/system`) → คง client (SSR จะ block รอ network)
- หน้า **CRUD หนัก** (มี mutation/dialog เยอะ เช่น tmc/finance, crm) → คง client, แปลง **opportunistic** ตอน touch เท่านั้น (ROI ต่ำ, risk สูง)

**สถานะปัจจุบัน (compliance):** loading.tsx + AuthGuard-shell ครอบทุกหน้าแล้ว · SSR แล้ว: accounting (เดิม), admin dashboard/payments/stt-billing/scheduler/admin-audit/health/stt-cost, tmc dashboard, **ผู้ช่วย AI (Flow) ทั้งร่ม `/assistant/*` — usage (full SSR), billing/meetings/transcribe-หน้าแรก (hybrid: SSR initial → client poll/mutation)** · exempt: system, หน้า CRUD

> หมายเหตุ assistant SSR: guard ฝั่งหน้า = `requireAssistantPage()` ([lib/assistant/page-guard.ts](apps/perpos/src/lib/assistant/page-guard.ts), cookies) คู่กับ API guard `requireAssistantUser` — ทั้งคู่เรียก `resolveAssistantAccess`/`resolveHomeOrg` ตัวเดียวกันใน [lib/assistant/access.ts](apps/perpos/src/lib/assistant/access.ts) · fetch logic แยกไป `lib/assistant/{stats,jobs,meetings,autotopup}.ts` (reuse กับ API route เดิม)

**Verify ก่อน merge:** `tsc --noEmit`=0 · `pnpm lint` clean · หน้า render เหมือนเดิม (screenshot) · ไม่มี client fetch เดิมหลัง SSR (network) — checklist เต็มใน [คัมภีร์](docs/SERVER_COMPONENT_PATTERN.md)

---

## Design System — UI Components

> **กฎบังคับ**: ทุก UI ใน `apps/perpos/` ต้องใช้ components จาก `@/components/ui/` เท่านั้น  
> ห้ามใช้ `rizzui`, raw `<button>`, `<input>`, `<select>`, `<label>` โดยตรง

### Components ที่ต้องใช้เสมอ

| ต้องการ                                                 | ใช้                                                                                                                  | Import จาก                         |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| ปุ่ม                                                    | `<Button>`                                                                                                           | `@/components/ui/button`           |
| Text input / number                                     | `<Input>`                                                                                                            | `@/components/ui/input`            |
| **Form Select (value-based)**                           | `<CustomSelect>`                                                                                                     | `@/components/ui/custom-select`    |
| **Navigation Dropdown (icon+list)**                     | `<Dropdown>`                                                                                                         | `@/components/ui/dropdown`         |
| **Rich Panel Popover**                                  | `<Popover>`                                                                                                          | `@/components/ui/popover`          |
| **Date picker**                                         | `<ThaiDatePicker>`                                                                                                   | `@/components/ui/thai-date-picker` |
| Label                                                   | `<Label>`                                                                                                            | `@/components/ui/label`            |
| Modal / Dialog                                          | `<Dialog>`, `<DialogContent>`, `<DialogBody>`, `<DialogHeader>`, `<DialogTitle>`, `<DialogFooter>`                   | `@/components/ui/dialog`           |
| Native select (เฉพาะ `type="month"` หรือกรณีพิเศษ)      | `<NativeSelect>`                                                                                                     | `@/components/ui/native-select`    |
| Time input                                              | `<Input type="time">`                                                                                                | `@/components/ui/input`            |
| **หัวข้อ/ข้อความ (Title/Text)**                         | `<Title>`, `<Text>`                                                                                                  | `@/components/ui/typography`       |
| **รูปโปรไฟล์ + fallback อักษรย่อ**                      | `<Avatar>`                                                                                                           | `@/components/ui/avatar`           |
| ป้ายสถานะ                                               | `<StatusBadge tone=…>`                                                                                               | `@/components/ui/badge`            |
| KPI/การ์ดสรุป                                           | `<StatCard>`                                                                                                         | `@/components/ui/stat-card`        |
| **ตัวเลือก 2–5 อย่าง (ตัวกรอง/แท็บ/yes-no ในฟอร์ม)**    | `<SegmentedControl>`                                                                                                 | `@/components/ui/segmented`        |
| **อัปโหลดรูป PNG (โลโก้/ลายเซน) → data URL**            | `<ImageUpload>`                                                                                                      | `@/components/ui/image-upload`     |
| **เลือก/ลากไฟล์ (เอกสาร, รูปบิล, เสียง, CSV)**          | `<FileDropzone>`                                                                                                     | `@/components/ui/file-dropzone`    |
| **แถบแบ่งหน้าใต้ตาราง (บังคับทุกตารางที่ list ยาวได้)** | `usePagination` + `<TablePager>` · `<ControlledTablePager>` (fetch ทีละหน้า) · `<LinkTablePager>` (SSR searchParams) | `@/components/ui/table-pager`      |

> **rizzui**: โค้ด/หน้าจอ**ใหม่**ห้าม import จาก `rizzui`/`rizzui/typography` ตรง ๆ — ใช้ `@/components/ui/*` เสมอ (`Button/Input/Select/Title/Text/Avatar/Badge` ฯลฯ มีครบแล้ว)
>
> **ข้อยกเว้นที่ยอมรับถาวร (ไม่ใช่ของค้างรอแก้ — อย่ารื้อโดยไม่จำเป็น):** `Collapse` ([sidebar-menu.tsx](apps/perpos/src/layouts/hydrogen/sidebar-menu.tsx)) + `Drawer` ([drawer-views/container.tsx](apps/perpos/src/app/shared/drawer-views/container.tsx)) ยังใช้ rizzui ได้ · เหตุผล: เป็น infra ที่แยกตัวชัด **ไม่หลุดพาเลตต์** (Collapse ไม่มีสีของตัวเอง — header เป็น JSX เราเอง; Drawer ใช้ `containerClassName` ของเรา) และ **ไม่ทำ UI เพี้ยน** · การถอดออกมี cost/risk สูง (กระทบ navigation หลัก) แต่ benefit ต่ำ → ถือเป็นการ coexist ที่ตั้งใจ ไม่ใช่ tech debt · จะ migrate ก็ต่อเมื่อ: ต้องแก้ดีไซน์ตัวนั้นจริง, มันเริ่มหลุดพาเลตต์, หรือ migrate `@core` (isomorphic-core ใช้ rizzui ~69 ไฟล์) ทั้งก้อน
>
> หมายเหตุ: rizzui ยังอยู่ใน `package.json` เพราะ `@core` ใช้ภายใน — **การคง dependency ไว้ไม่ถือว่าผิด standard** ตราบใดที่โค้ดแอปไม่ import ตรง

### Dropdown vs Popover — เลือกใช้อะไร?

| กรณี                                                               | ใช้                                                |
| ------------------------------------------------------------------ | -------------------------------------------------- |
| เลือกรายการจาก list (switcher, action menu) + มี icon + check mark | `<Dropdown>`                                       |
| Form select (value → label) — ไม่มี icon                           | `<CustomSelect>`                                   |
| Panel เนื้อหาเสรี (profile, card, multi-section)                   | `<Popover>`                                        |
| ห้ามใช้                                                            | `rizzui Popover`, inline dropdown `<div>` ที่ทำเอง |

### Dropdown

```tsx
import { Dropdown } from "@/components/ui/dropdown";
import type { DropdownItem } from "@/components/ui/dropdown";

// Standard: OrgSwitcher pattern — trigger button + portal item list
<Dropdown
  label={selectedOrg.name}
  leadingIcon={<Building2 className="h-4 w-4" />}
  badge="OWNER" // optional pill after label
  selectedKey={selectedOrg.id} // renders check on matching item
  placement="bottom-start" // or "bottom-end"
  className="w-full" // trigger button width
  items={orgs.map((o) => ({
    key: o.id,
    label: o.name,
    icon: <Building2 className="h-4 w-4" />,
    badge: o.role, // optional per-item pill
    onClick: () => switchOrg(o.id),
  }))}
/>;
```

- **ChevronsUpDown icon หมุน 180° เมื่อ open** — ห้ามใช้ ChevronDown
- ต้นแบบจริง: [`org-switcher.tsx`](apps/perpos/src/components/accounting/org-switcher.tsx) (ใน sidebar) ห่อ `<Dropdown>` ทั้งตัว
- `placement` รองรับ `"bottom-start" | "bottom-end" | "top-start" | "top-end"` (flip อัตโนมัติถ้าพื้นที่ไม่พอ) · panel กว้าง = ความกว้าง trigger (ใส่ `className="w-full"` เพื่อเต็มแนว)

### Popover

```tsx
import { Popover } from '@/components/ui/popover';

// Standard: profile menu (sidebar footer) pattern
// trigger เป็น render-prop รับ open → หมุน ChevronsUpDown ได้
<Popover
  placement="right-end"        // เปิดด้านข้างเมื่อ trigger ชิดขอบ (เช่น ก้น sidebar)
  triggerClassName="w-full"
  trigger={(open) => (
    <button className="...">
      <Avatar ... />
      <span>iprite</span>
      <ChevronsUpDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
    </button>
  )}
>
  <div className="min-w-[200px]">
    {/* panel content — header, items, divider, etc. */}
  </div>
</Popover>

// Controlled (optional)
<Popover trigger={...} open={isOpen} onOpenChange={setIsOpen}>...</Popover>
```

- ต้นแบบจริง: [`profile-menu.tsx`](apps/perpos/src/layouts/profile-menu.tsx) (การ์ดที่ก้น sidebar) ห่อ `<Popover>`
- `placement` รองรับ 8 ทิศ: `"bottom-start|end"`, `"top-start|end"`, `"right-start|end"`, `"left-start|end"` — `right-*`/`left-*` ใช้เมื่อ trigger ชิดขอบ (เปิดด้านข้าง) · `-end` = ชิด/align ด้านล่าง, `-start` = ด้านบน
- `trigger` รับได้ทั้ง node ตรง ๆ หรือ render-prop `(open) => node` (ใช้ render-prop เมื่ออยากให้ chevron หมุนตาม state)
- ปิดเองเมื่อเปลี่ยนหน้า (route change) + คลิกนอก panel

### Button variants

```tsx
import { Button } from '@/components/ui/button';

<Button>Primary (blue)</Button>
<Button variant="outline">Outline</Button>
<Button variant="secondary">Secondary (gray)</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="destructive">Destructive (red)</Button>
<Button size="sm">Small</Button>
<Button size="lg">Large</Button>
<Button size="icon"><IconName /></Button>

// Loading state — Button ไม่มี isLoading prop ให้ใช้ disabled + text แทน
<Button disabled={saving}>{saving ? 'กำลังบันทึก…' : 'บันทึก'}</Button>
```

### Input

```tsx
import { Input } from '@/components/ui/input';

<Input placeholder="..." />
<Input type="date" />
<Input type="number" />
<Input type="time" />
```

### NativeSelect

```tsx
import { NativeSelect } from '@/components/ui/native-select';

<NativeSelect value={val} onChange={e => setVal(e.target.value)}>
  <option value="">— เลือก —</option>
  <option value="a">A</option>
</NativeSelect>

// ถ้าต้องการ width อัตโนมัติ (ไม่ full-width)
<NativeSelect className="w-auto">...</NativeSelect>
```

### Label

```tsx
import { Label } from '@/components/ui/label';

<Label htmlFor="field-id">ชื่อ *</Label>
<Input id="field-id" ... />
```

### Dialog

> **กฎเด็ดขาด**: ทุก Dialog ต้องมี `DialogBody` — header/footer sticky อัตโนมัติ, body เท่านั้นที่ scroll. ดูมาตรฐานเต็มใน [DESIGN.md §13](DESIGN.md)

```tsx
import {
  Dialog, DialogContent, DialogBody, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';

<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent size="lg">          {/* sm|md|lg|xl|2xl|3xl|full */}
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

// ❌ ห้าม — เลิกใช้รูปแบบนี้ทั้งหมด
<DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
// ✅ แทนด้วย
<DialogContent size="xl">
```

### CustomSelect

```tsx
import { CustomSelect } from '@/components/ui/custom-select';

// options ต้องเป็น { value: string; label: string }[]
<CustomSelect
  value={val}
  onChange={(v) => setVal(v)}
  options={[
    { value: '', label: 'ทุกสถานะ' },
    { value: 'active', label: 'ใช้งาน' },
  ]}
/>

// กำหนดความกว้าง
<CustomSelect ... className="w-36" />
```

### ThaiDatePicker

```tsx
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";

// value และ onChange ใช้ ISO string "YYYY-MM-DD" (CE)
<ThaiDatePicker
  value={form.date} // "2025-01-15" หรือ ""
  onChange={(iso) => setForm((f) => ({ ...f, date: iso }))}
  placeholder="เลือกวันที่" // optional
/>;
```

### FileDropzone — ช่องเลือก/ลากไฟล์ (บังคับ)

> **ห้ามใช้ `<input type="file">` ดิบ หรือ `<Input type="file">` ที่ผู้ใช้มองเห็น** — ปุ่ม "Choose File" ของเบราว์เซอร์
> เป็นภาษาอังกฤษ อยู่นอกพาเลตต์ และลากไฟล์มาวางไม่ได้ · **ห้ามประกอบ dropzone เองด้วย `onDragOver`/`onDrop`**

```tsx
import { FileDropzone } from '@/components/ui/file-dropzone';

// ไฟล์เดียว (controlled) — มีการ์ดไฟล์ + ปุ่มเอาออกให้ในตัว
<FileDropzone
  value={file}
  onChange={setFile}
  accept="application/pdf,image/*"
  maxSizeMb={50}
  hint="รองรับ PDF / รูปภาพ ขนาดไม่เกิน 50 MB"
/>

// หลายไฟล์ — ส่งไฟล์ที่ผ่านด่านออกไป ผู้เรียกจัดการรายการเอง
<FileDropzone multiple onFiles={addFiles} accept={ACCEPT_TYPES} hint="เลือกได้หลายไฟล์" />

// ให้ปุ่มที่อยู่นอกกล่องเปิดหน้าต่างเลือกไฟล์ (เช่น CTA ใน empty state)
const openPicker = useRef<(() => void) | null>(null);
<FileDropzone value={file} onChange={setFile} openRef={openPicker} />
<Button onClick={() => openPicker.current?.()}>อัปโหลดไฟล์</Button>
```

- กันชนิดไฟล์ (`accept`) + เพดานขนาด (`maxSizeMb`) ให้เอง พร้อมข้อความไทยใต้กล่อง — **ไม่ต้องเช็คซ้ำใน component**
  (แต่กฎเชิงธุรกิจ เช่น ความยาวไฟล์เสียง/โควตา ยังเป็นหน้าที่ผู้เรียก)
- ปรับข้อความ/ไอคอนด้วย `label` · `hint` · `icon`
- **ข้อยกเว้นที่ยอมรับ**: ปุ่ม "แนบไฟล์" ที่อยู่ในแถบเครื่องมือ (compose note ของ crm, gov-procure detail) ยังใช้
  hidden input + ปุ่มได้ เพราะไม่ใช่พื้นที่วางไฟล์ · รูปโปรไฟล์/โลโก้ที่ต้องได้ data URL ใช้ `<ImageUpload>`

### ห้ามใช้เด็ดขาด

```tsx
// ❌ ห้าม
import { Button } from 'rizzui';
<button className="...">Click</button>
<input className="border rounded-lg ..." />
<select className="border rounded-lg ...">
<label className="text-xs ...">
<input type="date" ...>   // ❌ ใช้ ThaiDatePicker แทน

// ✅ ถูกต้อง
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CustomSelect } from '@/components/ui/custom-select';
import { ThaiDatePicker } from '@/components/ui/thai-date-picker';
import { Label } from '@/components/ui/label';
```

---

## Supabase Project

- **Project ID**: `zftnyipifpaiqzukiyzi`
- **Region**: ap-southeast-1 (Singapore)
- **URL**: `https://zftnyipifpaiqzukiyzi.supabase.co`

---

## Deployment

- **Platform (ตั้งแต่ 2026-08-19): Contabo Cloud VPS 4 สิงคโปร์ `62.146.233.27`** — เครื่องเดียวรัน **perpos + exapp + riekchang + เมล (Stalwart)** · Docker Compose + Caddy (auto TLS, DNS-01 Cloudflare) · คัมภีร์ = [`deploy/vps/README.md`](deploy/vps/README.md) **อ่านก่อนแตะเครื่อง**
  - **Deploy = push/merge เข้า `main` → GitHub Actions build standalone → อัปโหลด Cloudflare R2 → VPS ดึงด้วย presigned URL → สลับ symlink `releases/<ts>` → blue/green switch ([`deploy/vps/switch-app.sh`](deploy/vps/switch-app.sh) — zero-downtime ตั้งแต่ 2026-08-19: up สีว่าง → รอ `/api/health` → drain สีเก่าผ่านไฟล์ `/tmp/drain` → stop)** (path filter: แก้แต่ `docs/` ไม่ build) · rollback = `ln -sfn` release ก่อนหน้า + `bash current/deploy/switch-app.sh <app> <port> [worker]` · perpos = `perpos-blue`/`perpos-green` (สีที่ stopped เป็นเรื่องปกติ — monitor ยุบเป็น `perpos` ด้วย `collapseBlueGreen`) · **ห้าม `docker compose restart perpos-*` เพื่อ deploy**
  - **ห้าม build บนเครื่อง VPS** (8GB — `next build` กิน 4GB+) · **ห้ามส่ง artifact ผ่าน scp/Actions artifact API** (GitHub→Contabo SG ~40 KB/s ค้าง 20+ นาที) — R2 เท่านั้น
  - env ฝั่ง server อยู่ `/srv/apps/<app>/.env` (แก้แล้ว `docker compose restart <app>` ไม่ต้อง deploy) · `NEXT_PUBLIC_*` = GitHub secrets ต้อง build ใหม่ · ⚠️ `vercel env pull` คืน `""` สำหรับ env ที่ตั้ง Sensitive — ค่าจริงอยู่บนเครื่องแล้ว
  - **DNS**: โดเมนเว็บ 4 ตัว = Cloudflare **เมฆส้ม** (CDN/ซ่อน IP · Caddy `trusted_proxies cloudflare` → แอปเห็น IP จริงใน `x-forwarded-for`) · **ชื่อเมลทุกตัว (`mailserver`/`login`/`mta-sts`/`autoconfig`/…) = เมฆเทาเสมอ**
  - **Vercel = warm standby ถาวร (ไม่ลบ · $0)** — ทุก deploy VPS สำเร็จ workflow จะ `vercel deploy --prebuilt --prod --skip-domain` ขึ้น Vercel ด้วย (secret `VERCEL_TOKEN` ทั้ง 3 repo) ⇒ มี deployment Ready ที่ `*.vercel.app` เวอร์ชันเดียวกับ prod แต่ไม่รับ traffic · **เว็บร่วง = ชี้ CNAME `cname.vercel-dns.com` + add domain ใน Vercel ≈2 นาที** (ช่วยเฉพาะแอปพัง — เมล/cron/worker ยังอยู่ SG) · **เครื่องร่วง = Contabo snapshot** (สร้าง 2026-08-19 · หมดอายุ 30 วัน สร้างซ้ำทุกเดือน) · ขั้นตอนเต็มใน [`deploy/vps/README.md §DR`](deploy/vps/README.md) · Vercel Hobby ชนโควตา Fluid Active CPU 4h — สาเหตุที่ย้าย
- **Domain**: perpos.ai (landing = Cloudflare Pages) · `app.perpos.ai` = Suite/Flow · `mail.perpos.ai` = webmail
- ⚠️ **(ประวัติ — ใช้เมื่อยัง build บน Vercel) Build บน Vercel ชน OOM ง่าย (2 core / 8 GB) — ของที่กันไว้แล้วห้ามรื้อ** ([next.config.js](apps/perpos/next.config.js) + `"build"` ใน [package.json](apps/perpos/package.json)):
  `NODE_OPTIONS=--max-old-space-size=4096` (webpack ต้องการ >3 GB — ลดกว่านี้ตายตั้งแต่ compile) ·
  `experimental.cpus: 1` + `workerThreads: false` (ไม่แตก worker ที่ถือ heap ของตัวเองพร้อมกัน) ·
  `webpackMemoryOptimizations: true` · `typescript.ignoreBuildErrors` + `eslint.ignoreDuringBuilds`
  (redundant กับด่านก่อน push) · **`sourcemaps.disable` + `widenClientFileUpload` ผูกกับการมี `SENTRY_AUTH_TOKEN`**
  — Vercel ไม่ได้ตั้ง token แต่ plugin ยัง _สร้าง_ source map ครบทุก chunk แล้วทิ้ง (อัปโหลดไม่ได้)
  ไปทับช่วง webpack compile จนโดน SIGKILL · แก้แล้ว 2026-08-08 (#200): build 217→124 วิ, client `.js.map` = 0
  - **อาการเวลาเจอ**: log หยุดหลัง `Warning: No auth token provided...` แล้วเงียบ → จบด้วย
    `The file ".next/routes-manifest.json" couldn't be found` + build system report แจ้ง OOM event ·
    บางครั้งไม่ตายแต่ **แขวนยาว 30–45 นาที** (GC thrash) จนคิว build ตัน
  - **กับดักที่แพงที่สุด**: build พังแบบนี้แล้ว **prod ค้างอยู่ที่ deployment เก่าเงียบ ๆ** (เคยค้าง 5 วัน —
    โค้ดที่ merge แล้วไม่เคยขึ้นจริง) · หลัง merge ที่สำคัญ **ต้องเช็ค `vercel ls --prod` ว่า Ready ไม่ใช่ Error/Building**
  - build ที่ค้าง/ซ้ำซ้อน ยกเลิกด้วย `PATCH https://api.vercel.com/v12/deployments/<id>/cancel`
    (CLI เวอร์ชันนี้ไม่มีคำสั่ง `vercel cancel`)
- **PDF Service**: Google Cloud Run (`asia-southeast1`) — `perpos-pdf-renderer`
- **OCR Worker**: Google Cloud Run (`asia-southeast1`) — `perpos-ocr-worker`
- **STT Worker**: Google Cloud Run (`asia-southeast1`) — `perpos-stt-worker` · deploy ด้วย `--memory 2Gi --concurrency 3 --no-cpu-throttling` · secrets: `WORKER_SECRET`, `GEMINI_API_KEY`, `RECALL_API_KEY`, `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` · env: `APP_BASE_URL=https://app.perpos.ai`, `RECALL_REGION=ap-northeast-1` (**ทั้งสองต้องตั้ง** — `APP_BASE_URL`: แอปอยู่ที่ app.perpos.ai ไม่ใช่ perpos.ai ที่ default; ถ้าไม่ตั้ง callback mom-deliver จะ 404 → LINE ไม่ได้ PDF · `RECALL_API_KEY`+`RECALL_REGION`: worker ใช้ดึง recording ของฟีเจอร์ meeting-bot (Recall.ai) จาก `recall_bot_id` โดยตรง; ถ้า `RECALL_API_KEY` ตกหล่นเวลา redeploy → recall job fail "ยังไม่ได้ตั้งค่า RECALL_API_KEY", ถ้าไม่ตั้ง `RECALL_REGION` จะ default เป็น us-east-1 ผิด → fetch audio_mixed fail เพราะ workspace อยู่ ap-northeast-1) · ⚠️ `--set-secrets` แทนที่ secret ทั้งชุด → ต้องใส่ `RECALL_API_KEY` ทุกครั้ง
  - **ไฟล์ยาว = อัปไฟล์ทั้งก้อนเข้า Gemini Files API ตรง ๆ** (รองรับถึง 2GB / หลายชั่วโมง) — **ไม่ตัด/ไม่ใช้ ffmpeg** เพราะ Gemini เห็น global context ทั้งไฟล์ → สรุปคมกว่า. ผลลัพธ์เป็น **รายงานการประชุม (Minutes of Meeting)** JSON: meeting_title, executive_summary, key_topics, decisions (มติ), action_items, speakers (ผู้เข้าร่วม) — **ไม่มี transcript คำต่อคำ/timestamp** (เน้นสรุป → output เล็ก เร็ว ไม่ชน 64k output cap แม้ไฟล์ยาวหลายชั่วโมง) — ถ้าจะลดขนาด/เวลาอัปโหลด ให้บีบไฟล์เป็น .ogg/Opus จาก client
  - **`--no-cpu-throttling` บังคับ**: STT เป็นงาน async fire-and-forget ที่ใช้เวลา 30–90 วิหลังตอบ 202 — ถ้า CPU ถูก throttle หลังส่ง response (ค่า default ของ Cloud Run) background job จะค้างไม่จบ (job ค้าง `pending`/`processing`). ต่างจาก ocr-worker ที่งานสั้นจึงรอดด้วย default throttling
  - **GEMINI_API_KEY ต้องเป็น paid tier**: free tier — `gemini-2.5-pro` quota = 0 (ใช้ไม่ได้), `gemini-2.5-flash` มักโดน 503 high-demand. ต้องเปิด billing บน Google AI Studio / ใช้ Vertex AI
  - worker มี retry-with-backoff (429/500/503, 4 ครั้ง) + เปรียบเทียบ `WORKER_SECRET` แบบ `.trim()` (กัน secret ที่มี trailing newline ใน Secret Manager)
- **PDF Compress Worker**: Google Cloud Run (`asia-southeast1`) — `perpos-pdf-compress-worker` · deploy ด้วย `--memory 4Gi --cpu 2 --concurrency 2 --no-cpu-throttling` (concurrency ต่ำกัน OOM — แต่ละ req ถือ buffer) · engine = **pikepdf + Pillow** spawn `python3 compress.py` (surgical, **ไม่ใช้ ghostscript**) · secrets: `WORKER_SECRET`, `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (ไม่มี GEMINI) · env: `APP_BASE_URL=https://app.perpos.ai`, `PDF_MAX_MB=100`, `PDF_MAX_PAGES=500` · ดูคัมภีร์ [`docs/PDF_COMPRESS_FEATURE.md`](docs/PDF_COMPRESS_FEATURE.md)
- **โดเมน (perpos instance เดียว เสิร์ฟ 2 โดเมน — Caddy ชี้ทั้งคู่เข้า port 3005)**: `app.perpos.ai` = Suite/Flow · **`mail.perpos.ai` = PERPOS Mail** (webmail)
  · เมลเซิร์ฟเวอร์: **`mailserver.perpos.ai`** = **Stalwart native บนเครื่อง SG เดียวกัน** (ย้ายจาก Contabo EU 2026-08-19 · MX/PTR/HELO ชี้ชื่อนี้ · **ส่งตรงพอร์ต 25 ไม่ผ่าน relay** · Caddy ถือ 443 ของชื่อเมล → proxy Stalwart :8080 · ACME ของ Stalwart = DNS-01) — กับดัก auto-ban/PROXY protocol/`/etc/hosts` อยู่ใน [`docs/MAIL_CONTABO_MIGRATION_PLAN.md §15`](docs/MAIL_CONTABO_MIGRATION_PLAN.md)
  · ⚠️ **`mail.perpos.ai` ไม่ใช่เมลเซิร์ฟเวอร์อีกแล้ว** (ย้ายเมื่อ 2026-08-15) — อย่าเอาไปตั้งเป็น MX/`hostname`/relay
  · **ย้ายเครื่องไป Contabo EU + เปลี่ยนชื่อเป็น `mailserver.perpos.ai` + เลิกใช้ relay (2026-08-18)** — ดู [`docs/MAIL_CONTABO_MIGRATION_PLAN.md`](docs/MAIL_CONTABO_MIGRATION_PLAN.md)
- ⚠️ **(ประวัติ Vercel) แก้ env อย่างเดียวไม่ขึ้น prod เอง** — `turbo-ignore` (Ignored Build Step) ยกเลิก build ทุกครั้งที่
  commit ไม่ได้แตะโค้ดของ workspace `starter` (เช่น commit ที่แก้แต่ `docs/`) · env ถูก snapshot ตอน build
  ⇒ เปลี่ยนค่าใน Vercel แล้ว **ต้องบังคับ build ใหม่**: `vercel deploy --prod --force`
  (ห้ามแก้ด้วยการ push commit เปล่า) · อาการเวลาเจอ: deployment ขึ้นสถานะ **Canceled** ภายใน ~25 วิ
  และใน build log มี `This project and its dependencies are not affected` → `Ignoring the change`
- **เฝ้าเครื่อง VPS**: heartbeat จากเครื่อง (`scripts/mail-heartbeat.sh` ทุก 5 นาที) รายงาน**ทั้งเครื่อง** — ดิสก์/RAM/โหลด + สถานะ Docker container ทุกตัว (state/RestartCount/OOM/RAM เทียบ `mem_limit`) + release ที่ `/srv/apps/<app>/current` ชี้ (`RELEASE` = sha ที่ CI เขียน) → ดูที่ **`/admin/system`** (การ์ด VPS + กลุ่ม "เว็บ 3 แอป + Caddy" ping โดเมนจริง) · ตัวเตือน = scheduler t5 `evaluateHostIssues()` ใน [lib/mail/server-monitor.ts](apps/perpos/src/lib/mail/server-monitor.ts) → LINE super_admin — **คีย์ที่เตือน (2026-08-19)**: เมล `smtp`/`jmap`/`cert`/`smtp25`/`service`/`backup` · เครื่อง `heartbeat` (ขาด 30 นาที)/`disk` ≥85%/`hostmem` ≥92%/`load` ≥3×CPU/`reboot` (ครั้งเดียว) · Docker `container:`(หาย/ไม่ running/OOM)/`crash:`(restart เอง)/`mem:` ≥90% ของ limit/`deploy:`(release ค้าง) · `cron:service` + `cron:<job>` (exapp-daily, tmc-daily-occupancy, gov-procure-aging/weekly — จาก journal) · `cert:`/`origin:` ใบรับรอง Caddy origin 4 โดเมนเว็บ · **`worker:<name>`** Cloud Run 4 ตัวไม่ตอบ `/health` (timeout 15 วิ ×2) · **`scheduler:stale`** = worker `perpos-worker` ไม่เขียน `scheduler_runs` >10 นาที — ตัวนี้ตรวจจาก **heartbeat route** (container perpos) ไม่ใช่จาก worker (`checkSchedulerLiveness`) เพราะถ้า worker ตาย ตัวเฝ้าอื่นเงียบหมด · ทุกคีย์ dedup 6 ชม. + แจ้ง ✅ เมื่อหาย (ยกเว้น `crash:`/`reboot`) · เพิ่มเติม: scheduler run ล้ม → แจ้ง (throttle 30 นาที) · sync บิล GCP ล้ม → แจ้งวันละครั้ง · `/api/admin/alerts/{sentry,uptime}` + Stripe webhook แจ้งของตัวเอง · **แก้สคริปต์แล้วต้อง scp ขึ้นเครื่องเอง** (ดู [`deploy/vps/README.md`](deploy/vps/README.md) §เฝ้าเครื่อง) · ด่านนอกเมื่อเครื่องดับ = GitHub Actions `uptime.yml` (**self-healing 2026-08-19**: ล่ม → ssh restart ตัวที่ล่มผ่าน `switch-app.sh` 1 ครั้ง (กันวน 30 นาทีด้วย actions/cache) → เช็คซ้ำ → 🟡 หายเอง / 🔴 ต้องคนดู + ลิงก์) · **สั่งงานเครื่องจากมือถือ = workflow `ops-vps.yml`** (choice ปิด: status/logs-_/releases/disk/cron-list · restart-_/rollback-* ผ่าน `switch-app.sh` — **ห้ามเพิ่มช่องรันคำสั่งอิสระ** · เหตุผล: บอท LINE อยู่บน perpos ล่มพร้อมกัน สั่งผ่าน LINE ไม่ได้ · ดู [`deploy/vps/README.md`](deploy/vps/README.md) §สั่งงานเครื่องจากมือถือ) · **ผล deploy ทุกครั้งแจ้ง LINE** (step `Notify LINE` ท้าย `deploy-vps.yml`, `if: always()` — ✅ สำเร็จ / 🔴 ล้ม (prod ยังเป็น release เดิม) / ⚪ ยกเลิก + commit + ลิงก์ run) — ทั้ง uptime และ deploy ยิงตรง LINE API ด้วย GitHub secrets `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN` + **`ALERT_LINE_USER_IDS` (= `profiles.line_user_id` ของ super_admin คั่น `,` · ตั้งใหม่ 2026-08-19 ให้ตรงกับ iprite — เดิมเป็นค่าเก่า ไม่เคยถึงใคร)** · เช็คว่าตั้งถูกคน: `gh secret list` + ยิง push ทดสอบตรง · ⚠️ run ที่ต่อคิวถูก push ใหม่แทนที่ (superseded) จะไม่มีข้อความ ให้ดูที่ https://github.com/iprite/perpos/actions/workflows/deploy-vps.yml
- **Cron**: **crontab บน VPS** (`/etc/cron.d/perpos` + `/etc/cron.d/exapp` · ⚠️ `TZ=` ในไฟล์ไม่มีผลกับเวลา cron — เครื่องตั้ง timezone Asia/Bangkok ระดับ OS แล้ว 2026-08-19) job รายวัน/รายสัปดาห์ (tmc/gov-procure notify · exapp) — **scheduler ของ perpos ไม่ใช่ cron แล้ว** เป็น container `perpos-worker` (ดูหัวข้อ Notification Scheduler) · Google Cloud Scheduler **ลบแล้ว 2026-08-19** · exapp ตรวจ header `x-cron-secret` ไม่ใช่ Bearer

### Cloud Run Workers — กฎบังคับ

> **Stack**: ทุก Cloud Run worker ใช้ **plain Express + TypeScript** เท่านั้น — ห้ามใช้ NestJS, Fastify, หรือ framework อื่น
> Worker มีแค่ 2 endpoints: `GET /health` (มี `/healthz` เป็น alias — Cloud Run ดัก `/healthz` ระดับ platform บางกรณี · `/admin/system` ping `/health`) และ `POST /<action>` ตรวจ `x-worker-secret` header

**โครงสร้าง worker มาตรฐาน:**

```
services/<worker-name>/
├── src/
│   ├── main.ts          # Express server (healthz + action endpoint)
│   └── <name>.service.ts # plain functions — ไม่มี class/decorator
├── Dockerfile
├── .gcloudignore        # ← ต้องมีเสมอ (ดูด้านล่าง)
├── package.json         # deps: express + domain libs เท่านั้น
└── tsconfig.json        # ไม่มี experimentalDecorators
```

**`.gcloudignore` — ต้องมีทุก service** (ถ้าไม่มี `node_modules` จะถูก upload ทั้งหมด ทำให้ deploy ช้ามาก):

```
.gcloudignore
.git
.gitignore
node_modules/
dist/
*.log
.env*
!.env.example
README.md
```

**Deploy = `gcloud` มือเท่านั้น — ไม่มี CI auto-deploy สำหรับ workers** (workflow `deploy-workers.yml` ถูกลบแล้ว เพราะ `GCP_SA_KEY` ไม่เคยตั้ง + เงื่อนไขไม่ match squash merge → ใช้ไม่ได้จริง) · deploy ทุกครั้งรัน `gcloud run deploy --source` จาก `services/<worker>/` เอง

- เครื่อง dev ถ้า gcloud ฟ้อง _"Python 3.9 no longer supported"_ → `export CLOUDSDK_PYTHON=$(command -v python3.14 || command -v python3.13)` ก่อน
- 4 services: `perpos-pdf-renderer` (2Gi, timeout 120, concurrency 5) · `perpos-ocr-worker` (1Gi) · `perpos-stt-worker` (2Gi, concurrency 3, `--no-cpu-throttling`, `APP_BASE_URL`, `RECALL_API_KEY` secret, `RECALL_REGION=ap-northeast-1` env) · `perpos-pdf-compress-worker` (4Gi, cpu 2, concurrency 2, `--no-cpu-throttling`, `APP_BASE_URL`,`PDF_MAX_MB`,`PDF_MAX_PAGES`) · ทุกตัวมี secret `SENTRY_DSN` ด้วย

**Deploy command มาตรฐาน** (ห้ามใส่ `--set-env-vars PORT=8080` — Cloud Run inject ให้อัตโนมัติ):

```bash
gcloud run deploy <service-name> \
  --source . \
  --region asia-southeast1 \
  --project perpos \
  --memory <RAM> \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 5 \
  --timeout 540 \
  --concurrency 10 \
  --allow-unauthenticated \
  --set-secrets "WORKER_SECRET=WORKER_SECRET:latest,..."
```

---

## สถาปัตยกรรม — BFF + Serverless Workers

PERPOS ใช้รูปแบบ **"BFF (Backend for Frontend) + Serverless Workers"** ซึ่งเป็นท่ามาตรฐานของ Tech Startup ยุคใหม่ที่ได้ข้อดีของสองโลกรวมกัน:

| Layer                   | เทคโนโลยี          | หน้าที่                                                              |
| ----------------------- | ------------------ | -------------------------------------------------------------------- |
| **Frontend + Core API** | Next.js + Supabase | UI, business logic, RLS, Trigger — พัฒนาไว ลีน ตอบสนองทันที          |
| **Heavy Workers**       | Google Cloud Run   | งานหนัก (PDF, Payroll batch, AI analysis) — สเกลแยกอิสระ ไม่กวน Core |

### ทำไมต้องแยก Heavy Jobs ออกไป Cloud Run?

- **PDF / Puppeteer กิน RAM หนักมาก** — บางครั้งซด 1–2 GB ต่อ session ถ้าไม่แยกออกไป Next.js Core จะค้าง
- **Pay-per-use 100%** — Cloud Run สเกลลงเหลือ 0 instance เมื่อไม่มีงาน ไม่ต้องจ่ายค่าเซิร์ฟเวอร์ทิ้งตลอดเดือน
- **ไม่ติด Timeout** — Next.js Route Handler อยู่ที่ 10–60 วินาที, Cloud Run รันได้สูงสุด 60 นาที เหมาะกับ batch ปิดงบ/คำนวณ payroll

### Database-Driven Job Queue (ท่าที่ใช้ใน PERPOS)

ไม่ต้องตั้ง messaging queue เพิ่ม — ใช้ Supabase ที่มีอยู่แล้วเป็นตัวแจกงาน:

```
1. [Next.js] User กดสั่งงาน
        → INSERT job_queues (status = 'pending', triggered_by = user_id, correlation_id)
        → ตอบ User ทันทีว่า "กำลังปั่นเอกสาร..."

2. [Supabase Webhook] ตรวจเจอ row ใหม่ใน job_queues
        → HTTP POST → Cloud Run URL (payload: job_id, org_id, correlation_id)
        → Auth: Verify JWT หรือ Google Cloud IAM

3. [Cloud Run] ตื่นขึ้นมาประมวลผล
        → ดึงข้อมูลจาก Supabase
        → รันงานหนัก (render PDF, คำนวณ payroll, ฯลฯ)
        → อัปโหลดผลลัพธ์ขึ้น Object Storage → ได้ URL

4. [Cloud Run → Supabase] อัปเดตสถานะ
        → UPDATE job_queues SET status = 'completed', output_url = '...', completed_at = now()

5. [Supabase Realtime → Next.js] แจ้ง User ทันที
        → ปุ่มดาวน์โหลดเด้งขึ้นหน้าจอโดยอัตโนมัติ
```

### Schema ตาราง job_queues (แนวทาง)

```sql
CREATE TABLE job_queues (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  job_type      text NOT NULL,           -- 'pdf_report' | 'payroll_run' | 'batch_close'
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','processing','completed','failed')),
  payload       jsonb NOT NULL DEFAULT '{}',
  output_url    text,
  error_message text,
  -- Audit / tracing
  triggered_by  uuid REFERENCES profiles(id),  -- user ที่กดสั่ง
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  started_at    timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
```

---

## Audit Log — กฎสำหรับ Cloud Run Workers

เมื่อ Cloud Run เขียนข้อมูลกลับมายัง Supabase **ต้องส่ง Correlation ID** ของ user ที่สั่งงานตั้งแต่แรกข้ามมาด้วยเสมอ เพื่อให้ Audit Log ระบุได้ว่า "Cloud Run เป็นคนเขียน แต่ใครเป็นคนสั่ง"

```typescript
// ตัวอย่าง payload ที่ Next.js ส่งไปให้ Cloud Run
const jobPayload = {
  job_id:         jobId,
  org_id:         orgId,
  correlation_id: job.correlation_id,   // ← UUID ของ job นั้น
  triggered_by:   auth.userId,           // ← user ที่กดสั่ง
  triggered_by_email: auth.email,
};

// Cloud Run ใช้ค่าเหล่านี้เขียน audit log
await supabase.from('audit_logs').insert({
  actor_type:     'cloud_run_worker',
  actor_id:       jobPayload.triggered_by,        // user ต้นทาง
  actor_email:    jobPayload.triggered_by_email,
  correlation_id: jobPayload.correlation_id,
  action:         'pdf.generated',
  ...
});
```

**กฎเด็ดขาด**:

- Cloud Run ต้องรับ `triggered_by` + `correlation_id` ใน payload เสมอ
- ห้ามใช้ service account ID เป็น `actor_id` ใน audit log — ต้องใช้ user จริงที่กดสั่ง
- ถ้า job ล้มเหลว ให้ UPDATE `job_queues.status = 'failed'` + บันทึก `error_message` ก่อน ค่อย throw

---

## Security — Cloud Run Service-to-Service Auth

การเปิด Cloud Run ให้ Supabase Webhook เรียกได้ **ต้องล็อกสิทธิ์** ด้วยวิธีใดวิธีหนึ่ง:

| วิธี                          | แนะนำเมื่อ                                                                              |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| **Google Cloud IAM (Invoke)** | Production — Supabase Webhook ใช้ Service Account ที่มี `roles/run.invoker` เท่านั้น    |
| **Shared Secret Header**      | Dev/Staging — Cloud Run ตรวจ `X-Worker-Secret` header ที่ตรงกับ env var `WORKER_SECRET` |

```typescript
// Cloud Run — ตรวจ secret ฝั่ง worker (ถ้าไม่ใช้ IAM)
const secret = req.headers.get("x-worker-secret");
if (secret !== process.env.WORKER_SECRET) {
  return new Response("Unauthorized", { status: 401 });
}
```

**Scoped Permission สำหรับ AI Workers**: ถ้าใช้ AI บน Cloud Run วิเคราะห์บัญชีและเขียนผลลัพธ์กลับ ให้สร้าง Supabase Service Token แบบ Scoped — เขียนได้เฉพาะตารางรายงาน ห้ามแตะตาราง `profiles`, `user_permissions`, `organizations`, หรือตารางสิทธิ์ใดๆ

```sql
-- ตัวอย่าง RLS policy สำหรับ AI worker service role (scoped)
CREATE POLICY "ai_worker_write_reports_only"
  ON report_outputs FOR INSERT
  WITH CHECK (true);  -- service role ของ AI worker เขียนได้เฉพาะตารางนี้
-- ตารางอื่นไม่มี policy เปิด → INSERT/UPDATE/DELETE ถูก deny อัตโนมัติ
```

---
