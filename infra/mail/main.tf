# Mail server (Stalwart) บน Hetzner Cloud — สิงคโปร์
# ดูคัมภีร์: docs/MAIL_SERVER_PLAN.md
#
# ⚠️ ห้าม commit terraform.tfvars และ *.tfstate (มี token + ข้อมูลเครื่อง) — .gitignore กันไว้แล้ว

terraform {
  required_version = ">= 1.6"
  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.50"
    }
  }
}

provider "hcloud" {
  token = var.hcloud_token
}

# ---------------------------------------------------------------------------
# ตัวแปร
# ---------------------------------------------------------------------------

variable "hcloud_token" {
  description = "Hetzner Cloud API token (read-write) — ออกที่ Console > Security > API tokens"
  type        = string
  sensitive   = true
}

variable "ssh_public_key" {
  description = "SSH public key ที่จะใช้ล็อกอินเข้าเครื่อง"
  type        = string
}

variable "mail_hostname" {
  description = "ชื่อโฮสต์ของเมลเซิร์ฟเวอร์ — ต้องตรงกับ PTR และใบรับรอง TLS"
  type        = string
  default     = "mail.perpos.ai"
}

variable "server_type" {
  # CPX = AMD (มีที่สิงคโปร์) · CX/CAX มีเฉพาะยุโรป — อย่าเปลี่ยนเป็น cx22/cax11
  # cpx11 = 2 vCPU / 2GB / 40GB / 20TB traffic — พอถึงราว 25 กล่อง
  # ขยับเป็น cpx21 (3 vCPU / 4GB / 80GB) ได้ทีหลังโดยไม่ต้องย้ายข้อมูล
  description = "ขนาดเครื่อง Hetzner"
  type        = string
  default     = "cpx11"
}

variable "ssh_allowed_ips" {
  description = "IP ที่ให้ SSH เข้าได้ — ตั้งเป็น IP ออฟฟิศ/บ้าน อย่าเปิด 0.0.0.0/0 ถ้าเลี่ยงได้"
  type        = list(string)
  default     = ["0.0.0.0/0", "::/0"]
}

# ---------------------------------------------------------------------------
# SSH key
# ---------------------------------------------------------------------------

resource "hcloud_ssh_key" "admin" {
  name       = "perpos-mail-admin"
  public_key = var.ssh_public_key
}

# ---------------------------------------------------------------------------
# IP คงที่ — ต้องคงที่เพราะ PTR + ชื่อเสียงของ IP ผูกกับมัน
# ห้ามลบแล้วสร้างใหม่ ไม่งั้นต้อง warm-up ชื่อเสียงใหม่ทั้งหมด
# ---------------------------------------------------------------------------

resource "hcloud_primary_ip" "mail_v4" {
  name          = "perpos-mail-ipv4"
  type          = "ipv4"
  datacenter    = "sin-dc1"
  assignee_type = "server"
  auto_delete   = false

  lifecycle {
    prevent_destroy = true # กันเผลอ terraform destroy แล้วเสีย IP ที่ warm-up ไว้
  }
}

resource "hcloud_primary_ip" "mail_v6" {
  name          = "perpos-mail-ipv6"
  type          = "ipv6"
  datacenter    = "sin-dc1"
  assignee_type = "server"
  auto_delete   = false

  lifecycle {
    prevent_destroy = true
  }
}

# ---------------------------------------------------------------------------
# Firewall — กรองเฉพาะขาเข้า (ขาออกปล่อยหมด เพราะต้องต่อ SES:587 + DNS + ACME)
# ---------------------------------------------------------------------------

