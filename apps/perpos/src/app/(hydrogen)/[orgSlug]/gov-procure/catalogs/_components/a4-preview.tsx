"use client";

// a4-preview.tsx — พรีวิวเอกสารก่อนดาวน์โหลด (เนื้อหาจริงของไฟล์)
//
// โหลด **HTML ตัวเดียวกับที่ส่งเข้า pdf-renderer** จาก
//   GET /api/gov-procure/catalogs/[id]/pdf?...&format=html
// แล้วแสดงใน `<iframe srcDoc>` — ต้อง fetch เองพร้อม Bearer token (iframe ไม่แนบ token ให้ `src`)
//
// sandbox="" = **ไม่ให้สิทธิ์อะไรเลย** (ไม่มี allow-scripts/allow-same-origin) — เอกสารเป็น static
// HTML อยู่แล้ว และเนื้อหามีข้อความจาก AI/ผู้ใช้ ถึงจะ escape มาแล้วก็กันไว้อีกชั้น
//
// เนื้อหาที่เห็น = ของจริง (หัวจดหมาย รายการ รูป ลายน้ำ) · ต่างจาก PDF ที่ดาวน์โหลดเฉพาะ
// การแบ่งหน้า/จัดฟอนต์ ซึ่ง Chromium ฝั่ง renderer เป็นคนจัด

import { useEffect, useState } from "react";
import { Text } from "@/components/ui/typography";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { fmtNum } from "./format";

/** ขนาดกระดาษ A4 ที่ 96dpi — ต้องเรนเดอร์ที่ความกว้างนี้ ไม่งั้นคอลัมน์ที่เป็น % เพี้ยน */
const A4_WIDTH_PX = 794;
const A4_HEIGHT_PX = 1123;
/** ความกว้างที่แสดงในกล่อง dialog */
const PREVIEW_WIDTH_PX = 420;
const previewScale = PREVIEW_WIDTH_PX / A4_WIDTH_PX;

type LoadState = "loading" | "ready" | "error";

export function A4Preview({
  catalogId,
  orgId,
  template,
  showPrices,
  notVerifiedCount,
  /** ชุดยังไม่มีรายการ → endpoint ตอบ 400 จึงไม่ยิงเลย */
  hasItems,
}: {
  catalogId: string;
  orgId: string;
  template: "table" | "narrative";
  showPrices: boolean;
  notVerifiedCount: number;
  hasItems: boolean;
}) {
  const [state, setState] = useState<LoadState>("loading");
  const [html, setHtml] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!hasItems) {
      setState("error");
      setError("ชุดนี้ยังไม่มีรายการสินค้า จึงยังสร้างเอกสารไม่ได้");
      return;
    }

    let alive = true;
    setState("loading");
    setError("");

    const qs = new URLSearchParams({
      orgId,
      template,
      prices: showPrices ? "1" : "0",
      format: "html",
    });

    (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) throw new Error("กรุณาเข้าสู่ระบบใหม่");

        const res = await fetch(`/api/gov-procure/catalogs/${catalogId}/pdf?${qs.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error || "สร้างตัวอย่างเอกสารไม่สำเร็จ");
        }
        const text = await res.text();
        if (!alive) return;
        setHtml(text);
        setState("ready");
      } catch (e) {
        if (!alive) return;
        setError((e as Error).message || "สร้างตัวอย่างเอกสารไม่สำเร็จ");
        setState("error");
      }
    })();

    return () => {
      alive = false;
    };
  }, [catalogId, orgId, template, showPrices, hasItems]);

  return (
    <div>
      <div
        className="mx-auto overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm"
        style={{ width: PREVIEW_WIDTH_PX, height: Math.round(A4_HEIGHT_PX * previewScale) }}
      >
        {state === "loading" && (
          <div className="h-full w-full animate-pulse space-y-2 p-4">
            <div className="h-5 w-2/3 rounded bg-gray-100" />
            <div className="h-3 w-1/2 rounded bg-gray-100" />
            <div className="mt-4 h-40 rounded bg-gray-100" />
            <div className="h-24 rounded bg-gray-100" />
          </div>
        )}

        {state === "error" && (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-6 text-center">
            <Text className="text-sm font-medium text-gray-900">ยังแสดงตัวอย่างไม่ได้</Text>
            <Text className="text-xs text-gray-500">{error}</Text>
          </div>
        )}

        {state === "ready" && (
          /*
           * เรนเดอร์ที่ความกว้าง A4 จริง (794px @96dpi) แล้วย่อทั้งกรอบด้วย transform
           *
           * ถ้าปล่อยให้ iframe กว้างเท่ากล่อง (~420px) คอลัมน์ที่กำหนดเป็น % จะแคบกว่าจริง
           * → หัวคอลัมน์/ตัวเลขตกบรรทัดทั้งที่ในไฟล์จริงไม่ตก = พรีวิวบิดเบือนหน้าตาเอกสาร
           * ซึ่งขัดกับเหตุผลที่เปลี่ยนมาใช้ HTML จริงตั้งแต่แรก
           */
          <div
            className="origin-top-left"
            style={{
              width: `${A4_WIDTH_PX}px`,
              height: `${A4_HEIGHT_PX}px`,
              transform: `scale(${previewScale})`,
            }}
          >
            <iframe
              title="ตัวอย่างเอกสาร"
              srcDoc={html}
              sandbox=""
              className="h-full w-full border-0"
            />
          </div>
        )}
      </div>

      <Text className="mt-2 text-center text-xs text-gray-500">
        ตัวอย่างนี้ใช้ <span className="font-medium text-gray-700">เนื้อหาจริงของไฟล์</span> —
        ต่างจาก PDF ที่ดาวน์โหลดเฉพาะการแบ่งหน้าและการจัดฟอนต์ ซึ่งระบบเรนเดอร์เป็นผู้จัด
        {notVerifiedCount > 0
          ? ` · ยังมี ${fmtNum(notVerifiedCount)} รายการไม่ผ่านตรวจ เอกสารจึงมีลายน้ำ "ฉบับร่าง"`
          : ""}
      </Text>
    </div>
  );
}
