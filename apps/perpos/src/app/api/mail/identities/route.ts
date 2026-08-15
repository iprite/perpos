/** ที่อยู่ผู้ส่งที่บัญชีนี้ใช้ได้ (M2) — กล่องเขียนใช้เลือก "จาก" */

import { type NextRequest } from "next/server";

import { mailJson, withMailSession } from "../_lib";
import { fetchIdentities } from "@/lib/mail/outbox";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return withMailSession(req, async (session) => {
    const identities = await fetchIdentities(session);
    return mailJson({ identities, defaultEmail: session.email });
  });
}
