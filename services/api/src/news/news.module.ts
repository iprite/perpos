import { Module, Global } from '@nestjs/common';
import { NewsService } from './news.service';

@Global()
@Module({
  providers: [NewsService],
  exports: [NewsService],
})
export class NewsModule {}
