#!/usr/bin/env python3
"""
บีบ PDF — 2 โหมด:

โหมด surgical (default) — บีบเฉพาะ "รูปถ่ายใหญ่" ทีละตัว คงโครงสร้าง/transparency เดิม
  ต่างจาก ghostscript (เขียน PDF ใหม่ทั้งไฟล์ → flatten transparency → กล่องดำใน Apple Preview)
  วิธีนี้: iterate ทุก image object (รวมที่ซ้อนใน Form XObject) →
    - ข้ามรูปเล็ก (< MIN_SIDE) = โลโก้/ไอคอน → คงเดิม 100%
    - ข้าม stencil mask (ImageMask / 1-bit)
    - downsample รูปใหญ่เป็น TARGET_MAX px, re-encode JPEG quality JPEG_Q
    - เก็บ /SMask เดิมไว้ → transparency ไม่พัง
  ตรวจ "vector_heavy" ด้วย: ถ้าน้ำหนักไฟล์ส่วนใหญ่เป็น content stream (เวกเตอร์) ไม่ใช่รูป
  → surgical ช่วยไม่ได้ ฝั่งเรียกจะเสนอ "บีบแบบเข้ม" (rasterize) ต่อ

โหมด rasterize (--rasterize) — render ทุกหน้าเป็นภาพ JPEG แล้วประกอบ PDF ใหม่ (PyMuPDF)
  ใช้กับไฟล์ vector-heavy ที่ surgical บีบไม่ลง → ยุบได้ 70–90% แต่ข้อความค้นหา/คัดลอกไม่ได้
  + ความคมลดลงตาม DPI (default 150)

ทั้งสองโหมด: ถ้าผลใหญ่กว่าหรือเท่าเดิม → คืนไฟล์เดิม (no_gain) ฝั่งเรียก refund quota

ใช้: python3 compress.py [--rasterize] <in.pdf> <out.pdf>
พิมพ์ JSON ออก stdout: {"pages","size_before","size_after","no_gain","ratio","vector_heavy","mode"}
error (ไฟล์เสีย/เกินเพดาน) → พิมพ์ {"error": "..."} + exit 2 (ผู้ใช้แก้เองได้)
"""
import io
import json
import os
import sys

import pikepdf
from pikepdf import Name, PdfImage, Stream
from PIL import Image

TARGET_MAX = int(os.environ.get("PDF_TARGET_MAX_PX", "1400"))
JPEG_Q = int(os.environ.get("PDF_JPEG_QUALITY", "78"))
MIN_SIDE = int(os.environ.get("PDF_MIN_IMAGE_SIDE", "450"))
MAX_MB = float(os.environ.get("PDF_MAX_MB", "100"))
MAX_PAGES = int(os.environ.get("PDF_MAX_PAGES", "500"))
# rasterize (โหมดเข้ม): DPI render หน้า + JPEG quality
RASTER_DPI = int(os.environ.get("PDF_RASTER_DPI", "150"))
RASTER_Q = int(os.environ.get("PDF_RASTER_QUALITY", "80"))
# vector_heavy = ไฟล์ใหญ่พอควร + รูปเป็นส่วนน้อยของไฟล์ (น้ำหนักอยู่ที่เวกเตอร์/content stream)
#   → surgical (บีบรูป) ช่วยไม่ได้ คุ้มที่จะเสนอ rasterize ต่อ
#   เพดานขนาดขั้นต่ำ = กันเสนอ rasterize กับไฟล์ข้อความเล็ก ๆ ที่ไม่มีรูป (img_bytes=0)
#   เกณฑ์รูปต่ำ = กันไฟล์ภาพ (surgical จัดการอยู่แล้ว / rasterize ไม่ช่วย)
VECTOR_HEAVY_MIN_BYTES = int(os.environ.get("PDF_VECTOR_HEAVY_MIN_BYTES", str(2 * 1024 * 1024)))
VECTOR_HEAVY_IMG_FRACTION = float(os.environ.get("PDF_VECTOR_HEAVY_IMG_FRACTION", "0.35"))


