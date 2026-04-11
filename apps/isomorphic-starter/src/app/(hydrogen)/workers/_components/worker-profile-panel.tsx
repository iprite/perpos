"use client";

import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import dayjs from "dayjs";
import AppSelect from "@core/ui/app-select";
import { DatePicker } from "@core/ui/datepicker";
import { UserRound, UserSquare2 } from "lucide-react";

import { nationalityOptions, normalizeSexForTabs } from "./worker-edit-types";

export function WorkerProfilePanel({
  loading,
  profilePicUrl,
  onChangeProfilePicUrl,
  profilePicFile,
  onChangeProfilePicFile,
  osSex,
  onChangeOsSex,
  wpType,
  onChangeWpType,
  birthDate,
  onChangeBirthDate,
  nationality,
  onChangeNationality,
}: {
  loading: boolean;
  profilePicUrl: string;
  onChangeProfilePicUrl: (v: string) => void;
  profilePicFile: File | null;
  onChangeProfilePicFile: (v: File | null) => void;
  osSex: string;
  onChangeOsSex: (v: string) => void;
  wpType: string;
  onChangeWpType: (v: string) => void;
  birthDate: string;
  onChangeBirthDate: (v: string) => void;
  nationality: string;
  onChangeNationality: (v: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!profilePicFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(profilePicFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [profilePicFile]);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white/70 p-4 backdrop-blur">
      <div className="text-sm font-semibold text-gray-900">รูปโปรไฟล์</div>
      <div className="mt-3">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            if (f && f.size > 5 * 1024 * 1024) {
              e.currentTarget.value = "";
              return;
            }
            onChangeProfilePicFile(f);
          }}
          disabled={loading}
        />

        <button
          type="button"
          className="group relative w-full overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-b from-gray-50 to-white"
          onClick={() => inputRef.current?.click()}
          disabled={loading}
        >
          <div className="relative aspect-square w-full">
            {previewUrl || profilePicUrl ? (
              <Image src={previewUrl || profilePicUrl} alt="profile" fill unoptimized className="object-cover" />
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
        </button>

        {profilePicFile || profilePicUrl ? (
          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="min-w-0 truncate text-xs text-gray-500">{profilePicFile?.name || "รูปปัจจุบัน"}</div>
            <button
              type="button"
              className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              onClick={() => {
                onChangeProfilePicFile(null);
                onChangeProfilePicUrl("");
              }}
              disabled={loading}
            >
              ลบรูป
            </button>
          </div>
        ) : (
          <div className="mt-2 text-xs text-gray-500">รองรับ JPG/PNG • สูงสุด 5MB</div>
        )}
      </div>

      <div className="mt-4 grid gap-4">
        <div>
          <div className="mb-1 text-xs font-medium text-gray-900">เพศ</div>
          <div className="flex h-10 items-center rounded-full border border-gray-200 bg-white p-1">
            <button
              type="button"
              onClick={() => onChangeOsSex("ชาย")}
              disabled={loading}
              className={
                "inline-flex h-8 flex-1 items-center justify-center gap-2 rounded-full text-sm font-semibold transition disabled:cursor-not-allowed " +
                (normalizeSexForTabs(osSex) === "ชาย" ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-50")
              }
            >
              <UserSquare2 className="h-4 w-4" />
              ชาย
            </button>
            <button
              type="button"
              onClick={() => onChangeOsSex("หญิง")}
              disabled={loading}
              className={
                "inline-flex h-8 flex-1 items-center justify-center gap-2 rounded-full text-sm font-semibold transition disabled:cursor-not-allowed " +
                (normalizeSexForTabs(osSex) === "หญิง" ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-50")
              }
            >
              <UserRound className="h-4 w-4" />
              หญิง
            </button>
          </div>
        </div>

        <div>
          <AppSelect
            label="ประเภทแรงงาน"
            placeholder="เลือก"
            options={[
              { label: "เลือก", value: "" },
              { label: "ขึ้นทะเบียน", value: "ขึ้นทะเบียน" },
              { label: "MOU", value: "MOU" },
            ]}
            value={wpType}
            onChange={(v: string) => onChangeWpType(v)}
            getOptionValue={(o) => o.value}
            displayValue={(selected) =>
              (
                [
                  { label: "เลือก", value: "" },
                  { label: "ขึ้นทะเบียน", value: "ขึ้นทะเบียน" },
                  { label: "MOU", value: "MOU" },
                ] as Array<{ label: string; value: string }>
              ).find((o) => o.value === selected)?.label ?? ""
            }
            selectClassName="h-10 px-3"
            dropdownClassName="!z-[9999]"
            disabled={loading}
          />
        </div>

        <div>
          <AppSelect
            label="สัญชาติ"
            placeholder="เลือก"
            options={nationalityOptions}
            value={nationality}
            onChange={(v: string) => onChangeNationality(v || "เมียนมา")}
            getOptionValue={(o) => o.value}
            displayValue={(selected) => nationalityOptions.find((o) => o.value === selected)?.label ?? ""}
            selectClassName="h-10 px-3"
            dropdownClassName="!z-[9999]"
            disabled={loading}
          />
        </div>

        <DatePicker
          selected={birthDate ? dayjs(birthDate).toDate() : null}
          onChange={(date: Date | null) => onChangeBirthDate(date ? dayjs(date).format("YYYY-MM-DD") : "")}
          placeholderText="เลือกวันที่"
          disabled={loading}
          inputProps={{ label: "วันเกิด" }}
        />
      </div>
    </div>
  );
}
