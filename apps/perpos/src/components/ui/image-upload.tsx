"use client";

// ImageUpload — อัปโหลดรูป PNG → คืนค่าเป็น data URL (เก็บใน state/DB)
// ครอบ native <input type="file"> (file-picker primitive ที่ไม่มีใน @/components/ui) ไว้ใน component เดียว
// ใช้กับ: โลโก้บริษัท, ลายเซนผู้มีอำนาจลงนาม ฯลฯ
//
// <ImageUpload value={logo} onChange={setLogo} label="อัปโหลดโลโก้" previewClassName="h-16 w-16" />

import { useRef } from "react";
import { Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import cn from "@core/utils/class-names";

export function ImageUpload({
  value,
  onChange,
  label = "อัปโหลด PNG",
  accept = "image/png",
  className,
  previewClassName = "h-16 w-16",
}: {
  value?: string | null;
  onChange: (dataUrl: string | null) => void;
  label?: string;
  accept?: string;
  className?: string;
  previewClassName?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(file?: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onChange(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  }

  return (
    <div className={cn("flex items-center gap-3", className)}>
      {/* native file picker — primitive เดียวที่ไม่มีใน @/components/ui, ครอบไว้ใน component นี้ (ไม่ใช่ raw-input violation) */}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {value ? (
        <div
          className={cn(
            "shrink-0 overflow-hidden rounded-md border border-gray-200 bg-white",
            previewClassName,
          )}
        >
          {/* data URL preview — next/image ไม่รองรับ data URL อัปโหลด (warning ยอมรับได้ ไม่ทำ build ล้ม) */}
          <img src={value} alt="ตัวอย่างรูป" className="h-full w-full object-contain" />
        </div>
      ) : (
        <div
          className={cn(
            "flex shrink-0 items-center justify-center rounded-md border border-dashed border-gray-300 bg-gray-50 text-gray-400",
            previewClassName,
          )}
        >
          <Upload className="h-5 w-5" />
        </div>
      )}
      <div className="flex flex-col items-start gap-1">
        <Button type="button" size="sm" variant="outline" onClick={() => inputRef.current?.click()}>
          <Upload className="mr-1.5 h-4 w-4" />
          {value ? "เปลี่ยนรูป" : label}
        </Button>
        {value && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-red-600 hover:text-red-700"
            onClick={() => onChange(null)}
          >
            <X className="mr-1 h-3.5 w-3.5" /> ลบรูป
          </Button>
        )}
      </div>
    </div>
  );
}
