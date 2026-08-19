"use client";

/**
 * กล่องดูตัวอย่างไฟล์แนบ — ใช้ร่วมกันระหว่างรายการเมล (ชิป) กับบานอ่าน
 *
 * 🔴 **แสดง inline ได้เฉพาะรูปใน allowlist** (`INLINE_IMAGE_TYPES`)
 *    route ไฟล์แนบตอบ `Content-Disposition: attachment` กับทุกชนิดที่เหลือโดยเจตนา
 *    (ห้าม inline svg/html/pdf — ไฟล์มาจากคนส่งที่เราไม่ไว้ใจ) ⇒ ชนิดอื่นจึงมีแต่ปุ่มดาวน์โหลด
 *    **ห้ามแก้ให้ iframe ไฟล์ที่ไม่ได้อยู่ใน allowlist เพื่อให้ "ดูตัวอย่างได้"**
 */

import { useEffect, useState } from "react";
import Image from "next/image";
import { Download, FileQuestion } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Text } from "@/components/ui/typography";
import { useMailT } from "@/components/mail/mail-locale";
import { MailPdfPreview, PDF_PREVIEW_MAX_BYTES } from "@/components/mail/mail-pdf-preview";
import { INLINE_IMAGE_TYPES } from "@/lib/mail/jmap";
import { formatMailSize } from "@/lib/mail/format";
import type { MailAttachment } from "@/lib/mail/types";

/** URL ของ route ไฟล์แนบ — `download=1` บังคับให้เบราว์เซอร์เซฟแทนเปิด */
export function mailAttachmentUrl(a: MailAttachment, download: boolean): string {
  const params = new URLSearchParams({ name: a.name, type: a.type });
  if (download) params.set("download", "1");
  return `/api/mail/attachments/${encodeURIComponent(a.blobId)}?${params.toString()}`;
}

export function MailAttachmentPreview({
  attachment,
  onClose,
}: {
  attachment: MailAttachment | null;
  onClose: () => void;
}) {
  const t = useMailT();
  /** เรนเดอร์ PDF ไม่สำเร็จ (ไฟล์เพี้ยน/ฟอนต์แปลก) = ตกไปโหมดดาวน์โหลดอย่างเดียว ไม่ค้างจอเปล่า */
  const [pdfFailed, setPdfFailed] = useState(false);
  useEffect(() => setPdfFailed(false), [attachment?.blobId]);

  const isImage =
    !!attachment && (INLINE_IMAGE_TYPES as readonly string[]).includes(attachment.type);
  const isPdf =
    !!attachment &&
    attachment.type === "application/pdf" &&
    attachment.sizeBytes <= PDF_PREVIEW_MAX_BYTES &&
    !pdfFailed;
  const canPreview = isImage || isPdf;

  return (
    <Dialog open={!!attachment} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="3xl">
        <DialogHeader>
          <DialogTitle className="truncate">{attachment?.name}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {attachment && isPdf && (
            <MailPdfPreview
              url={mailAttachmentUrl(attachment, false)}
              label={attachment.name}
              onFail={() => setPdfFailed(true)}
            />
          )}
          {attachment && isImage && (
            <Image
              src={mailAttachmentUrl(attachment, false)}
              alt={attachment.name}
              width={1600}
              height={1200}
              unoptimized
              className="h-auto w-full rounded-lg object-contain"
            />
          )}
          {attachment && !canPreview && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="mb-4 rounded-full bg-gray-100 p-4">
                <FileQuestion className="h-8 w-8 text-gray-400" />
              </div>
              <Text className="text-sm font-medium text-gray-900">
                {t("preview.unsupported.title")}
              </Text>
              <Text className="mt-1 max-w-sm text-sm text-gray-500">
                {t("preview.unsupported.desc", {
                  type: attachment.type || t("preview.unknownType"),
                  size: formatMailSize(attachment.sizeBytes),
                })}
              </Text>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.close")}
          </Button>
          {attachment && (
            <Button asChild>
              <a href={mailAttachmentUrl(attachment, true)} download={attachment.name}>
                <Download className="h-4 w-4" />
                {t("preview.download")}
              </a>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
