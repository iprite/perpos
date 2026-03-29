"use client";

import type { User } from "@supabase/supabase-js";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { Profile } from "@/lib/supabase/types";
import type { Role } from "../lib/roles";

type AuthState = {
  loading: boolean;
  user: User | null;
  role: Role | null;
  profile: Profile | null;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function Providers({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    let unsub: (() => void) | null = null;

    const load = async () => {
      const { data } = await supabase.auth.getSession();
      const nextUser = data.session?.user ?? null;
      setUser(nextUser);
      if (!nextUser) {
        setProfile(null);
        setLoading(false);
        return;
      }

      const { data: profileRow } = await supabase
        .from("profiles")
        .select("id,email,role,created_at")
        .eq("id", nextUser.id)
        .maybeSingle();
      setProfile((profileRow as Profile | null) ?? null);
      setLoading(false);
    };

    load();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      if (!nextUser) {
        setProfile(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      const { data: profileRow } = await supabase
        .from("profiles")
        .select("id,email,role,created_at")
        .eq("id", nextUser.id)
        .maybeSingle();
      setProfile((profileRow as Profile | null) ?? null);
      setLoading(false);
    });

    unsub = () => sub.subscription.unsubscribe();

    return () => {
      unsub?.();
    };
  }, []);

  const signOut = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      loading,
      user,
      profile,
      role: profile?.role ?? null,
      signOut,
    }),
    [loading, profile, signOut, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useRole() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useRole must be used within Providers");
  return ctx;
}
