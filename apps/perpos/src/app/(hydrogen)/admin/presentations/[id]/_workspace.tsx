"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  History,
  ExternalLink,
  Trash2,
  RotateCcw,
  ArrowLeft,
  Settings2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import { StatusBadge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { PageShell } from "@/components/ui/page-shell";
import { notify } from "@/lib/toast";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { DeckDetail, DeckVersion } from "@/lib/admin/presentations";

const SOURCE_LABEL: Record<DeckVersion["source"], string> = {
  manual: "แก้เอง",
  factory: "Factory",
  ai_edit: "AI",
  revert: "ย้อนกลับ",
};

export function DeckWorkspace({ initialDeck }: { initialDeck: DeckDetail }) {
  const router = useRouter();
  const [deck, setDeck] = useState<DeckDetail>(initialDeck);
  const [prompt, setPrompt] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [metaOpen, setMetaOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [meta, setMeta] = useState({
    title: deck.title,
    description: deck.description ?? "",
    audience: deck.audience ?? "",
  });

  async function authToken() {
    const { data } = await createSupabaseBrowserClient().auth.getSession();
    return data.session?.access_token ?? "";
  }

  async function api(path: string, init: RequestInit) {
    const res = await fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${await authToken()}`,
        ...(init.headers ?? {}),
      },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "ทำรายการไม่สำเร็จ");
    return json;
  }

  // แก้ทั้ง deck ด้วย AI
  async function handleEdit() {
    if (!prompt.trim()) return notify.error("พิมพ์คำสั่งแก้ไขก่อน");
    setEditing(true);
    try {
      const { deck: updated } = await api(`/api/admin/presentations/${deck.id}/edit`, {
        method: "POST",
        body: JSON.stringify({ prompt }),
      });
      setDeck(updated);
      setPrompt("");
      notify.success(`แก้แล้ว — เวอร์ชัน ${updated.version}`);
    } catch (e) {
      notify.error(e);
    } finally {
      setEditing(false);
    }
  }

  async function patch(body: Record<string, unknown>, okMsg: string) {
    setBusy(true);
    try {
      const { deck: updated } = await api(`/api/admin/presentations/${deck.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setDeck(updated);
      notify.success(okMsg);
      return true;
    } catch (e) {
      notify.error(e);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleRevert(version: number) {
    await patch({ revertToVersion: version }, `ย้อนกลับไป v${version} แล้ว`);
  }

  async function toggleStatus() {
    const next = deck.status === "published" ? "draft" : "published";
    await patch({ status: next }, next === "published" ? "เผยแพร่แล้ว" : "เปลี่ยนเป็นฉบับร่าง");
  }

  async function saveMeta() {
    const ok = await patch(meta, "บันทึกข้อมูลแล้ว");
    if (ok) setMetaOpen(false);
  }

  async function handleDelete() {
    setBusy(true);
    try {
      await api(`/api/admin/presentations/${deck.id}`, { method: "DELETE" });
      notify.deleted("ลบ deck แล้ว");
      router.push("/admin/presentations");
    } catch (e) {
      notify.error(e);
      setBusy(false);
    }
  }

  function openInNewTab() {
    const blob = new Blob([deck.html], { type: "text/html" });
    window.open(URL.createObjectURL(blob), "_blank", "noopener");
  }

  return (
    <PageShell
      title={deck.title}
      description={deck.description ?? undefined}
      width="full"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={deck.status === "published" ? "success" : "neutral"}>
            {deck.status === "published" ? "เผยแพร่" : "ฉบับร่าง"}
          </StatusBadge>
          <Button variant="outline" size="sm" onClick={openInNewTab}>
            <ExternalLink className="mr-1.5 h-4 w-4" />
            เปิดเต็มจอ
          </Button>
          <Button variant="outline" size="sm" onClick={() => setMetaOpen(true)}>
            <Settings2 className="mr-1.5 h-4 w-4" />
            ตั้งค่า
          </Button>
        </div>
      }
    >
      <div className="mb-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/admin/presentations")}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          กลับคลังสื่อ
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* พรีวิว */}
        <div className="min-w-0 lg:col-span-8">
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
              <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
                พรีวิว · เวอร์ชัน {deck.version}
              </span>
            </div>
            {deck.html.trim() ? (
              <iframe
                key={deck.version}
                title="deck-preview"
                srcDoc={deck.html}
                sandbox="allow-scripts allow-popups allow-same-origin"
                className="h-[72vh] w-full border-0 bg-white"
              />
            ) : (
              <div className="flex h-[72vh] flex-col items-center justify-center text-center text-sm text-gray-500">
                <Sparkles className="mb-2 h-6 w-6 text-gray-400" />
                deck ยังไม่มีเนื้อหา — ใช้ AI สร้างจากคำสั่งด้านขวา
              </div>
            )}
          </div>
        </div>

        {/* แผง AI + ประวัติ */}
        <div className="min-w-0 space-y-4 lg:col-span-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-900">
              <Sparkles className="h-4 w-4 text-primary" />
              แก้ด้วย AI
            </div>
            <p className="mb-2 text-xs text-gray-500">
              พิมพ์สิ่งที่อยากเปลี่ยน — AI จะแก้ทั้งชุดแล้วบันทึกเป็นเวอร์ชันใหม่
            </p>
            <textarea
              className="h-32 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="เช่น เปลี่ยนสีหัวข้อเป็นเข้มขึ้น, เพิ่มสไลด์สรุปราคา, ย่อข้อความให้กระชับ…"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={editing}
            />
            <Button className="mt-2 w-full" onClick={handleEdit} disabled={editing}>
              {editing ? "AI กำลังแก้…" : "ส่งให้ AI แก้"}
            </Button>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-900">
              <History className="h-4 w-4 text-gray-500" />
              ประวัติเวอร์ชัน
            </div>
            <ul className="space-y-2">
              {deck.versions.map((v) => (
                <li
                  key={v.id}
                  className="flex items-start justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">v{v.version}</span>
                      <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] text-gray-600">
                        {SOURCE_LABEL[v.source]}
                      </span>
                      {v.version === deck.version && (
                        <span className="text-[10px] font-medium text-primary">ปัจจุบัน</span>
                      )}
                    </div>
                    {v.note && (
                      <p className="mt-0.5 truncate text-xs text-gray-500" title={v.note}>
                        {v.note}
                      </p>
                    )}
                  </div>
                  {v.version !== deck.version && (
                    <button
                      onClick={() => handleRevert(v.version)}
                      disabled={busy}
                      className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-50"
                    >
                      <RotateCcw className="h-3 w-3" />
                      ย้อน
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* ตั้งค่า / meta + status + delete */}
      <Dialog open={metaOpen} onOpenChange={setMetaOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>ตั้งค่า deck</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-4">
              <div>
                <Label htmlFor="m-title">ชื่อ deck</Label>
                <Input
                  id="m-title"
                  className="mt-1"
                  value={meta.title}
                  onChange={(e) => setMeta((m) => ({ ...m, title: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="m-desc">คำอธิบาย</Label>
                <Input
                  id="m-desc"
                  className="mt-1"
                  value={meta.description}
                  onChange={(e) => setMeta((m) => ({ ...m, description: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="m-aud">กลุ่มเป้าหมาย</Label>
                <Input
                  id="m-aud"
                  className="mt-1"
                  value={meta.audience}
                  onChange={(e) => setMeta((m) => ({ ...m, audience: e.target.value }))}
                />
              </div>
              <div>
                <Label>สถานะ</Label>
                <div className="mt-1">
                  <CustomSelect
                    value={deck.status}
                    onChange={() => toggleStatus()}
                    options={[
                      { value: "draft", label: "ฉบับร่าง" },
                      { value: "published", label: "เผยแพร่" },
                    ]}
                  />
                </div>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="destructive"
              className="mr-auto"
              onClick={() => setConfirmDel(true)}
              disabled={busy}
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              ลบ deck
            </Button>
            <Button variant="outline" onClick={() => setMetaOpen(false)} disabled={busy}>
              ปิด
            </Button>
            <Button onClick={saveMeta} disabled={busy}>
              {busy ? "กำลังบันทึก…" : "บันทึก"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ยืนยันลบ */}
      <Dialog open={confirmDel} onOpenChange={setConfirmDel}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>ลบ deck นี้?</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm text-gray-600">
              จะลบ “{deck.title}” พร้อมประวัติเวอร์ชันทั้งหมด — ยกเลิกไม่ได้
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDel(false)} disabled={busy}>
              ยกเลิก
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={busy}>
              {busy ? "กำลังลบ…" : "ลบถาวร"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
