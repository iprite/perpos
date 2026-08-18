import { headers } from "next/headers";

import { requireJustMePage } from "./_guard";

/**
 * ด่านสิทธิ์ของทุกหน้าใต้ `/[orgSlug]/just-me/*` — กติกาอยู่ที่ `_guard.ts` ที่เดียว
 * (pathname อ่านจาก `x-pathname` ที่ middleware ใส่ให้ — layout ไม่มี pathname ของตัวเอง)
 */
export default async function JustMeLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const pathname = (await headers()).get("x-pathname") ?? "";
  await requireJustMePage(orgSlug, pathname);
  return <>{children}</>;
}
