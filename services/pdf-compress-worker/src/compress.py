#!/usr/bin/env python3
"""
บีบ PDF แบบ surgical — บีบเฉพาะ "รูปถ่ายใหญ่" ทีละตัว คงโครงสร้าง/transparency เดิม
  ต่างจาก ghostscript (เขียน PDF ใหม่ทั้งไฟล์ → flatten transparency → กล่องดำใน Apple Preview)
  วิธีนี้: iterate ทุก image object (รวมที่ซ้อนใน Form XObject) →
    - ข้ามรูปเล็ก (< MIN_SIDE) = โลโก้/ไอคอน → คงเดิม 100%
    - ข้าม stencil mask (ImageMask / 1-bit)
    - downsample รูปใหญ่เป็น TARGET_MAX px, re-encode JPEG quality JPEG_Q
    - เก็บ /SMask เดิมไว้ → transparency ไม่พัง
  ถ้าผลใหญ่กว่าหรือเท่าเดิม → คืนไฟล์เดิม (no_gain) ฝั่งเรียก refund quota

ใช้: python3 compress.py <in.pdf> <out.pdf>
พิมพ์ JSON ออก stdout: {"pages","size_before","size_after","no_gain","ratio"}
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


def run(src: str, dst: str) -> dict:
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

    pdf.save(
        dst,
        object_stream_mode=pikepdf.ObjectStreamMode.generate,
        compress_streams=True,
    )

    size_after = os.path.getsize(dst)
    # บีบไม่ลง (PDF optimize มาแล้ว) → คืนไฟล์เดิม
    if size_after <= 0 or size_after >= size_before:
        with open(src, "rb") as fsrc, open(dst, "wb") as fout:
            fout.write(fsrc.read())
        return {"pages": pages, "size_before": size_before,
                "size_after": size_before, "no_gain": True, "ratio": 0.0}

    return {"pages": pages, "size_before": size_before, "size_after": size_after,
            "no_gain": False, "ratio": round(1 - size_after / size_before, 4)}


def main():
    if len(sys.argv) != 3:
        print(json.dumps({"error": "usage: compress.py <in> <out>"}))
        sys.exit(1)
    try:
        result = run(sys.argv[1], sys.argv[2])
        print(json.dumps(result))
    except UserError as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(2)  # user-facing
    except Exception as e:
        print(json.dumps({"error": "internal", "detail": str(e)[:300]}), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
