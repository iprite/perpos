#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# stt-stripe-test.sh — ทดสอบ STT billing webhook ด้วย Stripe CLI (test mode)
#
# ติดตั้ง Stripe CLI ก่อน: https://stripe.com/docs/stripe-cli  (brew install stripe/stripe-cli/stripe)
# แล้ว: stripe login
#
# คำสั่งย่อย:
#   ./scripts/stt-stripe-test.sh listen                 # forward test events → local webhook (พิมพ์ whsec_)
#   PROFILE_ID=<uuid> PLAN_ID=<uuid> ./scripts/stt-stripe-test.sh topup   # ยิง event topup ทดสอบ
#   ./scripts/stt-stripe-test.sh verify <profile_id>    # คำสั่ง SQL ตรวจผล (พิมพ์ให้ copy)
#
# หมายเหตุ: การทดสอบ "ของจริงที่สุด" คือเปิด listen แล้วกดซื้อในแอป (test mode, บัตร 4242…)
#           เพราะ event มี metadata (kind/profile_id/plan_id) + customer/subscription ครบตามจริง
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

FORWARD_URL="${FORWARD_URL:-localhost:3005/api/stripe/webhook}"
EVENTS="checkout.session.completed,invoice.payment_succeeded,invoice.payment_failed,customer.subscription.updated,customer.subscription.deleted"

cmd="${1:-help}"

case "$cmd" in
  listen)
    echo "▶ forward Stripe test events → $FORWARD_URL"
    echo "  คัดลอก whsec_… ที่ขึ้นด้านล่าง ไปใส่ STRIPE_WEBHOOK_SECRET ใน .env.local แล้วรีสตาร์ท dev server"
    echo "  (เปิดหน้าต่างนี้ค้างไว้ แล้วไปกดซื้อในแอป test mode — events จะวิ่งเข้ามาที่นี่)"
    exec stripe listen --events "$EVENTS" --forward-to "$FORWARD_URL"
    ;;

  topup)
    : "${PROFILE_ID:?ต้องตั้ง PROFILE_ID=<uuid ของ profile ที่จะเติมนาที>}"
    : "${PLAN_ID:?ต้องตั้ง PLAN_ID=<uuid ของ stt_plans แบบ kind=topup>}"
    echo "▶ ยิง checkout.session.completed (topup) สำหรับ profile=$PROFILE_ID plan=$PLAN_ID"
    echo "  ⚠️ ต้องเปิด ./scripts/stt-stripe-test.sh listen ไว้อีกหน้าต่างก่อน"
    # override fixture ให้ session เป็น STT topup (mode=payment + metadata) → handleSttCheckout จะ apply_stt_payment
    stripe trigger checkout.session.completed \
      --add "checkout_session:mode=payment" \
      --add "checkout_session:metadata[kind]=stt" \
      --add "checkout_session:metadata[profile_id]=$PROFILE_ID" \
      --add "checkout_session:metadata[plan_id]=$PLAN_ID"
    echo "✓ ส่งแล้ว — ตรวจผลด้วย: ./scripts/stt-stripe-test.sh verify $PROFILE_ID"
    echo "  (ถ้า CLI เวอร์ชันนี้ไม่รองรับ --add ให้ทดสอบด้วยการกดซื้อจริงในแอปแทน — เชื่อถือได้กว่า)"
    ;;

  verify)
    pid="${2:?ระบุ profile_id: ./scripts/stt-stripe-test.sh verify <uuid>}"
    cat <<SQL
-- รันใน Supabase SQL editor / execute_sql:
SELECT kind, amount, currency, minutes_granted, status, stripe_invoice_id, stripe_payment_intent_id, created_at
  FROM stt_payments WHERE profile_id = '$pid' ORDER BY created_at DESC LIMIT 10;
SELECT limit_seconds, used_seconds, plan_seconds, topup_seconds, (limit_seconds-used_seconds) AS remaining_sec
  FROM stt_quota WHERE profile_id = '$pid';
SELECT status, plan_id, current_period_end, cancel_at_period_end
  FROM stt_subscriptions WHERE profile_id = '$pid';
SQL
    ;;

  *)
    sed -n '2,20p' "$0"
    ;;
esac
