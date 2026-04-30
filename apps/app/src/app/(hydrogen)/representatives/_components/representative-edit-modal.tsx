"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import toast from "react-hot-toast";
import { Button, Input } from "rizzui";
import AppSelect from "@core/ui/app-select";
import { Modal } from "@core/modal-views/modal";
import { ExternalLink, Plus, Trash2, UserRound, X } from "lucide-react";

import { useConfirmDialog } from "@/app/shared/confirm-dialog/provider";

type RepresentativeRow = {
  id: string;
  rep_code: string;
  prefix: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  gender: string | null;
  id_card_no: string | null;
  status: string | null;
  photo: string | null;
  email: string | null;
};

type RepresentativeDocRow = {
  id: string;
  representative_id: string;
  doc_name: string;
  doc_type: string | null;
  drive_web_view_link: string;
  drive_file_id: string | null;
  updated_at: string;
};

const prefixOptions = [
  { label: "-", value: "" },
  { label: "นาย", value: "นาย" },
  { label: "นาง", value: "นาง" },
  { label: "นางสาว", value: "นางสาว" },
];

const genderOptions = [
  { label: "-", value: "" },
  { label: "ชาย", value: "ชาย" },
  { label: "หญิง", value: "หญิง" },
];

const statusOptions = [
  { label: "-", value: "" },
  { label: "ปกติ", value: "ปกติ" },
  { label: "พักใช้", value: "พักใช้" },
  { label: "ยกเลิกถาวร", value: "ยกเลิกถาวร" },
];

function normalizePhotoUrl(value: string | null | undefined) {
  const v = (value ?? "").trim();
  if (!v) return "";
  if (v.startsWith("//")) return `https:${v}`;
  return v;
}

function normalizeGender(value: string) {
  const v = value.trim();
  if (!v) return "";
  if (v.toLowerCase() === "male") return "ชาย";
  if (v.toLowerCase() === "female") return "หญิง";
  return v;
}

function normalizeStatus(value: string) {
  const v = value.trim();
  if (!v) return "";
  if (v === "ปกติ") return "ปกติ";
  if (v === "พักใช้") return "พักใช้";
  if (v === "ยกเลิกถาวร") return "ยกเลิกถาวร";
  if (v === "ไม่ปกติ") return "พักใช้";
  return v;
}

function isValidEmail(v: string) {
  const s = v.trim();
  if (!s) return true;
  return /^\S+@\S+\.\S+$/.test(s);
}

function isValidDriveUrl(v: string) {
  try {
    const u = new URL(v);
    return u.hostname.includes("drive.google.com") || u.hostname.includes("docs.google.com");
  } catch {
    return false;
  }
}

function extractDriveFileId(url: string) {
  try {
    const u = new URL(url);
    const idParam = u.searchParams.get("id");
    if (idParam) return idParam;
    const m = u.pathname.match(/\/file\/d\/([^/]+)/);
    if (m?.[1]) return m[1];
    return null;
  } catch {
    return null;
  }
}

