"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Profile, Role } from "@/lib/supabase/types";

type AuthState = {
  loading: boolean;
  envError: string | null;
  userId: string | null;
  email: string | null;
  role: Role | null;
  profile: Profile | null;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [envError, setEnvError] = useState<string | null>(null);
  const [supabase, setSupabase] = useState<ReturnType<typeof createSupabaseBrowserClient> | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const role = profile?.role ?? null;

  useEffect(() => {
    try {
      setSupabase(createSupabaseBrowserClient());
      setEnvError(null);
    } catch (e: any) {
      setEnvError(e?.message ?? "Missing Supabase env");
      setSupabase(null);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;

    const refresh = async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session?.user) {
        if (!cancelled) {
          setUserId(null);
          setEmail(null);
          setProfile(null);
          setLoading(false);
        }
        return;
      }

      const uid = session.user.id;
      const userEmail = session.user.email ?? null;
      if (!cancelled) {
        setUserId(uid);
        setEmail(userEmail);
        setLoading(false);
      }

      Promise.resolve()
        .then(async () => {
          const { data: p, error } = await supabase
            .from("profiles")
            .select("id,email,role,created_at")
            .eq("id", uid)
            .single();
          if (cancelled) return;
          if (error) {
            setProfile(null);
          } else {
            setProfile(p as Profile);
          }
        })
        .catch(() => {
          if (cancelled) return;
          setProfile(null);
        });
    };

    refresh();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      refresh();
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  const value = useMemo<AuthState>(
    () => ({
      loading,
      envError,
      userId,
      email,
      role,
      profile,
      signOut: async () => {
        if (!supabase) {
          setUserId(null);
          setEmail(null);
          setProfile(null);
          setLoading(false);
          return;
        }
        try {
          await supabase.auth.signOut();
        } finally {
          setUserId(null);
          setEmail(null);
          setProfile(null);
          setLoading(false);
        }
      },
    }),
    [email, envError, loading, profile, role, supabase, userId],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
