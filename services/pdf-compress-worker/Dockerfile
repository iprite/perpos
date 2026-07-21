# ─── Build stage ──────────────────────────────────────────────────────────────
FROM node:22-trixie-slim AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# ─── Production stage ─────────────────────────────────────────────────────────
FROM node:22-trixie-slim AS runner

WORKDIR /app

ENV NODE_ENV=production

# engine บีบ PDF = python:
#   - surgical (pass 1): pikepdf + Pillow — ลงผ่าน apt ของ trixie เลี่ยง pip/venv + PEP668
#   - rasterize (pass 2, โหมดเข้ม): PyMuPDF (fitz) — wheel self-contained (bundle MuPDF
#     ไม่ต้องการ system lib) จึงลงผ่าน pip ด้วย --break-system-packages (apt ไม่มี wheel ใหม่พอ)
#   ⚠️ ไม่ใช้ ghostscript แล้ว — gs flatten transparency → กล่องดำใน Apple Preview
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip python3-pikepdf python3-pil \
  && pip3 install --no-cache-dir --break-system-packages pymupdf \
  && apt-get purge -y python3-pip && apt-get autoremove -y \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
# compress.py = engine (ไม่ผ่าน tsc) — วางข้าง main.js ใน dist/ (pdf.service อ้าง join(__dirname,'..','compress.py'))
COPY src/compress.py ./dist/compress.py

EXPOSE 8080

CMD ["node", "dist/main"]
