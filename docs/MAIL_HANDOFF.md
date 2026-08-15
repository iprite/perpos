# 📋 Mail Server — สิ่งที่ค้างทำ (ส่งต่อให้ session local)

> อัปเดต 2026-08-14 · branch `claude/multi-tenant-mail-server-lmz4ai`
> เอกสารนี้ = **เช็กลิสต์ว่าต้องทำอะไรต่อ** · เหตุผลเบื้องหลังอยู่ที่ [`MAIL_SERVER_PLAN.md`](MAIL_SERVER_PLAN.md)

## เสร็จแล้ว ✅

| ของ                                          | ที่ไหน                                            |
| -------------------------------------------- | ------------------------------------------------- |
| แผนสถาปัตยกรรม + ต้นทุน + ความเสี่ยง         | [`docs/MAIL_SERVER_PLAN.md`](MAIL_SERVER_PLAN.md) |
| สเปก UI/UX (webmail + หลังบ้าน + DNS wizard) | [`docs/MAIL_UI_SPEC.md`](MAIL_UI_SPEC.md)         |
| Terraform + cloud-init + README              | [`infra/mail/`](../infra/mail/)                   |
| ตัดสินใจแล้ว 11 ข้อ                          | §10 ของคัมภีร์                                    |

**ตัดสินใจที่ต้องจำ:** Stalwart · **Hetzner `nbg1` (เยอรมนี) `cx23`** · เก็บเมลบนดิสก์เครื่อง ·
Community → sponsor $5 วันรับลูกค้าแรก · SES ขาออกพอร์ต 587 · **โควตา 1GB/กล่อง ปรับได้** ·
**DKIM = SES Easy DKIM (CNAME 3) ปิด DKIM ของ Stalwart** · **ไม่มี SLA** · **ไม่ให้บริการย้ายเมลเก่า**

---

## A. เตรียมก่อน (ทำนอกโค้ด — ทำได้เลยวันนี้)

