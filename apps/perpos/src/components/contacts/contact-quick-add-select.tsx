"use client";

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronsUpDown, Plus, Search } from "lucide-react";
import { toast } from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { upsertContactAction } from "@/lib/contacts/actions";
import cn from "@core/utils/class-names";

export type ContactOption = { value: string; label: string };

type Props = {
  value: string;
  onChange: (value: string) => void;
  initialOptions: ContactOption[];
  organizationId: string | null;
  contactType: "customer" | "vendor";
  placeholder?: string;
  disabled?: boolean;
  hasError?: boolean;
  className?: string;
};

const EMPTY_FORM = { name: "", taxId: "", phone: "", email: "", address: "" };

export function ContactQuickAddSelect({
  value, onChange, initialOptions, organizationId, contactType,
  placeholder = "เลือก...", disabled, hasError, className,
}: Props) {
  const [options, setOptions]   = useState<ContactOption[]>(initialOptions);
  const [open, setOpen]         = useState(false);
  const [rect, setRect]         = useState<DOMRect | null>(null);
  const [search, setSearch]     = useState("");
  const triggerRef              = useRef<HTMLButtonElement>(null);
  const panelRef                = useRef<HTMLDivElement>(null);
  const searchRef               = useRef<HTMLInputElement>(null);

  const [dialogOpen, setDialogOpen]   = useState(false);
  const [form, setForm]               = useState(EMPTY_FORM);
  const [pending, startTransition]    = useTransition();

  const typeLabel = contactType === "customer" ? "ลูกค้า" : "ผู้ขาย";

  useLayoutEffect(() => {
    if (open && triggerRef.current) setRect(triggerRef.current.getBoundingClientRect());
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 30);
  }, [open]);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!triggerRef.current?.contains(t) && !panelRef.current?.contains(t)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    return () => window.removeEventListener("scroll", close, true);
  }, [open]);

  const selected = options.find((o) => o.value === value);
  const filtered = search
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  const openQuickAdd = () => {
    setOpen(false);
    setSearch("");
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const save = () => {
    if (!form.name.trim()) { toast.error("กรุณากรอกชื่อ"); return; }
    if (!organizationId)   { toast.error("ไม่พบองค์กร");   return; }
    startTransition(async () => {
      const res = await upsertContactAction({
        organizationId,
        name:        form.name,
        contactType,
        taxId:   form.taxId   || undefined,
        email:   form.email   || undefined,
        phone:   form.phone   || undefined,
        address: form.address || undefined,
      });
      if (!res.ok) { toast.error(res.error); return; }
      const newOpt: ContactOption = { value: res.id, label: form.name.trim() };
      setOptions((prev) =>
        [...prev, newOpt].sort((a, b) => a.label.localeCompare(b.label, "th"))
      );
      onChange(res.id);
      setDialogOpen(false);
      toast.success(`เพิ่ม${typeLabel}แล้ว`);
    });
  };

  const panel =
    open && rect
      ? createPortal(
          <div
            ref={panelRef}
            style={{ position: "fixed", top: rect.bottom + 4, left: rect.left, width: rect.width, zIndex: 9999 }}
            className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
          >
            <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-1.5">
              <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ค้นหา..."
                className="w-full border-0 bg-transparent py-1 text-sm text-slate-700 placeholder-slate-400 outline-none ring-0 focus:outline-none focus-visible:outline-none focus:ring-0"
              />
            </div>
            <div className="max-h-52 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <div className="px-4 py-3 text-sm text-slate-400">ไม่พบรายการ</div>
              ) : filtered.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { onChange(opt.value); setOpen(false); setSearch(""); }}
                  className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                >
                  <span className="truncate">{opt.label}</span>
                  {opt.value === value && <Check className="ml-2 h-4 w-4 shrink-0 text-slate-600" />}
                </button>
              ))}
            </div>
            <div className="border-t border-slate-100">
              <button
                type="button"
                onClick={openQuickAdd}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-medium text-blue-600 hover:bg-blue-50"
              >
                <Plus className="h-4 w-4" />
                เพิ่ม{typeLabel}ใหม่
              </button>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <div className={cn("relative", className)}>
        <button
          ref={triggerRef}
          type="button"
          disabled={disabled}
          onClick={() => { setSearch(""); setOpen((v) => !v); }}
          className={cn(
            "inline-flex h-9 w-full items-center justify-between rounded-md border bg-white px-3 text-sm focus:outline-none disabled:opacity-60",
            hasError ? "border-red-300" : "border-slate-200",
            !disabled && "hover:bg-slate-50",
            selected ? "text-slate-800" : "text-slate-400"
          )}
        >
          <span className="truncate">{selected?.label ?? placeholder}</span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 text-slate-400" />
        </button>
        {panel}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>เพิ่ม{typeLabel}ใหม่</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label>
                ชื่อ{typeLabel} <span className="text-red-500">*</span>
              </Label>
              <Input
                autoFocus
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && save()}
                placeholder={contactType === "customer" ? "ชื่อลูกค้า / บริษัท" : "ชื่อผู้ขาย / บริษัท"}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>เลขประจำตัวผู้เสียภาษี</Label>
              <Input
                value={form.taxId}
                onChange={(e) => setForm((f) => ({ ...f, taxId: e.target.value }))}
                placeholder="0000000000000"
                maxLength={13}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>โทรศัพท์</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="0812345678"
                />
              </div>
              <div className="grid gap-1.5">
                <Label>อีเมล</Label>
                <Input
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="email@example.com"
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>ที่อยู่</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="(ไม่บังคับ)"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={pending}>
              ยกเลิก
            </Button>
            <Button onClick={save} disabled={pending || !form.name.trim()}>
              {pending ? "กำลังบันทึก..." : `บันทึก${typeLabel}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
