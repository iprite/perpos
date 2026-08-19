"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import cn from "@core/utils/class-names";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;
const DialogPortal = DialogPrimitive.Portal;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/40",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

/**
 * Popup standard — ดู DESIGN.md §"Dialog / Popup Standard"
 *
 * โครงสร้างบังคับ: DialogContent > DialogHeader + DialogBody + DialogFooter
 * - DialogContent เป็น flex column สูงสุด 85vh, overflow ซ่อน
 * - มีแต่ DialogBody ที่ scroll → header/footer pinned (sticky) อัตโนมัติ
 * - ความกว้างเลือกผ่าน prop `size` เท่านั้น (อย่าใส่ max-w ดิบ)
 */
type DialogSize = "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "full";

const sizeClass: Record<DialogSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-2xl",
  "2xl": "max-w-3xl",
  "3xl": "max-w-4xl",
  full: "max-w-[95vw]",
};

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    size?: DialogSize;
    /**
     * ซ่อนปุ่มปิดมุมขวาบนที่ dialog ใส่ให้เอง — ใช้เมื่อ dialog มีแถบเครื่องมือของตัวเอง
     * ที่มีปุ่มปิดอยู่แล้ว (เช่น กล่องเขียนเมลเต็มจอบนมือถือ) ไม่งั้นจะมีปุ่มปิดซ้อนกันสองอัน
     * **ห้ามใช้เพื่อ "เอาปุ่มปิดออก"** — ทุก dialog ต้องมีทางปิดที่มองเห็นเสมอ
     */
    hideClose?: boolean;
  }
>(({ className, children, size = "lg", hideClose, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 flex max-h-[85vh] w-[calc(100vw-2rem)] translate-x-[-50%] translate-y-[-50%] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl outline-none sm:w-full",
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        sizeClass[size],
        className,
      )}
      {...props}
    >
      {children}
      {!hideClose && (
        <DialogClose className="absolute right-4 top-4 z-10 rounded-md p-0.5 text-gray-400 opacity-80 ring-offset-white transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
          <X className="h-4 w-4" />
          <span className="sr-only">ปิด</span>
        </DialogClose>
      )}
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

/** Header — pinned บนสุด, มีเส้นคั่นใต้, เว้นที่ขวาให้ปุ่มปิด */
function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex shrink-0 flex-col gap-1 border-b border-gray-100 px-5 py-4 pr-12",
        className,
      )}
      {...props}
    />
  );
}
DialogHeader.displayName = "DialogHeader";

/**
 * Body — ส่วนเดียวที่ scroll ได้
 *
 * `fixedHeight` = ล็อกความสูงไว้คงที่ (ไม่ยืด-หดตามเนื้อหา) — **บังคับใช้กับ dialog ที่มีแท็บ**
 * ไม่งั้นกล่องจะเด้งสูง-เตี้ยทุกครั้งที่สลับแท็บ ปุ่มในแถบล่างขยับหนีมือผู้ใช้
 *   true      → min(60vh, 32rem) — ค่ากลางที่พอดีกับฟอร์มส่วนใหญ่
 *   "sm"|"lg" → min(48vh, 24rem) / min(70vh, 40rem)
 */
const DialogBody = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { fixedHeight?: boolean | "sm" | "lg" }
>(function DialogBody({ className, fixedHeight, ...props }, ref) {
  // หมายเหตุ: ต้อง **ไม่ใส่ `flex-1`** เมื่อล็อกความสูง — flex-basis:0 ของ flex-1 ชนะ height
  // ทำให้ h-[...] ไม่มีผล (กับดักที่เคยเจอ) · ปล่อย shrink ปกติไว้ เพื่อให้ยังย่อได้บนจอเตี้ย
  const locked =
    fixedHeight === "sm"
      ? "h-[min(48vh,24rem)]"
      : fixedHeight === "lg"
        ? "h-[min(70vh,40rem)]"
        : fixedHeight
          ? "h-[min(60vh,32rem)]"
          : "flex-1";
  return (
    <div
      ref={ref}
      className={cn("min-h-0 overflow-y-auto px-5 py-4", locked, className)}
      {...props}
    />
  );
});
DialogBody.displayName = "DialogBody";

/** Footer — pinned ล่างสุด, มีเส้นคั่นบน, ปุ่มชิดขวา (ปุ่ม destructive ใส่ className="mr-auto") */
function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-end gap-2 border-t border-gray-100 px-5 py-3",
        className,
      )}
      {...props}
    />
  );
}
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold text-gray-900", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-gray-500", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
