import * as Sentry from "@sentry/nextjs";

// ดัก error ฝั่ง browser — active เฉพาะเมื่อมี DSN + production (CI/local = no-op)
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    enabled: process.env.NODE_ENV === "production",
    tracesSampleRate: 0.1, // 10% — กัน quota บาน
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  });
}
