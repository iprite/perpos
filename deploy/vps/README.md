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

```bash
# 1) hardening พื้นฐาน
adduser deploy && usermod -aG sudo,docker deploy
# ssh key-only: /etc/ssh/sshd_config → PasswordAuthentication no · PermitRootLogin no
apt install -y ufw fail2ban unattended-upgrades docker.io docker-compose-plugin
ufw allow OpenSSH && ufw allow 80,443/tcp && ufw allow 443/udp && ufw enable
dpkg-reconfigure -plow unattended-upgrades

# 2) โครงไดเรกทอรี
mkdir -p /srv/deploy /srv/caddy /srv/apps/{perpos,exapp,riekchang}/releases
cp deploy/vps/{docker-compose.yml,Dockerfile.caddy} /srv/deploy/
cp deploy/vps/Caddyfile /srv/caddy/
# runtime env ต่อแอป (service role, LINE, MAIL_*, ฯลฯ — copy จาก Vercel env ฝั่ง server)
$EDITOR /srv/apps/perpos/.env && chmod 600 /srv/apps/perpos/.env
echo "CLOUDFLARE_API_TOKEN=..." > /srv/deploy/.env   # token สิทธิ์ Zone.DNS:Edit

# 3) ขึ้น Caddy ก่อน (แอปยังไม่มี artifact ก็ได้ container จะ restart รอเอง)
cd /srv/deploy && docker compose up -d caddy
```

## Deploy

- Repo secrets: `VPS_HOST` · `VPS_USER` (=deploy) · `VPS_SSH_KEY` · `NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_ANON_KEY` · `NEXT_PUBLIC_LINE_ADD_FRIEND_URL` · `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- รัน workflow `deploy-vps` (กดมือ) → build standalone → rsync ไป `releases/<ts>` → สลับ symlink `current` → `docker compose restart perpos`
- **rollback**: `ln -sfn /srv/apps/perpos/releases/<ก่อนหน้า> /srv/apps/perpos/current && docker compose restart perpos` (เก็บไว้ 3 release)
- `NEXT_PUBLIC_*` inline ตอน build — เปลี่ยนค่าต้อง build ใหม่ (เหมือน Vercel) · env ฝั่ง server แก้ที่ `/srv/apps/perpos/.env` แล้ว restart พอ
- exapp / riekchang: copy workflow นี้ไปแต่ละ repo แล้วปรับ path `server.js` ใน compose ให้ตรงโครง standalone ของ repo นั้น

## Cron (แทน Google Cloud Scheduler)

ยิงจากเครื่องเองผ่าน localhost — ฟรี ไม่ผ่าน internet · ตอนย้ายให้ **ปิด job ฝั่ง GCP** พร้อมกัน (กันยิงซ้ำ 2 ทาง)

```cron
# /etc/cron.d/perpos  (CRON_SECRET ตัวเดียวกับใน /srv/apps/perpos/.env)
*/3 * * * * deploy curl -sf -X POST -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3005/api/assistant/scheduler >/dev/null
0 20 * * *  deploy curl -sf -X POST -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3005/api/tmc/notify/daily-occupancy >/dev/null
0 8 * * 1   deploy curl -sf -X POST -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3005/api/gov-procure/notify/weekly >/dev/null
0 9 * * *   deploy curl -sf -X POST -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3005/api/gov-procure/notify/aging >/dev/null
0 3 * * *   deploy curl -sf -X POST -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3006/api/admin/rep-usage/recalc >/dev/null
```

port 3005–3007 bind ที่ `127.0.0.1` เท่านั้นใน compose (cron บน host ยิงได้ · internet เข้าไม่ได้)

## ลำดับตัดจริง (cutover)

1. สั่ง VPS รายเดือน → เปิด ticket ขอปลด port 25 + เช็ค IP กับ blacklist **วันแรก** (gate ของเฟส 2)
2. Setup เครื่อง + deploy perpos → ทดสอบผ่าน `--resolve`/hosts file ก่อนแตะ DNS
3. Cloudflare: ลด TTL `app.perpos.ai`/`mail.perpos.ai` เหลือ 300 → ชี้ A ไป VPS (เมฆส้ม) — Vercel ยังรันอยู่ = rollback ได้ใน 5 นาทีด้วยการชี้กลับ
4. สลับ cron: เพิ่ม `/etc/cron.d/perpos` → pause job ใน Cloud Scheduler
5. ทำซ้ำกับ exapp / riekchang → ใช้จริง ~1 เดือนดู network SG นิ่งไหม → ปิดโปรเจกต์ Vercel
6. เฟส 2 (ผ่าน gate แล้ว): ย้าย Stalwart ตาม `docs/MAIL_CONTABO_MIGRATION_PLAN.md` รอบสุดท้าย → ปิด EU → ล็อก 24 เดือน
7. `perpos.ai` (landing) อยู่ Cloudflare Pages ต่อ ไม่เกี่ยว
