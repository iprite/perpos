import { Module } from '@nestjs/common';
import { OrgController } from './org.controller';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [EmailModule],
  controllers: [OrgController],
})
export class OrgModule {}
