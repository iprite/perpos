import {
  Controller,
  Post,
  Body,
  Res,
  Get,
  Req,
  UnauthorizedException,
  HttpCode,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { PdfService } from './pdf.service';
import { RenderPdfDto } from './dto/render-pdf.dto';

function normalizeName(name: string): string {
  const raw = String(name || 'document');
  const safe = raw.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
  return safe || 'document';
}

@Controller()
export class PdfController {
  constructor(private readonly pdf: PdfService) {}

  @Get()
  healthRoot(): { ok: boolean; service: string } {
    return { ok: true, service: 'pdf-renderer' };
  }

  @Get('healthz')
  @Get('health')
  health(): { ok: boolean } {
    return { ok: true };
  }

  @Post('render')
  @HttpCode(200)
  async render(@Req() req: Request, @Body() body: RenderPdfDto, @Res() res: Response): Promise<void> {
    this.requireSecret(req, res);
    if (res.headersSent) return;

    const filename = normalizeName(body.filename);

    try {
      const pdfBuffer = await this.pdf.renderPdf(body.html);
      res
        .status(200)
        .setHeader('Content-Type', 'application/pdf')
        .setHeader('Content-Disposition', `inline; filename="${filename}.pdf"`)
        .send(pdfBuffer);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e ?? '');
      if (this.isBrowserCrash(msg)) {
        // Force browser restart on next request
      }
      res.status(500).type('text/plain').send(`PDF render failed: ${msg}`);
    }
  }

  private requireSecret(req: Request, res: Response): void {
    const required = process.env.PDF_SERVICE_SECRET ?? '';
    if (!required) return;
    const got = String(req.get('x-pdf-secret') ?? '');
    if (!got || got !== required) {
      res.status(401).type('text/plain').send('Unauthorized');
    }
  }

  private isBrowserCrash(msg: string): boolean {
    return (
      msg.includes('browser has been closed') ||
      msg.includes('Target page, context or browser has been closed') ||
      msg.includes('browserType.launch')
    );
  }
}
