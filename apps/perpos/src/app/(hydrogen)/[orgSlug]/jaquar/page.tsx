"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { PageShell } from "@/components/ui/page-shell";
import {
  LayoutDashboard,
  Package,
  TrendingUp,
  MapPin,
  AlertTriangle,
  Sliders,
  ChevronRight,
  AlertCircle,
  FileSpreadsheet,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  BarChart,
  Bar,
} from "recharts";
import { toast } from "@/lib/toast";

export default function JaquarDashboardPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  // State
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashboardData, setDashboardData] = useState<{
    stats: {
      totalSkus: number;
      totalQty: number;
      outOfStockCount: number;
      lowStockCount: number;
    };
    locations: any[];
    trends: any[];
  } | null>(null);

  // 1. Fetch Org ID
  useEffect(() => {
    async function loadOrg() {
      try {
        const { data, error } = await supabase
          .from("organizations")
          .select("id")
          .eq("slug", orgSlug)
          .single();
        if (error) throw new Error("ไม่พบข้อมูลองค์กร");
        setOrgId(data.id);
      } catch (err: any) {
        setError(err.message);
        setLoading(false);
      }
    }
    loadOrg();
  }, [supabase, orgSlug]);

  // 2. Fetch Dashboard Statistics
  const loadDashboard = useCallback(async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      setError(null);

      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("กรุณาเข้าสู่ระบบใหม่");

      const res = await fetch(`/api/jaquar/dashboard?orgId=${orgId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "เกิดข้อผิดพลาดในการโหลดข้อมูลสถิติ");
      }

      const json = await res.json();
      setDashboardData(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [orgId, supabase]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  // Navigate helper
  const navigateToStock = () => {
    router.push(`/${orgSlug}/jaquar/stock`);
  };

  if (loading && !dashboardData) {
    return (
      <PageShell
        width="full"
        icon={<LayoutDashboard className="h-6 w-6" />}
        title="แผงควบคุมสต๊อก Jaquar (Dashboard)"
        description="ภาพรวมสถิติคลังสินค้าและดัชนีชี้วัดข้อมูลสต๊อก"
      >
        <div className="animate-pulse space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 rounded-xl bg-gray-100" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="h-80 rounded-xl bg-gray-100 lg:col-span-2" />
            <div className="h-80 rounded-xl bg-gray-100" />
          </div>
          <div className="h-24 rounded-xl bg-gray-100" />
        </div>
      </PageShell>
    );
  }

  if (error && !dashboardData) {
    return (
      <div className="p-4 md:p-6">
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={loadDashboard} className="ml-auto">
            ลองใหม่
          </Button>
        </div>
      </div>
    );
  }

  const stats = dashboardData?.stats || {
    totalSkus: 0,
    totalQty: 0,
    outOfStockCount: 0,
    lowStockCount: 0,
  };

  const locations = dashboardData?.locations || [];
  const trends = dashboardData?.trends || [];

  return (
    <PageShell
      width="full"
      icon={<LayoutDashboard className="h-6 w-6" />}
      title="แผงควบคุมสต๊อก Jaquar (Dashboard)"
      description="ภาพรวมสถิติคลังสินค้าและดัชนีชี้วัดข้อมูลสต๊อก"
      actions={
        <Button onClick={navigateToStock} size="sm" className="flex items-center gap-1">
          จัดการคลังสินค้า
          <ChevronRight className="h-4 w-4" />
        </Button>
      }
    >
      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Package className="h-4 w-4" />}
          label="รายการสินค้าทั้งหมด (SKUs)"
          value={stats.totalSkus.toLocaleString()}
          tone="primary"
          valueColored
        />
        <StatCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="สต๊อกพร้อมขายรวมทั้งหมด"
          value={`${stats.totalQty.toLocaleString()} ชิ้น`}
          sub="พร้อมบริการและจัดส่ง"
          tone="positive"
          valueColored
        />
        <StatCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="สินค้าที่หมดสต๊อก"
          value={`${stats.outOfStockCount.toLocaleString()} SKUs`}
          sub={stats.outOfStockCount > 0 ? "ต้องการสั่งซื้อเติมด่วน" : "คลังอยู่ในสถานะดีเยี่ยม"}
          tone="negative"
          valueColored
        />
        <StatCard
          icon={<Sliders className="h-4 w-4" />}
          label="สินค้าสต๊อกคงเหลือต่ำ (ต่ำกว่า 5)"
          value={`${stats.lowStockCount.toLocaleString()} SKUs`}
          sub={stats.lowStockCount > 0 ? "แจ้งเตือนเฝ้าระวังต่ำกว่าเกณฑ์" : "ไม่มีสถิติเฝ้าระวัง"}
          tone="warning"
          valueColored
        />
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Chart Column */}
        <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between border-b pb-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-800">
                แนวโน้มยอดขายและการเคลื่อนไหวสต๊อก
              </h3>
              <p className="text-xs text-gray-400">
                สถิติการรับสินค้าเข้า (IN) และจ่ายออก (OUT) ในแต่ละวัน
              </p>
            </div>
            <StatusBadge tone="info">อ้างอิงรายวัน</StatusBadge>
          </div>
          {trends.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-xs text-gray-400">
              ยังไม่มีข้อมูลการเดินคลังเพื่อวาดกราฟแนวโน้ม
            </div>
          ) : (
            <div className="h-72 w-full text-xs">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trends} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorIn" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#48CFAD" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#48CFAD" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorOut" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#D8334A" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#D8334A" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F5F7FA" />
                  <XAxis dataKey="date" stroke="#9CA3AF" fontSize={10} />
                  <YAxis stroke="#9CA3AF" fontSize={10} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#fff",
                      border: "1px solid #E6E9EE",
                      borderRadius: "8px",
                      fontSize: "11px",
                    }}
                  />
                  <Legend verticalAlign="top" height={36} iconSize={8} iconType="circle" />
                  <Area
                    name="รับสินค้าเข้า (IN)"
                    type="monotone"
                    dataKey="inQty"
                    stroke="#48CFAD"
                    fillOpacity={1}
                    fill="url(#colorIn)"
                    strokeWidth={2}
                  />
                  <Area
                    name="จ่ายสินค้าออก (OUT)"
                    type="monotone"
                    dataKey="outQty"
                    stroke="#D8334A"
                    fillOpacity={1}
                    fill="url(#colorOut)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Top Locations Column */}
        <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between border-b pb-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-800">10 อันดับทำเลที่จัดเก็บหลัก</h3>
              <p className="text-xs text-gray-400">
                การจัดกลุ่มปริมาณสินค้าคงคลังในแต่ละจุดจัดเก็บ
              </p>
            </div>
            <MapPin className="h-4 w-4 text-gray-400" />
          </div>

          {locations.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-xs text-gray-400">
              ไม่มีข้อมูลตำแหน่งจัดเก็บ
            </div>
          ) : (
            <div className="max-h-[17.5rem] space-y-3.5 overflow-y-auto pr-1">
              {locations.map((loc, idx) => {
                const maxQty = locations[0]?.qty || 1;
                const percentage = Math.round((loc.qty / maxQty) * 100);
                return (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-semibold text-gray-700">
                      <span className="flex items-center gap-1">
                        <StatusBadge tone="neutral" className="px-1.5 py-0 text-[10px]">
                          #{idx + 1}
                        </StatusBadge>
                        {loc.name}
                      </span>
                      <span className="tabular-nums">
                        {loc.qty.toLocaleString()} ชิ้น{" "}
                        <span className="text-[10px] font-normal text-gray-400">
                          ({loc.skus} SKUs)
                        </span>
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-2 rounded-full bg-primary transition-[width] duration-300"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Quick Setup Notice / Action Box */}
      <div className="flex flex-col items-center justify-between gap-4 rounded-xl border border-gray-200 bg-gray-50 p-4 sm:flex-row">
        <div className="flex items-start gap-3 text-center sm:text-left">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600">
            <FileSpreadsheet className="h-5 w-5" />
          </span>
          <div className="space-y-0.5">
            <h3 className="text-sm font-semibold text-gray-800">
              นำเข้าข้อมูลสต๊อกอย่างรวดเร็ว (CSV Stock Uploader)
            </h3>
            <p className="max-w-xl text-xs text-gray-500">
              คุณสามารถอัปเดตยอดสต๊อกหรืออัปโหลดโครงสร้างข้อมูลคลังสินค้าของคุณผ่านหน้าจัดการคลังสินค้าได้โดยตรง
              สะดวก และรวดเร็ว
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={navigateToStock} className="shrink-0">
          เริ่มต้นอัปโหลดสต๊อกสินค้า
        </Button>
      </div>
    </PageShell>
  );
}
