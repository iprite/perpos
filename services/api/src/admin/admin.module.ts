import { Module } from '@nestjs/common';
import { UsersController } from './users/users.controller';
import { UsersService } from './users/users.service';
import { DeliveryController } from './delivery/delivery.controller';
import { DeliveryService } from './delivery/delivery.service';
import { NewsAgentController } from './news-agent/news-agent.controller';
import { ModulesController } from './modules/modules.controller';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [EmailModule],
  controllers: [UsersController, DeliveryController, NewsAgentController, ModulesController],
  providers: [UsersService, DeliveryService],
})
export class AdminModule {}
