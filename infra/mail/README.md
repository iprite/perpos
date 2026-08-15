# infra/mail — เมลเซิร์ฟเวอร์ (Stalwart บน Hetzner Cloud, เยอรมนี)

แผนเต็ม + เหตุผลเบื้องหลังทุกการตัดสินใจ: [`docs/MAIL_SERVER_PLAN.md`](../../docs/MAIL_SERVER_PLAN.md)

|              |                                                             |
| ------------ | ----------------------------------------------------------- |
| ผู้ให้บริการ | Hetzner Cloud · location `nbg1` (นูเรมเบิร์ก เยอรมนี)       |
| เครื่อง      | `cx23` (2 vCPU / 4GB / 40GB / traffic 22TB)                 |
| ขาออก        | AWS SES พอร์ต **587** (Hetzner บล็อก 25 ขาออกจนกว่าจะขอปลด) |
| ขาเข้า       | พอร์ต 25 เปิดปกติ (MX ชี้มาที่ `mail.perpos.ai`)            |

> 🔴 **ทำไมยุโรปไม่ใช่สิงคโปร์ (เปลี่ยนจากแผนเดิม 2026-08-15)** — ราคาจริงจาก API ตอน apply:
> สิงคโปร์เหลือแต่รุ่นเลขคู่ (`cpx11/21/31` เลิกขายแล้ว) ที่ **แพงกว่ายุโรป ~5 เท่าโดยสเปกแย่กว่า**
> · `sin` `cpx12` = 1 vCPU / 2GB / 1TB traffic **$17.99** · `nbg1` `cx23` = 2 vCPU / 4GB / **22TB** **$6.49**
> · ที่ราคาขาย ฿99/กล่อง × 20 กล่อง สิงคโปร์เหลือ margin ~36% ก่อนหักค่าซัพพอร์ต = ธุรกิจไม่เดิน
> · แลกกับ IMAP ช้าขึ้น ~200ms (เมลไม่ใช่งาน latency-critical) และต้องแจ้งใน DPA ว่าเก็บข้อมูลที่ EU
>
> ⚠️ **ถ้าย้ายกลับไปนอกยุโรป ต้องเปลี่ยนเป็นซีรีส์ CPX** — `cx*` / `cax*` มีเฉพาะยุโรป
>
> ⚠️ **ระบุตำแหน่งด้วย `location` ไม่ใช่ `datacenter`** — Hetzner เลิกใช้
> datacenter แล้ว ([changelog 2026-07-01](https://docs.hetzner.cloud/changelog#2026-07-01-removing-datacenters))
> · provider `~> 1.50` (ที่ล็อกจริง 1.68) จะ **validate ไม่ผ่าน** ถ้ายังใช้ `datacenter`

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

| ตัวแปร            | เอามาจากไหน                                                |
| ----------------- | ---------------------------------------------------------- |
| `hcloud_token`    | Hetzner Console → Security → API tokens → **Read & Write** |
| `ssh_public_key`  | `cat ~/.ssh/perpos_mail_ed25519.pub`                       |
| `ssh_allowed_ips` | IP ออฟฟิศ/บ้าน — **อย่าเปิด `0.0.0.0/0` ถ้าเลี่ยงได้**     |

> 💡 **ไม่อยากให้ token ลงดิสก์เลย** — ข้าม `hcloud_token` ใน tfvars แล้วส่งทาง env แทน
> (Terraform อ่าน `TF_VAR_<ชื่อตัวแปร>` อัตโนมัติ · หายไปเมื่อปิด terminal):
>
> ```bash
> read -rs TF_VAR_hcloud_token && export TF_VAR_hcloud_token   # วาง token แล้ว Enter (ไม่โชว์บนจอ)
> terraform plan
> ```

## หลัง apply

`terraform output next_steps` จะบอกขั้นตอนถัดไป โดยสรุป:

1. ตั้ง DNS ที่ Cloudflare — `A` + `AAAA` ของ `mail.perpos.ai`
   **ต้องเป็น DNS only (เมฆเทา) ห้ามเปิด proxy** เพราะ Cloudflare ไม่พร็อกซี SMTP/IMAP
2. `ssh root@<ipv4>` → `bash /root/install-stalwart.sh`
3. ทดสอบพอร์ตไป SES: `nc -zv email-smtp.eu-central-1.amazonaws.com 587`
   (เครื่องอยู่ยุโรปแล้ว → ใช้ SES `eu-central-1` แทน `ap-southeast-1` · ทดสอบแล้วผ่านทั้งคู่)
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

**$8.39/เดือน ≈ ฿280** — ราคาจริงจาก API ตอน apply (2026-08-15) ไม่ใช่ค่าประมาณ:
เครื่อง `cx23` $6.49 + primary IPv4 $0.60 + backup 20% ($1.30) · ไม่มี VAT (บัญชีคิดเป็น USD)

> **ค่านี้ไม่โผล่ใน `/admin/usage` เอง** (ท่อ `billing_export` เห็นเฉพาะ GCP)
> → ต้องกรอกใน `infra_costs` เดือนละครั้ง

## ขยายทีหลัง

| ต้องการ                  | ทำยังไง                                                                     |
| ------------------------ | --------------------------------------------------------------------------- |
| เครื่องแรงขึ้น           | เปลี่ยน `server_type` เป็น `cx33` → `terraform apply` (รีบูต ข้อมูลอยู่ครบ) |
| ดิสก์เพิ่ม               | เพิ่ม `hcloud_volume` (~€0.044/GB/เดือน) แล้ว mount ให้ Stalwart            |
| เก็บเมลบน object storage | Hetzner Object Storage (S3-compatible) — ทำเมื่อดิสก์ใกล้เต็ม ไม่ใช่ตอนนี้  |
| MX สำรอง                 | เครื่องที่สองคนละ datacenter + MX priority 20 (Phase 6)                     |
