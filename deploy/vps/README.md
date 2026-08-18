# VPS Deploy — Contabo SG (แทน Vercel)

ตัดสินใจ 2026-08-18: ย้าย compute 3 โปรเจกต์ (perpos / exapp / riekchang) จาก Vercel Hobby (โควตา Fluid Active CPU ชน 4h)
→ **Contabo Cloud VPS 4 สิงคโปร์ (4 vCPU / 8GB, ~$9.70/เดือน)** · คง **Supabase Pro** (backup + dedicated CPU) และ
**Cloud Run worker 4 ตัว** (PDF/STT/OCR — งาน spike แรมสูง, ~$3/เดือน) ไว้ที่เดิม · เฟส 2 ย้าย **เมล (Stalwart)** จาก Contabo EU มารวม → ปิด EU

บิลปลายทาง ≈ VPS $9.70 + Supabase $25 + Cloud Run $3 ≈ **$38/เดือน คงที่ ไม่โตตามโควตา**

## หลักการที่ห้ามพัง

1. **build ใน GitHub Actions เท่านั้น** — `next build` ของ perpos กินแรม 4GB+ (เคย OOM บน Vercel) · เครื่อง 8GB นี้ serve อย่างเดียว
2. **worker หนักอยู่ Cloud Run ต่อ** — อย่าลาก pdf-compress (4Gi) / stt (2Gi) มาลงเครื่องนี้
3. **`mailserver.perpos.ai` / `login.perpos.ai` = Cloudflare เมฆเทาเสมอ** (proxy ทำ SMTP/IMAP พัง) · โดเมนเว็บ = เมฆส้ม (CDN + ซ่อน IP จริง)
4. **ย้ายเมลได้ต่อเมื่อผ่าน gate**: Contabo ปลดล็อก port 25 บน VPS SG แล้ว + IP สะอาด (MXToolbox / Spamhaus / Barracuda) — ไม่ผ่าน = เก็บ EU ไว้ ($6.6 แลก deliverability ถือว่าถูก)
5. โปรเจกต์ perpos ตัวเดียวเสิร์ฟทั้ง `app.perpos.ai` + `mail.perpos.ai` — instance เดียว, Caddy ชี้ทั้งสองชื่อเข้า port 3005 (middleware แยกตาม host เอง) **อย่าแยกเป็น 2 instance**

## Setup เครื่อง (ครั้งเดียว)

เครื่องจริง: **62.146.233.27** (Ubuntu 24.04, 4 vCPU / 8GB / 96GB) — setup ครบแล้ว 2026-08-18
(docker-ce จาก repo ทางการ ไม่ใช่ `docker.io` ของ Ubuntu · user `deploy` + sudo NOPASSWD ·
sshd key-only (`/etc/ssh/sshd_config.d/99-hardening.conf`) · ufw 22/80/443 · fail2ban · unattended-upgrades)

```bash
# 1) hardening พื้นฐาน (ทำแล้ว — เก็บไว้อ้างอิงเวลาตั้งเครื่องใหม่)
adduser deploy && usermod -aG sudo,docker deploy
apt install -y ufw fail2ban unattended-upgrades docker-ce docker-ce-cli containerd.io docker-compose-plugin
ufw allow OpenSSH && ufw allow 80,443/tcp && ufw allow 443/udp && ufw enable

# 2) โครงไดเรกทอรี
mkdir -p /srv/deploy /srv/caddy /srv/apps/{perpos,exapp,riekchang}/releases
cp deploy/vps/{docker-compose.yml,Dockerfile.caddy} /srv/deploy/
cp deploy/vps/Caddyfile /srv/caddy/
# runtime env ต่อแอป (service role, LINE, MAIL_*, ฯลฯ — copy จาก Vercel env ฝั่ง server)
$EDITOR /srv/apps/perpos/.env && chmod 600 /srv/apps/perpos/.env
echo "CLOUDFLARE_API_TOKEN=..." > /srv/deploy/.env   # token สิทธิ์ Zone.DNS:Edit

# 3) ขึ้น Caddy (ต้องมี CLOUDFLARE_API_TOKEN ก่อน ไม่งั้นออกใบรับรองไม่ได้)
cd /srv/deploy && docker compose up -d caddy
```

