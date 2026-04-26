# PDF Renderer (Cloud Run)

Service นี้รับ HTML แล้วคืนค่าเป็น PDF เพื่อให้แอปที่รันบน Vercel ไม่ต้องสร้าง PDF ด้วย Playwright/Chromium เอง

## Endpoints

- `GET /healthz` → `{ ok: true }`
- `POST /render` → คืนค่า `application/pdf`
  - headers:
    - `Content-Type: application/json`
    - `X-PDF-SECRET: <secret>` (ถ้าตั้ง `PDF_SERVICE_SECRET`)
  - body:
    - `html` (string)
    - `filename` (string, optional)

## Environment variables

- `PDF_SERVICE_SECRET` (แนะนำให้ตั้ง): secret ที่จะต้องส่งมาใน header `X-PDF-SECRET`
- `PORT` (Cloud Run จะ set ให้เอง)

## Deploy (Google Cloud Run)

ตัวอย่างคำสั่ง (ใช้ Cloud Run + Artifact Registry)

```bash
gcloud config set project <YOUR_PROJECT_ID>
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com

gcloud run deploy exapp-pdf-renderer \
  --source services/pdf-renderer \
  --region asia-southeast1 \
  --allow-unauthenticated \
  --set-env-vars PDF_SERVICE_SECRET=<RANDOM_SECRET>
```

หลัง deploy เสร็จจะได้ URL ประมาณ:

`https://exapp-pdf-renderer-xxxxx-as.a.run.app`

## เชื่อมกับแอป (Vercel)

ตั้งค่า Environment Variables ใน Vercel (โปรเจกต์ที่เป็นเว็บ):

- `PDF_RENDER_URL` = Cloud Run URL (เช่น `https://exapp-pdf-renderer-xxxxx-as.a.run.app`)
- `PDF_SERVICE_SECRET` = ค่าเดียวกับที่ตั้งใน Cloud Run

แล้ว redeploy อีกครั้ง

