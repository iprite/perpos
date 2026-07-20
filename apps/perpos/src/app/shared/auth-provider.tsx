"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Profile, Role } from "@/lib/supabase/types";

type AuthState = {
  loading: boolean;
  envError: string | null;
  profileError: string | null;
  userId: string | null;
  email: string | null;
  role: Role | null;
  profile: Profile | null;
  blocked: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

const AUTO_LOGOUT_MS = 10 * 60 * 60 * 1000;
const AUTH_STARTED_AT_KEY = "exapp.auth.startedAt";

function readStartedAt() {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(AUTH_STARTED_AT_KEY);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : null;
}

function writeStartedAt(ts: number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AUTH_STARTED_AT_KEY, String(ts));
}

function clearStartedAt() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUTH_STARTED_AT_KEY);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [envError, setEnvError] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [supabase, setSupabase] = useState<ReturnType<typeof createSupabaseBrowserClient> | null>(
    null,
  );
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const role = profile?.role ?? null;
  const blocked = Boolean(
    userId && !loading && (profile?.is_active === false || !profile || !!profileError),
  );
  const logoutTimerRef = useRef<number | null>(null);
  // loading=true ได้เฉพาะรอบ resolve แรก — รอบ refresh ถัดไป (เช่น tab กลับมา focus แล้ว
  // supabase re-emit SIGNED_IN/TOKEN_REFRESHED) ต้องอัปเดตเงียบ ๆ ไม่งั้น AuthGuard สลับไป
  // skeleton → ทั้งหน้า (รวม dialog ที่เปิดค้าง) โดน unmount ข้อมูลในฟอร์มหาย
  const initializedRef = useRef(false);
  const userIdRef = useRef<string | null>(null);

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

    const clearLogoutTimer = () => {
      if (logoutTimerRef.current != null && typeof window !== "undefined") {
        window.clearTimeout(logoutTimerRef.current);
      }
      logoutTimerRef.current = null;
    };

    const setSignedOutState = () => {
      // sign-in รอบใหม่หลังจากนี้ต้องกลับไปโชว์ loading ได้อีก (กัน blocked เด้งระหว่างรอ profile)
      initializedRef.current = false;
      userIdRef.current = null;
      setUserId(null);
      setEmail(null);
      setProfile(null);
      setProfileError(null);
      setLoading(false);
    };

    const doClientSignOut = async () => {
      clearLogoutTimer();
      try {
        await supabase.auth.signOut();
      } finally {
        clearStartedAt();
        if (!cancelled) setSignedOutState();
      }
    };

    const refresh = async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session?.user) {
        clearLogoutTimer();
        clearStartedAt();
        if (!cancelled) {
          setSignedOutState();
        }
        return;
      }

      if (!cancelled && !initializedRef.current) {
        setLoading(true);
      }

      const startedAt = readStartedAt() ?? Date.now();
      if (!readStartedAt()) writeStartedAt(startedAt);
      const elapsed = Date.now() - startedAt;
      if (elapsed >= AUTO_LOGOUT_MS) {
        await doClientSignOut();
        return;
      }
      clearLogoutTimer();
      if (typeof window !== "undefined") {
        logoutTimerRef.current = window.setTimeout(() => {
          void doClientSignOut();
        }, AUTO_LOGOUT_MS - elapsed);
      }

      const uid = session.user.id;
      const userEmail = session.user.email ?? null;
      if (!cancelled) {
        userIdRef.current = uid;
        setUserId(uid);
        setEmail(userEmail);
      }

      try {
        const { data: p, error } = await supabase
          .from("profiles")
          .select(
            "id,email,role,is_active,display_name,avatar_url,line_user_id,line_linked_at,created_at",
          )
          .eq("id", uid)
          .single();
        if (cancelled) return;
        if (error) {
          setProfile(null);
          setProfileError(error.message);
        } else {
          setProfile(p as Profile);
          setProfileError(null);
        }
      } catch (e: any) {
        if (cancelled) return;
        setProfile(null);
        setProfileError(String(e?.message ?? "profile_fetch_error"));
      } finally {
        initializedRef.current = true;
        if (!cancelled) setLoading(false);
      }
    };

    refresh();
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        clearLogoutTimer();
        clearStartedAt();
      }
      // supabase re-emit SIGNED_IN/TOKEN_REFRESHED ทุกครั้งที่ tab กลับมา focus ทั้งที่เป็น
      // user เดิม — ข้ามไปเลย ไม่ต้อง re-fetch profile และไม่ reset นาฬิกา auto-logout
      const sameUser = !!session?.user?.id && session.user.id === userIdRef.current;
      if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && sameUser) return;
      if (event === "SIGNED_IN") {
        writeStartedAt(Date.now());
      }
      void refresh();
    });

    return () => {
      cancelled = true;
      clearLogoutTimer();
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  const refreshProfile = useCallback(async () => {
    if (!supabase) return;
    const uid = userId;
    if (!uid) return;
    const { data: p, error } = await supabase
      .from("profiles")
      .select(
        "id,email,role,is_active,display_name,avatar_url,line_user_id,line_linked_at,created_at",
      )
      .eq("id", uid)
      .single();
    if (error) {
      setProfile(null);
      setProfileError(error.message);
      return;
    }
    setProfile(p as Profile);
    setProfileError(null);
  }, [supabase, userId]);

  const value = useMemo<AuthState>(
    () => ({
      loading,
      envError,
      profileError,
      userId,
      email,
      role,
      profile,
      blocked,
      refreshProfile,
      signOut: async () => {
        initializedRef.current = false;
        userIdRef.current = null;
        if (!supabase) {
          clearStartedAt();
          if (logoutTimerRef.current != null && typeof window !== "undefined") {
            window.clearTimeout(logoutTimerRef.current);
          }
          logoutTimerRef.current = null;
          setUserId(null);
          setEmail(null);
          setProfile(null);
          setProfileError(null);
          setLoading(false);
          return;
        }
        try {
          await supabase.auth.signOut();
        } finally {
          clearStartedAt();
          if (logoutTimerRef.current != null && typeof window !== "undefined") {
            window.clearTimeout(logoutTimerRef.current);
          }
          logoutTimerRef.current = null;
          setUserId(null);
          setEmail(null);
          setProfile(null);
          setProfileError(null);
          setLoading(false);
        }
      },
    }),
    [
      blocked,
      email,
      envError,
      loading,
      profile,
      profileError,
      refreshProfile,
      role,
      supabase,
      userId,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
