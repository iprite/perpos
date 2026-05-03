"use client";

import React, { useEffect, useState } from "react";
import { Button } from "rizzui";
import { Modal } from "@core/modal-views/modal";
import { withBasePath } from "@/utils/base-path";

function isPdfUrl(url: string) {
  const u = url.toLowerCase();
  return u.includes(".pdf") || u.includes("application/pdf");
}

async function getSignedStorageUrl(input: { supabase: any; table: "order_documents"; id: string; disposition: "inline" | "attachment" }) {
  const sessionRes = await input.supabase.auth.getSession();
  const token = sessionRes.data.session?.access_token;
  if (!token) throw new Error("ยังไม่ได้เข้าสู่ระบบ");
  const res = await fetch(withBasePath("/api/storage/signed-url"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ table: input.table, id: input.id, disposition: input.disposition }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "ขอ signed url ไม่สำเร็จ");
  }
  const data = (await res.json()) as { ok: true; url: string };
  return data.url;
}

export function WorkerOrderDocViewerModal({
  open,
  onClose,
  loading,
  supabase,
  docId,
  title,
}: {
  open: boolean;
  onClose: () => void;
  loading: boolean;
  supabase: any;
  docId: string | null;
  title: string | null;
}) {
  const [fetching, setFetching] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (!docId) return;
    setError(null);
    setUrl(null);
    setFetching(true);
    Promise.resolve()
      .then(async () => {
        const signed = await getSignedStorageUrl({ supabase, table: "order_documents", id: docId, disposition: "inline" });
        setUrl(signed);
      })
      .catch((e: any) => {
        setError(e?.message ?? "เปิดไฟล์ไม่สำเร็จ");
      })
      .finally(() => {
        setFetching(false);
      });
  }, [docId, open, supabase]);

  return (
    <Modal isOpen={open} onClose={onClose} size="lg" rounded="md">
      <div className="rounded-xl bg-white p-5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 truncate text-base font-semibold text-gray-900">{title ?? "เอกสาร"}</div>
          <div className="flex shrink-0 gap-2">
            <Button
              variant="outline"
              onClick={async () => {
                if (!docId) return;
                setError(null);
                try {
                  const signed = await getSignedStorageUrl({ supabase, table: "order_documents", id: docId, disposition: "attachment" });
                  window.open(signed, "_blank", "noopener,noreferrer");
                } catch (e: any) {
                  setError(e?.message ?? "ดาวน์โหลดไม่สำเร็จ");
                }
              }}
              disabled={loading || fetching || !docId}
            >
              ดาวน์โหลด
            </Button>
            <Button variant="outline" onClick={onClose} disabled={loading || fetching}>
              ปิด
            </Button>
          </div>
        </div>

        {error ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

        <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
          {url ? (
            isPdfUrl(url) ? (
              <iframe src={url} className="h-[70vh] w-full" />
            ) : (
              <img src={url} alt={title ?? "document"} className="h-[70vh] w-full object-contain" />
            )
          ) : fetching ? (
            <div className="p-6 text-sm text-gray-600">กำลังโหลด...</div>
          ) : (
            <div className="p-6 text-sm text-gray-600">ไม่พบไฟล์</div>
          )}
        </div>
      </div>
    </Modal>
  );
}
