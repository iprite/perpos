"use client";

/**
 * FileDropzone — ช่องรับไฟล์ที่ "ลากมาวาง" หรือคลิกเลือกก็ได้
 *
 * ใช้แทน `<Input type="file">` ทุกที่ (native "Choose File" ของเบราว์เซอร์
 * ไม่อยู่ในพาเลตต์ แถมภาษาไม่ตรงกับ UI ไทย)
 *
 * <FileDropzone value={file} onChange={setFile} accept="application/pdf,image/*" maxSizeMb={50} />
 */

import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { FileUp, X } from "lucide-react";
import cn from "@core/utils/class-names";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/typography";

type BaseProps = {
  /** ค่าเดียวกับ attribute accept ของ input (เช่น "application/pdf,image/*") */
  accept?: string;
  /** เพดานขนาดไฟล์ต่อไฟล์ (MB) — เกินแล้วไม่รับ พร้อมบอกเหตุผล */
  maxSizeMb?: number;
  /** ข้อความบรรทัดล่าง เช่น "รองรับ PDF / รูปภาพ" */
  hint?: string;
  /** ข้อความหลัก (default "ลากไฟล์มาวาง หรือคลิกเพื่อเลือก") */
  label?: string;
  /** ไอคอนแทนค่า default (เช่น `<FileAudio />` ของหน้าแกะเสียง) */
  icon?: ReactNode;
  disabled?: boolean;
  className?: string;
  id?: string;
  /**
   * ช่องทางให้ปุ่มที่อยู่นอกกล่องเปิดหน้าต่างเลือกไฟล์ได้
   * (เช่น CTA ใน empty state) — component จะยัดฟังก์ชัน open() ให้เอง
   */
  openRef?: MutableRefObject<(() => void) | null>;
};

export type FileDropzoneProps = BaseProps &
  (
    | {
        /** โหมดไฟล์เดียว (controlled) — มีการ์ดไฟล์ + ปุ่มเอาออกให้ในตัว */
        multiple?: false;
        value: File | null;
        onChange: (file: File | null) => void;
        onFiles?: never;
      }
    | {
        /** โหมดหลายไฟล์ — ส่งไฟล์ที่ผ่านด่านออกไปให้ผู้เรียกจัดการรายการเอง */
        multiple: true;
        onFiles: (files: File[]) => void;
        value?: never;
        onChange?: never;
      }
  );

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

export function FileDropzone(props: FileDropzoneProps) {
  const { accept, maxSizeMb, hint, label, icon, disabled, className, id, openRef } = props;
  const multiple = props.multiple === true;
  const value = multiple ? null : props.value;

  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (!openRef) return;
    openRef.current = () => inputRef.current?.click();
    return () => {
      openRef.current = null;
    };
  }, [openRef]);

  const [error, setError] = useState<string | null>(null);

  /** กรองไฟล์ที่ผ่านด่าน + ตั้งข้อความบอกเหตุผลของตัวที่ไม่ผ่าน */
  function take(list: FileList | null | undefined) {
    const incoming = Array.from(list ?? []);
    if (incoming.length === 0) return;

    const passed: File[] = [];
    let reason: string | null = null;

    for (const file of incoming) {
      if (!matchesAccept(file, accept)) {
        reason = `"${file.name}" เป็นชนิดไฟล์ที่ไม่รองรับ`;
        continue;
      }
      if (maxSizeMb && file.size > maxSizeMb * 1024 * 1024) {
        reason = `"${file.name}" ใหญ่เกิน ${maxSizeMb} MB`;
        continue;
      }
      passed.push(file);
      if (!multiple) break;
    }

    setError(passed.length > 0 && !multiple ? null : reason);
    if (passed.length === 0) return;

    if (multiple) props.onFiles(passed);
    else props.onChange(passed[0]);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    take(e.dataTransfer.files);
  }

  function clear() {
    setError(null);
    if (!multiple) props.onChange(null);
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
        <span className={cn("mb-2 block", dragOver ? "text-primary" : "text-gray-400")}>
          {icon ?? <FileUp className="h-8 w-8" />}
        </span>
        <p className="text-sm font-medium text-gray-700">
          {dragOver ? "วางไฟล์ที่นี่" : (label ?? "ลากไฟล์มาวาง หรือคลิกเพื่อเลือก")}
        </p>
        {hint ? <Text className="mt-1 text-xs text-gray-500">{hint}</Text> : null}
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept={accept}
          multiple={multiple}
          className="hidden"
          disabled={disabled}
          onChange={(e) => {
            take(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {error ? <Text className="mt-1 text-xs text-red-600">{error}</Text> : null}
    </div>
  );
}