- [ ] **บัญชี Hetzner Cloud** → [console.hetzner.cloud](https://console.hetzner.cloud) ผูกบัตร สร้าง Project
      ⚠️ บัญชีใหม่อาจต้องยืนยันตัวตน **1–2 วัน** — ทำข้อนี้ก่อนสุด
- [ ] **API token** (Read & Write) → Security → API tokens
- [x] **SSH key** สร้างแล้ว `~/.ssh/perpos_mail_ed25519` (ใส่ใน `terraform.tfvars` แล้ว)
- [ ] **บัญชี AWS + เปิด SES** ที่ **`eu-central-1`** (เครื่องอยู่เยอรมนีแล้ว — ดู §D ข้อ 2)
- [ ] **ยื่นขอปลด SES sandbox** — ใช้เวลา 24–48 ชม. **ยื่นวันแรกเลย ไม่งั้นบล็อกงานทีหลัง**
      · ต้องบอกตรง ๆ ว่าเป็น **ISV ส่งแทนลูกค้า** + มีระบบจัดการ bounce/complaint
      · ⚠️ ต้องเคาะ §D ข้อ 1 (บัญชี AWS เดิม/ใหม่) + ข้อ 2 (region) **ก่อน** กดยื่น
      · ร่างคำขอพร้อมวางอยู่ที่ [`docs/MAIL_SES_SANDBOX_REQUEST.md`](MAIL_SES_SANDBOX_REQUEST.md)

---

## B. Phase 0 — สร้างเครื่อง (session local รันได้เลย)

```bash
git checkout claude/multi-tenant-mail-server-lmz4ai
cd infra/mail
read -rs TF_VAR_hcloud_token && export TF_VAR_hcloud_token   # ไม่ลงดิสก์ ไม่เข้าแชท
cp terraform.tfvars.example terraform.tfvars                 # ใส่ ssh_public_key (ลบบรรทัด hcloud_token)
terraform init
terraform plan     # ← ต้องได้ "7 to add, 0 to change, 0 to destroy"
terraform apply
```

- [x] **`terraform init` + `validate` ผ่านแล้ว** (2026-08-15, provider hcloud 1.68)
      · เจอจริงตามที่กลัวไว้: `hcloud_primary_ip` **ห้ามใช้ `datacenter`** แล้ว ต้องเป็น `location = "sin"`
      (+ `assignee_type` เลิกใช้) — แก้แล้วทั้ง primary_ip และ server
      · `terraform plan` (ใส่ token หลอก 64 ตัวเพื่อดูรูปแผน) ได้ **"7 to add, 0 to change, 0 to destroy"** ตามคาด
      · `terraform.tfvars` + SSH key `~/.ssh/perpos_mail_ed25519` เตรียมไว้แล้ว (tfvars ไม่มี token โดยตั้งใจ)
- [x] **`terraform apply` ผ่านแล้ว (2026-08-15)** — เครื่องรันอยู่จริง
      · **`46.225.14.18`** / `2a01:4f8:c2c:105a::1` · `nbg1` · `cx23` (2 vCPU / 4GB / 40GB)
      · 🔴 **เปลี่ยน location จากสิงคโปร์เป็นเยอรมนีกลาง apply** — `cpx11` ถูกเลิกขายที่ `sin`
      และรุ่นที่เหลือแพงกว่ายุโรป ~5 เท่าโดยสเปกแย่กว่า (ดู §8 ของคัมภีร์ที่แก้ตัวเลขแล้ว)
      · PTR ตรวจแล้วได้ `mail.perpos.ai` ทั้ง v4/v6 · ต้นทุนจริง **$8.39/เดือน ≈ ฿280**
- [x] **fail2ban ใช้งานได้แล้ว** — cloud-init เดิมพัง (Debian 12 ไม่มี `/var/log/auth.log` + ขาด `python3-systemd`) เครื่องเลยไม่มีเกราะกัน brute-force เลย · แก้ทั้งบนเครื่องและใน cloud-init
- [ ] **ตั้ง DNS ที่ Cloudflare** — `A` `mail.perpos.ai` → `46.225.14.18` · `AAAA` → `2a01:4f8:c2c:105a::1`
      ⚠️ **DNS only (เมฆเทา) ห้ามเปิด proxy** — Cloudflare ไม่พร็อกซี SMTP/IMAP
- [x] SES `:587` เช็คจากเครื่องแล้ว — **ผ่านทั้ง `eu-central-1` และ `ap-southeast-1`**
      · พอร์ต 25 **ขาออก** ถูกบล็อกตามคาด (บัญชีใหม่) — ไม่กระทบเพราะส่งออกผ่าน SES
- [x] `dig -x 46.225.14.18 +short` → ได้ `mail.perpos.ai` ✅ (v6 ด้วย)
- [x] **ติดตั้ง Stalwart แล้ว** — `0.16.17` · service `active`+`enabled` · อยู่ใน **bootstrap mode**
      · ⚠️ **ตัวติดตั้ง 0.16 ไม่ถามคำถามแล้ว** (คัมภีร์เดิมเขียนว่าถาม deployment/RocksDB/รหัสแอดมิน — ไม่จริงแล้ว)
      ทุกอย่างไปตั้งใน wizard หน้าเว็บ `:8080/admin` แทน
      · พอร์ต 8080 **ไม่ได้เปิดใน firewall โดยตั้งใจ** → เข้าผ่าน ssh tunnel เท่านั้น
- [ ] **เข้า wizard ตั้งค่า** — `ssh -N -L 8080:localhost:8080 root@mail.perpos.ai` แล้วเปิด `http://localhost:8080/admin`
      · รหัสชั่วคราว: `journalctl -u stalwart -n 200 | grep -A8 'bootstrap mode'` → **เปลี่ยนทันทีในหน้า wizard**
      · เลือกที่เก็บข้อมูล **RocksDB** · ตั้งโดเมน `perpos.ai`
- [ ] เปิดหน้า `https://mail.perpos.ai` ได้ (ACME ออกใบรับรองสำเร็จ — ต้องตั้งใน wizard ก่อน ตอนนี้ยังฟังแค่ 8080)
- [ ] **บันทึกค่าเครื่องลง `infra_costs`** — Hetzner อยู่นอกท่อ `billing_export` ต้องกรอกเอง
- [ ] (หลังจ่ายบิลเดือนแรก) ขอปลดพอร์ต 25 ขาออกกับ Hetzner — เป็นทางหนีทีไล่ถ้า SES มีปัญหา

---

## C. Phase 1 — dogfood ด้วย `perpos.ai` (2 สัปดาห์ก่อนขาย)

- [ ] ตั้ง **relay ขาออก → SES `:587`** · credentials `chmod 600` **ห้าม commit**
- [ ] **ปิด DKIM signing ของ Stalwart** — เราใช้ SES Easy DKIM (ไม่งั้นได้ลายเซ็นซ้อน)
- [ ] DNS ของ `perpos.ai`: MX · SPF `include:amazonses.com` · **DKIM CNAME ×3 จาก SES** · DMARC `p=none`
- [ ] เปิด **Google Postmaster Tools** ของ `perpos.ai`
- [ ] เพิ่ม **fail2ban jail สำหรับ Stalwart** (587/993) — cloud-init ทำไว้แค่ sshd
- [ ] 🔴 **logical backup รายวัน + ส่งออกนอก Hetzner** (§5.1 — snapshot ขณะเครื่องรันอาจกู้ไม่ได้)

**เกณฑ์ผ่าน Phase 1 (ครบทั้ง 4 ข้อถึงจะขายได้):**

1. ส่ง–รับกับ **Gmail + Outlook + Yahoo** ได้ (ทั้ง 3 เจ้า)
2. [mail-tester.com](https://www.mail-tester.com) ได้ **≥ 9/10**
3. ใช้เป็นเมลหลักจริง **2 สัปดาห์** โดยไม่มีเมลหาย/ไม่เข้าสแปม
4. 🔴 **ซ้อมกู้จาก backup สำเร็จ 1 ครั้ง** — สร้างเครื่องใหม่จาก backup แล้วเมลครบ

---

## D. ยังไม่เคาะ 5 ข้อ (ไม่บล็อก Phase 0)

| #   | เรื่อง                                                              | ต้องตอบก่อน         |
| --- | ------------------------------------------------------------------- | ------------------- |
| 1   | บัญชี AWS สำหรับ SES — เดิมหรือเปิดใหม่แยก? _(แนะนำแยก)_            | ก่อนยื่น sandbox    |
| 2   | region SES — **ควรเป็น `eu-central-1` แล้ว** (เครื่องย้ายไปเยอรมนี) | ก่อนยื่น sandbox    |
| 3   | ราคาขาย/กล่อง/เดือน _(แนะนำ ฿99–149)_                               | ก่อนขาย             |
| 4   | ราคาพื้นที่เพิ่ม/GB _(ต้นทุน ~฿1.5 · แนะนำ ฿20)_                    | ก่อนขาย             |
| 5   | ช่องทาง + เวลาทำการรับแจ้งปัญหา                                     | ก่อนรับลูกค้ารายแรก |

---

## E. งานโค้ดรอบถัดไป — M0 (รอบที่ทำเงิน)

ยังไม่เริ่ม · **M0 จบ = ขายได้** (ลูกค้าใช้ Outlook/Apple Mail ต่อ IMAP ได้ ไม่ต้องรอ webmail)

- [ ] โมดูล `mail` ใน [`lib/modules.ts`](../apps/perpos/src/lib/modules.ts) (shared, ไม่ใส่ `forOrgSlugs`)
- [ ] migration 6 ตาราง — `mail_domains` `mail_dns_records` `mail_mailboxes` `mail_aliases`
      `mail_events` `mail_usage_daily` (RLS ครบ + invariant 5 ข้อใน §Phase 2)
- [ ] API routes ห่อ `withUsageContext` — `/api/mail/{domains,domains/[id]/verify,mailboxes,aliases,ses-webhook}`
- [ ] หน้า Server Component + `loading.tsx` — `/[orgSlug]/mail/{domains,mailboxes,aliases,settings}`
- [ ] ⭐ **ตัวช่วยตั้ง DNS** (§5.1 ของ [`MAIL_UI_SPEC.md`](MAIL_UI_SPEC.md)) — จุดที่ลูกค้าพังบ่อยสุด
      · ท่อ: `CreateEmailIdentity` → เก็บ DKIM token 3 ตัว → poll `GetEmailIdentity` ทุก 30 วิ
- [ ] เตือนโควตา 80%/95% · **กล่องเต็มต้องตอบ `452` ไม่ใช่ `550`** (550 = เมลหายจริง)
- [ ] หน้าคู่มือ "ย้ายเมลเก่าเองยังไง" (§5.2) — 1 หน้า ตอบข้อโต้แย้งตอนขาย ไม่ต้องเขียนระบบ

**หลัง M0:** M1 อ่านเมล → M2 เขียน/ตอบ → M3 โฟลเดอร์+มือถือ → M4 หลังบ้าน super_admin
(ดู §11 ของ [`MAIL_UI_SPEC.md`](MAIL_UI_SPEC.md))

---

## F. ⚠️ ความเสี่ยงที่ยังไม่มีคำตอบ (อย่าลืม)

| เรื่อง                                                                        | ต้องจัดการเมื่อไหร่                                                          |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| ~~Terraform ยังไม่เคย validate จริง~~ ✅ **apply ขึ้นจริงแล้ว 2026-08-15**    | ปิดประเด็นแล้ว — เครื่องรันอยู่ `46.225.14.18`                               |
| 🔴 **ราคา/ที่ตั้งเคยผิดทั้งหัวข้อ** (§8) — เอาราคายุโรปมาคิดแล้วเลือกสิงคโปร์ | แก้แล้ว · **บทเรียน: ดึงราคาจาก API ก่อนเคาะ location อย่าเชื่อตัวเลขในแผน** |
| **`ssh_allowed_ips` ยังเปิด `0.0.0.0/0`**                                     | ก่อนรับลูกค้า · แคบให้เหลือ IP ที่ใช้จริง (ตอนนี้พึ่ง fail2ban อย่างเดียว)   |
| **backup อาจกู้ไม่ได้** (§5.1)                                                | **Phase 1 — เป็นเกณฑ์ผ่าน ไม่ใช่ nice-to-have**                              |
| **ยังไม่มี antivirus** (§5.5)                                                 | ก่อนรับลูกค้า · ClamAV กิน RAM ~1GB → อาจต้องขยับเป็น `cpx21`                |
| **เครื่องตัวเดียว = SPOF**                                                    | Phase 6 · ระหว่างนี้บอกลูกค้าตรง ๆ ว่าไม่มี SLA                              |
| **PDPA: DPA + ทางส่งออกข้อมูล** (§7)                                          | ก่อนรับลูกค้ารายแรก                                                          |
| **ตลาดแคบเพราะไม่รับย้ายเมล** (§5.2)                                          | รับรู้ไว้ · เจาะบริษัทเปิดใหม่/ที่ยังใช้เมลฟรี                               |

---

## 💬 พิมพ์แบบนี้ใน session local ได้เลย

> อ่าน `docs/MAIL_HANDOFF.md` แล้วทำหัวข้อ B ให้หน่อย — ติดตั้ง terraform ถ้ายังไม่มี
> รัน init กับ plan ให้ดูก่อน **อย่าเพิ่ง apply จนกว่าผมจะบอก**
> · token ผม export เป็น `TF_VAR_hcloud_token` ไว้แล้ว อย่าถามหาใน chat
