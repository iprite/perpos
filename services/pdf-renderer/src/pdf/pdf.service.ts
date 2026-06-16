import { chromium, Browser } from 'playwright';

let browserPromise: Promise<Browser> | null = null;

export type RenderOptions = {
  // เปิด running header/footer (ปรากฏทุกหน้าใน margin) — ส่ง HTML template มา
  // ใช้ class พิเศษของ Chromium ได้: pageNumber, totalPages, title, date
  footerHtml?: string;
  headerHtml?: string;
};

export async function renderPdf(html: string, opts: RenderOptions = {}): Promise<Buffer> {
  const browser = await getBrowser();
  const context = await browser.newContext({ viewport: { width: 794, height: 1123 }, ignoreHTTPSErrors: true });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);

  try {
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    try { await page.evaluate(() => (document.fonts ? document.fonts.ready : null)); } catch { /* ignore */ }
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => { /* ignore timeout */ });

    const useHeaderFooter = Boolean(opts.footerHtml || opts.headerHtml);
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      ...(useHeaderFooter
        ? {
            displayHeaderFooter: true,
            headerTemplate: opts.headerHtml ?? '<span></span>',
            footerTemplate: opts.footerHtml ?? '<span></span>',
          }
        : {}),
    });
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => null);
    await context.close().catch(() => null);
  }
}

export async function closeBrowser(): Promise<void> {
  if (browserPromise) {
    const b = await browserPromise.catch(() => null);
    await b?.close().catch(() => null);
    browserPromise = null;
  }
}

async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    const b = await browserPromise.catch(() => null);
    if (b && b.isConnected()) return b;
    await b?.close().catch(() => null);
    browserPromise = null;
  }

  const args = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--no-zygote', '--disable-gpu'];
  browserPromise = chromium.launch({ headless: true, args }).catch((e) => {
    browserPromise = null;
    throw e;
  });
  return browserPromise;
}
