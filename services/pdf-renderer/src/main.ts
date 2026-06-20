import "./instrument";
import express from "express";
import * as Sentry from "@sentry/node";
import { renderPdf, closeBrowser } from "./pdf/pdf.service";

const app = express();
app.use(express.json({ limit: "2mb" }));

// ── Helpers ───────────────────────────────────────────────────────────────────
function normalizeName(name: string): string {
  const raw = String(name || "document");
  const safe = raw.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
  return safe || "document";
}

function isBrowserCrash(msg: string): boolean {
  return (
    msg.includes("browser has been closed") ||
    msg.includes("Target page, context or browser has been closed") ||
    msg.includes("browserType.launch")
  );
}

function requireSecret(req: express.Request, res: express.Response): boolean {
  const required = process.env.PDF_SERVICE_SECRET ?? "";
  if (!required) return true;
  const got = String(req.get("x-pdf-secret") ?? "");
  if (!got || got !== required) {
    res.status(401).type("text/plain").send("Unauthorized");
    return false;
  }
  return true;
}

// ── Routes ────────────────────────────────────────────────────────────────────
app.get("/", (_req, res) => {
  res.json({ ok: true, service: "pdf-renderer" });
});

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/render", async (req, res) => {
  if (!requireSecret(req, res)) return;

  const { html, filename, footerHtml, headerHtml } = req.body as {
    html?: string;
    filename?: string;
    footerHtml?: string;
    headerHtml?: string;
  };

  if (!html || typeof html !== "string" || html.length < 20) {
    res.status(400).type("text/plain").send("html is required (min 20 chars)");
    return;
  }
  if (html.length > 1_500_000) {
    res.status(400).type("text/plain").send("html exceeds 1.5MB limit");
    return;
  }

  const safeName = normalizeName(filename ?? "document");

  try {
    const pdfBuffer = await renderPdf(html, { footerHtml, headerHtml });
    res
      .status(200)
      .setHeader("Content-Type", "application/pdf")
      .setHeader("Content-Disposition", `inline; filename="${safeName}.pdf"`)
      .send(pdfBuffer);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e ?? "");
    isBrowserCrash(msg); // log hint (browser will restart on next request via getBrowser())
    Sentry.captureException(e);
    res.status(500).type("text/plain").send(`PDF render failed: ${msg}`);
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
const port = Number(process.env.PORT ?? 8080);
const server = app.listen(port, () => {
  console.log(`pdf-renderer listening on :${port}`);
});

// Graceful shutdown — close Chromium before exit
async function shutdown() {
  console.log("pdf-renderer shutting down...");
  server.close();
  await closeBrowser();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
