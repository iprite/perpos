# infra/mail — เมลเซิร์ฟเวอร์ (Stalwart บน Hetzner Cloud, สิงคโปร์)

แผนเต็ม + เหตุผลเบื้องหลังทุกการตัดสินใจ: [`docs/MAIL_SERVER_PLAN.md`](../../docs/MAIL_SERVER_PLAN.md)

| | |
| - | - |
| ผู้ให้บริการ | Hetzner Cloud · `sin-dc1` (สิงคโปร์) |
| เครื่อง | `cpx11` (2 vCPU AMD / 2GB / 40GB / traffic 20TB) |
| ขาออก | AWS SES พอร์ต **587** (Hetzner บล็อก 25 ขาออกจนกว่าจะขอปลด) |
| ขาเข้า | พอร์ต 25 เปิดปกติ (MX ชี้มาที่ `mail.perpos.ai`) |

> ⚠️ **CPX เท่านั้น** — ซีรีส์ `cx*` / `cax*` (ARM ราคาถูกกว่า) **มีเฉพาะยุโรป ไม่มีที่สิงคโปร์**

---

## ครั้งแรก

```bash
cd infra/mail
cp terraform.tfvars.example terraform.tfvars   # แล้วใส่ค่าจริง
terraform init
terraform plan      # ← อ่านให้ครบก่อน apply เสมอ
terraform apply
```

`terraform.tfvars` ต้องมี:

| ตัวแปร | เอามาจากไหน |
| ------ | ------------ |
| `hcloud_token` | Hetzner Console → Security → API tokens → **Read & Write** |
| `ssh_public_key` | `cat ~/.ssh/id_ed25519.pub` |
| `ssh_allowed_ips` | IP ออฟฟิศ/บ้าน — **อย่าเปิด `0.0.0.0/0` ถ้าเลี่ยงได้** |

## หลัง apply

`terraform output next_steps` จะบอกขั้นตอนถัดไป โดยสรุป:

1. ตั้ง DNS ที่ Cloudflare — `A` + `AAAA` ของ `mail.perpos.ai`
   **ต้องเป็น DNS only (เมฆเทา) ห้ามเปิด proxy** เพราะ Cloudflare ไม่พร็อกซี SMTP/IMAP
2. `ssh root@<ipv4>` → `bash /root/install-stalwart.sh`
3. ทดสอบพอร์ตไป SES: `nc -zv email-smtp.ap-southeast-1.amazonaws.com 587`
4. ตรวจ PTR: `dig -x <ipv4> +short` → ต้องได้ `mail.perpos.ai`
5. ส่งเมลทดสอบไป [mail-tester.com](https://www.mail-tester.com) → **ต้องได้ ≥ 9/10**

---

## ⚠️ กฎที่ห้ามพัง

1. **`terraform destroy` = เมลหายทั้งหมด** · `hcloud_primary_ip` ตั้ง `prevent_destroy` ไว้แล้ว
   แต่ตัวเครื่องไม่ได้ตั้ง — **อย่ารัน destroy กับ workspace นี้**
2. **IP ห้ามเปลี่ยน** — ชื่อเสียงของ IP (ที่ทำให้ Gmail ยอมรับเมลเรา) ใช้เวลา warm-up เป็นสัปดาห์
   เปลี่ยน IP = เริ่มนับหนึ่งใหม่ + ต้องแก้ PTR/SPF ทุกโดเมนของลูกค้า
3. **แก้ `cloud-init.yaml` ไม่มีผลกับเครื่องที่รันอยู่** (`ignore_changes = [user_data]` — ตั้งใจ)
   config หลังติดตั้งให้แก้บนเครื่องโดยตรง แล้ว**จดไว้ในคัมภีร์**
4. **`backups = true` ห้ามปิด** — +20% ของค่าเครื่อง (~฿40/เดือน) แลกกับการกู้เมลคืนได้
5. **`terraform.tfvars` และ `*.tfstate` ห้าม commit** — มี API token · `.gitignore` กันไว้แล้ว
   (tfstate เก็บ token ในรูป plaintext แม้จะประกาศ `sensitive`)

## ต้นทุน

ประมาณ **฿190–240/เดือน** (เครื่อง + IPv4 + backup) — ยืนยันกับหน้าราคา Hetzner อีกครั้ง
เพราะสิงคโปร์มีค่าธรรมเนียมสถานที่เพิ่มจากราคายุโรป · ดูตารางเต็มใน §8 ของคัมภีร์

> **ค่านี้ไม่โผล่ใน `/admin/usage` เอง** (ท่อ `billing_export` เห็นเฉพาะ GCP)
> → ต้องกรอกใน `infra_costs` เดือนละครั้ง

## ขยายทีหลัง

| ต้องการ | ทำยังไง |
| ------- | -------- |
| เครื่องแรงขึ้น | เปลี่ยน `server_type` เป็น `cpx21` → `terraform apply` (รีบูต ข้อมูลอยู่ครบ) |
| ดิสก์เพิ่ม | เพิ่ม `hcloud_volume` (~€0.044/GB/เดือน) แล้ว mount ให้ Stalwart |
| เก็บเมลบน object storage | Hetzner Object Storage (S3-compatible) — ทำเมื่อดิสก์ใกล้เต็ม ไม่ใช่ตอนนี้ |
| MX สำรอง | เครื่องที่สองคนละ datacenter + MX priority 20 (Phase 6) |
