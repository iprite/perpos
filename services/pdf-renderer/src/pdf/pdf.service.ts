import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { chromium, Browser } from 'playwright';

@Injectable()
export class PdfService implements OnModuleDestroy {
  private browserPromise: Promise<Browser> | null = null;

  async renderPdf(html: string): Promise<Buffer> {
    const browser = await this.getBrowser();
    const context = await browser.newContext({ viewport: { width: 794, height: 1123 }, ignoreHTTPSErrors: true });
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);

    try {
      await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      try { await page.evaluate(() => (document.fonts ? document.fonts.ready : null)); } catch { /* ignore */ }
      await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => { /* ignore timeout */ });

      const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
      return Buffer.from(pdf);
    } finally {
      await page.close().catch(() => null);
      await context.close().catch(() => null);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.browserPromise) {
      const b = await this.browserPromise.catch(() => null);
      await b?.close().catch(() => null);
      this.browserPromise = null;
    }
  }

  private async getBrowser(): Promise<Browser> {
    if (this.browserPromise) {
      const b = await this.browserPromise.catch(() => null);
      if (b && b.isConnected()) return b;
      await b?.close().catch(() => null);
      this.browserPromise = null;
    }

    const args = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--no-zygote', '--disable-gpu'];
    this.browserPromise = chromium.launch({ headless: true, args }).catch((e) => {
      this.browserPromise = null;
      throw e;
    });
    return this.browserPromise;
  }
}
