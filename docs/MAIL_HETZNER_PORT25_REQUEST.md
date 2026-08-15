# ร่างคำขอปลดพอร์ต 25 ขาออก — Hetzner (พร้อมส่ง)

> ใช้กับ §B ของ [`MAIL_HANDOFF.md`](MAIL_HANDOFF.md) · ส่งที่ **Hetzner Cloud Console → Support → New request**
> (เลือกหมวด _Cloud_ · ถ้ามีช่องเลือกหัวข้อ ใช้ _Other / Network_)
>
> ⚠️ **ส่งเองเท่านั้น** — เป็นการติดต่อในนามผู้ถือบัญชี
>
> 📌 **จังหวะที่ควรส่ง**: Hetzner มักอนุมัติหลังบัญชีมีประวัติการจ่ายเงินแล้ว (บิลรอบแรก)
> ส่งก่อนได้ ไม่เสียอะไร — ถ้าโดนปฏิเสธรอบแรก ให้รอจ่ายบิลแล้วส่งซ้ำโดยอ้างเคสเดิม

## ข้อมูลที่ต้องมีในคำขอ

|        |                                                      |
| ------ | ---------------------------------------------------- |
| Server | `perpos-mail` (project ของ Hetzner Cloud ที่ใช้อยู่) |
| IPv4   | `46.225.14.18`                                       |
| IPv6   | `2a01:4f8:c2c:105a::1`                               |
| rDNS   | `mail.perpos.ai` (ตั้งแล้วทั้ง v4/v6)                |

## ข้อความคำขอ (วางได้เลย)

```
Hello,

I would like to request the removal of the outbound port 25 (SMTP) block for the
following server:

  Server name : perpos-mail
  IPv4        : 46.225.14.18
  IPv6        : 2a01:4f8:c2c:105a::1
  rDNS        : mail.perpos.ai (already configured for both IPv4 and IPv6)

Purpose
-------
This server runs Stalwart Mail Server and is the mail server for our own company
domain (perpos.ai) and, later, for business mailboxes we host for our customers.
We are a Thai SME accounting/ERP software company (https://perpos.ai).

The traffic is ordinary business email: messages written by our own staff and by
our customers' staff from their own authenticated mailboxes, plus transactional
messages from our application (invoices, receipts, account notifications).

We do NOT send marketing campaigns, newsletters, or bulk mail, and we do not use
purchased or third-party recipient lists.

Expected volume is low: well under 1,000 messages per day.

Anti-abuse measures already in place
------------------------------------
- No open relay. Outbound mail is only accepted on the submission ports (587
  STARTTLS / 465 implicit TLS) and requires per-mailbox authentication. Port 25
  is used for inbound mail only.
- Authentication is only offered over TLS; credentials are never accepted on an
  unencrypted connection.
- Stalwart's built-in auto-ban is active: repeated authentication failures,
  relay/RCPT TO probing, and port scanning result in the source IP being blocked.
- Every sending domain must pass domain-ownership verification before any mailbox
  on it can send. SPF, DKIM and DMARC are configured per domain.
- Valid TLS certificates (Let's Encrypt) are installed and rDNS matches the
  server hostname.
- Per-mailbox storage quotas and rate limits are enforced.
- Abuse reports are handled by our team and result in immediate suspension of the
  offending mailbox or customer account. Abuse contact: abuse@perpos.ai

We understand and accept responsibility for the mail sent from this IP address
and will keep the server secured against relaying and account compromise.

Thank you very much.

Best regards,
Jedsada Worapattrakorn
P2P Solutions
```

## ⚠️ ก่อนกดส่ง — 2 อย่างที่ต้องมีจริง ไม่ใช่แค่เขียน

- [ ] **`abuse@perpos.ai` ต้องรับเมลได้จริง** — Hetzner (และ blocklist ต่าง ๆ) ใช้ที่อยู่นี้ติดต่อ
      ถ้าเขียนไว้แล้วส่งไม่ถึง เสียเครดิตทันที · สร้างกล่องหรือ alias ก่อนส่งคำขอ
- [ ] **auto-ban ต้องตั้งเพดานจริง** — ตอนนี้ยิงรหัสผิด 12 ครั้งติดยังไม่โดนแบน
      (Settings → Security → Settings) · ที่เขียนในคำขอต้องเป็นความจริง

## ถ้าถูกปฏิเสธ

- อย่าเปิดเคสใหม่ — ตอบในเคสเดิม
- เหตุผลที่เจอบ่อยคือ "บัญชีใหม่เกินไป" → รอจ่ายบิลรอบแรกแล้วตอบกลับในเคสเดิมว่าจ่ายแล้ว
- ระหว่างนั้นเมลขาออกยังส่งผ่าน relay (SES/Mailgun) ที่พอร์ต 587 ได้ตามปกติ — พอร์ต 25 ขาออก
  เป็น **ทางหนีทีไล่** ไม่ใช่เส้นทางหลัก
