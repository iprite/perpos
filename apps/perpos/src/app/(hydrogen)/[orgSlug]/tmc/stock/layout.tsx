// ด่านสิทธิ์ฝั่ง server ของหน้า "Stock คลัง" (หน้าเป็น client component)
// ทุก role ของ tmc ยกเว้น "การเงิน" — การเงินถูกส่งไปหน้าบัญชีและการเงิน
import type { ReactNode } from "react";
import { requireTmcOperationsPage } from "../_guard";

export default async function TmcStockLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  await requireTmcOperationsPage(orgSlug);
  return <>{children}</>;
}
