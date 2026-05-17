import { Module } from '@nestjs/common';
import { DriveController } from './drive/drive.controller';
import { DriveService } from './drive/drive.service';
import { CalendarService } from './calendar.service';

@Module({
  controllers: [DriveController],
  providers: [DriveService, CalendarService],
  exports: [DriveService, CalendarService],
})
export class GoogleModule {}
