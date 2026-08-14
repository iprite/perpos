# แผน: Mail Server แบบ Multi-Tenant ขายลูกค้า

> สถานะ: **แผน (ยังไม่เริ่มทำ)** · ร่างเมื่อ 2026-08-14 · เจ้าของ: iprite
> เป้าหมาย: ขาย "อีเมลบริษัท" (`ชื่อ@โดเมนลูกค้า`) เป็นโมดูลหนึ่งของ PERPOS
> เอกสารนี้ = แผนสถาปัตยกรรม + ลำดับงาน + กับดักที่ต้องรู้ก่อนเริ่ม

---

## 0. สรุปสำหรับคนรีบ

**แผนเดิมที่คุณร่างมาใช้ได้จริง และเลือกของถูกตัวเกือบทั้งหมด** — Stalwart, R2, SES เป็นชุดที่เข้ากันดี
แต่มี **4 เรื่องที่ต้องรู้ก่อนจ่ายเงิน** ไม่งั้นจะไปตายกลางทาง:

| # | เรื่อง | ผลกระทบ |
| - | ------ | -------- |
| 1 | **DigitalOcean บล็อกพอร์ตขาออก 25 / 465 / 587 ทุกดรอปเล็ตโดยดีฟอลต์** | ส่งเมลออกผ่าน SES ทางพอร์ตปกติ **ไม่ได้** → ต้องใช้พอร์ตสำรอง **2587** ของ SES · ต้องทดสอบเป็นงานแรกสุด (go/no-go) |
| 2 | **multi-tenancy ของ Stalwart เป็นฟีเจอร์ Enterprise (เสียเงิน)** | Community ทำได้หลายโดเมน/หลายบัญชี แต่ไม่มี object `tenant`, ไม่มีโควตาต่อลูกค้า, ลูกค้าจัดการ user เองไม่ได้ → **เริ่มด้วย Community ได้** เพราะเราบังคับ isolation ที่ชั้น PERPOS อยู่แล้ว |
| 3 | **R2 เก็บได้แค่ "ตัวจดหมาย" (blob) ไม่ใช่ metadata** | Stalwart ต้องมี 2 ชั้นเสมอ: *data store* (index/flag/folder) + *blob store* (เนื้อเมล) → R2 แทนได้แค่ชั้นหลัง |
| 4 | **droplet $6 = ดิสก์ 25GB ทั้งก้อน** | ถ้าเก็บเมลบน NVMe เต็ม ๆ จะรับได้ ~10 กล่องแล้วเต็ม → ดูข้อเสนอใน §3 |

**ต้นทุนประเมิน (10 ลูกค้าแรก ~50–100 กล่อง): ≈ $12–14/เดือน (฿400–470)**
คิดเป็นต้นทุน **≈ ฿5 / กล่อง / เดือน** — ถ้าขาย ฿50–100/กล่อง/เดือน margin ดีมาก

---

## 1. ทำไมยังเป็น Stalwart (ตอบคำถาม "มีตัวอื่นแนะนำมั้ย")

ผมเทียบให้ครบแล้ว — **สำหรับโจทย์เฉพาะของคุณ Stalwart ชนะขาด ไม่ต้องเปลี่ยน** เหตุผลคือคุณมี 3 ข้อบังคับ
ที่ตัดตัวเลือกอื่นออกเกือบหมด: (ก) จะเขียน webmail เองด้วย Next.js, (ข) ต้อง provision จากโค้ดได้, (ค) droplet $6

