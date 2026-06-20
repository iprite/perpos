"use client";

// Global error boundary — จับ error ระดับ root layout (ที่ error.tsx ปกติจับไม่ได้)
// แล้วส่งเข้า Sentry · render เองทั้ง <html> เพราะ layout พังไปแล้ว (ใช้ inline style ไม่พึ่ง Tailwind/providers)
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="th">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Sarabun, 'Noto Sans Thai', system-ui, sans-serif",
          background: "#f5f7fa",
          color: "#3c3b3d",
        }}
      >
        <div style={{ textAlign: "center", padding: "2rem", maxWidth: 420 }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>เกิดข้อผิดพลาด</h1>
          <p style={{ fontSize: 14, color: "#656d78", marginBottom: 20 }}>
            ระบบขัดข้องชั่วคราว ทีมงานได้รับแจ้งแล้ว กรุณาลองใหม่อีกครั้ง
          </p>
          <button
            onClick={() => reset()}
            style={{
              fontSize: 14,
              padding: "8px 20px",
              borderRadius: 8,
              border: "none",
              background: "#3c3b3d",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            ลองใหม่
          </button>
        </div>
      </body>
    </html>
  );
}
