import {
  Controller,
  Post,
  Req,
  Res,
  HttpCode,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { WebhookService } from './webhook.service';

type RawRequest = Request & { rawBody?: Buffer };

@Controller('line')
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Post('webhook')
  @HttpCode(200)
  async handleWebhook(@Req() req: RawRequest, @Res() res: Response): Promise<void> {
    const raw = req.rawBody;
    const body = raw ? raw.toString('utf8') : '';
    const signature = req.headers['x-line-signature'] as string | null ?? null;

    if (!this.webhookService.verifySignature(body, signature)) {
      res.status(401).json({ ok: false });
      return;
    }

    await this.webhookService.processEvents(body);
    res.json({ ok: true });
  }
}
