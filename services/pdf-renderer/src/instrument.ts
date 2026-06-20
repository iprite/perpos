import * as Sentry from "@sentry/node";

// Sentry สำหรับ Cloud Run worker — active เฉพาะเมื่อมี SENTRY_DSN (ไม่มี = no-op, build/local ไม่พัง)
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.1,
  });
}
