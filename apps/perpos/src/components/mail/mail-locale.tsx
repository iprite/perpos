"use client";

/**
 * ภาษาของเว็บเมล (th/en) ฝั่ง React — provider ตัวเดียวห่อทั้งโซน `(mail)` ที่ `MailShell`
 *
 * ลำดับค่า: SSR อ่าน cookie → `initialLocale` (จอแรกถูกภาษาเลย ไม่วูบ)
 *          → เบราว์เซอร์อ่านค่าจริงจาก `/api/mail/prefs` (ไฟล์ในกล่องเมล — ตามตัวไปทุกเครื่อง) มาทับ
 * ตอนเปลี่ยน: state ทันที + cookie + localStorage + PUT prefs (fire-and-forget)
 *
 * ทำไมไม่เก็บใน DB ของ PERPOS: invariant ข้อ 1 ของโซน `(mail)` — ลูกค้าเมลไม่มีบัญชี PERPOS
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import {
  MAIL_LOCALE_COOKIE,
  MAIL_LOCALE_DEFAULT,
  MAIL_LOCALE_STORAGE_KEY,
  MAIL_LOCALE_TAGS,
  type MailLocale,
  type MailTranslate,
  normalizeMailLocale,
  translateMail,
} from "@/lib/mail/i18n";
import { fetchMailPrefsShared } from "@/lib/mail/prefs-storage";

interface MailLocaleContextValue {
  locale: MailLocale;
  /** เปลี่ยนภาษา + จำไว้ทุกที่ (`persist=false` = แค่ทาค่าที่โหลดมา ไม่เขียนกลับ) */
  setLocale: (next: MailLocale, opts?: { persist?: boolean }) => void;
  t: MailTranslate;
}

const MailLocaleContext = createContext<MailLocaleContextValue | null>(null);

function writeLocaleCookie(locale: MailLocale): void {
  try {
    // 1 ปี · SameSite=Lax พอ (ไม่ใช่ความลับ) · ไม่ตั้ง domain — โดเมนเมลกับ dev คนละที่อยู่แล้ว
    document.cookie = `${MAIL_LOCALE_COOKIE}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax${
      location.protocol === "https:" ? "; Secure" : ""
    }`;
  } catch {
    /* ไม่มี document (SSR) หรือ cookie ถูกปิด — ยังใช้งานได้ */
  }
}

export function cacheMailLocale(locale: MailLocale): void {
  writeLocaleCookie(locale);
  try {
    localStorage.setItem(MAIL_LOCALE_STORAGE_KEY, locale);
  } catch {
    /* โหมดส่วนตัว = ไม่จำ */
  }
}

/** ออกจากระบบ — ล้างทั้ง cookie และแคช (คนถัดไปบนเครื่องเดียวกันเริ่มที่ค่าเริ่มต้น) */
export function clearCachedMailLocale(): void {
  try {
    document.cookie = `${MAIL_LOCALE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
    localStorage.removeItem(MAIL_LOCALE_STORAGE_KEY);
  } catch {
    /* ไม่มีอะไรให้ล้าง */
  }
}

export function MailLocaleProvider({
  initialLocale,
  connected,
  children,
}: {
  /** จาก cookie ตอน SSR — ไม่มี = ค่าเริ่มต้น */
  initialLocale?: MailLocale;
  /** เชื่อมกล่องเมลแล้วเท่านั้นถึงจะไปอ่าน/เขียน prefs ที่เซิร์ฟเวอร์ */
  connected: boolean;
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = useState<MailLocale>(initialLocale ?? MAIL_LOCALE_DEFAULT);

  const setLocale = useCallback((next: MailLocale, opts?: { persist?: boolean }) => {
    setLocaleState(next);
    cacheMailLocale(next);
    if (opts?.persist === false) return;
    // fire-and-forget — พลาดก็แค่เครื่องอื่นยังเป็นภาษาเดิม (แก้ใหม่ได้)
    void fetch("/api/mail/prefs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: next }),
    }).catch(() => {});
  }, []);

  // ค่าจริงจากกล่องเมลมาทับ (เครื่องใหม่/ล้าง cookie แล้วยังได้ภาษาเดิม)
  useEffect(() => {
    if (!connected) return;
    let alive = true;
    fetchMailPrefsShared<{ locale?: unknown }>()
      .then((data) => {
        if (!alive || !data) return;
        const fromServer = normalizeMailLocale(data.locale);
        setLocaleState((prev) => {
          if (prev !== fromServer) cacheMailLocale(fromServer);
          return fromServer;
        });
      })
      .catch(() => {
        /* โหลดไม่ได้ = ใช้ค่าจาก cookie/ค่าเริ่มต้น */
      });
    return () => {
      alive = false;
    };
  }, [connected]);

  // `<html lang>` เป็นของ root layout (Suite/Flow) — โซนเมลปรับเองฝั่งเบราว์เซอร์
  useEffect(() => {
    document.documentElement.lang = MAIL_LOCALE_TAGS[locale].split("-")[0] ?? locale;
  }, [locale]);

  const value = useMemo<MailLocaleContextValue>(
    () => ({ locale, setLocale, t: (key, vars) => translateMail(locale, key, vars) }),
    [locale, setLocale],
  );

  return <MailLocaleContext.Provider value={value}>{children}</MailLocaleContext.Provider>;
}

/** ใช้ในทุก component ใต้ `MailShell` — นอก provider (ไม่ควรเกิด) จะได้ค่าเริ่มต้นแทนการพัง */
export function useMailLocale(): MailLocaleContextValue {
  const ctx = useContext(MailLocaleContext);
  if (ctx) return ctx;
  return {
    locale: MAIL_LOCALE_DEFAULT,
    setLocale: () => {},
    t: (key, vars) => translateMail(MAIL_LOCALE_DEFAULT, key, vars),
  };
}

/** ทางลัด — `const t = useMailT();` */
export function useMailT(): MailTranslate {
  return useMailLocale().t;
}
