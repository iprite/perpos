import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupabaseModule } from './supabase/supabase.module';
import { LineModule } from './line/line.module';
import { AssistantModule } from './assistant/assistant.module';
import { AdminModule } from './admin/admin.module';
import { GoogleModule } from './google/google.module';
import { OrgModule } from './org/org.module';
import { NewsModule } from './news/news.module';
import { EmailModule } from './email/email.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    SupabaseModule,
    NewsModule,
    EmailModule,
    GoogleModule,
    LineModule,
    AssistantModule,
    AdminModule,
    OrgModule,
  ],
})
export class AppModule {}