**สถานะ 2026-08-19: ตัด DNS ครบทั้ง 3 แอปแล้ว** — `app.riekchang.com` · `app.exworker.co.th` ·
`app.perpos.ai` + `mail.perpos.ai` เป็น `A 62.146.233.27` (TTL 300, **เมฆเทา** — เปิดเมฆส้มเป็นขั้นแยกทีหลัง)
· cron ย้ายมา `/etc/cron.d/perpos` (TZ=Asia/Bangkok) แล้ว, job ใน Cloud Scheduler 4 ตัว **PAUSED**
(ยังไม่ลบ = rollback ได้) · โปรเจกต์ Vercel ยังรันอยู่ทั้ง 3 = rollback ด้วยการชี้ CNAME กลับ · ค่า env
ที่ Vercel ตั้งเป็น Sensitive `vercel env pull` คืน `""` — กู้จาก `.env.local`/Cloud Run/DB แล้ว
(รายละเอียดใน memory ของ agent) · ค้าง: เปิดเมฆส้ม · `NEXT_PUBLIC_LINE_OA_ADD_URL` (riekchang) ·
`GCP_SYNC_SA_KEY` (perpos cost sync) · ปิด Vercel หลังนิ่ง ~1 เดือน · เฟส 2 เมล

## Deploy

- Repo secrets: `VPS_HOST` · `VPS_USER` (=deploy) · `VPS_SSH_KEY` · `NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_ANON_KEY` · `NEXT_PUBLIC_LINE_ADD_FRIEND_URL` · `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- รัน workflow `deploy-vps` (กดมือ) → build standalone → **อัปโหลด R2 (`deploy-artifacts`) → VPS ดึงด้วย presigned URL** → `releases/<ts>` → สลับ symlink `current` → `docker compose up -d && restart`
  · ⚠️ ห้ามกลับไป scp จาก runner หรือ Actions artifact API — เส้นทาง GitHub→Contabo SG ได้ ~40 KB/s (ค้าง 20+ นาที) ส่วน R2 มี CDN → ~17 MB/s · secrets เพิ่ม: `R2_ACCESS_KEY_ID` `R2_SECRET_ACCESS_KEY` `R2_ACCOUNT_ID`
  · `up -d` อย่างเดียวไม่ recreate เมื่อ symlink เปลี่ยน (bind mount เดิม) → ต้อง `restart` ต่อท้ายเสมอ
- **rollback**: `ln -sfn /srv/apps/perpos/releases/<ก่อนหน้า> /srv/apps/perpos/current && docker compose restart perpos` (เก็บไว้ 3 release)
- `NEXT_PUBLIC_*` inline ตอน build — เปลี่ยนค่าต้อง build ใหม่ (เหมือน Vercel) · env ฝั่ง server แก้ที่ `/srv/apps/perpos/.env` แล้ว restart พอ
- exapp / riekchang: มี workflow เดียวกันใน repo ตัวเองแล้ว (`.github/workflows/deploy-vps.yml`) · ทั้งสองใช้ Supabase project เดียวกับ perpos แต่คนละ schema (`SUPABASE_SCHEMA=exapp` / `riekchang`)

## Cron (แทน Google Cloud Scheduler)

ยิงจากเครื่องเองผ่าน localhost — ฟรี ไม่ผ่าน internet · ตอนย้ายให้ **ปิด job ฝั่ง GCP** พร้อมกัน (กันยิงซ้ำ 2 ทาง)

```cron
# /etc/cron.d/perpos  (CRON_SECRET ตัวเดียวกับใน /srv/apps/perpos/.env)
* * * * *   deploy curl -sf -X POST -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3005/api/assistant/scheduler >/dev/null   # กลับเป็นทุก 1 นาที (บน Vercel เคยลดเป็น 3 เพื่อประหยัด CPU)
0 20 * * *  deploy curl -sf -X POST -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3005/api/tmc/notify/daily-occupancy >/dev/null
0 8 * * 1   deploy curl -sf -X POST -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3005/api/gov-procure/notify/weekly >/dev/null
0 9 * * *   deploy curl -sf -X POST -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3005/api/gov-procure/notify/aging >/dev/null

