import { Controller, Get, Put, Post, Body, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../../common/guards/admin.guard';
import { DeliveryService } from './delivery.service';

@Controller('admin/delivery')
@UseGuards(AdminGuard)
export class DeliveryController {
  constructor(private readonly delivery: DeliveryService) {}

  @Get('logs')
  async getLogs() {
    return this.delivery.getLogs();
  }

  @Put('schedule')
  async setSchedule(@Body() body: { cron: string; timezone?: string }) {
    const cron = String(body.cron ?? '').trim();
    const timezone = String(body.timezone ?? 'Asia/Bangkok').trim();
    if (!cron) return { error: 'invalid_body' };
    return this.delivery.setSchedule(cron, timezone);
  }

  @Post('send-now')
  async sendNow(@Body() body: { toUserIds?: string[] }) {
    return this.delivery.sendNow(Array.isArray(body.toUserIds) ? body.toUserIds : []);
  }
}
