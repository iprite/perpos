/**
 * สถานะการเชื่อมกล่องเมลของอุปกรณ์นี้ (ไม่มีความลับใน response)
 * ใช้ให้ฝั่ง client รู้ว่า "เชื่อมแล้ว/อีเมลอะไร" โดยไม่ต้องยิงงานหนัก
 */

import { type NextRequest } from "next/server";

import { mailJson, mailNotConfigured } from "../_lib";
import { readMailConfig } from "@/lib/mail/oauth";
import { readMailSession } from "@/lib/mail/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!readMailConfig()) return mailNotConfigured();
  const session = readMailSession(req);
  if (!session) return mailJson({ connected: false, email: null });
  return mailJson({ connected: true, email: session.email });
}