| ตัวเลือก | RAM ขั้นต่ำ | provision ด้วย API | JMAP (สำหรับ webmail เอง) | multi-tenant | สรุป |
| -------- | ----------- | ------------------ | ------------------------- | ------------ | ---- |
| **Stalwart** ✅ | **~100–150MB idle** | **REST Management API + API key** | **native** | Enterprise (แต่ทำเองที่ชั้นแอปได้) | **เลือกตัวนี้** |
| mailcow | 2GB+ / 15 containers | API มี | ❌ (IMAP อย่างเดียว) | มี domain-admin | **ตกทันที** — ไม่ลง droplet $6 |
| Maddy | เบา (Go) | ❌ config file | ❌ | ❌ | provision อัตโนมัติไม่ได้ → ตก |
| Mox | เบา (Go) | admin API มี | ❌ | ❌ | ออกแบบมาเพื่อ "โดเมนตัวเอง" ไม่ใช่ขายต่อ → ตก |
| Postfix + Dovecot + Postgres | เบามาก | เขียน SQL เอง | ❌ | ทำเองได้ 100% | ยืดหยุ่นสุด แต่ **ต้องประกอบเองทุกชิ้น** (spam, DKIM, ACME, admin, quota) → งานเพิ่ม 3–4 เท่า |
| Modoboa / iRedMail | 2GB+ | REST มี | ❌ | มี | หนัก + ยังต้องพึ่ง Postfix/Dovecot ข้างใต้ |

**สิ่งที่ทำให้ Stalwart ขาดลอยสำหรับเรา** (ยืนยันจากเอกสารทางการแล้ว):

- **REST Management API + API key principal** → สร้างโดเมน/บัญชี/alias จาก Next.js ได้ตรง ๆ ไม่ต้อง ssh ไปแก้ไฟล์
- **JMAP เป็น protocol พื้นฐาน** → webmail ที่เขียนใน Next.js คุยตรงได้ ไม่ต้องแปลง IMAP (ตัวอื่นไม่มีเลย)
- **automate DNS บน Cloudflare ได้ในตัว** — สร้าง MX / SPF / DKIM / DMARC / TLSA ให้เอง (ตรงกับที่คุณใช้ Cloudflare อยู่แล้ว)
- **auto-DKIM ต่อโดเมน** (สร้าง + หมุนกุญแจเอง) → ไม่ต้องเขียนระบบหมุนคีย์เอง
- **ACME ในตัว** → ใบรับรอง TLS ของ `mail.perpos.ai` ต่ออายุเองอัตโนมัติ
- **relay / smarthost** → ชี้ขาออกเข้า SES ได้ตามแผน
- ไบนารีเดียว Rust · idle ~100MB · **ลง droplet $6 ได้สบาย** (mailcow กินมากกว่า 15 เท่า)

> **สรุป: ไม่ต้องเปลี่ยน** ตัวเลือกสำรองเดียวที่สมเหตุผลคือ Postfix+Dovecot+Postgres — เลือกเมื่อคุณ *ไม่อยาก
> จ่ายค่า Enterprise ตลอดกาล และยอมเขียนเองเยอะ* แต่ตอนนี้ยังไม่จำเป็น เพราะ Community ก็พอ (ดู §2)

### License: เริ่มด้วย Community — อัปเป็น Enterprise ทีหลังได้ ไม่ต้องรื้อ

Community (AGPL-3.0) **ทำได้**: โดเมนไม่จำกัด, บัญชีไม่จำกัด, DKIM/SPF/DMARC/ACME/JMAP/IMAP ครบ, spam filter, relay
Community **ทำไม่ได้**: object `tenant`, โควตาต่อ tenant, ผู้ดูแลย่อยฝั่งลูกค้า, branding ต่อ tenant, AI spam classifier

**ทำไมเริ่ม Community ถึงปลอดภัยในเคสเรา** — เพราะสถาปัตยกรรมนี้ **ลูกค้าไม่เคยแตะหน้า admin ของ Stalwart เลย**
ทุกอย่างผ่าน PERPOS ซึ่งมี guard ต่อ org + RLS อยู่แล้ว → `tenant` ของ Stalwart จะซ้ำซ้อนกับ `organizations` ของเรา
เราจึงบังคับ isolation ที่ชั้นแอปแทน (เหมือนที่ `acc_firm` / `gov_procure` ทำอยู่)

**ต้นทุนถ้าอัป Enterprise**: €2/กล่อง/ปี ที่ช่วง 25–499 กล่อง → 100 กล่อง = €200/ปี ≈ **฿633/เดือน**
(แพงกว่าค่า infra ทั้งก้อนเกินเท่าตัว) → **อัปเมื่อลูกค้าเริ่มขอจัดการ user เอง หรือเกิน ~50 กล่อง**

