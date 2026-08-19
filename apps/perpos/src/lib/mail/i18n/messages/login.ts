import { defineMailMessages } from "../define";

/** พจนานุกรมพื้นที่ `login` (หน้า `/login`) — คีย์ต้องขึ้นต้นด้วย `login.` */
export const login = defineMailMessages({
  "login.reason.expired": {
    th: "เซสชันกล่องเมลหมดอายุ กรุณาเข้าสู่ระบบใหม่อีกครั้ง",
    en: "Your mailbox session has expired. Please sign in again.",
  },
  "login.reason.denied": {
    th: "คุณยกเลิกการอนุญาต จึงยังเข้าสู่ระบบไม่สำเร็จ",
    en: "You cancelled the authorisation, so sign-in did not complete.",
  },
  "login.reason.disconnected": {
    th: "ออกจากระบบบนอุปกรณ์นี้เรียบร้อยแล้ว",
    en: "You have been signed out on this device.",
  },
  "login.reason.invalid": {
    th: "คำขอเข้าสู่ระบบไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง",
    en: "The sign-in request was invalid. Please try again.",
  },
  "login.reason.failed": {
    th: "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
    en: "Sign-in failed. Please try again.",
  },
  "login.reason.no_refresh": {
    th: "เซิร์ฟเวอร์อีเมลไม่ได้ให้สิทธิ์ค้างการเข้าสู่ระบบ กรุณาติดต่อผู้ดูแลระบบ",
    en: "The mail server did not grant a persistent sign-in. Please contact your administrator.",
  },
  "login.intro": {
    th: "เข้าสู่ระบบด้วยอีเมลและรหัสผ่านของกล่องเมลคุณ เพื่อเริ่มอ่านและจัดการอีเมล",
    en: "Sign in with your mailbox email and password to start reading and managing your email",
  },
  "login.submit": { th: "เข้าสู่ระบบ", en: "Sign in" },
  "login.footerPrefix": {
    th: "การเข้าสู่ระบบจะให้สิทธิ์อ่านและจัดการอีเมล ",
    en: "Signing in grants access to read and manage email ",
  },
  "login.footerDevice": { th: "บนอุปกรณ์นี้", en: "on this device" },
  "login.footerSuffix": {
    th: " ถ้าอุปกรณ์สูญหาย ให้เปลี่ยนรหัสผ่านกล่องเมลของคุณ",
    en: ". If the device is lost, change your mailbox password.",
  },
});
