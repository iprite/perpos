#!/usr/bin/env bash
# ตัวส่งสัญญาณจากเครื่อง VPS SG (Stalwart + Docker เว็บ 3 แอป + Caddy) → PERPOS
# (ชื่อไฟล์ยังเป็น mail-* ตามประวัติ — ตั้งแต่ 2026-08-19 เครื่องเมลกับเครื่องเว็บคือเครื่องเดียวกัน
#  จึงรายงานทั้งทรัพยากรเครื่อง + สถานะ container + release ของแต่ละแอปในก้อนเดียว)
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

# ── Docker container ของเว็บ 3 แอป + Caddy (ตั้งแต่ 2026-08-19 อยู่เครื่องเดียวกับเมล) ──
# ต่อ container: state / จำนวน restart โดย restart-policy (= crash · manual restart ไม่นับ) /
# OOMKilled / เวลาเริ่ม / RAM ที่ใช้เทียบ mem_limit — ไม่มี jq บนเครื่อง จึงประกอบ JSON เอง
containers="[]"
if command -v docker >/dev/null 2>&1; then
  # docker stats ให้ RAM ที่ใช้จริง (cgroup) — no-stream ครั้งเดียว ทุก container พร้อมกัน
  declare -A mem_used
  while IFS='|' read -r cname cmem; do
    [ -z "${cname:-}" ] && continue
    # "123.4MiB / 1.5GiB" → ไบต์ของตัวแรก
    mem_used["$cname"]=$(printf '%s' "$cmem" | awk '{
      v=$1; u=v; gsub(/[0-9.]/,"",u); gsub(/[^0-9.]/,"",v);
      m=1; if(u=="KiB")m=1024; else if(u=="MiB")m=1048576; else if(u=="GiB")m=1073741824;
      else if(u=="kB")m=1000; else if(u=="MB")m=1000000; else if(u=="GB")m=1000000000;
      printf "%d", v*m }')
  done < <(docker stats --no-stream --format '{{.Name}}|{{.MemUsage}}' 2>/dev/null)

  items=""
  while read -r cname; do
    [ -z "${cname:-}" ] && continue
    # ชื่อจริงบนเครื่องคือ `deploy-perpos-1` (compose project + service + index) — ฝั่งแอปรู้จักแค่ชื่อ
    # service (`perpos`/`exapp`/`riekchang`/`caddy`) จึงส่ง label ของ compose เป็น name · ไม่มี label = ชื่อเต็ม
    svc=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.service"}}' "$cname" 2>/dev/null)
    [ -z "${svc:-}" ] && svc=$cname
    row=$(docker inspect --format \
      '"state":"{{.State.Status}}","restarts":{{.RestartCount}},"oomKilled":{{.State.OOMKilled}},"exitCode":{{.State.ExitCode}},"startedAt":"{{.State.StartedAt}}","memLimitBytes":{{.HostConfig.Memory}}' \
      "$cname" 2>/dev/null) || continue
    mu=${mem_used[$cname]:-null}
    items="${items}${items:+,}{\"name\":\"$svc\",\"containerName\":\"$cname\",$row,\"memUsedBytes\":$mu}"
  done < <(docker ps -a --format '{{.Names}}' 2>/dev/null)
  containers="[$items]"
fi

# ── release ที่แต่ละแอปชี้อยู่ (/srv/apps/<app>/current → releases/<ts>) ──────────
# currentChangedAt = mtime ของ symlink เอง (= เวลา deploy สลับ) — ฝั่งแอปเอาไปเทียบกับ startedAt
# ของ container: symlink ใหม่กว่า container = deploy แล้วแต่ container ยังไม่ restart (release ค้าง)
apps="[]"
if [ -d /srv/apps ]; then
  items=""
  for d in /srv/apps/*/; do
    app=$(basename "$d")
    link="$d/current"
    [ -L "$link" ] || continue
    target=$(readlink -f "$link" 2>/dev/null || true)
    rel=$(basename "${target:-}")
    ok=false; [ -n "$target" ] && [ -d "$target" ] && ok=true
    changed=$(stat -c %Y "$link" 2>/dev/null || echo 0)   # stat บน symlink ไม่ตาม link
    sha=$(head -c 40 "$target/RELEASE" 2>/dev/null | tr -cd '0-9a-f' || true)
    items="${items}${items:+,}{\"app\":\"$app\",\"release\":\"$rel\",\"exists\":$ok,\"currentChangedAt\":$changed,\"sha\":\"$sha\"}"
  done
  apps="[$items]"
fi

# ── cron บนเครื่อง (/etc/cron.d/perpos + exapp) — เวลา "สั่งรัน" ล่าสุดของแต่ละ URL จาก journal ────
# cron log แค่ว่า CMD ถูกเรียก (ไม่รู้ว่า curl สำเร็จ) — ฝั่ง perpos มี scheduler_runs ยืนยันอีกชั้น
# ดูย้อน 72 ชม. (กว้างกว่าเกณฑ์ 26 ชม.) เพื่อให้ฝั่งแอปรายงาน "เก่าไป X ชม." แทนที่จะเป็น "ไม่เคยเห็น"
# ส่วน exapp มีแค่ตรงนี้ · journal ของเครื่องเป็น persistent (Storage=auto + /var/log/journal)
cron_active=false
systemctl is-active --quiet cron && cron_active=true
cron_jobs="[]"
if command -v journalctl >/dev/null 2>&1; then
  cron_jobs=$(journalctl -u cron --since "-72h" -o short-unix --no-pager 2>/dev/null | awk '
    /CMD \(curl/ {
      ts = int($1)
      # cron.d ยิงผ่าน Caddy แล้ว (https://app.perpos.ai/… + --resolve) ไม่ใช่ http://127.0.0.1:<port>/… อีก
      # → จับ URL แบบไม่ผูก host/port (ฝั่งแอป EXPECTED_CRON จับคู่ด้วย path เท่านั้น)
      if (match($0, /https?:\/\/[^ >")]+/)) { u = substr($0, RSTART, RLENGTH); last[u] = ts }
    }
    END {
      printf "["; n = 0
      for (u in last) { printf "%s{\"url\":\"%s\",\"lastRunAt\":%d}", (n++ ? "," : ""), u, last[u] }
      printf "]"
    }')
  [ -z "${cron_jobs:-}" ] && cron_jobs="[]"
fi

payload=$(cat <<JSON
{
  "cronActive": $cron_active,
  "cronJobs": $cron_jobs,
  "containers": $containers,
  "apps": $apps,
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
