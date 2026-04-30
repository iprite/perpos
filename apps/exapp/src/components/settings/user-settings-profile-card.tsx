import React, { useRef } from "react";
import { Button, Input } from "rizzui";

export default function ProfileEditCard({
  loading,
  email,
  avatarUrl,
  displayNameDraft,
  onDisplayNameDraftChange,
  onCancel,
  onSave,
  onUploadAvatar,
}: {
  loading: boolean;
  email: string | null;
  avatarUrl: string | null;
  displayNameDraft: string;
  onDisplayNameDraftChange: (v: string) => void;
  onCancel: () => void;
  onSave: () => void;
  onUploadAvatar: (f: File) => void;
}) {
  const initial = (email ?? "U").trim().charAt(0).toUpperCase();
  const fileRef = useRef<HTMLInputElement | null>(null);
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="text-base font-semibold text-gray-900">แก้ไขโปรไฟล์</div>
      <div className="mt-4 flex flex-col gap-5 md:flex-row md:items-center">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 overflow-hidden rounded-full bg-gray-100 ring-1 ring-gray-200">
            {avatarUrl ? (
              <img src={avatarUrl} alt="รูปโปรไฟล์" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-gray-700">
                {initial}
              </div>
            )}
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-900">รูปโปรไฟล์</div>
            <div className="mt-1 text-xs text-gray-600">รองรับ jpg/png/webp (ไม่เกิน 5MB)</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              e.target.value = "";
              if (!f) return;
              onUploadAvatar(f);
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => {
              fileRef.current?.click();
            }}
          >
            อัปโหลดรูป
          </Button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Input
          label="ชื่อแสดงผล"
          value={displayNameDraft}
          onChange={(e) => onDisplayNameDraftChange(e.target.value)}
          placeholder="เช่น คุณเอ็กซ์"
        />
      </div>

      <div className="mt-5 flex items-center justify-end gap-2">
        <Button variant="outline" disabled={loading} onClick={onCancel}>
          ยกเลิก
        </Button>
        <Button disabled={loading} onClick={onSave}>
          บันทึก
        </Button>
      </div>
    </div>
  );
}
