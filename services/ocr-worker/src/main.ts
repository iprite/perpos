import "./instrument";
import express from "express";
import * as Sentry from "@sentry/node";
import { processJob } from "./ocr/ocr.service";

const app = express();
app.use(express.json());

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Cloud Run intercepts /healthz at platform level — use /health instead
app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

// ── OCR process trigger ───────────────────────────────────────────────────────
app.post("/process", (req, res) => {
  const secret = req.headers["x-worker-secret"];
  const required = process.env.WORKER_SECRET ?? "";
  if (!required || secret !== required) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { jobId, firmOrgId } = req.body as { jobId?: string; firmOrgId?: string };
  if (!jobId || !firmOrgId) {
    res.status(400).json({ error: "jobId and firmOrgId are required" });
    return;
  }

  // Fire-and-forget — respond immediately, process in background
  res.status(202).json({ accepted: true });
  processJob(jobId, firmOrgId).catch(async (e) => {
    console.error("[ocr-worker] job failed:", e instanceof Error ? e.message : String(e));
    Sentry.captureException(e);
    await Sentry.flush(2000);
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const port = Number(process.env.PORT ?? 8080);
app.listen(port, () => {
  console.log(`ocr-worker listening on :${port}`);
});
