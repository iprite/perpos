"use client";

/**
 * FileDropzone — ช่องรับไฟล์ที่ "ลากมาวาง" หรือคลิกเลือกก็ได้
 *
 * ใช้แทน `<Input type="file">` ทุกที่ (native "Choose File" ของเบราว์เซอร์
 * ไม่อยู่ในพาเลตต์ แถมภาษาไม่ตรงกับ UI ไทย)
 *
 * <FileDropzone value={file} onChange={setFile} accept="application/pdf,image/*" maxSizeMb={50} />
 */

import { useRef, useState, type DragEvent } from "react";
import { FileUp, X } from "lucide-react";
import cn from "@core/utils/class-names";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/typography";

export type FileDropzoneProps = {
  value: File | null;
  onChange: (file: File | null) => void;
  /** ค่าเดียวกับ attribute accept ของ input (เช่น "application/pdf,image/*") */
  accept?: string;
  /** เพดานขนาดไฟล์ (MB) — เกินแล้วไม่รับ พร้อมบอกเหตุผล */
  maxSizeMb?: number;
  /** ข้อความบรรทัดล่าง เช่น "รองรับ PDF / รูปภาพ" */
  hint?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** ไฟล์ที่ลากมาตรงกับ accept ไหม (รองรับทั้ง "image/*" และ ".pdf") */
function matchesAccept(file: File, accept?: string): boolean {
  if (!accept) return true;
  return accept.split(",").some((raw) => {
    const rule = raw.trim().toLowerCase();
    if (!rule) return false;
    if (rule.endsWith("/*")) return file.type.toLowerCase().startsWith(rule.slice(0, -1));
    if (rule.startsWith(".")) return file.name.toLowerCase().endsWith(rule);
    return file.type.toLowerCase() === rule;
  });
}

export function FileDropzone({
  value,
  onChange,
  accept,
  maxSizeMb,
  hint,
  disabled,
  className,
  id,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function accept1(file: File | undefined) {
    if (!file) return;
    if (!matchesAccept(file, accept)) {
      setError("ชนิดไฟล์นี้ไม่รองรับ");
      return;
    }
    if (maxSizeMb && file.size > maxSizeMb * 1024 * 1024) {
      setError(`ไฟล์ใหญ่เกิน ${maxSizeMb} MB`);
      return;
    }
    setError(null);
    onChange(file);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    accept1(e.dataTransfer.files?.[0]);
  }

  function clear() {
    setError(null);
    onChange(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  // มีไฟล์แล้ว → แสดงการ์ดไฟล์พร้อมปุ่มเอาออก (ไม่ต้องโชว์พื้นที่ลากอีก)
  if (value) {
    return (
      <div
        className={cn(
          "mt-1 flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3",
          className,
        )}
      >
        <FileUp className="h-5 w-5 shrink-0 text-gray-400" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-gray-900">{value.name}</p>
          <Text className="text-xs text-gray-500">{formatBytes(value.size)}</Text>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={clear}
          disabled={disabled}
          aria-label="เอาไฟล์ออก"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("mt-1", className)}>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        className={cn(
          "flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors",
          disabled
            ? "cursor-not-allowed border-gray-200 bg-gray-50 opacity-60"
            : "cursor-pointer hover:border-gray-400 hover:bg-gray-50",
          dragOver ? "border-primary bg-gray-50" : "border-gray-300",
        )}
      >
        <FileUp className={cn("mb-2 h-8 w-8", dragOver ? "text-primary" : "text-gray-400")} />
        <p className="text-sm font-medium text-gray-700">
          {dragOver ? "วางไฟล์ที่นี่" : "ลากไฟล์มาวาง หรือคลิกเพื่อเลือก"}
        </p>
        {hint ? <Text className="mt-1 text-xs text-gray-500">{hint}</Text> : null}
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept={accept}
          className="hidden"
          disabled={disabled}
          onChange={(e) => {
            accept1(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      {error ? <Text className="mt-1 text-xs text-red-600">{error}</Text> : null}
    </div>
  );
}
