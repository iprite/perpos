/**
 * files.ts — ไฟล์แนบของโครงการ (แบบ/รูปสำรวจ/สัญญา)
 * contract: .claude/feature-factory/specs/just-me-project-loop.md §4.1
 *
 * ท่าเดียวกับคลังเอกสาร acc_firm (`lib/acc-firm/vault/documents.ts`):
 *  - bucket **private** `just_me_files` — ห้ามเปิด public เด็ดขาด
 *  - อัปโหลด: ออก **signed upload URL** ให้เบราว์เซอร์ยิงตรงเข้า storage (ไม่ผ่าน body ของ route)
 *  - ดาวน์โหลด: **signed URL ≤60 วิ** เท่านั้น
 *  - path = `{org_id}/{project_id}/{uuid}.{ext}` → storage policy อ่าน `foldername[1]` เป็น org
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProjectFileKind } from "./types";

export const JUST_ME_BUCKET = "just_me_files";
export const SIGNED_URL_TTL_SECONDS = 60;
export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

export const FILE_KINDS: ProjectFileKind[] = ["survey_photo", "drawing", "contract", "other"];

/** ตัดชื่อไฟล์เหลือแค่นามสกุลที่ปลอดภัย (กัน path traversal / ชื่อไทยยาว) */
export function safeExtension(fileName: string): string {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(fileName.trim());
  return m ? m[1].toLowerCase() : "bin";
}

export function buildStoragePath(orgId: string, projectId: string, fileName: string): string {
  return `${orgId}/${projectId}/${crypto.randomUUID()}.${safeExtension(fileName)}`;
}

/** path ต้องเป็นของ org+โครงการนี้จริง — กันคนส่ง path ของคนอื่นมาลงทะเบียน */
export function isOwnedPath(path: string, orgId: string, projectId: string): boolean {
  return path.startsWith(`${orgId}/${projectId}/`) && !path.includes("..");
}

export async function createUploadUrl(
  db: SupabaseClient,
  args: { orgId: string; projectId: string; fileName: string; sizeBytes?: number | null },
): Promise<{ path: string; token: string; signedUrl: string }> {
  if (args.sizeBytes && args.sizeBytes > MAX_FILE_SIZE_BYTES) {
    throw new Error("ไฟล์ใหญ่เกิน 50 MB");
  }
  const path = buildStoragePath(args.orgId, args.projectId, args.fileName);
  const { data, error } = await db.storage.from(JUST_ME_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error(error?.message ?? "สร้างลิงก์อัปโหลดไม่สำเร็จ");
  return { path, token: data.token, signedUrl: data.signedUrl };
}

export async function createDownloadUrl(
  db: SupabaseClient,
  storagePath: string,
  fileName?: string | null,
): Promise<{ url: string; expiresInSeconds: number }> {
  const { data, error } = await db.storage
    .from(JUST_ME_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS, {
      download: fileName ?? undefined,
    });
  if (error || !data) throw new Error(error?.message ?? "สร้างลิงก์ดาวน์โหลดไม่สำเร็จ");
  return { url: data.signedUrl, expiresInSeconds: SIGNED_URL_TTL_SECONDS };
}

export async function removeStorageObject(db: SupabaseClient, storagePath: string): Promise<void> {
  await db.storage.from(JUST_ME_BUCKET).remove([storagePath]);
}
