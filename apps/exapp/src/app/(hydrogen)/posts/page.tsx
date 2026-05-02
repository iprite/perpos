"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Title, Text } from "rizzui/typography";
import { useAuth } from "@/app/shared/auth-provider";
import { useConfirmDialog } from "@/app/shared/confirm-dialog/provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { PostEditorModal } from "@/components/posts/post-editor-modal";
import { PostsListCard, type PostRow } from "@/components/posts/posts-list-card";

type Mode = "create" | "edit";

function safeArr(v: any): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((x) => String(x ?? "").trim()).filter(Boolean);
  return [];
}

function parseTags(input: string): string[] {
  return input
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

export default function PostsPage() {
  const { role, userId } = useAuth();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const confirm = useConfirmDialog();
  const topRef = useRef<HTMLDivElement | null>(null);

  const canUsePage = role === "admin" || role === "sale";

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<PostRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formSlug, setFormSlug] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formContentHtml, setFormContentHtml] = useState("");
  const [formImageUrl, setFormImageUrl] = useState("");
  const [formImagePath, setFormImagePath] = useState("");
  const [formTags, setFormTags] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    const res = await supabase
      .from("posts")
      .select("id,title,slug,description,content_html,image_url,image_path,tags,created_at,updated_at")
      .order("updated_at", { ascending: false })
      .limit(500);
    if (res.error) {
      setError(res.error.message);
      setRows([]);
      setLoading(false);
      return;
    }
    const data = (res.data ?? []) as any[];
    setRows(
      data.map((r) => ({
        id: String(r.id),
        title: String(r.title ?? ""),
        slug: String(r.slug ?? ""),
        description: String(r.description ?? ""),
        content_html: String(r.content_html ?? ""),
        image_url: r.image_url ? String(r.image_url) : null,
        image_path: r.image_path ? String(r.image_path) : null,
        tags: safeArr(r.tags),
        created_at: String(r.created_at ?? ""),
        updated_at: String(r.updated_at ?? ""),
      })),
    );
    setLoading(false);
  }, [supabase, userId]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setMode("create");
    setEditingId(null);
    setFormTitle("");
    setFormSlug("");
    setFormDescription("");
    setFormContentHtml("");
    setFormImageUrl("");
    setFormImagePath("");
    setFormTags("");
    setSaving(false);
    setFormError(null);
  }, []);

  const openCreate = useCallback(() => {
    setMode("create");
    setEditingId(null);
    setFormTitle("");
    setFormSlug("");
    setFormDescription("");
    setFormContentHtml("");
    setFormImageUrl("");
    setFormImagePath("");
    setFormTags("");
    setFormError(null);
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((row: PostRow) => {
    setMode("edit");
    setEditingId(row.id);
    setFormTitle(row.title ?? "");
    setFormSlug(row.slug ?? "");
    setFormDescription(row.description ?? "");
    setFormContentHtml(row.content_html ?? "");
    setFormImageUrl(row.image_url ?? "");
    setFormImagePath(row.image_path ?? "");
    setFormTags((row.tags ?? []).join(", "));
    setFormError(null);
    setModalOpen(true);
  }, []);

  const save = useCallback(async () => {
    const title = formTitle.trim();
    const slug = formSlug.trim();
    const description = formDescription.trim();
    const contentHtml = formContentHtml.trim();
    const imageUrl = formImageUrl.trim() || null;
    const imagePath = formImagePath.trim() || null;
    const tags = parseTags(formTags);

    if (!title) {
      setFormError("กรุณากรอกหัวข้อ");
      return;
    }
    if (!slug) {
      setFormError("กรุณากรอก slug");
      return;
    }
    if (!description) {
      setFormError("กรุณากรอกคำอธิบาย");
      return;
    }
    if (!contentHtml) {
      setFormError("กรุณากรอกเนื้อหา (HTML)");
      return;
    }

    setSaving(true);
    setFormError(null);
    const now = new Date().toISOString();

    if (mode === "create") {
      const res = await supabase
        .from("posts")
        .insert({ title, slug, description, content_html: contentHtml, image_url: imageUrl, image_path: imagePath, tags, created_at: now, updated_at: now })
        .select("id")
        .single();
      if (res.error) {
        setFormError(res.error.message);
        setSaving(false);
        return;
      }
      toast.success("สร้างโพสต์สำเร็จ");
      closeModal();
      await refresh();
      topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    const id = String(editingId ?? "").trim();
    if (!id) {
      setFormError("ไม่พบข้อมูลโพสต์");
      setSaving(false);
      return;
    }
    const res = await supabase
      .from("posts")
      .update({ title, slug, description, content_html: contentHtml, image_url: imageUrl, image_path: imagePath, tags, updated_at: now })
      .eq("id", id);
    if (res.error) {
      setFormError(res.error.message);
      setSaving(false);
      return;
    }
    toast.success("บันทึกการแก้ไขสำเร็จ");
    closeModal();
    await refresh();
    setSaving(false);
  }, [closeModal, editingId, formContentHtml, formDescription, formImagePath, formImageUrl, formSlug, formTags, formTitle, mode, refresh, supabase]);

  const remove = useCallback(
    async (row: PostRow) => {
      const ok = await confirm({
        title: "ยืนยันการลบโพสต์",
        message: (
          <div>
            ต้องการลบ “{row.title}” ใช่หรือไม่
            <div className="mt-1 text-xs text-gray-500">การลบไม่สามารถย้อนกลับได้</div>
          </div>
        ),
        confirmText: "ลบ",
        cancelText: "ยกเลิก",
        tone: "danger",
      });
      if (!ok) return;
      const res = await supabase.from("posts").delete().eq("id", row.id);
      if (res.error) {
        toast.error(res.error.message);
        return;
      }
      toast.success("ลบโพสต์แล้ว");
      await refresh();
    },
    [confirm, refresh, supabase],
  );

  const removeEditing = useCallback(async () => {
    const id = String(editingId ?? "").trim();
    if (!id) return;
    const title = formTitle.trim() || "โพสต์";
    await remove({ id, title, slug: "", description: "", content_html: "", image_url: null, image_path: null, tags: [], created_at: "", updated_at: "" });
    closeModal();
  }, [closeModal, editingId, formTitle, remove]);

  if (!canUsePage) {
    return (
      <div>
        <Title as="h1" className="text-lg font-semibold text-gray-900">
          โพสต์
        </Title>
        <div className="mt-3 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700">หน้านี้สำหรับทีมงานเท่านั้น</div>
      </div>
    );
  }

  return (
    <div ref={topRef}>
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <Title as="h1" className="text-lg font-semibold text-gray-900">
            โพสต์
          </Title>
          <Text className="mt-1 text-sm text-gray-600">จัดการรายการโพสต์ (สร้าง/แก้ไข/ลบ)</Text>
        </div>
      </div>

      {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <PostsListCard
        rows={rows}
        loading={loading}
        search={search}
        onChangeSearch={setSearch}
        onCreate={openCreate}
        onEdit={openEdit}
      />

      <PostEditorModal
        isOpen={modalOpen}
        mode={mode}
        saving={saving}
        error={formError}
        title={formTitle}
        slug={formSlug}
        description={formDescription}
        contentHtml={formContentHtml}
        imageUrl={formImageUrl}
        imagePath={formImagePath}
        tags={formTags}
        onClose={closeModal}
        onSave={save}
        onDelete={mode === "edit" ? removeEditing : undefined}
        onChangeTitle={setFormTitle}
        onChangeSlug={setFormSlug}
        onChangeDescription={setFormDescription}
        onChangeContentHtml={setFormContentHtml}
        onChangeImageUrl={setFormImageUrl}
        onChangeImagePath={setFormImagePath}
        onChangeTags={setFormTags}
      />
    </div>
  );
}
