import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  constructor(private readonly config: ConfigService) {}

  createAdminClient(): SupabaseClient {
    const url = this.config.get<string>('SUPABASE_URL') ?? this.config.get<string>('NEXT_PUBLIC_SUPABASE_URL') ?? '';
    const serviceRoleKey = this.config.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY');
    if (!url) throw new Error('Missing SUPABASE_URL');
    return createClient(url, serviceRoleKey);
  }

  createAuthedClient(accessToken: string): SupabaseClient {
    const url = this.config.get<string>('SUPABASE_URL') ?? this.config.get<string>('NEXT_PUBLIC_SUPABASE_URL') ?? '';
    const anonKey =
      this.config.get<string>('NEXT_PUBLIC_SUPABASE_ANON_KEY') ??
      this.config.get<string>('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY') ??
      '';
    if (!url || !anonKey) throw new Error('Missing Supabase env');
    return createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
  }
}
