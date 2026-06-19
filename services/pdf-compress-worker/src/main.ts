import express from 'express';
import { compressPdf, compressBucketObject, UserFacingError } from './pdf/pdf.service';
import { processJob } from './pdf/job.service';

const app = express();

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ ok: true });
});
// Cloud Run intercepts /healthz at platform level — keep /health as primary
app.get('/healthz', (_req, res) => {
  res.json({ ok: true });
});

// ── Standalone compress (P1b) — raw PDF in → compressed PDF out ─────────────────
//   ทดสอบ core ด้วย curl ตรง ๆ ก่อนผูก bucket/job (P1c):
//     curl -X POST $URL/compress-raw -H "x-worker-secret: $S" \
//          -H "content-type: application/pdf" --data-binary @in.pdf -o out.pdf -D -
//   สถิติ before/after อยู่ใน response headers x-pdf-*
app.post('/compress-raw', express.raw({ type: 'application/pdf', limit: '110mb' }), async (req, res) => {
  const secret = String(req.headers['x-worker-secret'] ?? '').trim();
  const required = (process.env.WORKER_SECRET ?? '').trim();
  if (!required || secret !== required) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const input = req.body as Buffer;
  if (!Buffer.isBuffer(input) || input.length === 0) {
    res.status(400).json({ error: 'ส่งไฟล์ PDF เป็น raw body (content-type: application/pdf)' });
    return;
  }

  try {
    const result = await compressPdf(input);
    res
      .status(200)
      .setHeader('content-type', 'application/pdf')
      .setHeader('x-pdf-pages', String(result.pages))
      .setHeader('x-pdf-size-before', String(result.sizeBefore))
      .setHeader('x-pdf-size-after', String(result.sizeAfter))
      .setHeader('x-pdf-ratio', result.ratio.toFixed(4))
      .setHeader('x-pdf-no-gain', String(result.noGain))
      .send(result.bytes);
  } catch (e) {
    if (e instanceof UserFacingError) {
      res.status(422).json({ error: e.message });
      return;
    }
    console.error('[pdf-compress-worker] compress failed:', e instanceof Error ? e.message : String(e));
    res.status(500).json({ error: 'บีบไฟล์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' });
  }
});

// ── Bucket compress (P1c flow) — download จาก assistant_pdf → บีบ → upload ผลลัพธ์ ─
//   เลี่ยงลิมิต request body 32MB ของ Cloud Run (P1c จะห่อด้วย job + deliver)
//     curl -X POST $URL/compress -H "x-worker-secret: $S" -H "content-type: application/json" \
//          -d '{"path":"<profileId>/<jobId>.pdf"}'
app.post('/compress', express.json(), async (req, res) => {
  const secret = String(req.headers['x-worker-secret'] ?? '').trim();
  const required = (process.env.WORKER_SECRET ?? '').trim();
  if (!required || secret !== required) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { path } = (req.body ?? {}) as { path?: string };
  if (!path || typeof path !== 'string') {
    res.status(400).json({ error: 'path (storage path ใน assistant_pdf) is required' });
    return;
  }

  try {
    const result = await compressBucketObject(path);
    res.status(200).json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof UserFacingError) {
      res.status(422).json({ ok: false, error: e.message });
      return;
    }
    console.error('[pdf-compress-worker] bucket compress failed:', e instanceof Error ? e.message : String(e));
    res.status(500).json({ ok: false, error: 'บีบไฟล์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' });
  }
});

// ── Job process (P1c LINE flow) — fire-and-forget เหมือน stt-worker ─────────────
//   body { jobId, orgId } · ตอบ 202 ทันที แล้วประมวลผล background
//   (--no-cpu-throttling ทำให้ background job รันต่อหลังตอบ response)
app.post('/process', express.json(), (req, res) => {
  const secret = String(req.headers['x-worker-secret'] ?? '').trim();
  const required = (process.env.WORKER_SECRET ?? '').trim();
  if (!required || secret !== required) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const { jobId, orgId } = (req.body ?? {}) as { jobId?: string; orgId?: string };
  if (!jobId || !orgId) {
    res.status(400).json({ error: 'jobId and orgId are required' });
    return;
  }
  res.status(202).json({ accepted: true });
  void processJob(jobId, orgId);
});

// ── Start ─────────────────────────────────────────────────────────────────────
const port = Number(process.env.PORT ?? 8080);
app.listen(port, () => {
  console.log(`pdf-compress-worker listening on :${port}`);
});
