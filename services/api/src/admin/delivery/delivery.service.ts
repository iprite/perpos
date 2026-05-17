import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../../supabase/supabase.service';
import { NewsService } from '../../news/news.service';

@Injectable()
export class DeliveryService {
  constructor(
    private readonly config: ConfigService,
    private readonly supabase: SupabaseService,
    private readonly news: NewsService,
  ) {}

  async getLogs() {
    const admin = this.supabase.createAdminClient();
    const { data, error } = await admin.from('delivery_logs').select('id,profile_id,status,error_message,sent_at').order('sent_at', { ascending: false }).limit(50);
    if (error) throw new Error(error.message);
    return { ok: true, items: data ?? [] };
  }

  async setSchedule(cron: string, timezone: string) {
    const admin = this.supabase.createAdminClient();
    const cfgRes = await admin.from('news_agent_configs').select('id').order('updated_at', { ascending: false }).limit(1).maybeSingle();
    if (cfgRes.error) throw new Error(cfgRes.error.message);

    let configId = (cfgRes.data as Record<string, string> | null)?.id ?? null;
    if (!configId) {
      const ins = await admin.from('news_agent_configs').insert({}).select('id').single();
      if (ins.error) throw new Error(ins.error.message);
      configId = String((ins.data as Record<string, string>).id);
    }

    const schedRes = await admin
      .from('delivery_schedules')
      .upsert({ news_agent_config_id: configId, cron, timezone, is_enabled: true, updated_at: new Date().toISOString() }, { onConflict: 'news_agent_config_id' })
      .select('id')
      .single();
    if (schedRes.error) throw new Error(schedRes.error.message);
    return { ok: true, id: String((schedRes.data as Record<string, string>).id) };
  }

  async sendNow(toUserIds: string[]) {
    const admin = this.supabase.createAdminClient();
    const text = await this.buildNewsText(admin);

    const lineIds = toUserIds.length
      ? await Promise.all(toUserIds.map((uid) => admin.from('profiles').select('line_user_id').eq('id', uid).maybeSingle().then((r) => (r.data as Record<string, string> | null)?.line_user_id ?? null)))
      : await admin.from('profiles').select('line_user_id').not('line_user_id', 'is', null).eq('is_active', true).then((r) => (r.data ?? []).map((p: Record<string, string>) => p.line_user_id));

    const validIds = lineIds.filter((id): id is string => Boolean(id));
    if (!validIds.length) return { ok: true, sent: 0 };

    const accessToken = this.config.get<string>('LINE_MESSAGING_CHANNEL_ACCESS_TOKEN') ?? '';
    if (!accessToken) throw new Error('LINE access token not configured');

    await fetch('https://api.line.me/v2/bot/message/multicast', {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ to: validIds, messages: [{ type: 'text', text }] }),
    });

    return { ok: true, sent: validIds.length };
  }

  private async buildNewsText(admin: ReturnType<SupabaseService['createAdminClient']>): Promise<string> {
    const cfgRes = await admin.from('news_agent_configs').select('topics,sources,summary_style,max_items').order('updated_at', { ascending: false }).limit(1).maybeSingle();
    const cfg = cfgRes.error ? null : (cfgRes.data as Record<string, unknown> | null);
    const topics = Array.isArray(cfg?.topics) ? (cfg?.topics as string[]) : [];
    const sources = Array.isArray(cfg?.sources) ? (cfg?.sources as Record<string, string>[]) : [];
    const style = (cfg?.summary_style as 'bullet' | 'brief' | 'detailed') || 'bullet';
    const maxItems = Math.min(30, Math.max(1, Number(cfg?.max_items ?? 8)));
    const rssUrls = sources.map((s) => String(s?.value ?? '')).filter((x) => x.trim().length);
    const perSource = Math.max(1, Math.ceil(maxItems / Math.max(1, rssUrls.length)));
    const lists = await Promise.all(rssUrls.map((u) => this.news.fetchRssItems(u, perSource).catch(() => [])));
    const items = lists.flat().slice(0, maxItems);
    const key = this.config.get<string>('OPENAI_API_KEY') ?? '';
    if (!key) return this.news.basicHeadlineSummary(items, Math.min(8, maxItems));
    try { return await this.news.summarizeWithOpenAI({ apiKey: key, topics, items, style }); } catch { return this.news.basicHeadlineSummary(items, Math.min(8, maxItems)); }
  }
}
