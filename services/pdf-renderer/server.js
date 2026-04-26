const express = require("express");
const { chromium } = require("playwright");

const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));

const REQUIRED_SECRET = process.env.PDF_SERVICE_SECRET || "";

function normalizeBaseName(name) {
  const raw = String(name || "document");
  const safe = raw.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
  return safe || "document";
}

function requireSecret(req, res) {
  if (!REQUIRED_SECRET) return true;
  const got = String(req.get("x-pdf-secret") || "");
  if (got && got === REQUIRED_SECRET) return true;
  res.status(401).type("text/plain; charset=utf-8").send("Unauthorized");
  return false;
}

let browserPromise = null;

async function getBrowser() {
  if (browserPromise) return browserPromise;
  const args = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--no-zygote",
    "--single-process",
  ];
  browserPromise = chromium.launch({ headless: true, args }).catch((e) => {
    browserPromise = null;
    throw e;
  });
  return browserPromise;
}

app.get("/healthz", (_req, res) => {
  res.status(200).json({ ok: true });
});

app.post("/render", async (req, res) => {
  if (!requireSecret(req, res)) return;

  const html = typeof req.body?.html === "string" ? req.body.html : "";
  const filename = normalizeBaseName(req.body?.filename);

  if (!html || html.length < 20) {
    res.status(400).type("text/plain; charset=utf-8").send("Invalid html");
    return;
  }

  if (html.length > 1_500_000) {
    res.status(413).type("text/plain; charset=utf-8").send("HTML too large");
    return;
  }

  let browser;
  try {
    browser = await getBrowser();
    const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
    page.setDefaultTimeout(30_000);

    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
    await page.close();

    res
      .status(200)
      .setHeader("Content-Type", "application/pdf")
      .setHeader("Content-Disposition", `inline; filename=\"${filename}.pdf\"`)
      .send(Buffer.from(pdf));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e ?? "");
    res.status(500).type("text/plain; charset=utf-8").send(`PDF render failed: ${msg}`);
  }
});

const port = Number(process.env.PORT || 8080);
app.listen(port, () => {
  console.log(`pdf-renderer listening on :${port}`);
});

