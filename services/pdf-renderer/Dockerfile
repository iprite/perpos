# ─── Build stage ──────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# ─── Production stage ─────────────────────────────────────────────────────────
# Use the official Playwright image so Chromium is pre-installed
FROM mcr.microsoft.com/playwright:v1.59.1-noble AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PORT=8080

# Thai and CJK fonts for PDF rendering
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       fonts-noto fonts-noto-cjk fonts-noto-color-emoji fonts-thai-tlwg \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

EXPOSE 8080

CMD ["node", "dist/main"]
