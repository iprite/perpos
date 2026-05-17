import { Controller, Get, Put, Query, Body, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../../common/guards/admin.guard';
import { SupabaseService } from '../../supabase/supabase.service';

const ALL_MODULE_KEYS = ['accounting', 'payroll', 'assistant'];
const ORG_ROLES = ['owner', 'admin', 'member'];

@Controller('admin/modules')
@UseGuards(AdminGuard)
export class ModulesController {
  constructor(private readonly supabase: SupabaseService) {}

  @Get()
  async getModules(@Query('orgId') orgId?: string) {
    const admin = this.supabase.createAdminClient();

    if (!orgId) {
      const { data: orgs, error } = await admin.from('organizations').select('id,name').order('name');
      if (error) throw new Error(error.message);
      return { orgs: orgs ?? [] };
    }

    const { data, error } = await admin.from('org_module_settings').select('module_key,is_enabled,allowed_roles').eq('organization_id', orgId);
    if (error) throw new Error(error.message);

    const rowByKey = new Map((data ?? []).map((r: Record<string, unknown>) => [r.module_key as string, r]));
    const settings = ALL_MODULE_KEYS.map((key) => rowByKey.get(key) ?? { module_key: key, is_enabled: true, allowed_roles: [...ORG_ROLES] });
    return { settings };
  }

  @Put()
  async setModules(@Body() body: { orgId: string; settings: { module_key: string; is_enabled: boolean; allowed_roles: string[] }[] }) {
    if (!body?.orgId || !Array.isArray(body.settings)) throw new Error('invalid_body');

    const admin = this.supabase.createAdminClient();
    const now = new Date().toISOString();
    const rows = body.settings.map((s) => ({
      organization_id: body.orgId,
      module_key: String(s.module_key),
      is_enabled: Boolean(s.is_enabled),
      allowed_roles: Array.isArray(s.allowed_roles) ? s.allowed_roles : [...ORG_ROLES],
      updated_at: now,
    }));

    const { error } = await admin.from('org_module_settings').upsert(rows, { onConflict: 'organization_id,module_key' });
    if (error) throw new Error(error.message);
    return { ok: true };
  }
}
