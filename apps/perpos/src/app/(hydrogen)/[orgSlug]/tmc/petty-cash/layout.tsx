// ด่านสิทธิ์ฝั่ง server ของหน้า "เงินสดย่อย" (หน้าเป็น client component)
// เฉพาะเจ้าของ/ผู้ดูแลของโมดูล tmc — คนอื่นถูกส่งไปหน้า Stock
import type { ReactNode } from "react";
import { requireTmcManagerPage } from "../_guard";

export default async function TmcPettyCashLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  await requireTmcManagerPage(orgSlug);
  return <>{children}</>;
}
