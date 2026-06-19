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

# engine บีบ PDF = python (pikepdf + Pillow) — surgical compression
#   ลงผ่าน apt ของ trixie (python3-pikepdf, python3-pil) เลี่ยง pip/venv + PEP668
#   ⚠️ ไม่ใช้ ghostscript แล้ว — gs flatten transparency → กล่องดำใน Apple Preview
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pikepdf python3-pil \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
# compress.py = engine (ไม่ผ่าน tsc) — วางข้าง main.js ใน dist/ (pdf.service อ้าง join(__dirname,'..','compress.py'))
COPY src/compress.py ./dist/compress.py

EXPOSE 8080

CMD ["node", "dist/main"]
