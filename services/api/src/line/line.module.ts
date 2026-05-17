import { Module } from '@nestjs/common';
import { WebhookController } from './webhook/webhook.controller';
import { WebhookService } from './webhook/webhook.service';
import { LinkTokenController } from './link-token.controller';
import { UnlinkController } from './unlink.controller';
import { GoogleModule } from '../google/google.module';

@Module({
  imports: [GoogleModule],
  controllers: [WebhookController, LinkTokenController, UnlinkController],
  providers: [WebhookService],
})
export class LineModule {}
