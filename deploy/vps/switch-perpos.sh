#!/usr/bin/env bash
# สลับ perpos ไป release ที่ /srv/apps/perpos/current ชี้อยู่ แบบ blue/green (zero-downtime)
#
#   1. หาสีที่รันอยู่ (ACTIVE) กับสีว่าง (IDLE) — Caddy `lb_policy first` ชอบ blue ก่อนเสมอ
#   2. up สีว่างแบบ recreate (resolve symlink ใหม่ = release ใหม่) → รอ /api/health ตอบ ok ในตัว container
#      ไม่ผ่านใน 120 วิ = stop สีว่างทิ้ง แล้ว exit 1 — **สีเก่ายังเสิร์ฟอยู่ ผู้ใช้ไม่รู้สึกอะไร**
#   3. รอ Caddy เห็นสีใหม่ healthy → แตะ /tmp/perpos-drain ในสีเก่า (health ตอบ 503) → Caddy หยุดส่ง
#      → stop สีเก่า (grace 30 วิ เผื่อ request ที่ค้าง)
#   4. restart perpos-worker (instance เดียว ไม่มี traffic — restart ตรง ๆ ได้)
#
# ใช้ตอน: CI deploy (workflow เรียกจากในก้อน artifact) · rollback (ln -sfn release ก่อนหน้า แล้วรันสคริปต์นี้)
# ไฟล์ต้นทาง: deploy/vps/switch-perpos.sh ใน repo perpos — CI ก็อปเข้า artifact เป็น deploy/switch-perpos.sh
set -euo pipefail

COMPOSE_DIR=${COMPOSE_DIR:-/srv/deploy}
HEALTH_TIMEOUT=${HEALTH_TIMEOUT:-120}   # วินาทีที่รอสีใหม่ boot
CADDY_SETTLE=${CADDY_SETTLE:-5}         # วินาทีให้ Caddy วนเช็ค health (health_interval 3s) จนเห็นสถานะใหม่

cd "$COMPOSE_DIR"
dc() { docker compose "$@"; }

running() { dc ps --status running --format '{{.Service}}' 2>/dev/null | grep -qx "$1"; }

if running perpos-blue; then
  ACTIVE=perpos-blue; IDLE=perpos-green
elif running perpos-green; then
  ACTIVE=perpos-green; IDLE=perpos-blue
else
  ACTIVE=""; IDLE=perpos-blue
fi
echo "[switch] active=${ACTIVE:-none} idle=$IDLE release=$(readlink -f /srv/apps/perpos/current)"

# ── 2. เปิดสีว่างจาก release ใหม่ ────────────────────────────────────────────────
# --force-recreate: container ที่ stopped ค้างอยู่ถูกสร้างใหม่ (bind mount resolve symlink ณ ตอนนี้)
dc up -d --force-recreate --no-deps "$IDLE"

deadline=$((SECONDS + HEALTH_TIMEOUT))
until dc exec -T "$IDLE" wget -qO- -T 3 http://127.0.0.1:3005/api/health 2>/dev/null | grep -q '"ok":true'; do
  if (( SECONDS >= deadline )); then
    echo "[switch] ❌ $IDLE ไม่ผ่าน /api/health ใน ${HEALTH_TIMEOUT}s — ปล่อย ${ACTIVE:-ไม่มีตัวเสิร์ฟ!} ไว้ตามเดิม" >&2
    dc logs --tail 60 "$IDLE" >&2 || true
    dc stop -t 5 "$IDLE" >/dev/null 2>&1 || true
    exit 1
  fi
  sleep 2
done
echo "[switch] ✅ $IDLE healthy (${SECONDS}s)"

# ── 3. ย้าย traffic แล้วดับสีเก่า ─────────────────────────────────────────────────
if [ -n "$ACTIVE" ]; then
  sleep "$CADDY_SETTLE"                                   # ให้ Caddy เห็นสีใหม่ healthy ก่อน
  dc exec -T "$ACTIVE" touch /tmp/perpos-drain 2>/dev/null || true   # health → 503 → Caddy ตัดออกจาก pool
  sleep "$CADDY_SETTLE"
  dc stop "$ACTIVE"                                       # stop_grace_period 30s ใน compose
  echo "[switch] ⏹ $ACTIVE stopped — traffic อยู่ที่ $IDLE"
fi

# ── 4. scheduler worker (instance เดียว) ────────────────────────────────────────
dc up -d --no-deps perpos-worker && dc restart perpos-worker
echo "[switch] done: $(cat /srv/apps/perpos/current/RELEASE 2>/dev/null || echo '?')"
