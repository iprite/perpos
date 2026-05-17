import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { EmailService } from '../../email/email.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly email: EmailService,
  ) {}

  async listUsers(page: number, perPage: number) {
    const admin = this.supabase.createAdminClient();
    const { data: listData, error: listError } = await admin.auth.admin.listUsers({ page, perPage });
    if (listError || !listData) throw new Error(listError?.message ?? 'list_failed');

    const users = listData.users ?? [];
    const ids = users.map((u) => u.id);

    const profilesRes = ids.length
      ? await admin.from('profiles').select('id,email,role,is_active,line_user_id,created_at').in('id', ids)
      : { data: [], error: null };

    if (profilesRes.error) throw new Error(profilesRes.error.message);

    const profileById = new Map<string, Record<string, unknown>>();
    for (const p of (profilesRes.data ?? []) as Record<string, unknown>[]) {
      profileById.set(p.id as string, p);
    }

    return {
      page,
      perPage,
      total: listData.total ?? null,
      items: users.map((u) => ({
        id: u.id,
        email: u.email ?? null,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
        invited_at: (u as unknown as Record<string, unknown>).invited_at ?? null,
        profile: profileById.get(u.id) ?? null,
      })),
    };
  }

  async inviteUser(args: { email: string; role: 'admin' | 'user'; redirectTo: string }) {
    const admin = this.supabase.createAdminClient();
    const inviteRes = await admin.auth.admin.generateLink({ type: 'invite', email: args.email, options: { redirectTo: args.redirectTo } });

    let linkData = inviteRes.data;
    let linkError = inviteRes.error;

    if (linkError) {
      const msg = String(linkError.message ?? '').toLowerCase();
      const alreadyExists = msg.includes('already registered') || msg.includes('already exists') || msg.includes('user exists');
      if (alreadyExists) {
        const recoveryRes = await admin.auth.admin.generateLink({ type: 'recovery', email: args.email, options: { redirectTo: args.redirectTo } });
        linkData = recoveryRes.data;
        linkError = recoveryRes.error;
      }
    }

    if (linkError || !linkData.user || !linkData.properties?.action_link) {
      throw new Error(linkError?.message ?? 'invite_failed');
    }

    const userId = linkData.user.id;
    const actionLink = linkData.properties.action_link;

    await admin.from('profiles').upsert({ id: userId, email: args.email, role: args.role, is_active: true }, { onConflict: 'id' });

    const { html, text } = this.email.buildAuthLinkEmail({ title: 'คุณได้รับคำเชิญเข้าใช้งานระบบ', actionLabel: 'ตั้งรหัสผ่านและเข้าสู่ระบบ', actionLink });
    const sent = await this.email.sendEmail({ to: args.email, subject: 'คำเชิญเข้าใช้งานระบบ PERPOS', html, text });
    if (!sent.ok) throw Object.assign(new Error('email_send_failed'), { actionLink });

    return { ok: true, userId, actionLink, emailSent: true };
  }

  async deleteUser(userId: string) {
    const admin = this.supabase.createAdminClient();
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  }

  async getPermissions(userId: string) {
    const admin = this.supabase.createAdminClient();
    const { data, error } = await admin.from('user_permissions').select('function_key,allowed').eq('user_id', userId);
    if (error) throw new Error(error.message);
    return { ok: true, items: data ?? [] };
  }

  async setPermissions(userId: string, items: { function_key: string; allowed: boolean }[]) {
    const admin = this.supabase.createAdminClient();
    const delRes = await admin.from('user_permissions').delete().eq('user_id', userId);
    if (delRes.error) throw new Error(delRes.error.message);

    const allowedKeys = items.filter((x) => x.allowed).map((x) => x.function_key);
    if (allowedKeys.length) {
      const insRes = await admin.from('user_permissions').insert(allowedKeys.map((k) => ({ user_id: userId, function_key: k, allowed: true })));
      if (insRes.error) throw new Error(insRes.error.message);
    }
    return { ok: true };
  }

  async getOrgMemberships(userId: string) {
    const admin = this.supabase.createAdminClient();
    const [membershipsRes, allOrgsRes] = await Promise.all([
      admin.from('organization_members').select('id,organization_id,role').eq('user_id', userId),
      admin.from('organizations').select('id,name').order('name'),
    ]);
    if (membershipsRes.error) throw new Error(membershipsRes.error.message);
    if (allOrgsRes.error) throw new Error(allOrgsRes.error.message);

    const allOrgs = (allOrgsRes.data ?? []).map((o: Record<string, unknown>) => ({ id: o.id as string, name: o.name as string }));
    const orgNameById = new Map(allOrgs.map((o) => [o.id, o.name]));
    const memberships = (membershipsRes.data ?? []).map((row: Record<string, unknown>) => ({
      id: row.id as string,
      orgId: row.organization_id as string,
      orgName: orgNameById.get(row.organization_id as string) ?? row.organization_id,
      role: row.role as string,
    }));
    return { memberships, allOrgs };
  }

  async upsertOrgMembership(userId: string, orgId: string, role: 'owner' | 'admin' | 'member') {
    const admin = this.supabase.createAdminClient();
    const { error } = await admin.from('organization_members').upsert({ organization_id: orgId, user_id: userId, role }, { onConflict: 'organization_id,user_id' });
    if (error) throw new Error(error.message);
    return { ok: true };
  }

  async removeOrgMembership(userId: string, orgId: string) {
    const admin = this.supabase.createAdminClient();
    const { error } = await admin.from('organization_members').delete().eq('organization_id', orgId).eq('user_id', userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  }
}
