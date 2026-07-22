"use client";

// image-api.ts — เรียก /api/gov-procure/catalog-images (รูปของรายการ/สินค้าในคลัง)
//
// กฎความปลอดภัย (A-B1): **client ห้ามส่ง `path` ของไฟล์เด็ดขาด** — อ้างด้วย id เท่านั้น
// server เป็นคน resolve path + เซ็น URL (อายุ 5 นาที) ให้

import { govApi, govForm } from "../../_components/api";

const BASE = "/api/gov-procure/catalog-images";

/** signed URL ของรูป (key = itemId) — ขอเป็นชุดเดียวต่อรอบ */
export async function fetchItemImageUrls(
  orgId: string,
  itemIds: string[],
): Promise<Record<string, string>> {
  if (itemIds.length === 0) return {};
  const res = await govApi<{ urls: Record<string, string> }>(
    `${BASE}?orgId=${encodeURIComponent(orgId)}&itemIds=${itemIds.join(",")}`,
    "GET",
  );
  return res.urls ?? {};
}

/** signed URL ของรูปสินค้าในคลัง (key = productId) */
export async function fetchProductImageUrl(
  orgId: string,
  productId: string,
): Promise<string | undefined> {
  const res = await govApi<{ urls: Record<string, string> }>(
    `${BASE}?orgId=${encodeURIComponent(orgId)}&productId=${encodeURIComponent(productId)}`,
    "GET",
  );
  return (res.urls ?? {})[productId];
}

/** data URL (จาก `<ImageUpload>`) → File สำหรับ multipart */
async function dataUrlToFile(dataUrl: string, name: string): Promise<File> {
  const blob = await (await fetch(dataUrl)).blob();
  const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
  return new File([blob], `${name}.${ext}`, { type: blob.type || "image/jpeg" });
}

/** อัปโหลดรูปของรายการในชุด → server ตั้ง `image_path` ให้เอง */
export async function uploadItemImage(
  orgId: string,
  catalogId: string,
  itemId: string,
  dataUrl: string,
): Promise<void> {
  const form = new FormData();
  form.append("file", await dataUrlToFile(dataUrl, itemId));
  form.append("catalogId", catalogId);
  form.append("itemId", itemId);
  await govForm(`${BASE}?orgId=${encodeURIComponent(orgId)}`, "POST", form);
}

/** อัปโหลดรูปของสินค้าในคลัง */
export async function uploadProductImage(
  orgId: string,
  productId: string,
  dataUrl: string,
): Promise<void> {
  const form = new FormData();
  form.append("file", await dataUrlToFile(dataUrl, productId));
  form.append("productId", productId);
  await govForm(`${BASE}?orgId=${encodeURIComponent(orgId)}`, "POST", form);
}

/** ลบรูป (รายการหรือสินค้าในคลัง) */
export async function deleteImage(
  orgId: string,
  target: { itemId?: string; productId?: string },
): Promise<void> {
  const qs = target.itemId
    ? `itemId=${encodeURIComponent(target.itemId)}`
    : `productId=${encodeURIComponent(target.productId ?? "")}`;
  await govApi(`${BASE}?orgId=${encodeURIComponent(orgId)}&${qs}`, "DELETE");
}
