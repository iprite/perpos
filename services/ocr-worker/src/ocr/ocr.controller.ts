import { Controller, Post, Body, Get, Req, HttpCode, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { OcrService } from './ocr.service';
import { ProcessJobDto } from './dto/process.dto';

@Controller()
export class OcrController {
  constructor(private readonly ocr: OcrService) {}

  @Get()
  healthRoot(): { ok: boolean; service: string } {
    return { ok: true, service: 'ocr-worker' };
  }

  @Get('healthz')
  health(): { ok: boolean } {
    return { ok: true };
  }

  /**
   * Triggered (fire-and-forget) by the Next.js API after a job is queued.
   * Returns 202 immediately and processes asynchronously; all outcomes —
   * success or failure — are persisted to ocr_processing_jobs.status.
   */
  @Post('process')
  @HttpCode(202)
  process(@Req() req: Request, @Body() body: ProcessJobDto): { accepted: boolean } {
    const required = process.env.WORKER_SECRET ?? '';
    const got = String(req.get('x-worker-secret') ?? '');
    if (!required || got !== required) {
      // Do not leak whether the secret is configured; generic 401.
      throw new UnauthorizedException('Unauthorized');
    }

    // Kick off processing without blocking the HTTP response.
    void this.ocr.processJob(body.jobId, body.firmOrgId);
    return { accepted: true };
  }
}
