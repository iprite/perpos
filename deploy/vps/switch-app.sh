#!/usr/bin/env bash
# สลับแอป Next.js บน VPS ไป release ที่ /srv/apps/<app>/current ชี้อยู่ แบบ blue/green (zero-downtime)
#
#   usage: switch-app.sh <app> <port> [extra-service ...]
#     app           = ชื่อ service ใน compose (มี <app>-blue + <app>-green)  เช่น perpos / exapp / riekchang
#     port          = พอร์ตที่ Next ฟังในตัว container (3005/3006/3007) — ใช้ยิง /api/health
#     extra-service = service ที่ต้อง restart ตามหลัง (instance เดียว ไม่มี traffic) เช่น perpos-worker
#
#   1. หาสีที่รันอยู่ (ACTIVE) กับสีว่าง (IDLE) — Caddy `lb_policy first` ชอบ blue ก่อนเสมอ
#   2. up สีว่างแบบ recreate (resolve symlink ใหม่ = release ใหม่) → รอ /api/health ตอบ ok ในตัว container
#      ไม่ผ่านใน 120 วิ = stop สีว่างทิ้ง แล้ว exit 1 — **สีเก่ายังเสิร์ฟอยู่ ผู้ใช้ไม่รู้สึกอะไร**
#   3. รอ Caddy เห็นสีใหม่ healthy → แตะ /tmp/drain ในสีเก่า (health ตอบ 503) → Caddy หยุดส่ง
#      → stop สีเก่า (stop_grace_period 30 วิ เผื่อ request ที่ค้าง)
#   4. restart extra-service (ถ้ามี)
#
# ใช้ตอน: CI deploy (workflow เรียกจากในก้อน artifact ที่ deploy/switch-app.sh) · rollback
# (ln -sfn release ก่อนหน้า แล้วรันสคริปต์นี้) · ต้นฉบับ = deploy/vps/switch-app.sh ใน repo perpos
# (exapp/riekchang ถือสำเนาไฟล์เดียวกัน — แก้แล้วต้องซิงก์ทั้ง 3 repo)
set -euo pipefail

APP=${1:?usage: switch-app.sh <app> <port> [extra-service ...]}
PORT=${2:?usage: switch-app.sh <app> <port> [extra-service ...]}
shift 2
EXTRA=("$@")

COMPOSE_DIR=${COMPOSE_DIR:-/srv/deploy}
HEALTH_TIMEOUT=${HEALTH_TIMEOUT:-120}   # วินาทีที่รอสีใหม่ boot
CADDY_SETTLE=${CADDY_SETTLE:-5}         # วินาทีให้ Caddy วนเช็ค health (health_interval 3s) จนเห็นสถานะใหม่
DRAIN_FILE=/tmp/drain                   # ต้องตรงกับที่ /api/health ของแอปเช็ค

cd "$COMPOSE_DIR"
dc() { docker compose "$@"; }
running() { dc ps --status running --format '{{.Service}}' 2>/dev/null | grep -qx "$1"; }

if running "$APP-blue"; then
  ACTIVE=$APP-blue; IDLE=$APP-green
elif running "$APP-green"; then
  ACTIVE=$APP-green; IDLE=$APP-blue
else
  ACTIVE=""; IDLE=$APP-blue
fi
echo "[switch:$APP] active=${ACTIVE:-none} idle=$IDLE release=$(readlink -f /srv/apps/$APP/current)"

# ── 2. เปิดสีว่างจาก release ใหม่ ────────────────────────────────────────────────
# --force-recreate: container ที่ stopped ค้างอยู่ถูกสร้างใหม่ (bind mount resolve symlink ณ ตอนนี้)
dc up -d --force-recreate --no-deps "$IDLE"

deadline=$((SECONDS + HEALTH_TIMEOUT))
until dc exec -T "$IDLE" wget -qO- -T 3 "http://127.0.0.1:$PORT/api/health" 2>/dev/null | grep -q '"ok":true'; do
  if (( SECONDS >= deadline )); then
    echo "[switch:$APP] ❌ $IDLE ไม่ผ่าน /api/health ใน ${HEALTH_TIMEOUT}s — ปล่อย ${ACTIVE:-ไม่มีตัวเสิร์ฟ!} ไว้ตามเดิม" >&2
    dc logs --tail 60 "$IDLE" >&2 || true
    dc stop -t 5 "$IDLE" >/dev/null 2>&1 || true
    exit 1
  fi
  sleep 2
done
echo "[switch:$APP] ✅ $IDLE healthy (${SECONDS}s)"

# ── 3. ย้าย traffic แล้วดับสีเก่า ─────────────────────────────────────────────────
if [ -n "$ACTIVE" ]; then
  sleep "$CADDY_SETTLE"                                        # ให้ Caddy เห็นสีใหม่ healthy ก่อน
  dc exec -T "$ACTIVE" touch "$DRAIN_FILE" 2>/dev/null || true # health → 503 → Caddy ตัดออกจาก pool
  sleep "$CADDY_SETTLE"
  dc stop "$ACTIVE"                                            # stop_grace_period ใน compose
  echo "[switch:$APP] ⏹ $ACTIVE stopped — traffic อยู่ที่ $IDLE"
fi

# ── 4. service พ่วง (instance เดียว ไม่มี traffic) ────────────────────────────────
if [ ${#EXTRA[@]} -gt 0 ]; then
  dc up -d --no-deps "${EXTRA[@]}" && dc restart "${EXTRA[@]}"
fi
echo "[switch:$APP] done: $(cat /srv/apps/$APP/current/RELEASE 2>/dev/null || echo '?')"
