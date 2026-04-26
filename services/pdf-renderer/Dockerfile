FROM mcr.microsoft.com/playwright:v1.59.1-jammy

WORKDIR /app

ENV NODE_ENV=production
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PORT=8080

RUN apt-get update \
  && apt-get install -y --no-install-recommends fonts-noto fonts-noto-cjk fonts-noto-color-emoji fonts-thai-tlwg \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js ./

EXPOSE 8080

CMD ["node", "server.js"]
