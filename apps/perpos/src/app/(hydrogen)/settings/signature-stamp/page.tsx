"use client";

import React, { useCallback, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Button, Title, Text } from "rizzui";

import { useAuth } from "@/app/shared/auth-provider";
import { useConfirmDialog } from "@/app/shared/confirm-dialog/provider";
import FileUploader from "@/components/form/file-uploader";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { withBasePath } from "@/utils/base-path";

type AssetType = "signature" | "stamp";

type UserAssetRow = {
  id: string;
  profile_id: string;
  asset_type: AssetType;
  file_name: string | null;
  created_at: string;
};

async function getSignedStorageUrl(input: {
  supabase: any;
  table: "user_assets";
  id: string;
  disposition: "inline" | "attachment";
}) {
  const sessionRes = await input.supabase.auth.getSession();
  const token = sessionRes.data.session?.access_token;
  if (!token) throw new Error("ยังไม่ได้เข้าสู่ระบบ");
  const res = await fetch(withBasePath("/api/storage/signed-url"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ table: input.table, id: input.id, disposition: input.disposition }),
  });
  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) throw new Error(data.error || "สร้างลิงก์ไม่สำเร็จ");
  return String(data.url ?? data.signedUrl ?? "");
}

async function deleteStorageDoc(input: { supabase: any; table: "user_assets"; id: string }) {
  const sessionRes = await input.supabase.auth.getSession();
  const token = sessionRes.data.session?.access_token;
  if (!token) throw new Error("ยังไม่ได้เข้าสู่ระบบ");
  const res = await fetch(withBasePath("/api/storage/delete"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ table: input.table, id: input.id }),
  });
  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) throw new Error(data.error || "ลบไม่สำเร็จ");
}

