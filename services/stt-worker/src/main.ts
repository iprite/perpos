import express from 'express';
import { processJob } from './stt/stt.service';

const app = express();
app.use(express.json());

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// Cloud Run intercepts /healthz at platform level — use /health instead
app.get('/healthz', (_req, res) => {
  res.json({ ok: true });
});

// ── Speech-to-text process trigger ──────────────────────────────────────────────
app.post('/process', (req, res) => {
  const secret = req.headers['x-worker-secret'];
  const required = process.env.WORKER_SECRET ?? '';
  if (!required || secret !== required) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { jobId, orgId } = req.body as { jobId?: string; orgId?: string };
  if (!jobId || !orgId) {
    res.status(400).json({ error: 'jobId and orgId are required' });
    return;
  }

  // Fire-and-forget — respond immediately, process in background
  res.status(202).json({ accepted: true });
  void processJob(jobId, orgId);
});

// ── Start ─────────────────────────────────────────────────────────────────────
const port = Number(process.env.PORT ?? 8080);
app.listen(port, () => {
  console.log(`stt-worker listening on :${port}`);
});
