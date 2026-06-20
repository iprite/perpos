<!-- Phase 0 DevOps — self-review checklist สำหรับ solo dev -->

## สรุปการเปลี่ยนแปลง

<!-- ทำอะไร ทำไม -->

## ประเภท

- [ ] ฟีเจอร์ใหม่
- [ ] แก้บั๊ก
- [ ] refactor / chore
- [ ] แตะ **เงิน / billing / token / quota** ⚠️
- [ ] แตะ **DB migration / RLS**
- [ ] แตะ **webhook (LINE / Stripe)**

## Checklist ก่อน merge

- [ ] CI เขียว (`app` + `workers`)
- [ ] ดู **Vercel Preview** แล้วทำงานถูกต้อง
- [ ] ไม่มี secret / key หลุดใน diff
- [ ] migration ใหม่ enable RLS + มี policy (ถ้าแตะ DB)
- [ ] รัน `/code-review` (+ `/security-review` ถ้าแตะเงิน/auth/webhook)

## หมายเหตุ / วิธีทดสอบ

<!-- เทสยังไง / ส่งผลกระทบอะไรบ้าง -->
