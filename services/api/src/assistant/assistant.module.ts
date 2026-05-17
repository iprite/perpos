import { Module } from '@nestjs/common';
import { SchedulerController } from './scheduler.controller';
import { TaskNotifierService } from './task-notifier.service';

@Module({
  controllers: [SchedulerController],
  providers: [TaskNotifierService],
})
export class AssistantModule {}
