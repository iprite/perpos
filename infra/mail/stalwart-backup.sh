#!/usr/bin/env bash
# สำรองข้อมูล Stalwart แบบ logical (ไม่ใช่ snapshot ของ Hetzner)
#
# ทำไมต้อง logical: snapshot ของเครื่องที่กำลังรันอยู่จับ RocksDB กลางคัน กู้แล้วอาจพัง
# (docs/MAIL_SERVER_PLAN.md §5.1) — ตัวนี้หยุด service สั้น ๆ แล้ว export ออกมาเป็นไฟล์
#
# ⚠️ RocksDB ล็อกไฟล์ไว้ตอน service รัน → export ระหว่างรันไม่ได้ ต้องหยุดก่อนเท่านั้น
#    ช่วงที่หยุด เมลขาเข้าไม่หาย — เซิร์ฟเวอร์ต้นทางจะ retry ตามมาตรฐาน SMTP
set -euo pipefail

BACKUP_DIR=/var/backups/stalwart
STAGING="$BACKUP_DIR/.staging"
KEYFILE=/root/.stalwart-backup-key
KEEP_DAYS=14
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUT="$BACKUP_DIR/stalwart-$STAMP.tar.gz.enc"

log() { echo "[$(date -u +%FT%TZ)] $*"; }

[ -s "$KEYFILE" ] || { log "ไม่มี $KEYFILE — ยกเลิก (ห้าม backup แบบไม่เข้ารหัส)"; exit 1; }

mkdir -p "$BACKUP_DIR"
rm -rf "$STAGING"; mkdir -p "$STAGING"
trap 'rm -rf "$STAGING"' EXIT

# ---- หยุด → export → เปิดกลับ (ให้ downtime สั้นที่สุด) ----
DOWN_START=$(date +%s)
systemctl stop stalwart
if ! /usr/local/bin/stalwart --config /etc/stalwart/config.json --export "$STAGING" >/dev/null 2>&1; then
  systemctl start stalwart          # เปิดกลับให้ได้ก่อนเสมอ แม้ export พัง
  log "export ล้มเหลว — เปิด service กลับแล้ว"
  exit 1
fi
systemctl start stalwart
DOWN=$(( $(date +%s) - DOWN_START ))
log "export เสร็จ · service หยุดไป ${DOWN} วินาที"

# ---- บีบ + เข้ารหัส (ในนี้มีเมลลูกค้าทั้งหมด ห้ามวางเปล่า ๆ นอกเครื่อง — PDPA) ----
tar -C "$STAGING" -czf - . \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 300000 -salt -pass file:"$KEYFILE" -out "$OUT"
chmod 600 "$OUT"
log "ได้ไฟล์ $OUT ($(du -h "$OUT" | cut -f1))"

# ---- ลบของเก่า ----
find "$BACKUP_DIR" -name 'stalwart-*.tar.gz.enc' -mtime +$KEEP_DAYS -delete
log "เหลือไฟล์สำรอง $(find "$BACKUP_DIR" -name 'stalwart-*.tar.gz.enc' | wc -l) ไฟล์"

# ---- ส่งออกนอก Hetzner ----
# ⚠️ ยังไม่ได้ต่อ — เครื่องเดียวกับที่เก็บเมลไม่นับเป็น backup
#    (เครื่องหาย = หายพร้อมกัน) ดู §5.1 ของคัมภีร์
if [ -x /usr/local/sbin/stalwart-backup-upload.sh ]; then
  /usr/local/sbin/stalwart-backup-upload.sh "$OUT" && log "อัปโหลดออกนอกเครื่องแล้ว"
else
  log "⚠️ ยังไม่มีตัวอัปโหลดออกนอกเครื่อง — backup ยังอยู่บนเครื่องเดียวกับข้อมูลจริง"
fi