export default function SignatureStampSettingsPage() {
  const { role, userId } = useAuth();
  const confirm = useConfirmDialog();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const canManage = role === "admin" || role === "sale" || role === "operation";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [assets, setAssets] = useState<UserAssetRow[]>([]);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [stampUrl, setStampUrl] = useState<string | null>(null);
  const [signatureFiles, setSignatureFiles] = useState<File[]>([]);
  const [stampFiles, setStampFiles] = useState<File[]>([]);

  const acceptImages = useMemo(
    () => ({ "image/png": [".png"], "image/jpeg": [".jpg", ".jpeg"], "image/webp": [".webp"] }),
    [],
  );

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await supabase
        .from("user_assets")
        .select("id,profile_id,asset_type,file_name,created_at")
        .eq("profile_id", userId)
        .in("asset_type", ["signature", "stamp"]) as any;
      if (res.error) throw new Error(res.error.message);

      const rows = ((res.data ?? []) as UserAssetRow[]) ?? [];
      setAssets(rows);
      setSignatureFiles([]);
      setStampFiles([]);

      const sig = rows.find((r) => r.asset_type === "signature") ?? null;
      const st = rows.find((r) => r.asset_type === "stamp") ?? null;
      setSignatureUrl(sig?.id ? await getSignedStorageUrl({ supabase, table: "user_assets", id: sig.id, disposition: "inline" }) : null);
      setStampUrl(st?.id ? await getSignedStorageUrl({ supabase, table: "user_assets", id: st.id, disposition: "inline" }) : null);
    } catch (e: any) {
      setError(e?.message ?? "โหลดข้อมูลไม่สำเร็จ");
      setAssets([]);
      setSignatureUrl(null);
      setStampUrl(null);
    } finally {
      setLoading(false);
    }
  }, [supabase, userId]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const upload = useCallback(
    async (assetType: AssetType, file: File) => {
      if (!userId) throw new Error("ยังไม่ได้เข้าสู่ระบบ");
      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes.data.session?.access_token;
      if (!token) throw new Error("ยังไม่ได้เข้าสู่ระบบ");
      const fd = new FormData();
      fd.set("assetType", assetType);
      fd.set("file", file);
      const res = await fetch(withBasePath("/api/user-assets/upload"), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) throw new Error(data.error || "อัปโหลดไม่สำเร็จ");
      toast.success("บันทึกแล้ว");
      await refresh();
    },
    [refresh, supabase, userId],
  );

  const signatureRow = useMemo(() => assets.find((r) => r.asset_type === "signature") ?? null, [assets]);
  const stampRow = useMemo(() => assets.find((r) => r.asset_type === "stamp") ?? null, [assets]);

  if (!userId) {
    return (
      <div>
        <Title as="h1" className="text-lg font-semibold text-gray-900">ลายเซ็นและตราประทับ</Title>
        <div className="mt-3 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700">กรุณาเข้าสู่ระบบ</div>
      </div>
    );
  }

  if (!canManage) {
    return (
      <div>
        <Title as="h1" className="text-lg font-semibold text-gray-900">ลายเซ็นและตราประทับ</Title>
        <div className="mt-3 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700">บทบาทนี้ไม่มีสิทธิ์ตั้งค่า</div>
      </div>
    );
  }

  return (
    <div>
      <div>
        <Title as="h1" className="text-lg font-semibold text-gray-900">ลายเซ็นและตราประทับ</Title>
        <Text className="mt-1 text-sm text-gray-600">ใช้ในใบเสนอราคา ช่องผู้จัดทำเอกสาร</Text>
      </div>

      {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white/70 p-4 backdrop-blur">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-gray-900">ลายเซ็น</div>
              <div className="mt-0.5 text-xs text-gray-500">แนะนำพื้นหลังโปร่งใส (PNG)</div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={loading || !signatureRow?.id}
                onClick={async () => {
                  if (!signatureRow?.id) return;
                  const url = await getSignedStorageUrl({ supabase, table: "user_assets", id: signatureRow.id, disposition: "attachment" });
                  window.open(url, "_blank", "noopener,noreferrer");
                }}
              >
                ดาวน์โหลด
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={loading || !signatureRow?.id}
                onClick={async () => {
                  if (!signatureRow?.id) return;
                  const ok = await confirm({ title: "ยืนยันการลบ", message: "ต้องการลบลายเซ็นนี้หรือไม่?", confirmText: "ลบ", tone: "danger" });
                  if (!ok) return;
                  setLoading(true);
                  setError(null);
                  try {
                    await deleteStorageDoc({ supabase, table: "user_assets", id: signatureRow.id });
                    toast.success("ลบแล้ว");
                    await refresh();
                  } catch (e: any) {
                    setError(e?.message ?? "ลบไม่สำเร็จ");
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                ลบ
              </Button>
            </div>
          </div>

          <div className="mt-3">
            {signatureUrl ? (
              <div className="rounded-xl border border-gray-200 bg-white p-3">
                <img alt="signature" src={signatureUrl} className="max-h-32 w-auto" />
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-sm text-gray-600">ยังไม่มีลายเซ็น</div>
            )}
          </div>

          <div className="mt-3">
            <FileUploader
              label="อัปโหลดลายเซ็น"
              helperText="คลิกเพื่อเลือกไฟล์ หรือ ลากไฟล์มาวาง"
              accept={acceptImages}
              multiple={false}
              maxFiles={1}
              maxSizeBytes={5 * 1024 * 1024}
              disabled={loading}
              files={signatureFiles}
              onFilesChange={setSignatureFiles}
            />

            <div className="mt-3 flex justify-end">
              <Button
                onClick={async () => {
                  const f = signatureFiles[0];
                  if (!f) return;
                  setLoading(true);
                  setError(null);
                  try {
                    await upload("signature", f);
                    setSignatureFiles([]);
                  } catch (err: any) {
                    setError(err?.message ?? "อัปโหลดไม่สำเร็จ");
                  } finally {
                    setLoading(false);
                  }
                }}
                disabled={loading || signatureFiles.length === 0}
              >
                บันทึก
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white/70 p-4 backdrop-blur">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-gray-900">ตราประทับ</div>
              <div className="mt-0.5 text-xs text-gray-500">แนะนำพื้นหลังโปร่งใส (PNG)</div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={loading || !stampRow?.id}
                onClick={async () => {
                  if (!stampRow?.id) return;
                  const url = await getSignedStorageUrl({ supabase, table: "user_assets", id: stampRow.id, disposition: "attachment" });
                  window.open(url, "_blank", "noopener,noreferrer");
                }}
              >
                ดาวน์โหลด
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={loading || !stampRow?.id}
                onClick={async () => {
                  if (!stampRow?.id) return;
                  const ok = await confirm({ title: "ยืนยันการลบ", message: "ต้องการลบตราประทับนี้หรือไม่?", confirmText: "ลบ", tone: "danger" });
                  if (!ok) return;
                  setLoading(true);
                  setError(null);
                  try {
                    await deleteStorageDoc({ supabase, table: "user_assets", id: stampRow.id });
                    toast.success("ลบแล้ว");
                    await refresh();
                  } catch (e: any) {
                    setError(e?.message ?? "ลบไม่สำเร็จ");
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                ลบ
              </Button>
            </div>
          </div>

          <div className="mt-3">
            {stampUrl ? (
              <div className="rounded-xl border border-gray-200 bg-white p-3">
                <img alt="stamp" src={stampUrl} className="max-h-32 w-auto" />
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-sm text-gray-600">ยังไม่มีตราประทับ</div>
            )}
          </div>

          <div className="mt-3">
            <FileUploader
              label="อัปโหลดตราประทับ"
              helperText="คลิกเพื่อเลือกไฟล์ หรือ ลากไฟล์มาวาง"
              accept={acceptImages}
              multiple={false}
              maxFiles={1}
              maxSizeBytes={5 * 1024 * 1024}
              disabled={loading}
              files={stampFiles}
              onFilesChange={setStampFiles}
            />

            <div className="mt-3 flex justify-end">
              <Button
                onClick={async () => {
                  const f = stampFiles[0];
                  if (!f) return;
                  setLoading(true);
                  setError(null);
                  try {
                    await upload("stamp", f);
                    setStampFiles([]);
                  } catch (err: any) {
                    setError(err?.message ?? "อัปโหลดไม่สำเร็จ");
                  } finally {
                    setLoading(false);
                  }
                }}
                disabled={loading || stampFiles.length === 0}
              >
                บันทึก
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