⚠️ **ข้อควรระวัง AGPL**: PERPOS คุยกับ Stalwart ผ่าน REST/JMAP ข้ามโพรเซส = คนละโปรแกรม AGPL ไม่ลามมาที่
โค้ด Next.js ของเรา **ตราบใดที่ไม่ patch ตัว Stalwart แล้วเอาไปให้บริการ** — ถ้าวันหนึ่งต้องแก้ซอร์ส Stalwart
เอง ต้องเปิดซอร์สส่วนนั้น หรือซื้อ Enterprise เพื่อเลี่ยง

---

## 2. สถาปัตยกรรมที่เสนอ

```
                          ┌──────────────────────────────┐
      ลูกค้า ─── HTTPS ──▶ │  PERPOS (Vercel, Next.js)    │
                          │  /[orgSlug]/mail/*           │
                          │  · webmail (JMAP)            │
                          │  · จัดการโดเมน/กล่อง/alias    │
                          │  · ตัวช่วยตั้ง DNS + ตรวจสอบ  │
                          └───────┬──────────────────────┘
                                  │ REST Management API (API key)
                                  │ + JMAP proxy (ต่อ user)
                                  ▼
   MX ของลูกค้า           ┌──────────────────────────────┐
   ─── SMTP:25 ─────────▶ │  Stalwart (DO droplet, SGP1) │
   (ขาเข้า, ไม่ถูกบล็อก)   │  mail.perpos.ai              │
                          │  IMAP 993 · JMAP 443 · SMTP  │
                          │  Submission 465/587 (ขาเข้า)  │
                          └──┬────────────┬──────────────┘
                             │            │
             data store      │            │  ขาออก SMTP :2587  ⚠️ พอร์ตสำรอง
             (RocksDB,       │            ▼
              บน NVMe)       │      ┌──────────────┐
                             │      │  AWS SES     │──▶ ปลายทาง
                             ▼      │  + Tenants   │
                    ┌─────────────┐ └──────┬───────┘
                    │ Cloudflare  │        │ bounce/complaint (SNS)
                    │ R2 (blob)   │        ▼
                    │ + backup    │   /api/mail/ses-webhook → PERPOS
                    └─────────────┘
```

### ชิ้นส่วนและหน้าที่

| ชิ้น | ของ | หน้าที่ | หมายเหตุ |
| ---- | --- | ------- | -------- |
| Stalwart | DO droplet SGP1 $6 | รับเมลเข้า (MX), เก็บ, เสิร์ฟ IMAP/JMAP, รับ submission | ไบนารีเดียว + systemd |
| data store | RocksDB บน NVMe | index/flag/folder/ผู้ใช้ — **เล็ก โตช้า** | ห้ามย้ายไป R2 |
| blob store | **R2** | เนื้อเมล + ไฟล์แนบ — **ใหญ่ โตเร็ว** | ดู §3 |
| ขาออก | AWS SES + Tenants | ส่งจริง + จัดการชื่อเสียง IP ต่อลูกค้า | พอร์ต **2587** |
| DNS | Cloudflare | โซนของ perpos.ai + ตัวช่วยบอกลูกค้าตั้ง record | Stalwart คุย Cloudflare API ได้เอง |
| หน้าเว็บ | PERPOS `/[orgSlug]/mail` | webmail + admin + billing | โมดูลใหม่ key `mail` |

---

## 3. ⚠️ จุดที่คำตอบคุณ 2 ข้อขัดกัน — ขอเสนอทางออก

คุณเลือก **"NVMe ก่อน + R2 เป็น backup"** และ **"droplet $6"** — สองข้อนี้อยู่ด้วยกันไม่ได้:

- droplet $6 ของ DO = **ดิสก์ 25GB ทั้งก้อน** หัก OS + RocksDB + log แล้วเหลือให้เมล ~18–20GB
- ถ้าให้ลูกค้ากล่องละ 2GB → **รับได้ ~9–10 กล่องแล้วเต็ม** ขายลูกค้าที่ 3 ก็ตันแล้ว
- ดิสก์เต็มบนเมลเซิร์ฟเวอร์ = **รับเมลไม่ได้ทั้งระบบทุกลูกค้าพร้อมกัน** (ไม่ใช่แค่ช้า) เป็น failure mode ที่แย่ที่สุด
- ขยายดิสก์ DO ต้อง resize droplet (ขึ้นราคาทั้งก้อน) หรือแปะ Block Storage +$10/100GB — แพงกว่า R2 **6 เท่า**