class UserError(Exception):
    pass


def compress_image(obj: Stream) -> bool:
    """downsample + re-encode รูปหนึ่งตัว · คืน True ถ้าแก้ไข"""
    if obj.get("/Subtype") != Name("/Image"):
        return False
    if obj.get("/ImageMask"):
        return False  # stencil mask — ห้ามแตะ
    if int(obj.get("/BitsPerComponent", 8)) == 1:
        return False  # 1-bit
    w = int(obj.get("/Width", 0))
    h = int(obj.get("/Height", 0))
    if max(w, h) < MIN_SIDE:
        return False  # โลโก้/ไอคอน → คงเดิม

    try:
        pil = PdfImage(obj).as_pil_image()
    except Exception:
        return False

    # รูป grayscale ที่ไม่มี smask = น่าจะเป็น mask channel → คง gray, ไม่งั้น RGB
    is_gray = obj.get("/ColorSpace") == Name("/DeviceGray") and "/SMask" not in obj
    if pil.mode not in ("RGB", "L"):
        pil = pil.convert("L" if is_gray else "RGB")

    scale = TARGET_MAX / max(w, h)
    if scale < 1.0:
        pil = pil.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)

    buf = io.BytesIO()
    pil.save(buf, format="JPEG", quality=JPEG_Q, optimize=True)
    obj.write(buf.getvalue(), filter=Name("/DCTDecode"))
    obj["/Width"] = pil.width
    obj["/Height"] = pil.height
    obj["/ColorSpace"] = Name("/DeviceRGB") if pil.mode == "RGB" else Name("/DeviceGray")
    obj["/BitsPerComponent"] = 8
    for k in ("/Decode", "/DecodeParms"):
        if k in obj:
            del obj[k]
    return True


def _image_bytes(pdf: pikepdf.Pdf) -> int:
    """รวมไบต์ดิบของ image stream ทั้งหมด (ใช้ประเมินว่ารูปเป็นน้ำหนักหลักของไฟล์ไหม)"""
    total = 0
    for obj in pdf.objects:
        if isinstance(obj, Stream) and obj.get("/Subtype") == Name("/Image"):
            try:
                total += len(obj.read_raw_bytes())
            except Exception:
                pass
    return total


def _copy_original(src: str, dst: str) -> None:
    with open(src, "rb") as fsrc, open(dst, "wb") as fout:
        fout.write(fsrc.read())


def run(src: str, dst: str) -> dict:
    """โหมด surgical — บีบรูปใหญ่ + ประเมิน vector_heavy"""
    size_before = os.path.getsize(src)
    if size_before > MAX_MB * 1024 * 1024:
        raise UserError(f"ไฟล์ใหญ่เกิน {int(MAX_MB)}MB กรุณาแบ่งไฟล์")

    try:
        pdf = pikepdf.open(src)
    except Exception:
        raise UserError("ไฟล์ PDF เสียหรืออ่านไม่ได้ กรุณาตรวจไฟล์แล้วส่งใหม่")

    pages = len(pdf.pages)
    if pages > MAX_PAGES:
        raise UserError(f"ไฟล์เกิน {MAX_PAGES} หน้า ({pages} หน้า) กรุณาแบ่งไฟล์")

    for obj in pdf.objects:
        if isinstance(obj, Stream):
            try:
                compress_image(obj)
            except Exception:
                pass  # รูปเดี่ยวล้ม = ข้าม ไม่ทำทั้งงานพัง

    # ไบต์รูป (หลังบีบ) — ใช้ตัดสินว่ารูปเป็นน้ำหนักหลักของไฟล์ไหม
    img_bytes = _image_bytes(pdf)

    pdf.save(
        dst,
        object_stream_mode=pikepdf.ObjectStreamMode.generate,
        compress_streams=True,
    )

    size_after = os.path.getsize(dst)
    # vector_heavy: ไฟล์ใหญ่พอ + รูปเป็นส่วนน้อย → น้ำหนักอยู่ที่เวกเตอร์ surgical ช่วยไม่ได้
    #   กันไฟล์ข้อความเล็ก (เพดานขนาด) + ไฟล์ภาพ (รูปเกินสัดส่วน → surgical/ภาพจัดการอยู่แล้ว)
    vector_heavy = (
        size_after >= VECTOR_HEAVY_MIN_BYTES
        and img_bytes < VECTOR_HEAVY_IMG_FRACTION * size_after
    )

    # บีบไม่ลง (PDF optimize มาแล้ว) → คืนไฟล์เดิม
    if size_after <= 0 or size_after >= size_before:
        _copy_original(src, dst)
        return {"pages": pages, "size_before": size_before, "size_after": size_before,
                "no_gain": True, "ratio": 0.0, "vector_heavy": vector_heavy, "mode": "surgical"}

    return {"pages": pages, "size_before": size_before, "size_after": size_after,
            "no_gain": False, "ratio": round(1 - size_after / size_before, 4),
            "vector_heavy": vector_heavy, "mode": "surgical"}


