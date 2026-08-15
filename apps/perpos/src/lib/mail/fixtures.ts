/**
 * ตัวอย่างข้อมูลสำหรับเทส/dev — **ห้ามยิงเซิร์ฟเวอร์จริงในเทส**
 * ไม่มีข้อมูลจริงของใครในไฟล์นี้ (ทุกอย่างสมมติขึ้น)
 */

import type { JmapEmail, JmapMailbox, MailSession, MailUndoToken } from "./types";

export const FIXTURE_MAILBOXES: JmapMailbox[] = [
  { id: "a", name: "Inbox", role: "inbox", parentId: null, totalEmails: 12, unreadEmails: 3 },
  { id: "b", name: "Drafts", role: "drafts", parentId: null, totalEmails: 7, unreadEmails: 0 },
  { id: "c", name: "Sent", role: "sent", parentId: null, totalEmails: 4, unreadEmails: 0 },
  { id: "d", name: "Trash", role: "trash", parentId: null, totalEmails: 1, unreadEmails: 0 },
  { id: "e", name: "Junk", role: "junk", parentId: null, totalEmails: 0, unreadEmails: 0 },
];

export const FIXTURE_EMAIL: JmapEmail = {
  id: "em1",
  threadId: "th1",
  mailboxIds: { a: true },
  from: [{ name: "ผู้ส่งทดสอบ", email: "sender@example.com" }],
  to: [{ name: null, email: "me@example.com" }],
  subject: "ทดสอบระบบอีเมล",
  preview: "สวัสดีครับ นี่คือข้อความทดสอบ",
  receivedAt: "2026-08-15T03:00:00Z",
  keywords: { $flagged: true },
  size: 20480,
  hasAttachment: true,
};

export const FIXTURE_SESSION: MailSession = {
  v: 1,
  accessToken: "access-token-fixture",
  refreshToken: "refresh-token-fixture",
  expiresAt: Date.now() + 3_600_000,
  issuedAt: Date.now(),
  email: "me@example.com",
  accountId: "b",
  apiUrl: "https://mail.example.com/jmap/",
  downloadUrl: "https://mail.example.com/jmap/download/{accountId}/{blobId}/{name}?accept={type}",
};

export const FIXTURE_UNDO_TOKEN: MailUndoToken = {
  action: "unstar",
  by: "email",
  items: [
    { id: "em1", mailboxIds: ["a"], wasUnread: true, wasFlagged: true },
    { id: "em2", mailboxIds: ["a"], wasUnread: false, wasFlagged: false },
  ],
};

/** เมลการตลาดที่มีทุกช่องทางรั่วรูปนอก + preheader ซ่อน + tracking pixel */
export const FIXTURE_HTML_REMOTE = [
  "<html><head>",
  '<link rel="stylesheet" href="https://tracker.example.com/x.css">',
  "<style>@import url(https://tracker.example.com/y.css);</style>",
  '<meta http-equiv="refresh" content="0;url=https://evil.example.com">',
  "</head><body>",
  '<div style="display:none;font-size:0">preheader ที่ซ่อนไว้</div>',
  '<div style="background-image:url(https://tracker.example.com/bg.png)">เนื้อหา</div>',
  '<img src="https://tracker.example.com/pixel.gif" width="1" height="1">',
  '<img src="https://cdn.example.com/hero.png" width="600" height="200">',
  '<video poster="https://tracker.example.com/poster.jpg"></video>',
  '<svg><image xlink:href="https://tracker.example.com/s.svg"></image></svg>',
  "<script>alert(1)</script>",
  '<a href="javascript:alert(2)" onclick="alert(3)">ลิงก์</a>',
  '<a href="https://example.com">ปกติ</a>',
  "</body></html>",
].join("");

/** เมลตอบกลับที่พ่วงประวัติมาด้วย (Gmail + Outlook + Apple Mail) */
export const FIXTURE_HTML_QUOTED = [
  "<div>ตอบกลับล่าสุด</div>",
  '<div class="gmail_quote"><blockquote type="cite">',
  "<div>ข้อความเก่า 1</div>",
  "<blockquote><div>ข้อความเก่า 2</div></blockquote>",
  "</blockquote></div>",
  '<div class="gmail_extra">ลายเซ็น Gmail</div>',
  '<div id="divRplyFwdMsg">From: someone</div>',
].join("");

/** ตาราง newsletter ที่ต้องรอดทั้งชุด (attribute ยุค HTML4) */
export const FIXTURE_HTML_TABLE =
  '<table cellpadding="8" cellspacing="0" border="0" bgcolor="#ffffff" width="600">' +
  '<tr><td colspan="2" align="center" valign="top">หัวข้อ</td></tr></table>';