export function RepresentativeEditModal({
  open,
  onClose,
  initial,
  supabase,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  initial: RepresentativeRow | null;
  supabase: any;
  onSaved: () => void;
}) {
  const confirmDialog = useConfirmDialog();

  const editingId = initial?.id ?? null;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [repCode, setRepCode] = useState("");
  const [prefix, setPrefix] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState("");
  const [idCardNo, setIdCardNo] = useState("");
  const [status, setStatus] = useState("");
  const [email, setEmail] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");

  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);

  const [docs, setDocs] = useState<RepresentativeDocRow[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);

  const [docAddOpen, setDocAddOpen] = useState(false);
  const [docName, setDocName] = useState("");
  const [docType, setDocType] = useState("");
  const [docLink, setDocLink] = useState("");

  const effectivePrefix = useMemo(() => {
    const p = prefix.trim();
    if (p) return p;
    const g = normalizeGender(gender);
    if (g === "ชาย") return "นาย";
    if (g === "หญิง") return "นางสาว";
    return "";
  }, [gender, prefix]);

  const canSave = repCode.trim().length > 0 && isValidEmail(email);

  const loadDocs = useCallback(
    async (repId: string) => {
      setDocsLoading(true);
      const { data, error: e } = await supabase
        .from("company_representative_documents")
        .select("id,representative_id,doc_name,doc_type,drive_web_view_link,drive_file_id,updated_at")
        .eq("representative_id", repId)
        .order("updated_at", { ascending: false });
      if (e) {
        setDocs([]);
        setDocsLoading(false);
        return;
      }
      setDocs((data ?? []) as RepresentativeDocRow[]);
      setDocsLoading(false);
    },
    [supabase],
  );

  const uploadPhotoFile = useCallback(
    async (file: File) => {
      if (!repCode.trim()) {
        setError("กรุณากรอกรหัสตัวแทนก่อนอัปโหลดรูป");
        return;
      }
      setUploadingPhoto(true);
      setError(null);
      const form = new FormData();
      form.set("repCode", repCode.trim());
      form.set("file", file);
      const res = await fetch("/api/representatives/import-photo", { method: "POST", body: form });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error || "อัปโหลดรูปไม่สำเร็จ");
        setUploadingPhoto(false);
        return;
      }
      const data = (await res.json()) as { publicUrl?: string };
      const publicUrl = (data.publicUrl ?? "").trim();
      if (publicUrl) setPhotoUrl(publicUrl);
      setUploadingPhoto(false);
    },
    [repCode],
  );

  useEffect(() => {
    if (!photoFile) {
      setPhotoPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(photoFile);
    setPhotoPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setLoading(false);
    setRepCode(initial?.rep_code ?? "");
    setPrefix(initial?.prefix ?? "");
    setFirstName(initial?.first_name ?? "");
    setLastName(initial?.last_name ?? "");
    setPhone(initial?.phone ?? "");
    setGender(initial?.gender ?? "");
    setIdCardNo(initial?.id_card_no ?? "");
    setStatus(normalizeStatus(initial?.status ?? ""));
    setEmail(initial?.email ?? "");
    setPhotoUrl(normalizePhotoUrl(initial?.photo));
    setPhotoFile(null);
    setDocAddOpen(false);
    setDocName("");
    setDocType("");
    setDocLink("");
    setDocs([]);
    if (initial?.id) void loadDocs(initial.id);
    window.setTimeout(() => {
      (document.getElementById("rep-edit-rep-code") as HTMLInputElement | null)?.focus?.();
    }, 50);
  }, [initial, loadDocs, open]);

  return (
    <Modal isOpen={open} onClose={onClose} size="lg" rounded="md">
      <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
        <div>
          <div className="text-base font-semibold text-gray-900">{editingId ? "แก้ไขตัวแทนบริษัท" : "เพิ่มตัวแทนบริษัท"}</div>
          <div className="mt-0.5 text-sm text-gray-600">จัดการข้อมูลตัวแทน + เอกสารแนบลิงก์ Google Drive</div>
        </div>
        <button className="rounded-md p-2 text-gray-500 hover:bg-gray-100" onClick={onClose}>
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="max-h-[75vh] overflow-auto px-5 py-4">
        {error ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 md:col-span-4">
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                if (f && f.size > 5 * 1024 * 1024) {
                  setError("ไฟล์รูปใหญ่เกิน 5MB");
                  e.currentTarget.value = "";
                  return;
                }
                setPhotoFile(f);
                if (f) void uploadPhotoFile(f).finally(() => setPhotoFile(null));
              }}
              disabled={loading || uploadingPhoto}
            />

            <button
              type="button"
              className="group relative w-full overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-b from-gray-50 to-white"
              onClick={() => photoInputRef.current?.click()}
              disabled={loading || uploadingPhoto}
            >
              <div className="relative aspect-square w-full">
                {photoPreviewUrl || photoUrl ? (
                  <Image src={photoPreviewUrl || photoUrl} alt="profile" fill unoptimized className="object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-900 text-white">
                      <UserRound className="h-7 w-7" />
                    </div>
                  </div>
                )}
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/0 to-black/0 opacity-0 transition-opacity group-hover:opacity-100" />
              <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                <div className="min-w-0 truncate text-xs font-semibold text-white">คลิกเพื่อเลือกรูป</div>
                <div className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white backdrop-blur">เปลี่ยน</div>
              </div>
              {uploadingPhoto ? (
                <div className="absolute inset-0 flex items-center justify-center bg-white/70">
                  <div className="rounded-full bg-gray-900 px-3 py-1 text-xs font-semibold text-white">กำลังอัปโหลด...</div>
                </div>
              ) : null}
            </button>

            {photoUrl ? (
              <div className="mt-3 flex items-center justify-between gap-2">
                <div className="min-w-0 truncate text-xs text-gray-500">รูปปัจจุบัน</div>
                <button
                  type="button"
                  className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                  onClick={() => setPhotoUrl("")}
                  disabled={loading || uploadingPhoto}
                >
                  ลบรูป
                </button>
              </div>
            ) : (
              <div className="mt-2 text-xs text-gray-500">รองรับ JPG/PNG • สูงสุด 5MB</div>
            )}
          </div>

          <div className="col-span-12 md:col-span-8">
            <div className="grid gap-3 md:grid-cols-2">
              <Input id="rep-edit-rep-code" label="รหัสตัวแทน" value={repCode} onChange={(e) => setRepCode(e.target.value)} disabled={loading} />

              <div>
                <AppSelect
                  label="คำนำหน้า"
                  placeholder="-"
                  options={prefixOptions}
                  value={effectivePrefix || ""}
                  onChange={(v: string) => setPrefix(v)}
                  getOptionValue={(o) => o.value}
                  displayValue={(selected) => prefixOptions.find((o) => o.value === selected)?.label ?? ""}
                  selectClassName="h-10 px-3"
                  dropdownClassName="!z-[9999]"
                  inPortal={false}
                  disabled={loading}
                />
              </div>

              <Input label="ชื่อ" value={firstName} onChange={(e) => setFirstName(e.target.value)} disabled={loading} />
              <Input label="นามสกุล" value={lastName} onChange={(e) => setLastName(e.target.value)} disabled={loading} />

              <Input label="เบอร์โทร" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" disabled={loading} />

              <div>
                <AppSelect
                  label="เพศ"
                  placeholder="-"
                  options={genderOptions}
                  value={normalizeGender(gender) || ""}
                  onChange={(v: string) => {
                    setGender(v);
                    if (!prefix.trim()) {
                      if (v === "ชาย") setPrefix("นาย");
                      if (v === "หญิง") setPrefix("นางสาว");
                    }
                  }}
                  getOptionValue={(o) => o.value}
                  displayValue={(selected) => genderOptions.find((o) => o.value === selected)?.label ?? ""}
                  selectClassName="h-10 px-3"
                  dropdownClassName="!z-[9999]"
                  inPortal={false}
                  disabled={loading}
                />
              </div>

              <Input label="เลขบัตรประชาชน" value={idCardNo} onChange={(e) => setIdCardNo(e.target.value)} inputMode="numeric" disabled={loading} />
              <Input
                label="อีเมล"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                inputMode="email"
                disabled={loading}
                error={email.trim() && !isValidEmail(email) ? "รูปแบบอีเมลไม่ถูกต้อง" : undefined}
              />

              <div className="md:col-span-2">
                <AppSelect
                  label="สถานะ"
                  placeholder="-"
                  options={statusOptions}
                  value={normalizeStatus(status) || ""}
                  onChange={(v: string) => setStatus(v)}
                  getOptionValue={(o) => o.value}
                  displayValue={(selected) => statusOptions.find((o) => o.value === selected)?.label ?? ""}
                  selectClassName="h-10 px-3"
                  dropdownClassName="!z-[9999]"
                  inPortal={false}
                  disabled={loading}
                />
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-gray-200 bg-white">
              <div className="flex items-center justify-between gap-2 border-b border-gray-200 px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-gray-900">เอกสารของตัวแทน</div>
                  <div className="mt-0.5 text-xs text-gray-600">แนบเป็นลิงก์ Google Drive</div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setDocAddOpen(true)}
                  disabled={!editingId || loading}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  เพิ่มเอกสาร
                </Button>
              </div>

              {!editingId ? (
                <div className="px-4 py-4 text-sm text-gray-600">บันทึกตัวแทนก่อน แล้วจึงเพิ่มเอกสารได้</div>
              ) : docsLoading ? (
                <div className="px-4 py-4 text-sm text-gray-600">กำลังโหลดเอกสาร...</div>
              ) : docs.length === 0 ? (
                <div className="px-4 py-4 text-sm text-gray-600">ยังไม่มีเอกสาร</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {docs.map((d) => (
                    <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                      <div className="min-w-[220px]">
                        <div className="text-sm font-medium text-gray-900">{d.doc_name}</div>
                        <div className="mt-0.5 text-xs text-gray-600">{d.doc_type || "-"}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                          onClick={() => {
                            window.open(d.drive_web_view_link, "_blank", "noopener,noreferrer");
                          }}
                          disabled={loading}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          เปิด
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                          onClick={async () => {
                            const ok = await confirmDialog({ title: "ยืนยันการลบ", message: "ต้องการลบเอกสารนี้หรือไม่?", confirmText: "ลบ", tone: "danger" });
                            if (!ok) return;
                            setLoading(true);
                            setError(null);
                            const { error: delErr } = await supabase.from("company_representative_documents").delete().eq("id", d.id);
                            if (delErr) {
                              setError(delErr.message);
                              setLoading(false);
                              return;
                            }
                            setLoading(false);
                            toast.success("ลบเอกสารแล้ว");
                            void loadDocs(editingId);
                          }}
                          disabled={loading}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          ลบ
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <Modal
          isOpen={docAddOpen}
          onClose={() => {
            setDocAddOpen(false);
            setDocName("");
            setDocType("");
            setDocLink("");
          }}
          size="md"
          rounded="md"
        >
          <div className="rounded-xl bg-white p-5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-base font-semibold text-gray-900">เพิ่มเอกสาร</div>
              <button
                type="button"
                className="rounded-md p-2 text-gray-500 hover:bg-gray-100"
                onClick={() => {
                  setDocAddOpen(false);
                  setDocName("");
                  setDocType("");
                  setDocLink("");
                }}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-3 grid gap-3">
              <Input label="ชื่อเอกสาร" value={docName} onChange={(e) => setDocName(e.target.value)} disabled={loading} />
              <Input label="ประเภทเอกสาร" value={docType} onChange={(e) => setDocType(e.target.value)} disabled={loading} />
              <Input label="Google Drive link" value={docLink} onChange={(e) => setDocLink(e.target.value)} disabled={loading} />
              <div className="text-xs text-gray-500">รองรับลิงก์จาก drive.google.com หรือ docs.google.com</div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setDocAddOpen(false);
                  setDocName("");
                  setDocType("");
                  setDocLink("");
                }}
                disabled={loading}
              >
                ยกเลิก
              </Button>
              <Button
                onClick={async () => {
                  if (!editingId) return;
                  const name = docName.trim();
                  const link = docLink.trim();
                  if (!name) {
                    setError("กรุณากรอกชื่อเอกสาร");
                    return;
                  }
                  if (!link || !isValidDriveUrl(link)) {
                    setError("กรุณากรอกลิงก์ Google Drive ให้ถูกต้อง");
                    return;
                  }
                  setLoading(true);
                  setError(null);
                  const payload = {
                    representative_id: editingId,
                    doc_name: name,
                    doc_type: docType.trim() || null,
                    drive_web_view_link: link,
                    drive_file_id: extractDriveFileId(link),
                  };
                  const { error: insErr } = await supabase.from("company_representative_documents").insert(payload);
                  if (insErr) {
                    setError(insErr.message);
                    setLoading(false);
                    return;
                  }
                  setLoading(false);
                  toast.success("เพิ่มเอกสารแล้ว");
                  setDocAddOpen(false);
                  setDocName("");
                  setDocType("");
                  setDocLink("");
                  void loadDocs(editingId);
                }}
                disabled={loading || !editingId}
              >
                เพิ่ม
              </Button>
            </div>
          </div>
        </Modal>
      </div>

      <div className="border-t border-gray-200 px-5 py-4">
        <div className="flex flex-wrap justify-end gap-2">
          {editingId ? (
            <Button
              variant="outline"
              onClick={async () => {
                const ok = await confirmDialog({ title: "ยืนยันการลบ", message: "ต้องการลบรายการนี้หรือไม่?", confirmText: "ลบ", tone: "danger" });
                if (!ok) return;
                setLoading(true);
                setError(null);
                const { error: delErr } = await supabase.from("company_representatives").delete().eq("id", editingId);
                if (delErr) {
                  setError(delErr.message);
                  setLoading(false);
                  return;
                }
                setLoading(false);
                toast.success("ลบแล้ว");
                onClose();
                onSaved();
              }}
              disabled={loading}
            >
              ลบ
            </Button>
          ) : null}
          <Button variant="outline" onClick={onClose} disabled={loading}>
            ยกเลิก
          </Button>
          <Button
            onClick={async () => {
              setLoading(true);
              setError(null);

              const payload = {
                rep_code: repCode.trim(),
                prefix: effectivePrefix || null,
                first_name: firstName.trim() || null,
                last_name: lastName.trim() || null,
                phone: phone.trim() || null,
                gender: normalizeGender(gender) || null,
                id_card_no: idCardNo.trim() || null,
                status: normalizeStatus(status) || null,
                email: email.trim() || null,
                photo: normalizePhotoUrl(photoUrl) || null,
              };

              const isMissingEmailColumnError = (message: string | null | undefined) => {
                const m = (message ?? "").toLowerCase();
                if (!m) return false;
                return (
                  m.includes("company_representatives.email") ||
                  (m.includes("column") && m.includes("email") && (m.includes("does not exist") || m.includes("could not find"))) ||
                  (m.includes("schema cache") && m.includes("email"))
                );
              };

              const { email: _omitEmail, ...payloadWithoutEmail } = payload;

              const run = (p: any) =>
                editingId
                  ? supabase.from("company_representatives").update(p).eq("id", editingId)
                  : supabase.from("company_representatives").insert(p).select("id").single();

              let res = await run(payload);
              if (res.error && isMissingEmailColumnError(res.error.message)) {
                res = await run(payloadWithoutEmail);
              }

              if (res.error) {
                setError(res.error.message);
                setLoading(false);
                return;
              }

              setLoading(false);
              toast.success(editingId ? "อัปเดตแล้ว" : "บันทึกแล้ว");
              onClose();
              onSaved();
            }}
            disabled={loading || !canSave}
          >
            {editingId ? "อัปเดต" : "บันทึก"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
