# ร่างคำขอปลด SES sandbox (พร้อมวาง)

> ใช้กับ §A ของ [`MAIL_HANDOFF.md`](MAIL_HANDOFF.md) · ยื่นที่ **SES Console → Account dashboard →
> Request production access** (ฟอร์มนี้ = support case ประเภท "Service limit increase")
> **ต้องเคาะ §D ข้อ 1–2 ก่อน** (ใช้บัญชี AWS ไหน · region ไหน) เพราะปลดเป็นราย account+region
>
> ⚠️ ยื่นเองเท่านั้น — เป็นการส่งเรื่องในนามบริษัทไปให้ AWS agent ไม่ใช่งานที่ให้ agent กดแทน

## ค่าที่กรอกในฟอร์ม

| ช่อง                       | ค่า                                                            |
| -------------------------- | -------------------------------------------------------------- |
| Mail type                  | **Transactional**                                              |
| Website URL                | `https://perpos.ai`                                            |
| Use case description       | ข้อความด้านล่าง                                                |
| Additional contacts        | อีเมลที่ติดต่อได้จริง                                          |
| Preferred contact language | English                                                        |
| ขอเพดานเริ่มต้น            | 50,000 ฉบับ/วัน · 14 ฉบับ/วินาที (ปรับขึ้นทีหลังได้ตามยอดจริง) |

## Use case description (วางได้เลย)

```
PERPOS (perpos.ai) is a Thai SME ERP/accounting SaaS. We are adding a hosted business
email service for our customers, and we will use SES only as the outbound relay
(SMTP submission on port 587) from our own mail server (Stalwart) hosted in Singapore.

We are an ISV sending on behalf of our customers, on their own verified domains.

What we send:
- Business email composed by our customers' own staff from their own mailboxes
  (@their-company-domain), plus our application's transactional mail
  (invoices, receipts, document links, account notifications).
- No marketing campaigns, no purchased lists, no bulk newsletters.

How recipients are obtained:
- Recipients are the counterparties our customers already do business with
  (their own clients, suppliers, staff). Every message is initiated by a human
  action or by a document the customer issued. We do not import third-party lists.

Domain and identity control:
- Every sending domain must be verified by the customer through our in-app DNS
  wizard before a single message can be sent: SES Easy DKIM (3 CNAME records),
  SPF (include:amazonses.com), and DMARC. We poll GetEmailIdentity and keep the
  domain disabled until verification passes.
- We do not allow sending from unverified or unowned domains.

Bounce and complaint handling:
- We subscribe to SES bounce, complaint and delivery notifications via SNS and
  process them in an automated webhook endpoint.
- Hard bounces and complaints are added to a suppression list immediately and are
  never retried. Repeated complaints on a customer domain suspend that domain's
  sending and alert our team.
- We monitor bounce and complaint rates per customer domain, not just per account,
  so one bad tenant cannot damage the whole account reputation.
- Every mailbox is authenticated (no open relay); abuse results in account suspension
  under our terms of service.

Unsubscribe:
- Not applicable to person-to-person business mail. For our own application
  notifications, users control them in their account settings.

Expected volume at launch: under 5,000 messages per day, growing with customer count.
```

## หลังได้รับอนุมัติ

- [ ] ตรวจว่าเพดาน (sending quota / rate) ขึ้นจริงใน SES console
- [ ] สร้าง **SMTP credentials** แยกสำหรับเครื่องเมล (ไม่ใช้ root key) → `chmod 600` บนเครื่อง **ห้าม commit**
- [ ] ตั้ง **SNS topic + webhook** รับ bounce/complaint ก่อนส่งจริงฉบับแรก (ที่เขียนไว้ในคำขอ ต้องมีจริง)
