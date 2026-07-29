"use client";

// api.ts — ตัวเรียก API ของคลังเอกสารฝั่ง browser (mutation เท่านั้น — read แรกมาจาก SSR)
// ทุกเส้นต้องมี ?orgId=<firmOrgId> + Bearer token (ตามสัญญาใน api/acc-firm/vault/_lib.ts)

import { useCallback, useMemo } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { VAULT_BUCKET } from "@/lib/acc-firm/vault/types";

export class VaultApiError extends Error {}

/** hex ของ SHA-256 (64 ตัว) — คำนวณฝั่ง browser ก่อนส่ง register */
export async function sha256Hex(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type UploadArgs = {
  clientId: string;
  categoryId: string;
  periodId?: string | null;
  fiscalYear: number;
  title: string;
  docDate?: string | null;
  file: File;
};

export function useVaultApi(orgId: string) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const authHeaders = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new VaultApiError("เซสชันหมดอายุ — เข้าสู่ระบบใหม่อีกครั้ง");
    return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  }, [supabase]);

  const request = useCallback(
    async <T>(path: string, init: { method: string; body?: unknown }): Promise<T> => {
      const headers = await authHeaders();
      const glue = path.includes("?") ? "&" : "?";
      const res = await fetch(`${path}${glue}orgId=${encodeURIComponent(orgId)}`, {
        method: init.method,
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok) {
        throw new VaultApiError((json?.error as string) ?? "ทำรายการไม่สำเร็จ");
      }
      return json as T;
    },
    [authHeaders, orgId],
  );

  /** เปิดงวด + กาง checklist (idempotent ฝั่ง API) */
  const openPeriod = useCallback(
    (body: { clientId: string; kind: "month" | "year"; year: number; month?: number }) =>
      request<{ periodId: string; created: boolean; checklistCount: number }>(
        "/api/acc-firm/vault/periods",
        { method: "POST", body },
      ),
    [request],
  );

  const fetchChecklist = useCallback(
    (periodId: string) =>
      request<{ items: unknown[]; canWrite: boolean }>(
        `/api/acc-firm/vault/checklist?periodId=${encodeURIComponent(periodId)}`,
        { method: "GET" },
      ),
    [request],
  );

  const setChecklistStatus = useCallback(
    (body: { checklistId: string; status: string; waivedReason?: string }) =>
      request<{ ok: true }>("/api/acc-firm/vault/checklist", { method: "PATCH", body }),
    [request],
  );

  const fetchDocuments = useCallback(
    (clientId: string) =>
      request<{ documents: unknown[] }>(
        `/api/acc-firm/vault/documents?clientId=${encodeURIComponent(clientId)}`,
        { method: "GET" },
      ),
    [request],
  );

  const fetchCustody = useCallback(
    (clientId: string) =>
      request<{ entries: unknown[] }>(
        `/api/acc-firm/vault/custody?clientId=${encodeURIComponent(clientId)}`,
        { method: "GET" },
      ),
    [request],
  );

  const createCustody = useCallback(
    (body: Record<string, unknown>) =>
      request<{ id: string; receiptNo: string }>("/api/acc-firm/vault/custody", {
        method: "POST",
        body,
      }),
    [request],
  );

  /**
   * ดาวน์โหลด — URL อายุ 60 วิ เปิดทันที **ห้ามเก็บ/แคช** (spec §6)
   * ฝั่ง API เขียน access log ก่อนคืน URL เสมอ
   */
  const openDownload = useCallback(
    async (documentId: string) => {
      const result = await request<{ url: string; fileName: string }>(
        `/api/acc-firm/vault/documents/${encodeURIComponent(documentId)}/download`,
        { method: "POST" },
      );
      window.open(result.url, "_blank", "noopener,noreferrer");
      return result.fileName;
    },
    [request],
  );

  /** อัปโหลด 3 สเต็ป: ขอที่อัปโหลด → ยิงไฟล์เข้า storage ตรง → บันทึกทะเบียน */
  const uploadDocument = useCallback(
    async (args: UploadArgs) => {
      const slot = await request<{ path: string; token: string }>("/api/acc-firm/vault/documents", {
        method: "POST",
        body: {
          intent: "upload-url",
          clientId: args.clientId,
          categoryId: args.categoryId,
          fiscalYear: args.fiscalYear,
          fileName: args.file.name,
          sizeBytes: args.file.size,
        },
      });

      const { error } = await supabase.storage
        .from(VAULT_BUCKET)
        .uploadToSignedUrl(slot.path, slot.token, args.file);
      if (error) throw new VaultApiError(`อัปโหลดไฟล์ไม่สำเร็จ: ${error.message}`);

      return request<{ id: string }>("/api/acc-firm/vault/documents", {
        method: "POST",
        body: {
          intent: "register",
          clientId: args.clientId,
          categoryId: args.categoryId,
          periodId: args.periodId ?? null,
          title: args.title,
          storagePath: slot.path,
          sha256: await sha256Hex(args.file),
          mimeType: args.file.type || null,
          sizeBytes: args.file.size,
          docDate: args.docDate || null,
        },
      });
    },
    [request, supabase],
  );

  // ต้อง memo — ถ้าคืน object ใหม่ทุก render ตัวที่ใส่ `api` ใน dep ของ useEffect จะยิงซ้ำไม่รู้จบ
  return useMemo(
    () => ({
      openPeriod,
      fetchChecklist,
      setChecklistStatus,
      fetchDocuments,
      fetchCustody,
      createCustody,
      openDownload,
      uploadDocument,
    }),
    [
      openPeriod,
      fetchChecklist,
      setChecklistStatus,
      fetchDocuments,
      fetchCustody,
      createCustody,
      openDownload,
      uploadDocument,
    ],
  );
}
