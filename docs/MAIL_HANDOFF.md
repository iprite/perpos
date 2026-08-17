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
Community → sponsor $5 วันรับลูกค้าแรก · **ขาออก = relay พอร์ต 587: ตอนนี้ Brevo · ย้ายไป SES/Mailgun ก่อนขายจริง** (SES ติดบัตร AWS) ·
**โควตา 1GB/กล่อง ปรับได้** · **DKIM = ให้ relay เซ็นในนาม perpos.ai** (Brevo ทำอยู่ selector `brevo2` — DMARC pass แล้ว) ·
**ไม่มี SLA** · **ไม่ให้บริการย้ายเมลเก่า**

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
- [x] **DNS ที่ Cloudflare ตั้งแล้ว** — A+AAAA (DNS only, ttl 300) ของ **5 ชื่อ** ชี้ `46.225.14.18` /
      `2a01:4f8:c2c:105a::1`: `mail` · `autoconfig` · `autodiscover` · `mta-sts` · `ua-auto-config`
      ⚠️ **DNS only (เมฆเทา) ห้ามเปิด proxy** — Cloudflare ไม่พร็อกซี SMTP/IMAP
- [x] SES `:587` เช็คจากเครื่องแล้ว — **ผ่านทั้ง `eu-central-1` และ `ap-southeast-1`**
      · พอร์ต 25 **ขาออก** ถูกบล็อกตามคาด (บัญชีใหม่) — ไม่กระทบเพราะส่งออกผ่าน SES
- [x] `dig -x 46.225.14.18 +short` → ได้ `mail.perpos.ai` ✅ (v6 ด้วย)
- [x] **ติดตั้ง Stalwart แล้ว** — `0.16.17` · service `active`+`enabled` · อยู่ใน **bootstrap mode**
      · ⚠️ **ตัวติดตั้ง 0.16 ไม่ถามคำถามแล้ว** (คัมภีร์เดิมเขียนว่าถาม deployment/RocksDB/รหัสแอดมิน — ไม่จริงแล้ว)
      ทุกอย่างไปตั้งใน wizard หน้าเว็บ `:8080/admin` แทน
      · พอร์ต 8080 **ไม่ได้เปิดใน firewall โดยตั้งใจ** → เข้าผ่าน ssh tunnel เท่านั้น
- [x] **wizard เสร็จ** — RocksDB ที่ `/var/lib/stalwart/` (`config.json` เก็บแค่ storage backend
      ที่เหลืออยู่ใน RocksDB) · ⚠️ **แก้ config แล้วต้อง `systemctl restart stalwart`** ไม่งั้นค้าง bootstrap mode