### ข้อเสนอ (แนะนำ): สลับเป็น **RocksDB บน NVMe + blob ไปอยู่ R2 ตั้งแต่วันแรก**

| | ของที่อยู่ NVMe | ของที่อยู่ R2 |
| - | --------------- | ------------- |
| อะไร | metadata, index, flag, folder, บัญชีผู้ใช้ | เนื้อจดหมาย + ไฟล์แนบ |
| โตแค่ไหน | **ช้ามาก** (~50–100MB ต่อ 1,000 กล่อง) | โตตามที่ลูกค้าใช้จริง |
| ต้องเร็วมั้ย | **ต้องเร็ว** (ทุกครั้งที่เปิดกล่อง/list เมล) | เร็วเฉพาะตอนกดเปิดอ่านเมล 1 ฉบับ |

**ได้อะไร**: droplet $6 อยู่ได้จริงระยะยาว · เพิ่มลูกค้าไม่ต้องขยายเครื่อง · ดิสก์เต็มยาก · ค่าเก็บ $0.015/GB
(100GB = ~$1.35/เดือน) · **egress ฟรี** ซึ่งสำคัญมากเพราะ webmail อ่านเมลคือ egress ล้วน ๆ

**เสียอะไร**: กดเปิดอ่านเมลแต่ละฉบับมี latency เพิ่มจากการไป R2 (ประเมิน +50–150ms จาก SGP1)
— **ยอมรับได้** เพราะการ list กล่อง/ค้นหา/เช็คเมลใหม่ (ซึ่งเป็น 90% ของการใช้งาน) ยังอ่านจาก NVMe ทั้งหมด

**ยังได้ backup เหมือนเดิม**: ตั้ง R2 bucket ที่สอง (`perpos-mail-backup`) รับ snapshot ของ RocksDB รายวัน
→ ได้ทั้ง blob store และ backup ตามที่คุณต้องการ แค่คนละ bucket

> ถ้าคุณยังอยากได้ NVMe-first จริง ๆ ทางเดียวคือ **ขยับเป็น droplet $12 (2GB/50GB)** + Block Storage
> ตามจำนวนลูกค้า — ทำได้ แต่ต้นทุนต่อกล่องจะแพงกว่า R2 หลายเท่าและต้องคอยเฝ้าดิสก์เอง
> **ผมแนะนำ R2-first แต่ตัดสินใจสุดท้ายเป็นของคุณ — บอกมาได้ถ้าจะเอาแบบเดิม**

---

## 4. Phase 0 — งาน go/no-go ต้องทำก่อนจ่ายเงินอะไรทั้งสิ้น

**ห้ามข้าม** ถ้าข้อ 1 ไม่ผ่าน แผนทั้งก้อนต้องเปลี่ยนผู้ให้บริการ VPS

1. **ทดสอบว่า DO ยิงออกพอร์ต 2587 ไป SES ได้จริง**
   - สร้าง droplet $6 ที่ SGP1 → `nc -zv email-smtp.ap-southeast-1.amazonaws.com 2587`
   - DO บล็อก 25/465/587 ขาออกทุกดรอปเล็ต แต่ **2587/2465 ของ SES เป็นพอร์ตสำรองที่ตั้งใจไว้เพื่อกรณีนี้**
   - **ถ้าโดนบล็อกด้วย** → ทางออก: (ก) เปิด ticket ขอ DO ปลดล็อก (ข) เขียน bridge SMTP→SES API (HTTPS)
     ตัวเล็ก ๆ วางข้าง Stalwart (ค) **ย้ายไป Hetzner** (ราคาใกล้กัน ไม่บล็อกพอร์ตหลังยืนยันตัวตน)
