import * as Sentry from "@sentry/nextjs";

// ดัก error ฝั่ง edge runtime (middleware ฯลฯ) — active เฉพาะเมื่อมี DSN + production
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    enabled: process.env.NODE_ENV === "production",
    tracesSampleRate: 0.1,
  });
}