# /etc/cron.d/exapp  (CRON_SECRET ของ exapp — คนละค่า · ⚠️ exapp ใช้ header `x-cron-secret` ไม่ใช่ Bearer)
0 3 * * *   deploy curl -sf -X POST -H "x-cron-secret: $CRON_SECRET" http://127.0.0.1:3006/api/admin/rep-usage/recalc >/dev/null
```

ทั้งสองไฟล์ตั้ง `TZ=Asia/Bangkok` (เครื่องเป็น Europe/Berlin — job รายวันจะเพี้ยน 5 ชม.ถ้าไม่ตั้ง) · **Cloud Scheduler ทั้ง 5 job PAUSED แล้ว 2026-08-19** (ยังไม่ลบ = rollback ได้)

port 3005–3007 bind ที่ `127.0.0.1` เท่านั้นใน compose (cron บน host ยิงได้ · internet เข้าไม่ได้)

## Firewall (2 ชั้น)

1. **Contabo Firewall (network-level, ฟรี) — `perpos-sg-web-mail`** ผูกกับ instance 203517994 (2026-08-19, ตั้งผ่าน API) · inbound allow: tcp 22 · 80/443 · **udp 443 (h3)** · 25/465/587 · 993/995 · 4190 · icmp — ที่เหลือ drop (v4+v6) · ทดสอบแล้ว: port ที่เปิด open ครบ, 8080/3005 ถูก drop เงียบ (timeout ไม่ใช่ refused)
   · แก้กฎ: CCP → Firewall หรือ API `PUT /v1/firewalls/<id>` (token = OAuth password grant ด้วย client_id/secret + **รหัสล็อกอิน CCP** — หน้า API details ใหม่ไม่มี API password แยกแล้ว) · assign/DELETE **ห้ามส่ง `Content-Type: application/json` เมื่อ body ว่าง** (400)
   · เปิด port ใหม่ต้องเพิ่ม **ทั้งสองชั้น** ไม่งั้นงงว่า ufw allow แล้วทำไมยังเข้าไม่ได้
2. **ufw บนเครื่อง** — 22 · 80,443/tcp · 443/udp · 25,465,587,993,995,4190/tcp · 8080 เฉพาะ `172.16.0.0/12` (Caddy→Stalwart)

## ลำดับตัดจริง (cutover)

1. สั่ง VPS รายเดือน → เปิด ticket ขอปลด port 25 + เช็ค IP กับ blacklist **วันแรก** (gate ของเฟส 2)
2. Setup เครื่อง + deploy perpos → ทดสอบผ่าน `--resolve`/hosts file ก่อนแตะ DNS
3. Cloudflare: ลด TTL `app.perpos.ai`/`mail.perpos.ai` เหลือ 300 → ชี้ A ไป VPS (เมฆส้ม) — Vercel ยังรันอยู่ = rollback ได้ใน 5 นาทีด้วยการชี้กลับ
4. สลับ cron: เพิ่ม `/etc/cron.d/perpos` → pause job ใน Cloud Scheduler
5. ทำซ้ำกับ exapp / riekchang → ใช้จริง ~1 เดือนดู network SG นิ่งไหม → ปิดโปรเจกต์ Vercel
6. เฟส 2 (ผ่าน gate แล้ว): ย้าย Stalwart ตาม `docs/MAIL_CONTABO_MIGRATION_PLAN.md` รอบสุดท้าย → ปิด EU → ล็อก 24 เดือน
7. `perpos.ai` (landing) อยู่ Cloudflare Pages ต่อ ไม่เกี่ยว