2. **ยืนยันว่า Cloudflare R2 ทำงานเป็น blob store ของ Stalwart ได้** — R2 เข้ากับ S3 API แต่ **ไม่ใช่ทุก
   endpoint** ให้ทดสอบ ส่งเมลเข้า → อ่านผ่าน IMAP → ลบ → เช็คว่า object หายจริง
3. **ขอปลด SES sandbox** (production access) — ใช้เวลา 24–48 ชม. **ยื่นวันแรกเลย** ไม่งั้นบล็อกงานทีหลัง
   - ตอนยื่นต้องบอกตรง ๆ ว่าเป็น **ISV ส่งแทนลูกค้า** + มีระบบจัดการ bounce/complaint (ไม่งั้นโดนปฏิเสธ)
4. **จอง Reserved IP + ตั้ง PTR (reverse DNS) = `mail.perpos.ai`** — เมลขาเข้าที่ไม่มี PTR ตรง โดนตีกลับเยอะ

---

## 5. ลำดับงาน (Phase 1–6)

### Phase 1 — ตั้งเซิร์ฟเวอร์ + dogfood ด้วยโดเมนตัวเอง
เป้า: **เราใช้เองก่อนขาย** — `iprite@perpos.ai` ใช้งานจริงบน Stalwart

- ติดตั้ง Stalwart (ไบนารี + systemd) · เปิด swap 2GB (droplet 1GB ไม่มี swap มาให้)
- data store = RocksDB บน NVMe · blob store = R2 · ACME ออกใบรับรอง `mail.perpos.ai`
- ตั้ง relay ขาออก → SES `:2587` (SMTP credentials เก็บใน Secret ไม่ใช่ไฟล์ config ที่ commit)
- ตั้ง DNS ของ `perpos.ai`: MX, SPF (`include:amazonses.com`), DKIM, DMARC (`p=none` ก่อน แล้วค่อยขยับ)
- ไฟร์วอลล์: เปิดเฉพาะ 25 (เข้า), 465/587 (submission เข้า), 993 (IMAP), 443 (JMAP+admin), 22
- **เกณฑ์ผ่าน**: ส่ง–รับกับ Gmail/Outlook ได้ · [mail-tester.com](https://www.mail-tester.com) ได้ **≥ 9/10**

### Phase 2 — โมดูล `mail` ใน PERPOS (โครง + provisioning)

**โมดูลใหม่** ใน [`lib/modules.ts`](apps/perpos/src/lib/modules.ts) — เป็น **shared** (ไม่ใส่ `forOrgSlugs`)
เพราะขายลูกค้าทั่วไป ต่างจาก `acc_firm`/`gov_procure` ที่ล็อก org เดียว

```ts
{
  key: "mail",
  label: "อีเมลบริษัท",
  href: "/mail",
  specific: true,
  match: (p) => { const s = p.split("/").filter(Boolean); return s.length >= 2 && s[1] === "mail"; },
  roles: [
    { key: "owner",  label: "ผู้ดูแลระบบเมล", canWrite: true },   // เพิ่ม/ลบกล่อง, ผูกโดเมน
    { key: "member", label: "ผู้ใช้",         canWrite: true },   // ใช้กล่องตัวเอง
    { key: "viewer", label: "ผู้ดูข้อมูล",     canWrite: false },
  ],
}
```

**ตาราง (migration `supabase/migrations/`)** — RLS ทุกตัวตาม convention:

| ตาราง | เก็บอะไร |
| ----- | -------- |
| `mail_domains` | โดเมนของแต่ละ org + สถานะยืนยัน (`pending`/`verified`/`failed`) + เวลาตรวจล่าสุด |
| `mail_dns_records` | record ที่ลูกค้าต้องไปตั้ง (type/host/value/ตรวจผ่านแล้วหรือยัง) — ทำหน้า "ตัวช่วยตั้ง DNS" |
| `mail_mailboxes` | กล่อง (org_id, domain_id, local_part, display_name, quota_bytes, สถานะ) |
| `mail_aliases` | alias / กลุ่มส่งต่อ |
| `mail_events` | bounce / complaint / delivery จาก SES (append-only) |
| `mail_usage_daily` | พื้นที่ใช้จริง + จำนวนเมลส่งต่อวัน ต่อ org (ป้อนหน้า billing) |

**ข้อผูกพันที่ห้ามพัง (invariant):**

1. **รหัสผ่านกล่องเมลไม่เก็บใน Supabase เด็ดขาด** — Stalwart hash เอง เราเก็บแค่ metadata
   ตอนสร้างกล่องให้แสดงรหัสชั่วคราวครั้งเดียวแล้วทิ้ง (เหมือน API key)
2. **API key ของ Stalwart Management API = service-role เท่านั้น** ห้ามหลุดถึง browser
   ทุกการ provision ผ่าน route handler ฝั่งเซิร์ฟเวอร์
3. **1 กล่องผูก 1 org เสมอ** — ทุก query ต้องกรอง `org_id` และผ่าน `getModuleRoleForCurrentUser`
   (**ห้ามใช้ admin service-role client กับข้อมูล per-org** ตามกฎใน AGENTS.md)
4. **`local_part@domain` unique ทั้งระบบ** — บังคับที่ DB ไม่ใช่แค่ตรวจในโค้ด
5. โดเมนที่ยังไม่ `verified` **ห้ามสร้างกล่องได้** (กันคนมาผูกโดเมนที่ไม่ใช่ของตัวเอง)

**API routes** (ห่อด้วย `withUsageContext` ทุกตัวตามกฎ metering):
`/api/mail/domains` (GET/POST/DELETE) · `/api/mail/domains/[id]/verify` (ตรวจ DNS จริง) ·
`/api/mail/mailboxes` (GET/POST/PATCH/DELETE) · `/api/mail/aliases` · `/api/mail/ses-webhook` (รับ SNS)

**หน้าเว็บ** (Server Component ตาม [`docs/SERVER_COMPONENT_PATTERN.md`](docs/SERVER_COMPONENT_PATTERN.md) + `loading.tsx`):
`/[orgSlug]/mail/domains` · `/[orgSlug]/mail/mailboxes` · `/[orgSlug]/mail/settings`

### Phase 3 — Webmail ใน Next.js ผ่าน JMAP
ตามที่คุณเลือก — งานใหญ่สุดของโปรเจกต์ ประเมิน **2–3 เดือน** ถ้าจะให้ครบเครื่อง

- ต่อ JMAP ของ Stalwart · auth ต่อผู้ใช้ (ห้ามใช้ API key ตัวแอดมินยิงแทนผู้ใช้เด็ดขาด)
- ทำเป็นชั้น ๆ ให้ขายได้ตั้งแต่ยังไม่ครบ:
  **M1** อ่าน/list/ค้นหา → **M2** เขียน/ตอบ/ส่งต่อ + ไฟล์แนบ → **M3** โฟลเดอร์/ป้าย/กฎกรอง → **M4** contact/ปฏิทิน (CardDAV/CalDAV มีในตัว)
- UI ตาม DESIGN.md ทุกข้อ (PageShell, ตารางมาตรฐาน, ไทยล้วน)
- **ระหว่างที่ยังไม่เสร็จ ลูกค้าใช้ Outlook / Apple Mail ต่อ IMAP ได้เลย** → ขายได้ตั้งแต่ Phase 2 จบ

### Phase 4 — SES Tenants + จัดการ bounce
- สร้าง **SES Tenant ต่อ 1 org ลูกค้า** (รองรับถึง 10,000 tenant/บัญชี AWS)
  → ชื่อเสียงแยกกัน **ลูกค้า A ส่งสแปมจนโดนแบน ไม่ลาก B ตายด้วย** ← หัวใจของการขายต่อ
- configuration set ต่อ tenant · reputation policy = `Standard` · suppression list แยกต่อ tenant
- SNS → `/api/mail/ses-webhook` → เขียน `mail_events` → เตือนเจ้าของ org ผ่าน LINE (ใช้ `sendLineMessages` เดิม)
- **นโยบายการใช้งาน (AUP)** + ขั้นตอนตรวจลูกค้าก่อนเปิดใช้ — AWS ถือว่าเรารับผิดชอบสิ่งที่ลูกค้าส่ง

### Phase 5 — Billing + โควตา
- ต่อเข้า `usage_events` เดิม (**scope `suite`** เพราะเป็นบริการระดับ org ไม่ใช่ per-profile)
- นับ: พื้นที่ใช้จริง (GB-เดือน) + จำนวนเมลส่งออก → เข้าหน้า `/admin/usage` ที่มีอยู่แล้ว
- โควตาต่อกล่องบังคับที่ Stalwart · เกินโควตา → เตือนที่ 80% / 95% ก่อนหยุดรับ

### Phase 6 — ความทนทาน (ทำเมื่อมีลูกค้าจ่ายเงินจริงแล้ว)
- **backup MX ตัวที่สอง** — ตอนนี้ droplet ตัวเดียว = ตายแล้วเมลเข้าหาย (ผู้ส่งจะ retry ~4 วัน แต่ลูกค้าจะโทรมาก่อน)
- ซ้อม restore จาก R2 backup จริง ๆ **อย่างน้อยครั้งเดียว** — backup ที่ไม่เคยกู้ = ไม่มี backup
- monitoring เข้า Issue Tracker (`system_issues`) ที่มีอยู่: ดิสก์ >80%, คิวค้าง, ใบรับรองใกล้หมดอายุ, ติด blacklist

---

## 6. DNS ที่ลูกค้าแต่ละรายต้องตั้ง

หน้า "ตัวช่วยตั้ง DNS" ต้องปั่น record ชุดนี้ + **ปุ่มตรวจสอบว่าตั้งถูกยัง** (ห้ามให้ลูกค้าเดาเอง)

| Type | Host | Value | ทำไม |
| ---- | ---- | ----- | ---- |
| MX | `@` | `mail.perpos.ai` (priority 10) | รับเมลเข้า |
| TXT | `@` | `v=spf1 include:amazonses.com ~all` | ขาออกผ่าน SES |
| CNAME ×3 | `xxx._domainkey` | (SES Easy DKIM) | DKIM ให้ตรง DMARC |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@perpos.ai` | เริ่มที่ `p=none` เก็บสถิติ 2–4 สัปดาห์ ค่อยขยับ `quarantine` |
| CNAME | `autodiscover` | `mail.perpos.ai` | Outlook ตั้งค่าเอง |
| SRV | `_autodiscover._tcp` | `mail.perpos.ai:443` | Outlook |
| CNAME | `autoconfig` | `mail.perpos.ai` | Thunderbird / Apple Mail |

> **ห้ามให้กล่องเมลใช้งานได้ก่อน DNS ผ่านครบ** — ปล่อยผ่านแล้วลูกค้าจะส่งเมลออกไปเข้าถังสแปม
> แล้วโทษเรา งานซัพพอร์ตจะท่วม

---

## 7. กฎหมาย / PDPA — เรื่องที่ต้องทำ ไม่ใช่ทางเลือก

- **เนื้อหาอีเมลของลูกค้า = ข้อมูลส่วนบุคคลที่อ่อนไหวที่สุดเท่าที่ PERPOS เคยเก็บ** — หนักกว่าเอกสารบัญชี
- ต้องอัปเดต [นโยบายความเป็นส่วนตัว](apps/landing-astro/src/lib/legal.ts): เก็บอะไร, เก็บที่ไหน
  (DO สิงคโปร์ + Cloudflare R2), เก็บนานแค่ไหน, ลบอย่างไรเมื่อเลิกใช้
- ต้องมี **ข้อตกลงประมวลผลข้อมูล (DPA)** กับลูกค้าแต่ละราย — เราเป็น "ผู้ประมวลผล" ลูกค้าเป็น "ผู้ควบคุม"
- **ผู้ดูแลระบบ (รวมเราเอง) ต้องอ่านเมลลูกค้าไม่ได้** — ออกแบบให้ admin เห็นแค่ metadata
  ถ้าจำเป็นต้องเข้าถึงเพื่อแก้ปัญหา ต้องมี audit log + ลูกค้ายินยอมเป็นครั้ง ๆ
- ⚠️ **ห้ามส่งเนื้อหาเมลเข้า AI ทุกกรณีจนกว่าจะแก้นโยบายก่อน** — AGENTS.md ระบุว่าเรารับรองกับ Google
  ไว้เรื่อง Limited Use ถ้าจะทำ "AI สรุปเมล" ต้องอัปเดตนโยบาย §7 และแจ้ง Google **ก่อน** เขียนโค้ด

---

## 8. ต้นทุนประเมิน

| รายการ | เดือนละ | หมายเหตุ |
| ------ | ------- | -------- |
| DO droplet $6 (1GB/1vCPU/25GB) SGP1 | $6.00 | Stalwart idle ~150MB — เหลือเฟือ |
| DO backup (20%) | $1.20 | เปิดไว้ ถูกและคุ้ม |
| Reserved IP | $0 | ฟรีเมื่อผูกกับ droplet |
| Cloudflare R2 (100GB) | ~$1.35 | 10GB แรกฟรี · **egress ฟรี** |
| AWS SES (50,000 เมล) | $5.00 | $0.10 / 1,000 ฉบับ |
| TLS (ACME) | $0 | Stalwart ต่ออายุเอง |
| Stalwart Community | $0 | อัป Enterprise = +฿633/เดือน ที่ 100 กล่อง |
| **รวม** | **≈ $13.5 (฿455)** | ที่ ~100 กล่อง = **฿4.5 / กล่อง / เดือน** |

**ตัวเลขที่โตตามลูกค้าคือ R2 กับ SES เท่านั้น** — droplet $6 อยู่ได้จนถึงประมาณ 300–500 กล่อง
(ถ้าใช้ R2 เป็น blob store ตาม §3) นี่คือเหตุผลหลักที่แนะนำให้สลับ

---

## 9. ความเสี่ยงที่ต้องรับรู้ก่อนตัดสินใจ

| ความเสี่ยง | ระดับ | รับมือ |
| ---------- | ----- | ------ |
| DO บล็อก 2587 ด้วย | **สูง** | ทดสอบเป็นงานแรก (Phase 0) → สำรอง: Hetzner / SES API bridge |
| droplet ตัวเดียว = SPOF | **สูง** | Phase 6 เพิ่ม backup MX — ระหว่างนี้ต้องบอกลูกค้าตรง ๆ ว่ายังไม่มี SLA |
| ลูกค้ารายหนึ่งส่งสแปม | กลาง | SES Tenants แยกชื่อเสียง + AUP + ตรวจลูกค้าก่อนเปิด |
| เมลตกถังสแปมตอนเริ่มใหม่ | กลาง | warm-up ค่อย ๆ เพิ่ม · DMARC เริ่ม `p=none` · เฝ้า Google Postmaster Tools |
| ลูกค้าตั้ง DNS ผิด | กลาง | บังคับ verify ก่อนใช้ + ปุ่มตรวจสอบในหน้าเว็บ |
| งาน webmail บานปลาย | **สูง** | ขายตั้งแต่ Phase 2 (ใช้ Outlook ได้) — webmail เป็นของแถมที่ค่อยทยอยออก |
| ข้อมูลลูกค้ารั่วข้าม org | **สูงมาก** | invariant §Phase 2 + เทสคุม + ห้าม service-role กับข้อมูล per-org |

---

## 10. สิ่งที่ต้องเคาะก่อนเริ่ม Phase 0

1. **§3 — เอา R2 เป็น blob store ตั้งแต่แรก (ผมแนะนำ) หรือยืนยัน NVMe-first แล้วขยับเป็น droplet $12?**
2. บัญชี AWS ที่จะใช้ทำ SES — ใช้บัญชีเดิมหรือเปิดใหม่แยก? (แนะนำแยก เพื่อไม่ให้ปัญหาเมลลามไปโดนบริการอื่น)
3. region ของ SES — `ap-southeast-1` (สิงคโปร์) ให้ใกล้ droplet
4. ราคาขาย — ตั้งต้นที่กี่บาท/กล่อง/เดือน? (ต้นทุนจริง ฿4.5 → ขาย ฿50–100 ยัง margin ดีมาก)
