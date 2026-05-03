"use client";

import React from "react";
import { Button, Input, Textarea } from "rizzui";
import { Modal } from "@core/modal-views/modal";
import Image from "next/image";
import toast from "react-hot-toast";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Mode = "create" | "edit";

export function PostEditorModal(props: {
  isOpen: boolean;
  mode: Mode;
  saving: boolean;
  error: string | null;
  title: string;
  slug: string;
  description: string;
  contentHtml: string;
  imageUrl: string;
  imagePath: string;
  tags: string;
  onClose: () => void;
  onSave: () => void;
  onDelete?: () => void;
  onChangeTitle: (v: string) => void;
  onChangeSlug: (v: string) => void;
  onChangeDescription: (v: string) => void;
  onChangeContentHtml: (v: string) => void;
  onChangeImageUrl: (v: string) => void;
  onChangeImagePath: (v: string) => void;
  onChangeTags: (v: string) => void;
}) {
  const title = props.mode === "create" ? "สร้างโพสต์" : "แก้ไขโพสต์";
  const fileRef = React.useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = React.useState(false);

  const onPickFile = React.useCallback(() => {
    fileRef.current?.click();
  }, []);

  const onFileChange = React.useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (!f) return;
      const slug = String(props.slug ?? "").trim() || "post";
      const ext = (f.name.split(".").pop() || "bin").toLowerCase();
      const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now());
      const path = `posts/${slug}/${id}.${ext}`;

      setUploading(true);
      try {
        const supabase = createSupabaseBrowserClient();
        const up = await supabase.storage.from("post-images").upload(path, f, { upsert: true, contentType: f.type || undefined });
        if (up.error) {
          toast.error(up.error.message);
          setUploading(false);
          return;
        }
        const pub = supabase.storage.from("post-images").getPublicUrl(path);
        const url = pub.data.publicUrl;
        props.onChangeImagePath(path);
        props.onChangeImageUrl(url);
        toast.success("อัปโหลดรูปสำเร็จ");
      } catch (err: any) {
        toast.error(String(err?.message ?? "อัปโหลดไม่สำเร็จ"));
      } finally {
        setUploading(false);
      }
    },
    [props],
  );

  return (
    <Modal isOpen={props.isOpen} onClose={props.onClose} rounded="md" size="lg" className="z-[9999]">
      <div className="flex max-h-[80vh] flex-col overflow-hidden rounded-xl bg-white">
        <div className="flex shrink-0 items-start justify-between gap-2 border-b border-gray-200 bg-white px-5 py-4">
          <div>
            <div className="text-base font-semibold text-gray-900">{title}</div>
            <div className="mt-1 text-sm text-gray-600">กรอกข้อมูลให้ครบก่อนบันทึก</div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {props.error ? <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{props.error}</div> : null}

          <div className="grid grid-cols-1 gap-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[160px_1fr] sm:items-start">
              <div>
                <div className="text-xs font-semibold text-gray-700">รูปภาพ</div>
                <div className="mt-1 flex flex-col items-start gap-2">
                  <div className="relative h-24 w-40 overflow-hidden rounded-xl border border-gray-200 bg-gray-100">
                    {props.imageUrl ? <Image src={props.imageUrl} alt={props.title || "post"} fill sizes="160px" className="object-cover" /> : null}
                  </div>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
                  <Button size="sm" variant="outline" onClick={onPickFile} disabled={props.saving || uploading}>
                    {uploading ? "กำลังอัปโหลด..." : "อัปโหลดรูปใหม่"}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <div>
                  <div className="text-xs font-semibold text-gray-700">หัวข้อ *</div>
                  <Input
                    value={props.title}
                    onChange={(e) => props.onChangeTitle(e.target.value)}
                    placeholder="หัวข้อโพสต์"
                    disabled={props.saving || uploading}
                    size="sm"
                    inputClassName="text-sm"
                  />
                </div>
                <div>
                  <div className="text-xs font-semibold text-gray-700">Slug * (ต้องไม่ซ้ำ)</div>
                  <Input
                    value={props.slug}
                    onChange={(e) => props.onChangeSlug(e.target.value)}
                    placeholder="news-2026-05"
                    disabled={props.saving || uploading}
                    size="sm"
                    inputClassName="text-sm"
                  />
                </div>
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-gray-700">คำอธิบาย *</div>
              <Textarea
                value={props.description}
                onChange={(e) => props.onChangeDescription(e.target.value)}
                placeholder="คำอธิบายสั้น ๆ"
                disabled={props.saving || uploading}
              />
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-700">แท็ก (คั่นด้วย , )</div>
              <Input
                value={props.tags}
                onChange={(e) => props.onChangeTags(e.target.value)}
                placeholder="ข่าวสาร, ประกาศ"
                disabled={props.saving || uploading}
              />
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-700">เนื้อหา (HTML) *</div>
              <Textarea
                value={props.contentHtml}
                onChange={(e) => props.onChangeContentHtml(e.target.value)}
                placeholder="<p>...</p>"
                disabled={props.saving || uploading}
                rows={8}
              />
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-gray-200 bg-white px-5 py-4">
          <div>
            {props.mode === "edit" && props.onDelete ? (
              <Button variant="outline" color="danger" onClick={props.onDelete} disabled={props.saving || uploading}>
                ลบโพสต์
              </Button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={props.onClose} disabled={props.saving || uploading}>
              ยกเลิก
            </Button>
            <Button onClick={props.onSave} disabled={props.saving || uploading}>
              {props.saving ? "กำลังบันทึก..." : "บันทึก"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