- [x] **ACME ออกใบรับรองจริงแล้ว** (Let's Encrypt ถึง 13 พ.ย. 2026) ครอบ 5 ชื่อ:
      `mail` · `autoconfig` · `autodiscover` · `mta-sts` · `ua-auto-config` `.perpos.ai`
      · 🔴 **กับดักที่เสียเวลาไปหนึ่งรอบ**: Stalwart ใส่ 4 ชื่อ auto-discovery เข้า SAN ให้เอง
      **ถ้าชื่อไหนไม่มีใน DNS ทั้ง order ล้ม** → ได้ self-signed (`CN=rcgen self signed cert`) เงียบ ๆ
      · แก้โดยเพิ่ม A+AAAA ครบทั้ง 4 ชื่อ (ได้ auto-config ของ Outlook/Thunderbird เป็นของแถม)
      · ⚠️ Let's Encrypt จำกัด validate ล้มเหลว 5 ครั้ง/ชม./ชื่อ — ถ้าเจออีกให้แก้ DNS **ก่อน** restart ซ้ำ
- [x] **พอร์ต 587 เพิ่มแล้ว** (`submission`, SMTP, `[::]:587`, STARTTLS) — ตรวจจากนอกเครื่องแล้ว:
      EHLO โฆษณา `STARTTLS` · หลัง STARTTLS ได้ `AUTH PLAIN LOGIN XOAUTH2 OAUTHBEARER`
      (ก่อน STARTTLS ไม่โฆษณา PLAIN/LOGIN = ถูกต้อง ไม่ยอมรับรหัสผ่านบนช่องที่ยังไม่เข้ารหัส)
      · ใบรับรองบน 587 = Let's Encrypt ใบเดียวกับ 443/465/993/25
      · ที่ฟังครบตอนนี้: **25 · 443 · 465 · 587 · 993 · 995 · 4190** (ManageSieve) · 8080 (admin, ไม่เปิดใน firewall)
      · 💡 กับดักตอนกรอกฟอร์ม: ช่อง **Bind addresses ต้องกด `+`** ให้ค่าเข้า list ก่อน ไม่งั้นฟ้อง
      `Minimum length is 1` ทั้งที่พิมพ์ค่าถูกแล้ว
- [x] **หน้าแอดมินยังเปิดทั้งอินเทอร์เน็ต แต่ auto-ban คุมจริงแล้ว (พิสูจน์ 2026-08-17)**
      · เดิมเชื่อว่า "ยิงรหัสผิด 12 ครั้งไม่โดนแบน" — **การทดสอบเดิมผิดเอง**: ยิงผ่าน loopback ซึ่ง
      Stalwart ยกเว้นให้ · ทดสอบใหม่จาก IP จริง → **โดนแบน 1 วันหลังผิดครบ 10 ครั้ง/ชม.** (`authFailure`)
      ตามค่า `x:Security` singleton (`authBanRate {count:10, period:1h}` · `authBanPeriod 1d`)
      · ระบบแบน port-scan ก็ทำงานอยู่ (~150 IP ในบัญชีแบนตลอดเวลา)
      · วิธีทดสอบโดยไม่ล็อกตัวเองออก: ยิงจาก IP สาธารณะของเครื่องเอง แล้วปลดผ่าน
      `x:BlockedIp/set destroy` + `x:Action ReloadBlockedIps` จากเครื่องอื่น
      · ที่เหลือเป็นทางเลือก ไม่เร่ง: 2FA แอดมิน / จำกัด `/admin` ตาม IP (IP บ้านเป็น dynamic — ยังไม่ทำ)
- [ ] **บันทึกค่าเครื่องลง `infra_costs`** — Hetzner อยู่นอกท่อ `billing_export` ต้องกรอกเอง
- [ ] **ขอปลดพอร์ต 25 ขาออกกับ Hetzner** — ร่างคำขอพร้อมส่งที่
      [`docs/MAIL_HETZNER_PORT25_REQUEST.md`](MAIL_HETZNER_PORT25_REQUEST.md)
      · เดิมจดว่า "หลังจ่ายบิลเดือนแรก" — ส่งก่อนได้ ไม่เสียอะไร โดนปฏิเสธก็ตอบซ้ำในเคสเดิม
      · ⚠️ ก่อนส่งต้องมี `abuse@perpos.ai` ที่รับเมลได้จริง + ตั้งเพดาน auto-ban จริง
      (ที่เขียนในคำขอต้องเป็นความจริง)
      · **สำคัญขึ้นกว่าเดิม** เพราะ SES ติดที่บัตร AWS ยังไม่ผ่าน — ถ้าไม่มี relay เลย
      พอร์ต 25 คือทางเดียวที่ส่งเมลออกได้

---

## C. Phase 1 — dogfood ด้วย `perpos.ai` (2 สัปดาห์ก่อนขาย)

- [x] **MX ของ `perpos.ai` ชี้มาที่เครื่องเราแล้ว (2026-08-15)** — `MX 10 mail.perpos.ai` (ttl 300)
      · ที่อยู่ที่รับได้จริงผ่าน MX แล้ว: `admin@` `abuse@` `postmaster@` (probe ได้ `250` ครบ)
      · 🔍 **เหตุผลที่กล้าสลับ**: ก่อนสลับ Cloudflare Email Routing **ตอบ `550` ทุกที่อยู่อยู่แล้ว**
      (รวม `iprite@perpos.ai`) — กฎ forward ไป Gmail ตายไปแล้วโดยไม่มีใครรู้ · การสลับจึงไม่ทำให้
      อะไรแย่ลง มีแต่ดีขึ้น · **บทเรียน: ก่อน cutover ให้ probe MX เดิมด้วย `RCPT TO` เสมอ
      อย่าเชื่อว่ามันยังทำงาน**
      · ⚠️ Cloudflare **ห้ามแก้ MX ตราบใดที่ Email Routing ยังเปิดอยู่** (error 1046 / 890190)
      ต้องปิดที่หน้าเว็บก่อน — token แบบ "Edit zone DNS" ปิดให้ไม่ได้ (คนละ permission)
      · ค่า MX เดิมสำรองไว้ที่ scratchpad ของ session (`mx-before-cutover.json`)
      · **ตั้งใจไม่มี `iprite@perpos.ai`** — เจ้าตัวไม่ใช้แล้ว
- [ ] 🔴 **ยังส่งเมลออกไม่ได้เลย — และ relay ที่ 587 คือทางเดียวจนถึงกลางเดือน ก.ย.**
      · วัดจากเครื่องจริง: **25 ❌ · 465 ❌ · 587 ✅** (Hetzner บล็อกทั้ง 25 และ 465 ไม่ใช่แค่ 25)
      · FAQ ของ Hetzner ระบุเงื่อนไขปลดบล็อก: **เป็นลูกค้าครบ 1 เดือน + จ่ายบิลรอบแรก** แล้วยื่น
      **"limit request"** (ไม่ใช่ support ticket) → บัญชีเปิด 15 ส.ค. ⇒ ยื่นได้ ~15 ก.ย.
      · ⇒ **ต้องมี relay ที่พอร์ต 587 ให้ได้** (Brevo / SES / Mailgun) ไม่ใช่ทางเลือกเสริม
      · ทดสอบแล้วออกได้ทั้ง `smtp-relay.brevo.com:587` และ `email-smtp.eu-central-1.amazonaws.com:587`

- [x] **relay ขาออกใช้ Brevo แล้ว (ไม่ใช่ SES)** — `smtp-relay.brevo.com:587` STARTTLS
      · **ส่งเมลออกได้จริงแล้ว** ยืนยันจาก log: `delivery.delivered … code = 250` ทั้งไป
      Gmail และ mail-tester
      · ทำไมไม่ใช่ SES: บัตร AWS ยังยืนยันไม่ผ่าน · Brevo มีบัญชีอยู่แล้ว โดเมน verify แล้ว
      · ตั้งผ่าน **JMAP admin API** ไม่ใช่หน้าเว็บ — ดู §G ด้านล่าง (วิธีเรียก API)
- [x] **DNS**: MX ✅ · SPF ✅ (`v=spf1 ip4:46.225.14.18 ip6:… include:spf.brevo.com ~all`)
      · DKIM ของ Stalwart ✅ เผยแพร่แล้ว (`v1-ed25519-20260815` + `v1-rsa-20260815`)
      · DMARC ✅ มีอยู่เดิม `p=none` (rua ชี้ Brevo)
      · 🔴 **SPF เดิมหายไปเงียบ ๆ ตอนปิด Cloudflare Email Routing** — Cloudflare ลบทั้ง MX
      **และ TXT ของ SPF** ที่มันจัดการอยู่ · ถ้าไม่ไล่ดูจะไม่มีใครรู้ · **เช็ค SPF ทุกครั้งหลังแตะ
      Email Routing**
- [x] **DMARC ผ่านแล้ว — และผ่านมาตั้งแต่ก่อนที่เราจะแก้อะไร (2026-08-15)**
      · header จริงจาก Gmail: `dmarc=pass (p=NONE) header.from=perpos.ai`
      · เพราะ **Brevo เซ็นด้วย `d=perpos.ai` selector `brevo2` อยู่แล้ว** (ใช้ record
      `brevo1/brevo2._domainkey` ที่มีใน DNS มาก่อนเราจะเริ่มทำ) → DKIM align → DMARC ผ่าน
      · SPF ไม่ align (Brevo เขียน Return-Path เป็น `gw.d.sender-sib.com`) แต่ **DMARC ต้องการ
      แค่อย่างใดอย่างหนึ่ง** จึงไม่เป็นไร
      · 🔴 **mail-tester บอกว่า DMARC fail ทั้งที่ Gmail บอก pass** — mail-tester ไปตัดสินจาก
      ลายเซ็นตัวที่เสีย (ดูข้อล่าง) · **อย่าเชื่อ mail-tester อย่างเดียว ให้ดู header จริงจาก
      ปลายทางจริงเสมอ**
- [ ] ⚠️ **ลายเซ็น DKIM ของ Stalwart เองยัง `bad format`**
      · Gmail: `dkim=neutral (bad format) header.i=@perpos.ai`
      · สาเหตุ: Stalwart ยัด **2 ลายเซ็น (ed25519 + rsa) ไว้ในหัวเดียวคั่นด้วย `,`** แล้วทั้งก้อน
      ถูก MIME-encode เป็น `=?utf-8?b?…?=` ซึ่งผิดสเปก
      · ลองแก้แล้วโดยตัดให้เหลือ **RSA อย่างเดียว** (`x:Domain` → `dkimManagement/algorithms`)
      — ส่งรอบ 5 ไป Gmail แล้ว **รอเจ้าของเช็ค Show original**
      · ถ้ายังเสีย → **ปิด DKIM ของ Stalwart ทิ้ง** (`x:SenderAuth`) ปล่อยให้ Brevo เซ็นอย่างเดียว
      ซึ่งตรงกับที่คัมภีร์เขียนไว้แต่แรก — **แผนเดิมถูก ผมเป็นคนไปเปิดเองแล้วทำให้แย่ลง**
      · ⚠️ แต่ถ้าย้ายออกจาก Brevo ไป SES/Mailgun เมื่อไร **ต้องกลับมาแก้ให้ลายเซ็นตัวเองใช้ได้**
      ไม่งั้นจะไม่เหลืออะไร align
- [ ] −1.9 SpamAssassin + −0.5 body errors — ส่วนใหญ่เพราะเมลทดสอบเป็น plain text ล้วน
      ไม่มี HTML part / List-Unsubscribe · เมลจริงคะแนนดีกว่านี้ ไม่ใช่เรื่องเร่งด่วน
- [ ] เปิด **Google Postmaster Tools** ของ `perpos.ai`
- [x] ⚠️ **fail2ban jail สำหรับ Stalwart — ไม่ต้องทำ ใช้ของในตัว ซึ่งพิสูจน์แล้วว่าทำงาน** (ดูข้อหน้าแอดมินด้านบน — ที่เคยคิดว่า default หลวมคือทดสอบผ่าน loopback ที่ถูกยกเว้น)
      · Stalwart มี auto-ban ในตัวตั้งแต่ 0.5.3 (ครอบทั้ง SMTP/IMAP/JMAP/ManageSieve + นับตาม
      **ชื่อล็อกอิน** ด้วย ไม่ใช่แค่ IP → กัน distributed brute-force ที่หมุน IP ได้)
      · fail2ban ภายนอก **ใช้กับ Stalwart ไม่ได้อยู่แล้ว** — ระดับ log ปัจจุบันไม่บันทึก auth ที่ล้มเหลว
      (ลองยิงรหัสผิดแล้วไม่มีบรรทัดใน log เลย) จะ match อะไรก็ไม่เจอ
      · **ที่ต้องทำ: ตั้งเพดานที่ Settings → Security → Settings** — ยิงรหัสผิด 12 ครั้งติดยังไม่โดนแบน
      แปลว่า `authBanRate` default หลวมเกินไปสำหรับเครื่องที่เปิด `/admin` ให้ทั้งโลก
- [x] **backup รายวัน — แก้ใหม่ 2026-08-17 ให้สำรอง "ทั้งก้อน" แล้ว** (timer `stalwart-backup.timer` ตี 3 UTC เดิม)
      · 🔴 **บทเรียนแพง**: ของเดิมใช้ `stalwart --export` ซึ่งดึงแค่ metadata subspace (~700KB)
      **ไม่รวม blob = ตัวเมลทั้งหมดไม่อยู่ใน backup เลย** (ดิสก์มี 1.6GB แต่ไฟล์ backup 743KB)
      — ที่เคยเขียนว่า "ทดสอบแล้วครบ" คือทดสอบตอนเครื่องยังไม่มีเมลจริง · **ห้ามกลับไปใช้ `--export`**
      · ท่าใหม่ (`/usr/local/sbin/stalwart-backup.sh` บนเครื่อง): stop → **rsync ทั้ง
      `/var/lib/stalwart` + `/etc/stalwart` ไป mirror** → start ทันที (downtime วัดจริง **4 วิ**
      · รอบถัดไปสั้นกว่าเพราะ SST/blob ของ RocksDB ส่วนใหญ่ immutable) → tar+zstd+AES-256 จาก
      mirror นอกเวลา downtime → **verify ในตัว** (แตกกลับต้องเจอ `.blob` ไม่งั้น exit 1)
      · ซ้อมกู้แล้ว 2026-08-17: แตกกลับ 82 ไฟล์ 1.6GB **byte ตรงทุกไฟล์** · ไฟล์ละ ~1.2GB เก็บในเครื่อง 3 สำเนา
- [x] **backup ออกนอกเครื่องแล้ว (2026-08-17)** — GCS `gs://perpos-mail-backup`
      (**Nearline · `europe-west3` Frankfurt** ใกล้เครื่อง NBG1 อัป 1.2GB ~10 วิ · lifecycle **ลบเองที่ 30 วัน**
      · ~฿13/เดือน เข้าบิล GCP เดิม → โผล่ในแท็บโครงสร้างพื้นฐานของ `/admin/usage` เองผ่าน billing_export)
      · `/usr/local/sbin/stalwart-backup-upload.sh` เซ็น JWT ด้วย openssl แลก token เอง — **ไม่ลง gsutil/rclone บนเครื่องเมล**
      · 🔒 service account `perpos-mail-backup@perpos` มีสิทธิ์ **objectCreator อย่างเดียว** — ทดสอบจริง:
      GET/DELETE/LIST ได้ 403 หมด ⇒ เครื่องเมลถูกยึดก็ทำลาย backup เก่าไม่ได้ (ลบของเก่า = หน้าที่ lifecycle)
      · **ซ้อมภัยพิบัติผ่านแล้ว**: โหลดจาก GCS ลงเครื่องอื่น + ถอดรหัส + แตกไฟล์ → 82 ไฟล์ 1.6GB ครบ
      · ท่อรายวันทดสอบ end-to-end แล้ว (backup → verify → upload ใน run เดียว)
- [ ] 🔴 **เก็บกุญแจถอดรหัสลง password manager** (เหลือข้อเดียวของหมวดนี้ — คนต้องทำเอง)
      `ssh root@46.225.14.18 'cat /root/.stalwart-backup-key'` · กุญแจยังอยู่บนเครื่องเดียวกับข้อมูล
      เครื่องหายทั้งลูก = backup บน GCS ถอดรหัสไม่ได้

**เกณฑ์ผ่าน Phase 1 (ครบทั้ง 4 ข้อถึงจะขายได้):**

1. ส่ง–รับกับ **Gmail + Outlook + Yahoo** ได้ (ทั้ง 3 เจ้า)
2. [mail-tester.com](https://www.mail-tester.com) ได้ **≥ 9/10**
3. ใช้เป็นเมลหลักจริง **2 สัปดาห์** โดยไม่มีเมลหาย/ไม่เข้าสแปม
4. 🔴 **ซ้อมกู้จาก backup สำเร็จ 1 ครั้ง** — สร้างเครื่องใหม่จาก backup แล้วเมลครบ

---

## C2. Monitoring + MTA-STS (เพิ่ม 2026-08-17)

- [x] **เฝ้าระวัง + แจ้งเตือน LINE** — 2 ขา ตัดสินใจเตือนนอกเครื่องเสมอ:
  1. **scheduler ของแอป (ทุก 5 นาที, tier t5)** เรียก `runMailServerMonitor()`
     ([lib/mail/server-monitor.ts](../apps/perpos/src/lib/mail/server-monitor.ts)) — ตรวจสดจาก Vercel:
     พอร์ต 25 (banner 220) · เว็บ/JMAP 443 · วันหมดอายุใบรับรอง (<14 วัน = เตือน)
  2. **heartbeat รายชั่วโมงจากเครื่องเมล** (`stalwart-heartbeat.timer` → `POST /api/admin/mail-server/heartbeat`
     auth `x-worker-secret`) ส่งของที่มองได้เฉพาะในเครื่อง: ดิสก์% · อายุ/ขนาด backup · service active
     — **heartbeat ขาดเกิน 3 ชม. = เรื่องต้องเตือนเช่นกัน** (ตัวส่งตาย/เครื่องดับ)
  - เตือนผ่าน `alertAdminLine` (LINE → super_admin) เฉพาะ**ขอบเหตุการณ์** (พัง/กลับมาปกติ) + ซ้ำทุก 6 ชม.
    ถ้ายังพัง — สถานะ dedup อยู่ตาราง `mail_server_health` (แถวเดียว, RLS deny-all) · เกณฑ์: ดิสก์ ≥85% ·
    backup แก่กว่า 30 ชม. · pure logic มีเทสคุม ([server-monitor.test.ts](../apps/perpos/src/lib/mail/server-monitor.test.ts))
  - ⚠️ heartbeat จะเริ่มติดเมื่อ **โค้ดฝั่งแอป deploy แล้ว** (endpoint ยังไม่อยู่บน prod ตอนตั้ง timer)
- [x] **MTA-STS โหมด enforce ทั้งสองโดเมน** — Stalwart เสิร์ฟ policy เองที่
      `https://mta-sts.<โดเมน>/.well-known/mta-sts.txt` (ตั้งผ่าน `x:MtaSts` singleton: `mode=enforce, maxAge=1d`)
      · TXT `_mta-sts` + **TLS-RPT** (`_smtp._tls` → rua เข้ากล่อง dmarc ของเราเอง) ครบทั้ง perpos.ai + exworker.co.th
      · ⚠️ **ถ้าย้าย MX เมื่อไร ต้องแก้ policy + bump `id=` ใน TXT ก่อน** ไม่งั้นปลายทางที่ cache policy จะไม่ส่งเมลมา
      · 🪤 **กับดัก SAN เดิมกัดซ้ำกับ exworker**: Stalwart ยัด autoconfig/autodiscover/ua-auto-config/mta-sts
      เข้า ACME order เองตั้งแต่สร้างโดเมน → 3 ชื่อไม่มี DNS ทำ order ล้มวนมาหลายชั่วโมง (rate-limited เงียบ ๆ)
      — เพิ่ม A/AAAA ครบ 6 record แล้ว 2026-08-17 (ได้ auto-config ของ Outlook/Thunderbird เป็นของแถม)

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

---

## G. 🔧 วิธีตั้งค่า Stalwart ผ่าน API (ขุดเองจนเจอ — ไม่มีในเอกสารสาธารณะ)

Stalwart 0.16 ย้ายการจัดการทั้งหมดไปอยู่ใต้ **JMAP** · `/api/*` เหลือแค่ helper
(`auth` `account` `schema` `discover`) ไม่ใช่ REST สำหรับจัดการอีกแล้ว

**กุญแจ 3 ดอกที่ทำให้เรียกได้:**

1. ต้องใส่ capability **`urn:stalwart:jmap`** ใน `using` (ไม่มีในเอกสาร — ขุดจากโค้ดหน้าแอดมิน)
2. object ของ Stalwart ขึ้นต้นด้วย **`x:`** — `x:MtaRoute/get`, `x:Domain/get`, `x:DkimSignature/get`
   (ถ้าเรียก `MtaRoute/get` เฉย ๆ จะได้ `unknownMethod`)
3. **schema ทั้งหมดดูได้ที่ `GET /api/schema`** (redirect ไป `/api/schema/<hash>` · ต้อง `--compressed`)
   → บอกทุก field ของทุก object รวม enum และ variant · **นี่คือเอกสาร API ที่แท้จริง**

```bash
K=$(security find-generic-password -a "$USER" -s perpos-stalwart-apikey -w)
curl -s -X POST -H "Authorization: Bearer $K" -H "Content-Type: application/json" \
  https://stalwart.perpos.ai/jmap/ \
  --data '{"using":["urn:ietf:params:jmap:core","urn:stalwart:jmap"],
           "methodCalls":[["x:MtaRoute/get",{"accountId":"b"},"0"]]}'
```

**กับดักที่เจอ:**

- variant object ใช้ `@type` เป็นตัวแยกชนิด (`{"@type":"Relay", …}` / `{"@type":"Value","secret":"…"}`)
- ค่าใน **Expression ต้องใส่ single quote** — `{"route":{"else":"'brevo'"}}` ไม่ใช่ `"brevo"`
  (ไม่งั้นได้ `Invalid variable or constant`)
- **สร้าง route อย่างเดียวไม่มีผล** ต้องตั้ง `x:MtaOutboundStrategy` (singleton) ให้ชี้มาใช้ด้วย
- ~~`Principal/set` เรียกไม่สำเร็จ → เพิ่มบัญชีต้องทำผ่านหน้าเว็บ~~ **ผิด — object ที่ถูกคือ `x:Account`**
  (2026-08-16): `x:Domain/set` และ `x:Account/set` เรียกได้ปกติ ⇒ เพิ่ม/ลบโดเมนกับกล่องเมลจาก UI ของเราได้
  · หน้า `/admin/mail` ใช้ทางนี้อยู่แล้ว ([lib/mail/admin-api.ts](../apps/perpos/src/lib/mail/admin-api.ts))
  · กับดัก 2 ข้อที่เจอตอนทำจริง:
  1. `certificateManagement: {"@type":"Automatic"}` **ต้องมี `acmeProviderId`** ไม่งั้นได้ `ACME provider not found`
     (หา id จาก `x:AcmeProvider/query`) · และอย่าใส่ `subjectAlternativeNames` ของโดเมนลูกค้าตั้งแต่แรก
     เพราะ DNS ยังไม่ชี้มา ACME จะ challenge ไม่ผ่านแล้ววนขอใหม่
  2. **ลบโดเมนไม่ได้ถ้ายังมีลายเซ็น DKIM ผูกอยู่** (`notDestroyed.type = objectIsLinked`) — และเราตั้ง DKIM
     เป็น Automatic ทุกโดเมน ⇒ ต้อง `x:DkimSignature/set destroy` ของโดเมนนั้นก่อนเสมอ
     · error ของ `*/set` บางกรณีมีแค่ `type` ไม่มี `description` — ต้องแปลเป็นข้อความไทยเอง
- แก้ config แล้ว **ต้องสั่ง reload ก่อนถึงจะมีผล** — และ **ไม่ต้อง ssh ไป restart** (เอกสารเดิมเขียนผิด):
  ```
  x:Action/set → create { "@type": "ReloadSettings" }
  ```
  🔴 **กับดักที่เสียเวลาที่สุดตอนตั้ง route** (2026-08-17): สร้าง route + ผูก `x:MtaOutboundStrategy`
  ครบถูกต้องแล้ว แต่เมลยัง**ออกทาง route เดิมเงียบ ๆ** ไม่มี error ไม่มี bounce ไม่มีคิวค้าง
  → สั่ง `ReloadSettings` แล้วเมลฉบับถัดไปไปถูกเส้นทันที
  · variant อื่น: `ReloadTlsCertificates` · `ReloadLookupStores` · `ReloadBlockedIps`
  · **วิธีพิสูจน์ว่าเมลไปเส้นไหนจริง** (log ของ relay ไม่โชว์เมลที่มาทาง SMTP ทันที): ส่งหากล่องที่
  อ่าน header ได้ แล้วดู `Received:` + `Return-Path:` — บอกชัดว่าออกจากโครงข่ายใคร

**ส่งเมลทดสอบผ่าน API** (ไม่ต้องรู้รหัสผ่านบัญชี):
`Email/set` สร้างใน Drafts (`mailboxIds:{"d":true}`) → `EmailSubmission/set` (`identityId` จาก `Identity/get`)
