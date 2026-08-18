#!/usr/bin/env bash
# ตัวส่งสัญญาณจากเมลเซิร์ฟเวอร์ (Stalwart @ Contabo) → PERPOS
#
# ทำไมต้องมี: **Contabo API ไม่มี usage ให้ดึง** (มีแค่สเปกที่ซื้อกับ audit log)
#   ⇒ ตัวเลขการใช้ทรัพยากรทั้งหมดต้องให้เครื่องรายงานเข้ามาเอง
#
# ปลายทาง: POST $APP_BASE_URL/api/admin/mail-server/heartbeat (header x-worker-secret)
#   → เขียน 2 ที่: `mail_server_health` (ค่าล่าสุด ใช้ตัดสินใจเตือน)
#                 `mail_server_samples` (ประวัติ → กราฟใน /admin/mail แท็บ "เครื่องเซิร์ฟเวอร์")
#
# ติดตั้งบนเครื่องเมล (รันจากเครื่อง dev):
#   scp -i ~/.ssh/perpos_mail_ed25519 scripts/mail-heartbeat.sh root@mailserver.perpos.ai:/usr/local/bin/
#   ssh -i ~/.ssh/perpos_mail_ed25519 root@mailserver.perpos.ai
#     chmod +x /usr/local/bin/mail-heartbeat.sh
#     printf 'WORKER_SECRET=…\nAPP_BASE_URL=https://app.perpos.ai\n' > /etc/stalwart/heartbeat.env
#     chmod 600 /etc/stalwart/heartbeat.env      # ← มี secret ห้ามอ่านได้ทั้งเครื่อง
#     (ดู unit + timer ท้ายไฟล์นี้)
set -uo pipefail

ENV_FILE=/etc/stalwart/heartbeat.env
[ -f "$ENV_FILE" ] && . "$ENV_FILE"
: "${APP_BASE_URL:=https://app.perpos.ai}"
: "${WORKER_SECRET:?ต้องตั้ง WORKER_SECRET ใน $ENV_FILE}"
: "${STALWART_DATA:=/var/lib/stalwart}"
: "${BACKUP_DIR:=/var/backups/stalwart}"

# ── ดิสก์ของ / (ตัวที่เต็มแล้วเมลล่ม) ─────────────────────────────────────────
read -r disk_total_kb disk_used_kb disk_pct < <(
  df -Pk / | awk 'NR==2 {gsub("%","",$5); print $2, $3, $5}'
)
disk_total_bytes=$((disk_total_kb * 1024))
disk_used_bytes=$((disk_used_kb * 1024))

# ── หน่วยความจำ + โหลด ────────────────────────────────────────────────────────
# ใช้ "available" เป็นตัวตั้ง (buff/cache คืนได้ ไม่ใช่ของที่ใช้จริง)
read -r mem_total_mb mem_used_mb < <(
  free -m | awk '/^Mem:/ {print $2, $2-$7}'
)
load1=$(awk '{print $1}' /proc/loadavg)
cpu_count=$(nproc)
uptime_seconds=$(awk '{printf "%d", $1}' /proc/uptime)

# ── ขนาดฐานข้อมูลเมลจริง (โตตามปริมาณเมล — ตัวชี้วัดที่ใช้วางแผนพื้นที่) ────────
store_bytes=$(du -sb "$STALWART_DATA" 2>/dev/null | awk '{print $1}')
[ -z "${store_bytes:-}" ] && store_bytes=null

# ── backup ล่าสุด ─────────────────────────────────────────────────────────────
backup_age_hours=null
backup_size_mb=null
latest_backup=$(ls -1t "$BACKUP_DIR"/* 2>/dev/null | head -1)
if [ -n "${latest_backup:-}" ]; then
  mtime=$(stat -c %Y "$latest_backup")
  backup_age_hours=$(awk -v n="$(date +%s)" -v m="$mtime" 'BEGIN{printf "%.2f", (n-m)/3600}')
  backup_size_mb=$(awk -v b="$(stat -c %s "$latest_backup")" 'BEGIN{printf "%.1f", b/1048576}')
fi

# ── สถานะบริการ + พอร์ต 25 (ตรวจจาก Vercel ไม่ได้ — Vercel บล็อก 25 ขาออก) ────
service_active=false
systemctl is-active --quiet stalwart && service_active=true
smtp25=false
ss -lnt '( sport = :25 )' 2>/dev/null | grep -q LISTEN && smtp25=true

# ── ตัวนับสะสมของการ์ดเน็ต (ฝั่งแอปคิดผลต่างเอง · ข้าม lo) ────────────────────
read -r rx tx < <(
  awk -F'[: ]+' '/:/ && $2 !~ /^(lo|docker|veth)/ {rx+=$3; tx+=$11} END {print rx+0, tx+0}' /proc/net/dev
)

payload=$(cat <<JSON
{
  "diskPct": $disk_pct,
  "diskUsedBytes": $disk_used_bytes,
  "diskTotalBytes": $disk_total_bytes,
  "memUsedMb": $mem_used_mb,
  "memTotalMb": $mem_total_mb,
  "load1": $load1,
  "cpuCount": $cpu_count,
  "storeBytes": $store_bytes,
  "backupAgeHours": $backup_age_hours,
  "backupSizeMb": $backup_size_mb,
  "serviceActive": $service_active,
  "smtp25Listening": $smtp25,
  "uptimeSeconds": $uptime_seconds,
  "netRxBytes": $rx,
  "netTxBytes": $tx
}
JSON
)

curl -fsS --max-time 20 \
  -X POST "$APP_BASE_URL/api/admin/mail-server/heartbeat" \
  -H "content-type: application/json" \
  -H "x-worker-secret: $WORKER_SECRET" \
  -d "$payload" >/dev/null

# ─────────────────────────────────────────────────────────────────────────────
# systemd (วางที่ /etc/systemd/system/ แล้ว `systemctl enable --now stalwart-heartbeat.timer`)
#
# stalwart-heartbeat.service
#   [Unit]
#   Description=PERPOS mail heartbeat
#   [Service]
#   Type=oneshot
#   ExecStart=/usr/local/bin/mail-heartbeat.sh
#
# stalwart-heartbeat.timer
#   [Unit]
#   Description=ส่งสัญญาณสถานะเครื่องเมลทุก 5 นาที
#   [Timer]
#   OnBootSec=2min
#   OnUnitActiveSec=5min
#   AccuracySec=30s
#   [Install]
#   WantedBy=timers.target
