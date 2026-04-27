"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";

import type { WorkerDocumentRow, WorkerRow } from "./worker-edit-types";

export function useWorkerEditForm({
  open,
  initial,
  supabase,
  userId,
  onSaved,
  onClose,
}: {
  open: boolean;
  initial: WorkerRow | null;
  supabase: any;
  userId: string | null;
  onSaved: () => void;
  onClose: () => void;
}) {
  const editingId = initial?.id ?? null;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [workerId, setWorkerId] = useState("");
  const [fullName, setFullName] = useState("");
  const [customerId, setCustomerId] = useState<string>("");
  const [passportNo, setPassportNo] = useState("");
  const [passportType, setPassportType] = useState("");
  const [passportExpireDate, setPassportExpireDate] = useState("");
  const [nationality, setNationality] = useState<string>("เมียนมา");
  const [birthDate, setBirthDate] = useState("");
  const [osSex, setOsSex] = useState("");
  const [profilePicUrl, setProfilePicUrl] = useState("");
  const [profilePicFile, setProfilePicFile] = useState<File | null>(null);
  const [visaExpDate, setVisaExpDate] = useState("");
  const [wpNumber, setWpNumber] = useState("");
  const [wpExpireDate, setWpExpireDate] = useState("");
  const [wpType, setWpType] = useState("");

  const [docRows, setDocRows] = useState<WorkerDocumentRow[]>([]);
  const [docAddOpen, setDocAddOpen] = useState(false);
  const [docType, setDocType] = useState("");
  const [docExpiryDate, setDocExpiryDate] = useState("");
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docViewerOpen, setDocViewerOpen] = useState(false);
  const [docViewerId, setDocViewerId] = useState<string | null>(null);
  const [docViewerTitle, setDocViewerTitle] = useState<string | null>(null);

  const nameInputRef = useRef<HTMLInputElement | null>(null);

  const reset = useCallback(() => {
    setLoading(false);
    setError(null);
    setWorkerId("");
    setFullName("");
    setCustomerId("");
    setPassportNo("");
    setPassportType("");
    setPassportExpireDate("");
    setNationality("เมียนมา");
    setBirthDate("");
    setOsSex("");
    setProfilePicUrl("");
    setProfilePicFile(null);
    setVisaExpDate("");
    setWpNumber("");
    setWpExpireDate("");
    setWpType("");
    setDocRows([]);
    setDocAddOpen(false);
    setDocType("");
    setDocExpiryDate("");
    setDocFile(null);
    setDocViewerOpen(false);
    setDocViewerId(null);
    setDocViewerTitle(null);
  }, []);

  const refreshDocs = useCallback(
    async (workerId: string) => {
      try {
        const { data, error: e } = await supabase
          .from("worker_documents")
          .select("id,doc_type,expiry_date,storage_provider,storage_bucket,storage_path,file_name,created_at")
          .eq("worker_id", workerId)
          .order("created_at", { ascending: false });
        if (e) return;
        setDocRows((data ?? []) as WorkerDocumentRow[]);
      } catch {
        return;
      }
    },
    [supabase],
  );

  const closeAndReset = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setLoading(false);

    if (initial) {
      setWorkerId(initial.worker_id ?? "");
      setFullName(initial.full_name ?? "");
      setCustomerId(initial.customer_id ?? "");
      setPassportNo(initial.passport_no ?? "");
      setPassportType(initial.passport_type ?? "");
      setPassportExpireDate(initial.passport_expire_date ?? "");
      setNationality(initial.nationality ?? "");
      setBirthDate(initial.birth_date ?? "");
      setOsSex(initial.os_sex ?? "");
      setProfilePicUrl(initial.profile_pic_url ?? "");
      setProfilePicFile(null);
      setVisaExpDate(initial.visa_exp_date ?? "");
      setWpNumber(initial.wp_number ?? "");
      setWpExpireDate(initial.wp_expire_date ?? "");
      setWpType(initial.wp_type ?? "");
      setDocAddOpen(false);
      setDocType("");
      setDocExpiryDate("");
      setDocFile(null);
      setDocViewerOpen(false);
      setDocViewerId(null);
      setDocViewerTitle(null);
      void refreshDocs(initial.id);
    } else {
      reset();
    }

    window.setTimeout(() => {
      nameInputRef.current?.focus?.();
    }, 50);
  }, [initial, open, refreshDocs, reset]);

  const canSave = fullName.trim().length > 0;

  const submitWorker = useCallback(
    async (mode: "edit" | "add") => {
      setLoading(true);
      setError(null);
      if (!userId) {
        setError("กรุณาเข้าสู่ระบบใหม่");
        setLoading(false);
        return;
      }

      const payload = {
        worker_id: workerId.trim() || null,
        full_name: fullName.trim(),
        customer_id: customerId || null,
        passport_no: passportNo.trim() || null,
        passport_type: passportType.trim() || null,
        passport_expire_date: passportExpireDate || null,
        nationality: nationality.trim() || null,
        birth_date: birthDate || null,
        os_sex: osSex.trim() || null,
        visa_exp_date: visaExpDate || null,
        wp_number: wpNumber.trim() || null,
        wp_expire_date: wpExpireDate || null,
        wp_type: wpType.trim() || null,
      };

      const uploadForWorker = async (workerId: string) => {
        if (!profilePicFile) return profilePicUrl.trim() || null;
        const bucket = "worker_profile_pics";
        const ext = (profilePicFile.name.split(".").pop() || "jpg").toLowerCase();
        const path = `workers/${workerId}/profile.${ext}`;
        const { error: upErr } = await supabase.storage.from(bucket).upload(path, profilePicFile, {
          upsert: true,
          contentType: profilePicFile.type || undefined,
        });
        if (upErr) throw new Error(upErr.message);
        const { data } = supabase.storage.from(bucket).getPublicUrl(path);
        return data.publicUrl;
      };

      try {
        if (mode === "edit") {
          if (!editingId) throw new Error("ไม่พบรายการที่ต้องแก้ไข");
          const nextUrl = await uploadForWorker(editingId);
          const { error: e } = await supabase.from("workers").update({ ...payload, profile_pic_url: nextUrl }).eq("id", editingId);
          if (e) throw new Error(e.message);
        } else {
          const { data: created, error: insErr } = await supabase
            .from("workers")
            .insert({ ...payload, created_by_profile_id: userId })
            .select("id")
            .single();
          if (insErr) throw new Error(insErr.message);
          const newId = String((created as any)?.id);
          const nextUrl = await uploadForWorker(newId);
          if (nextUrl) {
            const { error: updErr } = await supabase.from("workers").update({ profile_pic_url: nextUrl }).eq("id", newId);
            if (updErr) throw new Error(updErr.message);
          }
        }
      } catch (err: any) {
        const msg = String(err?.message ?? "");
        if (msg.includes("idx_workers_worker_id_unique") || msg.toLowerCase().includes("duplicate key value violates unique constraint")) {
          setError("เลขประจำตัวแรงงานซ้ำในระบบ กรุณาตรวจสอบและลองใหม่");
        } else {
          setError(msg || "บันทึกไม่สำเร็จ");
        }
        setLoading(false);
        return;
      }

      toast.success(mode === "edit" ? "อัปเดตแล้ว" : "บันทึกแล้ว");
      setLoading(false);
      onSaved();
      closeAndReset();
    },
    [
      birthDate,
      closeAndReset,
      customerId,
      editingId,
      fullName,
      passportType,
      nationality,
      onSaved,
      osSex,
      passportExpireDate,
      passportNo,
      profilePicFile,
      profilePicUrl,
      supabase,
      userId,
      visaExpDate,
      workerId,
      wpExpireDate,
      wpNumber,
      wpType,
    ],
  );

  return {
    editingId,
    loading,
    setLoading,
    error,
    setError,
    closeAndReset,
    submitWorker,
    canSave,
    nameInputRef,
    workerId,
    setWorkerId,
    fullName,
    setFullName,
    customerId,
    setCustomerId,
    passportNo,
    setPassportNo,
    passportType,
    setPassportType,
    passportExpireDate,
    setPassportExpireDate,
    nationality,
    setNationality,
    birthDate,
    setBirthDate,
    osSex,
    setOsSex,
    profilePicUrl,
    setProfilePicUrl,
    profilePicFile,
    setProfilePicFile,
    visaExpDate,
    setVisaExpDate,
    wpNumber,
    setWpNumber,
    wpExpireDate,
    setWpExpireDate,
    wpType,
    setWpType,
    docRows,
    refreshDocs,
    docAddOpen,
    setDocAddOpen,
    docType,
    setDocType,
    docExpiryDate,
    setDocExpiryDate,
    docFile,
    setDocFile,
    docViewerOpen,
    setDocViewerOpen,
    docViewerId,
    setDocViewerId,
    docViewerTitle,
    setDocViewerTitle,
  };
}
