# 📋 Mail Server — สิ่งที่ค้างทำ (ส่งต่อให้ session local)

> อัปเดต 2026-08-14 · branch `claude/multi-tenant-mail-server-lmz4ai`
> เอกสารนี้ = **เช็กลิสต์ว่าต้องทำอะไรต่อ** · เหตุผลเบื้องหลังอยู่ที่ [`MAIL_SERVER_PLAN.md`](MAIL_SERVER_PLAN.md)

## เสร็จแล้ว ✅

| ของ | ที่ไหน |
| --- | ------ |
| แผนสถาปัตยกรรม + ต้นทุน + ความเสี่ยง | [`docs/MAIL_SERVER_PLAN.md`](MAIL_SERVER_PLAN.md) |
| สเปก UI/UX (webmail + หลังบ้าน + DNS wizard) | [`docs/MAIL_UI_SPEC.md`](MAIL_UI_SPEC.md) |
| Terraform + cloud-init + README | [`infra/mail/`](../infra/mail/) |
| ตัดสินใจแล้ว 11 ข้อ | §10 ของคัมภีร์ |

**ตัดสินใจที่ต้องจำ:** Stalwart · Hetzner `sin-dc1` `cpx11` · เก็บเมลบนดิสก์เครื่อง ·
Community → sponsor $5 วันรับลูกค้าแรก · SES ขาออกพอร์ต 587 · **โควตา 1GB/กล่อง ปรับได้** ·
**DKIM = SES Easy DKIM (CNAME 3) ปิด DKIM ของ Stalwart** · **ไม่มี SLA** · **ไม่ให้บริการย้ายเมลเก่า**

---

## A. เตรียมก่อน (ทำนอกโค้ด — ทำได้เลยวันนี้)

- [ ] **บัญชี Hetzner Cloud** → [console.hetzner.cloud](https://console.hetzner.cloud) ผูกบัตร สร้าง Project
      ⚠️ บัญชีใหม่อาจต้องยืนยันตัวตน **1–2 วัน** — ทำข้อนี้ก่อนสุด
- [ ] **API token** (Read & Write) → Security → API tokens
- [ ] **SSH key** → `ssh-keygen -t ed25519 -C "perpos-mail"` (ถ้ายังไม่มี)
- [ ] **บัญชี AWS + เปิด SES** ที่ `ap-southeast-1`
- [ ] **ยื่นขอปลด SES sandbox** — ใช้เวลา 24–48 ชม. **ยื่นวันแรกเลย ไม่งั้นบล็อกงานทีหลัง**
      · ต้องบอกตรง ๆ ว่าเป็น **ISV ส่งแทนลูกค้า** + มีระบบจัดการ bounce/complaint

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

- [ ] `terraform apply` ผ่าน
      ⚠️ **โค้ดยังไม่เคย `validate` กับ provider จริง** (session ก่อนหน้าถูก proxy บล็อก registry)
      → มีโอกาสเจอชื่อ attribute ที่ต้องปรับตามเวอร์ชัน provider · แก้แล้ว commit ด้วย
- [ ] **ตั้ง DNS ที่ Cloudflare** — `A` + `AAAA` ของ `mail.perpos.ai`
      ⚠️ **DNS only (เมฆเทา) ห้ามเปิด proxy** — Cloudflare ไม่พร็อกซี SMTP/IMAP
- [ ] `nc -zv email-smtp.ap-southeast-1.amazonaws.com 587` → **ต้องผ่าน**
- [ ] `dig -x <ipv4> +short` → **ต้องได้ `mail.perpos.ai`**
- [ ] `bash /root/install-stalwart.sh` → เลือก **RocksDB** · เก็บรหัสแอดมินลง password manager ทันที
- [ ] เปิดหน้า `https://mail.perpos.ai` ได้ (ACME ออกใบรับรองสำเร็จ)
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

| # | เรื่อง | ต้องตอบก่อน |
| - | ------ | ------------ |
| 1 | บัญชี AWS สำหรับ SES — เดิมหรือเปิดใหม่แยก? *(แนะนำแยก)* | ก่อนยื่น sandbox |
| 2 | region SES — `ap-southeast-1`? | ก่อนยื่น sandbox |
| 3 | ราคาขาย/กล่อง/เดือน *(แนะนำ ฿99–149)* | ก่อนขาย |
| 4 | ราคาพื้นที่เพิ่ม/GB *(ต้นทุน ~฿1.5 · แนะนำ ฿20)* | ก่อนขาย |
| 5 | ช่องทาง + เวลาทำการรับแจ้งปัญหา | ก่อนรับลูกค้ารายแรก |

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

| เรื่อง | ต้องจัดการเมื่อไหร่ |
| ------ | -------------------- |
| **Terraform ยังไม่เคย validate จริง** | Phase 0 — เจอ error แล้วแก้ commit ด้วย |
| **backup อาจกู้ไม่ได้** (§5.1) | **Phase 1 — เป็นเกณฑ์ผ่าน ไม่ใช่ nice-to-have** |
| **ยังไม่มี antivirus** (§5.5) | ก่อนรับลูกค้า · ClamAV กิน RAM ~1GB → อาจต้องขยับเป็น `cpx21` |
| **เครื่องตัวเดียว = SPOF** | Phase 6 · ระหว่างนี้บอกลูกค้าตรง ๆ ว่าไม่มี SLA |
| **PDPA: DPA + ทางส่งออกข้อมูล** (§7) | ก่อนรับลูกค้ารายแรก |
| **ตลาดแคบเพราะไม่รับย้ายเมล** (§5.2) | รับรู้ไว้ · เจาะบริษัทเปิดใหม่/ที่ยังใช้เมลฟรี |

---

## 💬 พิมพ์แบบนี้ใน session local ได้เลย

> อ่าน `docs/MAIL_HANDOFF.md` แล้วทำหัวข้อ B ให้หน่อย — ติดตั้ง terraform ถ้ายังไม่มี
> รัน init กับ plan ให้ดูก่อน **อย่าเพิ่ง apply จนกว่าผมจะบอก**
> · token ผม export เป็น `TF_VAR_hcloud_token` ไว้แล้ว อย่าถามหาใน chat
