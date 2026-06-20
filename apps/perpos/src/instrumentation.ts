// Next.js instrumentation hook — โหลด Sentry init ตาม runtime
// (Next 15.2 ใช้ sentry.client.config.ts สำหรับ browser; ที่นี่คุม server/edge)
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

// ส่ง error ของ React Server Components / route handlers เข้า Sentry
export { captureRequestError as onRequestError } from "@sentry/nextjs";