def rasterize(src: str, dst: str) -> dict:
    """โหมดเข้ม — render ทุกหน้าเป็น JPEG @ RASTER_DPI แล้วประกอบ PDF ใหม่ (PyMuPDF)"""
    import fitz  # PyMuPDF — lazy import (โหลดเฉพาะตอนใช้โหมดเข้ม)

    size_before = os.path.getsize(src)
    if size_before > MAX_MB * 1024 * 1024:
        raise UserError(f"ไฟล์ใหญ่เกิน {int(MAX_MB)}MB กรุณาแบ่งไฟล์")

    try:
        doc = fitz.open(src)
    except Exception:
        raise UserError("ไฟล์ PDF เสียหรืออ่านไม่ได้ กรุณาตรวจไฟล์แล้วส่งใหม่")

    pages = doc.page_count
    if pages > MAX_PAGES:
        raise UserError(f"ไฟล์เกิน {MAX_PAGES} หน้า ({pages} หน้า) กรุณาแบ่งไฟล์")

    out = fitz.open()
    zoom = RASTER_DPI / 72.0
    mat = fitz.Matrix(zoom, zoom)
    for page in doc:
        pix = page.get_pixmap(matrix=mat, alpha=False)
        jpg = pix.tobytes("jpeg", jpg_quality=RASTER_Q)
        rect = page.rect  # ขนาดหน้าเดิม (points) → ภาพเต็มหน้าพอดี
        newpage = out.new_page(width=rect.width, height=rect.height)
        newpage.insert_image(rect, stream=jpg)
    out.save(dst, deflate=True, garbage=4)
    out.close()
    doc.close()

    size_after = os.path.getsize(dst)
    # rasterize แล้วยังใหญ่กว่าเดิม (ไฟล์เล็ก/หน้าน้อยอยู่แล้ว) → คืนไฟล์เดิม
    if size_after <= 0 or size_after >= size_before:
        _copy_original(src, dst)
        return {"pages": pages, "size_before": size_before, "size_after": size_before,
                "no_gain": True, "ratio": 0.0, "vector_heavy": True, "mode": "rasterize"}

    return {"pages": pages, "size_before": size_before, "size_after": size_after,
            "no_gain": False, "ratio": round(1 - size_after / size_before, 4),
            "vector_heavy": True, "mode": "rasterize"}


def main():
    args = sys.argv[1:]
    raster = False
    if args and args[0] == "--rasterize":
        raster = True
        args = args[1:]
    if len(args) != 2:
        print(json.dumps({"error": "usage: compress.py [--rasterize] <in> <out>"}))
        sys.exit(1)
    try:
        result = rasterize(args[0], args[1]) if raster else run(args[0], args[1])
        print(json.dumps(result))
    except UserError as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(2)  # user-facing
    except Exception as e:
        print(json.dumps({"error": "internal", "detail": str(e)[:300]}), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