resource "hcloud_firewall" "mail" {
  name = "perpos-mail-fw"

  rule {
    description = "SSH"
    direction   = "in"
    protocol    = "tcp"
    port        = "22"
    source_ips  = var.ssh_allowed_ips
  }

  rule {
    description = "SMTP รับเมลเข้า (MX) — ต้องเปิดให้ทั้งโลก"
    direction   = "in"
    protocol    = "tcp"
    port        = "25"
    source_ips  = ["0.0.0.0/0", "::/0"]
  }

  rule {
    description = "Submission (STARTTLS) — ลูกค้าส่งเมลออก"
    direction   = "in"
    protocol    = "tcp"
    port        = "587"
    source_ips  = ["0.0.0.0/0", "::/0"]
  }

  rule {
    description = "Submission (implicit TLS)"
    direction   = "in"
    protocol    = "tcp"
    port        = "465"
    source_ips  = ["0.0.0.0/0", "::/0"]
  }

  rule {
    description = "IMAPS"
    direction   = "in"
    protocol    = "tcp"
    port        = "993"
    source_ips  = ["0.0.0.0/0", "::/0"]
  }

  rule {
    description = "HTTPS — JMAP + webadmin + ACME tls-alpn-01"
    direction   = "in"
    protocol    = "tcp"
    port        = "443"
    source_ips  = ["0.0.0.0/0", "::/0"]
  }

  rule {
    description = "HTTP — ACME http-01 challenge เท่านั้น"
    direction   = "in"
    protocol    = "tcp"
    port        = "80"
    source_ips  = ["0.0.0.0/0", "::/0"]
  }
}

# ---------------------------------------------------------------------------
# เครื่อง
# ---------------------------------------------------------------------------

resource "hcloud_server" "mail" {
  name        = "perpos-mail"
  server_type = var.server_type
  image       = "debian-12"
  datacenter  = "sin-dc1"
  ssh_keys    = [hcloud_ssh_key.admin.id]
  firewall_ids = [hcloud_firewall.mail.id]

  # สำรองข้อมูลอัตโนมัติ (+20% ของค่าเครื่อง) — ถูกที่สุดในบิลทั้งใบ อย่าปิด
  backups = true

  public_net {
    ipv4_enabled = true
    ipv4         = hcloud_primary_ip.mail_v4.id
    ipv6_enabled = true
    ipv6         = hcloud_primary_ip.mail_v6.id
  }

  user_data = templatefile("${path.module}/cloud-init.yaml", {
    mail_hostname = var.mail_hostname
  })

  labels = {
    app = "perpos"
    role = "mail"
  }

  lifecycle {
    # user_data เปลี่ยน = Terraform อยากสร้างเครื่องใหม่ ซึ่งจะทำให้ "เมลหายทั้งหมด"
    # แก้ config หลังเครื่องรันแล้วให้ทำบนเครื่องโดยตรง ไม่ใช่แก้ cloud-init
    ignore_changes = [user_data]
  }
}

# ---------------------------------------------------------------------------
# PTR / reverse DNS — ขาดตัวนี้ = เมลเข้าถังสแปมทุกฉบับ
# ---------------------------------------------------------------------------

resource "hcloud_rdns" "mail_v4" {
  server_id  = hcloud_server.mail.id
  ip_address = hcloud_server.mail.ipv4_address
  dns_ptr    = var.mail_hostname
}

resource "hcloud_rdns" "mail_v6" {
  server_id  = hcloud_server.mail.id
  ip_address = hcloud_server.mail.ipv6_address
  dns_ptr    = var.mail_hostname
}

# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

output "ipv4" {
  description = "เอาไปตั้ง A record ของ mail.perpos.ai และใช้เป็นค่าใน SPF"
  value       = hcloud_server.mail.ipv4_address
}

output "ipv6" {
  value = hcloud_server.mail.ipv6_address
}

output "next_steps" {
  value = <<-EOT
    1. ตั้ง DNS ที่ Cloudflare:  A  ${var.mail_hostname}  ->  ${hcloud_server.mail.ipv4_address}  (DNS only, ห้ามเปิดเมฆส้ม)
                                 AAAA ${var.mail_hostname} -> ${hcloud_server.mail.ipv6_address}
    2. ssh root@${hcloud_server.mail.ipv4_address}
    3. bash /root/install-stalwart.sh      # ติดตั้ง Stalwart (ถามค่าตอนติดตั้ง)
    4. ทดสอบพอร์ตไป SES:  nc -zv email-smtp.ap-southeast-1.amazonaws.com 587
    5. ตรวจ PTR:  dig -x ${hcloud_server.mail.ipv4_address} +short   # ต้องได้ ${var.mail_hostname}
  EOT
}
