"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Google Analytics (gtag.js) ของ Next app — เสิร์ฟทั้ง `app.perpos.ai` และ `mail.perpos.ai`
 *
 * ⚠️ กฎที่ห้ามพัง (เหตุผลเดียวกับที่ Sentry ต้อง scrub `/api/mail/*`):
 * 1. **ปิด page_view อัตโนมัติ** (`send_page_view:false`) — ไม่งั้น gtag จะส่ง `location` ดิบ
 *    ที่พก id ของเมล/เอกสารไปที่ Google ตั้งแต่วินาทีแรก
 * 2. ยิง page_view เองด้วย **path ที่ล้างแล้ว** (`sanitizePath`) เท่านั้น — โซนเมลยุบเป็น `/mail`
 *    ก้อนเดียว (ไม่แยกกล่อง/ฉบับ) และ id ในเส้นทางอื่นถูกแทนด้วย `:id`
 * 3. ไม่แตะ query string เลย (`?box=`, `?id=` ของเมล)
 *
 * ไม่ตั้ง `NEXT_PUBLIC_GA_ID` = ไม่โหลดสคริปต์เลย (dev/preview เงียบ)
 */

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const LONG_ID_RE = /\b[A-Za-z0-9_-]{16,}\b/g;

function isMailHost(): boolean {
  if (typeof window === "undefined") return false;
  return (window.location.hostname.split(":")[0] ?? "").toLowerCase().startsWith("mail.");
}

export function sanitizePath(pathname: string, mailHost = false): string {
  if (mailHost) return "/mail";
  if (pathname === "/mail" || pathname.startsWith("/mail/")) return "/mail";
  return pathname.replace(UUID_RE, ":id").replace(LONG_ID_RE, ":id");
}

export default function GoogleAnalytics() {
  const pathname = usePathname();

  useEffect(() => {
    if (!GA_ID || typeof window === "undefined" || !window.gtag) return;
    window.gtag("event", "page_view", {
      page_path: sanitizePath(pathname ?? "/", isMailHost()),
      page_title: document.title,
    });
  }, [pathname]);

  if (!GA_ID) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
window.gtag = gtag;
// เครื่อง dev ห้ามยิงเข้า property จริง — เคยมี hostname=localhost ปนในข้อมูล prod
if (/^(localhost|127\\.0\\.0\\.1|0\\.0\\.0\\.0|\\[?::1\\]?)$/.test(location.hostname) ||
    location.hostname.endsWith('.local')) { window['ga-disable-${GA_ID}'] = true; }
gtag('js', new Date());
gtag('config', '${GA_ID}', { send_page_view: false });`}
      </Script>
    </>
  );
}
