"use client";

import React, { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Mic, UserPlus, RefreshCw, ShieldCheck, AlertCircle } from "lucide-react";

import { withBasePath } from "@/utils/base-path";

// URL แอดเพื่อน OA (เช่น https://lin.ee/xxxx หรือ https://line.me/R/ti/p/@basicId)
const ADD_FRIEND_URL = process.env.NEXT_PUBLIC_LINE_ADD_FRIEND_URL ?? "";

function LineLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.48 2 2 5.64 2 10.13c0 4.02 3.55 7.39 8.35 8.03.32.07.77.21.88.49.1.25.06.64.03.9l-.14.85c-.04.25-.2.99.87.54 1.07-.45 5.76-3.39 7.86-5.81C21.27 13.49 22 11.9 22 10.13 22 5.64 17.52 2 12 2zM8.28 12.4H6.3a.4.4 0 0 1-.4-.4V8.06a.4.4 0 0 1 .8 0v3.54h1.58a.4.4 0 0 1 0 .8zm1.56-.4a.4.4 0 0 1-.8 0V8.06a.4.4 0 0 1 .8 0v3.94zm4.62 0a.4.4 0 0 1-.27.38.4.4 0 0 1-.13.02.4.4 0 0 1-.32-.16l-2.02-2.75v2.51a.4.4 0 0 1-.8 0V8.06a.4.4 0 0 1 .72-.24l2.02 2.75V8.06a.4.4 0 0 1 .8 0v3.94zm3.1-2.37a.4.4 0 0 1 0 .8h-1.58v.78h1.58a.4.4 0 0 1 0 .8h-1.98a.4.4 0 0 1-.4-.4V8.06a.4.4 0 0 1 .4-.4h1.98a.4.4 0 0 1 0 .8h-1.58v.77h1.58z" />
    </svg>
  );
}

function AddFriendContent() {
  const searchParams = useSearchParams();
  const notYet = searchParams.get("status") === "notyet";

  return (
    <div className="w-full max-w-md">
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/60 sm:p-10">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <Mic className="h-5 w-5" />
          </span>
          <span className="text-xl font-bold tracking-tight text-slate-900">PERPOS</span>
        </div>

        <div className="mt-8 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#48CFAD]/10 text-[#48CFAD]">
          <UserPlus className="h-7 w-7" />
        </div>

        <h1 className="mt-5 text-2xl font-semibold text-slate-900">เพิ่มเพื่อน LINE ก่อนเริ่มใช้งาน</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          เพื่อให้ระบบส่งรายงานการประชุม (MoM) และการแจ้งเตือนกลับให้คุณทาง LINE ได้
          กรุณาเพิ่มบัญชีทางการ PERPOS เป็นเพื่อนก่อน แล้วกด “ตรวจสอบอีกครั้ง”
        </p>

        {notYet && (
          <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>ยังไม่พบว่าคุณเพิ่มเพื่อน — เปิด LINE แล้วกดเพิ่มเพื่อน จากนั้นลองตรวจสอบอีกครั้ง</span>
          </div>
        )}

        <div className="mt-7 space-y-3">
          {ADD_FRIEND_URL ? (
            <a
              href={ADD_FRIEND_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-[#48CFAD] px-4 py-3.5 text-base font-semibold text-white shadow-sm transition-all hover:bg-[#46BC9E] hover:shadow-md active:scale-[0.99]"
            >
              <LineLogo className="h-5 w-5" />
              เพิ่มเพื่อนใน LINE
            </a>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-center text-sm text-slate-500">
              ค้นหาบัญชีทางการ <span className="font-semibold text-slate-700">PERPOS</span> ใน LINE แล้วกดเพิ่มเพื่อน
            </div>
          )}

          <a
            href={withBasePath("/line/verify-follow")}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-base font-semibold text-slate-700 transition-all hover:bg-slate-50 active:scale-[0.99]"
          >
            <RefreshCw className="h-4 w-4" />
            เพิ่มเพื่อนแล้ว · ตรวจสอบอีกครั้ง
          </a>
        </div>

        <div className="mt-6 flex items-center justify-center gap-1.5 text-xs text-slate-400">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
          ปลอดภัยตามมาตรฐาน · เราไม่นำข้อมูลเสียงไปฝึกโมเดล AI
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          เข้าผิดบัญชี?{" "}
          <a href={withBasePath("/signin")} className="text-slate-500 underline-offset-2 hover:underline">
            กลับไปหน้าเข้าสู่ระบบ
          </a>
        </p>
      </div>
    </div>
  );
}

export default function AddFriendPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />
        </div>
      }
    >
      <AddFriendContent />
    </Suspense>
  );
}
