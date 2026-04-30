"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useDropzone, type Accept } from "react-dropzone";
import prettyBytes from "pretty-bytes";
import { FileText, Image as ImageIcon, Trash2, UploadCloud } from "lucide-react";
import cn from "@core/utils/class-names";

type FileUploaderProps = {
  label?: string;
  helperText?: string;
  hintText?: string;
  accept?: Accept;
  multiple?: boolean;
  maxFiles?: number;
  maxSizeBytes?: number;
  disabled?: boolean;
  files: File[];
  onFilesChange: (next: File[]) => void;
  className?: string;
};

function fileKey(file: File) {
  return `${file.name}_${file.size}_${file.lastModified}`;
}

function isImageFile(file: File) {
  return file.type.startsWith("image/");
}

export default function FileUploader({
  label = "แนบไฟล์/รูป",
  helperText = "คลิกเพื่อเลือกไฟล์ หรือ ลากไฟล์มาวาง",
  hintText,
  accept,
  multiple = true,
  maxFiles,
  maxSizeBytes,
  disabled = false,
  files,
  onFilesChange,
  className,
}: FileUploaderProps) {
  const [error, setError] = useState<string | null>(null);
  const urlByKeyRef = useRef<Map<string, string>>(new Map());

  const onDrop = useCallback(
    (accepted: File[]) => {
      setError(null);
      if (!accepted.length) return;
      if (!multiple) {
        onFilesChange([accepted[0]]);
        return;
      }

      const next = [...files];
      const seen = new Set(next.map(fileKey));
      for (const f of accepted) {
        const k = fileKey(f);
        if (seen.has(k)) continue;
        next.push(f);
        seen.add(k);
      }
      if (typeof maxFiles === "number" && maxFiles > 0 && next.length > maxFiles) {
        onFilesChange(next.slice(0, maxFiles));
        return;
      }
      onFilesChange(next);
    },
    [files, maxFiles, multiple, onFilesChange]
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    onDropRejected: (rejections) => {
      const first = rejections[0];
      const firstError = first?.errors?.[0];
      setError(firstError?.message ?? "ไม่สามารถแนบไฟล์นี้ได้");
    },
    accept,
    multiple,
    maxFiles,
    maxSize: maxSizeBytes,
    disabled,
    noKeyboard: true,
    noClick: true,
  });

  const items = useMemo(() => {
    const urlByKey = urlByKeyRef.current;
    const nextKeys = new Set(files.map(fileKey));
    for (const [k, url] of Array.from(urlByKey.entries())) {
      if (nextKeys.has(k)) continue;
      URL.revokeObjectURL(url);
      urlByKey.delete(k);
    }
    const out = files.map((file) => {
      const k = fileKey(file);
      const img = isImageFile(file);
      if (img && !urlByKey.has(k)) {
        urlByKey.set(k, URL.createObjectURL(file));
      }
      return {
        key: k,
        file,
        isImage: img,
        previewUrl: img ? urlByKey.get(k) ?? null : null,
      };
    });
    return out;
  }, [files]);

  useEffect(() => {
    const map = urlByKeyRef.current;
    return () => {
      for (const url of Array.from(map.values())) URL.revokeObjectURL(url);
      map.clear();
    };
  }, []);

  const showHead = Boolean(label) || Boolean(hintText);

  return (
    <div className={cn("uploader", className)}>
      {showHead ? (
        <div className="uploader__head">
          {label ? <div className="uploader__label">{label}</div> : <div />}
          {hintText ? <div className="uploader__hint">{hintText}</div> : null}
        </div>
      ) : null}

      <div
        {...getRootProps({
          className: cn("uploader__drop", isDragActive && "dragover", disabled && "is-disabled"),
          onClick: () => open(),
        })}
      >
        <input {...getInputProps()} />
        <div className="uploader__icon">
          <UploadCloud className="h-6 w-6" />
        </div>
        <div className="uploader__title">{helperText}</div>
        <div className="uploader__sub">
          {maxSizeBytes ? `ขนาดไม่เกิน ${prettyBytes(maxSizeBytes)} ต่อไฟล์` : "รองรับภาพ/เอกสาร"}
          {typeof maxFiles === "number" && maxFiles > 0 ? ` • สูงสุด ${maxFiles} ไฟล์` : ""}
        </div>
        <button
          type="button"
          className="uploader__btn"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            open();
          }}
          disabled={disabled}
        >
          เลือกไฟล์
        </button>
      </div>

      {error ? <div className="uploader__error">{error}</div> : null}

      {items.length ? (
        <ul className="uploader__list">
          {items.map((it, idx) => (
            <li key={it.key} className="uploader__item">
              <div className="uploader__thumb">
                {it.isImage && it.previewUrl ? (
                  <Image alt={it.file.name} src={it.previewUrl} width={56} height={56} unoptimized className="uploader__thumb-img" />
                ) : (
                  <div className="uploader__thumb-icon">
                    {it.isImage ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                  </div>
                )}
              </div>
              <div className="uploader__meta">
                <div className="uploader__name" title={it.file.name}>
                  {it.file.name}
                </div>
                <div className="uploader__size">{prettyBytes(it.file.size)}</div>
              </div>
              <button
                type="button"
                className="uploader__remove"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const next = files.filter((_, i) => i !== idx);
                  onFilesChange(next);
                }}
                disabled={disabled}
                aria-label="ลบไฟล์"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
