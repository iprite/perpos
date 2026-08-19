"use client";

/**
 * ดูตัวอย่าง PDF ในเว็บด้วย **pdf.js ฝั่งเบราว์เซอร์**
 *
 * 🔴 ทำแบบนี้เพราะ route ไฟล์แนบตอบ `Content-Disposition: attachment` กับ PDF เสมอ
 *    (ห้าม inline pdf/html/svg — ไฟล์มาจากผู้ส่งที่เราไม่ไว้ใจ) ⇒ ฝัง `<iframe>`/`<embed>` ไม่ได้
 *    ที่นี่จึง **ดึงไฟล์มาเป็นไบต์แล้ววาดลง `<canvas>` เอง** — เบราว์เซอร์ไม่ได้เปิดไฟล์นั้นเป็นเอกสาร
 *    ⇒ ข้อห้ามเดิมยังอยู่ครบ **ห้ามแก้ route ให้ inline PDF เพื่อความสะดวก**
 *
 * 🔴 ห้ามเปิด `enableScripting` — PDF รัน JavaScript ของตัวเองได้ตามสเปก
 *    (pdf.js ปิดไว้เป็นค่าเริ่มต้น แต่ถ้าใครเผลอเปิด = เท่ากับรันสคริปต์ของคนส่งเมล)
 *
 * โหลดแบบ dynamic import — pdf.js หนักเกือบ 1MB ห้ามติดไปกับ bundle ของหน้าเมล
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/typography";
import { useMailT } from "@/components/mail/mail-locale";

/** ใหญ่กว่านี้ไม่วาดให้ — เรนเดอร์ในเบราว์เซอร์จะหน่วงจนเหมือนแอปค้าง (ดาวน์โหลดไปเปิดเร็วกว่า) */
export const PDF_PREVIEW_MAX_BYTES = 15 * 1024 * 1024;

interface PdfRenderTask {
  promise: Promise<void>;
  cancel: () => void;
}

interface PdfPage {
  getViewport: (o: { scale: number }) => { width: number; height: number };
  render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => PdfRenderTask;
}

interface PdfDoc {
  numPages: number;
  getPage: (n: number) => Promise<PdfPage>;
  destroy: () => Promise<void>;
}

export function MailPdfPreview({
  url,
  label,
  onFail,
}: {
  url: string;
  /** ชื่อไฟล์ — ใช้เป็นชื่อให้ screen reader อ่าน (canvas เปล่า ๆ ไม่มีอะไรให้อ่านเลย) */
  label: string;
  onFail: () => void;
}) {
  const t = useMailT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const docRef = useRef<PdfDoc | null>(null);
  /** งานวาดที่ค้างอยู่ — ต้องยกเลิกก่อนเริ่มงานใหม่ (pdf.js ห้ามวาดซ้อนบน canvas เดียวกัน) */
  const taskRef = useRef<PdfRenderTask | null>(null);
  const [pages, setPages] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  /**
   * `onFail` มาจาก JSX ของ parent ⇒ identity เปลี่ยนทุก re-render
   * ถ้าเอาไปใส่ deps ของ effect โหลดไฟล์ **poller ของรายการ (30 วิ) จะทำให้โหลด PDF ใหม่ทั้งไฟล์**
   * และเด้งกลับหน้า 1 — เก็บใน ref แทน แล้ว deps เหลือ `url` อย่างเดียว
   */
  const onFailRef = useRef(onFail);
  useEffect(() => {
    onFailRef.current = onFail;
  }, [onFail]);

  useEffect(() => {
    let alive = true;
    let doc: PdfDoc | null = null;
    // ปิดกล่องแล้วต้องหยุดโหลด — ไฟล์ 15MB ไม่ควรวิ่งต่อให้คอมโพเนนต์ที่ไม่มีอยู่แล้ว
    const abort = new AbortController();
    setLoading(true);
    setPages(0);
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        // worker ถูก bundle เป็น asset โดย webpack — ไม่ยิงออกอินเทอร์เน็ต (CSP ของแอปไม่ยอมอยู่แล้ว)
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();

        const res = await fetch(url, { credentials: "same-origin", signal: abort.signal });
        if (!res.ok) throw new Error("โหลดไฟล์ไม่สำเร็จ");
        const data = await res.arrayBuffer();
        if (!alive) return;

        // ❌ ห้ามใส่ enableScripting — ดูหมายเหตุด้านบน (pdf.js v5 ไม่รัน JS ของ PDF เป็นค่าเริ่มต้น)
        doc = (await pdfjs.getDocument({ data }).promise) as unknown as PdfDoc;
        if (!alive) {
          void doc.destroy();
          return;
        }
        docRef.current = doc;
        setPages(doc.numPages);
        setPage(1);
      } catch (e) {
        // ยกเลิกเองไม่ใช่ความล้มเหลว — ห้ามเด้งไปโหมด "ดูตัวอย่างไม่ได้"
        if (alive && !(e instanceof DOMException && e.name === "AbortError")) {
          onFailRef.current();
        }
      }
    })();
    return () => {
      alive = false;
      abort.abort();
      // ยกเลิกงานวาดก่อนทำลายเอกสาร ไม่งั้น promise ที่ค้างจะ reject ลอย ๆ (unhandled rejection)
      taskRef.current?.cancel();
      taskRef.current = null;
      void docRef.current?.destroy();
      docRef.current = null;
    };
  }, [url]);

  const renderPage = useCallback(async (n: number) => {
    const doc = docRef.current;
    const canvas = canvasRef.current;
    if (!doc || !canvas) return;
    // งานเก่ายังวาดอยู่ = ยกเลิกก่อน (กด "หน้าถัดไป" รัว ๆ ไม่งั้น pdf.js โยน error แล้วหน้าว่าง)
    taskRef.current?.cancel();
    taskRef.current = null;
    setLoading(true);
    try {
      const p = await doc.getPage(n);
      if (docRef.current !== doc) return;
      // กว้างตามกรอบจริง × devicePixelRatio (ไม่งั้นตัวหนังสือแตกบนจอ retina)
      const base = p.getViewport({ scale: 1 });
      const targetWidth = canvas.parentElement?.clientWidth ?? base.width;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = p.getViewport({ scale: (targetWidth / base.width) * ratio });
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = "100%";
      canvas.style.height = "auto";
      const task = p.render({ canvasContext: ctx, viewport });
      taskRef.current = task;
      await task.promise;
      if (taskRef.current === task) taskRef.current = null;
    } catch {
      /* ยกเลิก/เอกสารถูกทำลายระหว่างวาด = ไม่ใช่ error ที่ผู้ใช้ต้องรู้ (จะมีงานใหม่มาแทนอยู่แล้ว) */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (pages > 0) void renderPage(page);
  }, [page, pages, renderPage]);

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
        {loading && <Skeleton className="h-[60vh] w-full" />}
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={pages > 1 ? t("preview.pdf.pageLabel", { label, page, pages }) : label}
          className={loading ? "hidden" : "block w-full"}
        />
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label={t("preview.pdf.prev")}
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Text className="text-sm tabular-nums text-gray-600">
            {page} / {pages}
          </Text>
          <Button
            variant="outline"
            size="icon"
            aria-label={t("preview.pdf.next")}
            disabled={page >= pages}
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
