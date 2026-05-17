import { Controller, Post, Get, UseGuards, HttpCode } from '@nestjs/common';
import { CronAuthGuard } from '../common/guards/cron-auth.guard';
import { TaskNotifierService } from './task-notifier.service';

@Controller('assistant')
export class SchedulerController {
  constructor(private readonly taskNotifier: TaskNotifierService) {}

  @Post('scheduler')
  @Get('scheduler')
  @UseGuards(CronAuthGuard)
  @HttpCode(200)
  async runScheduler(): Promise<{ ok: boolean }> {
    await this.taskNotifier.runScheduler();
    return { ok: true };
  }
}
