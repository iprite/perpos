"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Badge, Button, Title, Text } from "rizzui";
import { Link2, Mail, Shield, User, Settings } from "lucide-react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/app/shared/auth-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type PermissionRow = { function_key: string; allowed: boolean };

export default function MePage() {
  const router = useRouter();
  const { email, profile, role, userId } = useAuth();
  const [loadingPerms, setLoadingPerms] = useState(false);
  const [permissions, setPermissions] = useState<PermissionRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const isLineLinked = Boolean(profile?.line_user_id);
  const displayName = String(profile?.display_name ?? email ?? "").trim();

  const visiblePermissions = useMemo(() => {
    return permissions.filter((p) => p.allowed).map((p) => p.function_key);
  }, [permissions]);

  useEffect(() => {
    if (!userId) return;
    if (role === "admin") {
      setPermissions([]);
      return;
    }
    let cancelled = false;
    setLoadingPerms(true);
    setError(null);
    const run = async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data, error: e } = await supabase
          .from("user_permissions")
          .select("function_key,allowed")
          .eq("user_id", userId)
          .order("function_key", { ascending: true });
        if (cancelled) return;
        if (e) {
          setError(e.message);
          setPermissions([]);
          return;
        }
        setPermissions((data ?? []) as PermissionRow[]);
      } catch (e: any) {
        if (cancelled) return;
        setError(String(e?.message ?? "permission_fetch_error"));
        setPermissions([]);
      } finally {
        if (cancelled) return;
        setLoadingPerms(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [role, userId]);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Title as="h1" className="text-xl font-semibold">
            แดชบอร์ด
          </Title>
          <Text className="mt-1 text-sm text-gray-600">ใช้งาน PERPOS ผ่าน LINE เป็นหลัก</Text>
        </div>

        <Button
          variant="outline"
          className="gap-2"
          onClick={() => {
            router.push("/settings");
          }}
        >
          <Settings className="h-4 w-4" />
          ตั้งค่าผู้ใช้งาน
        </Button>
      </div>

      {error ? <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2 text-gray-900">
            <User className="h-4 w-4" />
            <div className="text-sm font-semibold">บัญชี</div>
          </div>
          <div className="mt-4 grid gap-2 text-sm">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-gray-500" />
              <div className="text-gray-700">{email ?? "-"}</div>
            </div>
            <div className="text-gray-600">ชื่อที่แสดง: {displayName || "-"}</div>
            <div className="text-gray-600">Role: {role ?? "-"}</div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3 text-gray-900">
            <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            <div className="text-sm font-semibold">เชื่อมต่อ LINE</div>
            </div>
            <Badge
              variant="flat"
              size="sm"
              color={isLineLinked ? "success" : "danger"}
              className="border px-2 py-0.5 text-xs font-normal tracking-wide"
            >
              {isLineLinked ? "เชื่อมต่อแล้ว" : "ยังไม่เชื่อม"}
            </Badge>
          </div>
          <div className="mt-4 text-sm text-gray-700">
            {isLineLinked ? (
              <div>
                เชื่อมแล้ว ({profile?.line_user_id})
                <div className="mt-2 text-xs text-gray-500">ต้องการเปลี่ยน/เชื่อมใหม่ ไปที่หน้า “ตั้งค่าผู้ใช้งาน”</div>
              </div>
            ) : (
              <div>
                ยังไม่เชื่อมบัญชี
                <div className="mt-2 text-xs text-gray-500">ไปที่หน้า “ตั้งค่าผู้ใช้งาน” เพื่อสร้าง QR สำหรับเชื่อม LINE @perpos</div>
              </div>
            )}
          </div>

          <div className="mt-4">
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => {
                router.push("/settings");
              }}
            >
              <Settings className="h-4 w-4" />
              ไปที่ตั้งค่าผู้ใช้งาน
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex items-center gap-2 text-gray-900">
          <Shield className="h-4 w-4" />
          <div className="text-sm font-semibold">สิทธิ์การใช้งาน</div>
        </div>
        <div className="mt-3 text-sm text-gray-700">
          {role === "admin" ? (
            <div>แอดมินใช้งานได้ทุกฟังก์ชัน และสามารถใช้หน้า User นี้ได้เช่นกัน</div>
          ) : loadingPerms ? (
            <div>กำลังโหลดสิทธิ์…</div>
          ) : visiblePermissions.length ? (
            <div className="grid gap-1">
              {visiblePermissions.map((k) => (
                <div key={k} className="rounded-lg bg-gray-50 px-3 py-2 font-mono text-xs text-gray-800">
                  {k}
                </div>
              ))}
            </div>
          ) : (
            <div>ยังไม่มีสิทธิ์ที่เปิดใช้งาน (ให้แอดมินตั้งค่าที่ /admin/permissions)</div>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-5">
        <div className="text-sm font-semibold text-gray-900">คำสั่งที่ใช้ใน LINE (ตัวอย่าง)</div>
        <div className="mt-3 grid gap-2 text-sm text-gray-700">
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 font-mono">สรุปข่าว</div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 font-mono">รายรับ 1200 ค่าจ้าง</div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 font-mono">รายจ่าย 80 กาแฟ</div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 font-mono">นัด 09:30 ประชุมทีม</div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 font-mono">วันนี้</div>
        </div>
      </div>
    </div>
  );
}
