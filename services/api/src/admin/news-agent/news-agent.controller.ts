import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsArray, IsEnum, IsInt, IsObject, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AdminGuard } from '../../common/guards/admin.guard';
import { NewsService } from '../../news/news.service';

class NewsSource {
  @IsEnum(['rss', 'url'])
  type!: 'rss' | 'url';

  @IsString()
  value!: string;
}

class PreviewNewsDto {
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  topics: string[] = [];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NewsSource)
  @IsOptional()
  sources: NewsSource[] = [];

  @IsInt()
  @Min(1)
  @Max(30)
  @IsOptional()
  @Type(() => Number)
  maxItems: number = 10;

  @IsEnum(['bullet', 'brief', 'detailed'])
  @IsOptional()
  summaryStyle: 'bullet' | 'brief' | 'detailed' = 'bullet';
}

@Controller('admin/news-agent')
@UseGuards(AdminGuard)
export class NewsAgentController {
  constructor(
    private readonly config: ConfigService,
    private readonly news: NewsService,
  ) {}

  @Post('preview')
  async preview(@Body() body: PreviewNewsDto) {
    const sources = body.sources.filter((s) => s.type === 'rss').map((s) => s.value);
    const maxItems = body.maxItems;
    const perSource = Math.max(1, Math.ceil(maxItems / Math.max(1, sources.length)));

    const lists = await Promise.all(sources.map((u) => this.news.fetchRssItems(u, perSource).catch(() => [])));
    const items = lists.flat().slice(0, maxItems);

    const key = this.config.get<string>('OPENAI_API_KEY') ?? '';
    if (!key) {
      return { ok: true, text: this.news.basicHeadlineSummary(items, Math.min(8, maxItems)) };
    }

    try {
      const text = await this.news.summarizeWithOpenAI({ apiKey: key, topics: body.topics, items, style: body.summaryStyle });
      return { ok: true, text };
    } catch (e: unknown) {
      const warn = e instanceof Error ? e.message : String(e);
      return { ok: true, text: this.news.basicHeadlineSummary(items, Math.min(8, maxItems)), warn };
    }
  }
}
