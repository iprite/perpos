import * as Sentry from "@sentry/nextjs";

import { scrubMailEvent } from "@/lib/observability/scrub-mail";

// ดัก error ฝั่ง edge runtime (middleware ฯลฯ) — active เฉพาะเมื่อมี DSN + production
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    enabled: process.env.NODE_ENV === "production",
    tracesSampleRate: 0.1,
    // ชื่อไฟล์แนบ/คำค้นของผู้ใช้ห้ามหลุดเข้า Sentry (contract §7.8)
    beforeSend: scrubMailEvent,
    beforeSendTransaction: scrubMailEvent,
  });
}
