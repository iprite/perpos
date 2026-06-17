'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageShell } from '@/components/ui/page-shell';
import {
  LayoutDashboard,
  Package,
  TrendingUp,
  MapPin,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Sliders,
  ChevronRight,
  Loader2,
  AlertCircle,
  FileSpreadsheet,
} from 'lucide-react';
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
} from 'recharts';
import toast, { Toaster } from 'react-hot-toast';

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
          .from('organizations')
          .select('id')
          .eq('slug', orgSlug)
          .single();
        if (error) throw new Error('ไม่พบข้อมูลองค์กร');
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
      if (!token) throw new Error('กรุณาเข้าสู่ระบบใหม่');

      const res = await fetch(`/api/jaquar/dashboard?orgId=${orgId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'เกิดข้อผิดพลาดในการโหลดข้อมูลสถิติ');
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
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
          <span className="text-sm text-slate-500">กำลังโหลดแดชบอร์ด...</span>
        </div>
      </div>
    );
  }

  if (error && !dashboardData) {
    return (
      <div className="p-4 md:p-6">
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
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
        <>
          <Button onClick={navigateToStock} size="sm" className="bg-indigo-600 hover:bg-indigo-700 flex items-center gap-1">
            จัดการคลังสินค้า
            <ChevronRight className="w-4 h-4" />
          </Button>
        </>
      }
    >
      <Toaster position="top-right" />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total SKUs */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden flex flex-col justify-between group hover:shadow-md transition-all duration-300">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform duration-300">
            <Package className="w-16 h-16 text-indigo-600" />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">รายการสินค้าทั้งหมด (SKUs)</span>
            <h3 className="text-2xl font-black text-slate-800 mt-1">{stats.totalSkus.toLocaleString()}</h3>
          </div>
          <div className="flex items-center gap-1.5 mt-4 text-xs font-medium text-indigo-600 cursor-pointer" onClick={navigateToStock}>
            <span>ไปหน้าจัดการสินค้า</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* Card 2: Total Saleable Qty */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden flex flex-col justify-between group hover:shadow-md transition-all duration-300">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform duration-300">
            <TrendingUp className="w-16 h-16 text-emerald-600" />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">สต๊อกพร้อมขายรวมทั้งหมด</span>
            <h3 className="text-2xl font-black text-slate-800 mt-1">{stats.totalQty.toLocaleString()} <span className="text-sm font-normal text-slate-500">ชิ้น</span></h3>
          </div>
          <div className="flex items-center gap-1.5 mt-4 text-xs font-medium text-emerald-600">
            <span>พร้อมบริการและจัดส่ง</span>
          </div>
        </div>

        {/* Card 3: Out of Stock */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden flex flex-col justify-between group hover:shadow-md transition-all duration-300">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform duration-300">
            <AlertTriangle className="w-16 h-16 text-red-600" />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">สินค้าที่หมดสต๊อก</span>
            <h3 className="text-2xl font-black text-slate-800 mt-1">{stats.outOfStockCount.toLocaleString()} <span className="text-sm font-normal text-slate-500">SKUs</span></h3>
          </div>
          <div className="flex items-center mt-4">
            {stats.outOfStockCount > 0 ? (
              <Badge variant="danger" className="bg-red-50 text-red-700 text-[10px] font-semibold">
                ต้องการสั่งซื้อเติมด่วน
              </Badge>
            ) : (
              <span className="text-xs text-slate-400">คลังอยู่ในสถานะดีเยี่ยม</span>
            )}
          </div>
        </div>

        {/* Card 4: Low Stock */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden flex flex-col justify-between group hover:shadow-md transition-all duration-300">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform duration-300">
            <Sliders className="w-16 h-16 text-amber-600" />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">สินค้าสต๊อกคงเหลือต่ำ (ต่ำกว่า 5)</span>
            <h3 className="text-2xl font-black text-slate-800 mt-1">{stats.lowStockCount.toLocaleString()} <span className="text-sm font-normal text-slate-500">SKUs</span></h3>
          </div>
          <div className="flex items-center mt-4">
            {stats.lowStockCount > 0 ? (
              <Badge variant="secondary" className="bg-amber-50 text-amber-700 text-[10px] font-medium">
                แจ้งเตือนเฝ้าระวังต่ำกว่าเกณฑ์
              </Badge>
            ) : (
              <span className="text-xs text-slate-400">ไม่มีสถิติเฝ้าระวัง</span>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart Column */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-800">แนวโน้มยอดขายและการเคลื่อนไหวสต๊อก</h3>
              <p className="text-xs text-slate-400">สถิติการรับสินค้าเข้า (IN) และจ่ายออก (OUT) ในแต่ละวัน</p>
            </div>
            <Badge variant="secondary" className="bg-indigo-50 text-indigo-700 text-[10px]">
              อ้างอิงรายวัน
            </Badge>
          </div>
          {trends.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-slate-400 text-xs">
              ยังไม่มีข้อมูลการเดินคลังเพื่อวาดกราฟแนวโน้ม
            </div>
          ) : (
            <div className="h-72 w-full text-xs">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trends} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorIn" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#48CFAD" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#48CFAD" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorOut" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#D8334A" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#D8334A" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F5F7FA" />
                  <XAxis dataKey="date" stroke="#9CA3AF" fontSize={10} />
                  <YAxis stroke="#9CA3AF" fontSize={10} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#fff',
                      border: '1px solid #E6E9EE',
                      borderRadius: '8px',
                      fontSize: '11px',
                    }}
                  />
                  <Legend verticalAlign="top" height={36} iconSize={8} iconType="circle" />
                  <Area name="รับสินค้าเข้า (IN)" type="monotone" dataKey="inQty" stroke="#48CFAD" fillOpacity={1} fill="url(#colorIn)" strokeWidth={2} />
                  <Area name="จ่ายสินค้าออก (OUT)" type="monotone" dataKey="outQty" stroke="#D8334A" fillOpacity={1} fill="url(#colorOut)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Top Locations Column */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-800">10 อันดับทำเลที่จัดเก็บหลัก</h3>
              <p className="text-xs text-slate-400">การจัดกลุ่มปริมาณสินค้าคงคลังในแต่ละจุดจัดเก็บ</p>
            </div>
            <MapPin className="w-4 h-4 text-slate-400" />
          </div>

          {locations.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-slate-400 text-xs">
              ไม่มีข้อมูลตำแหน่งจัดเก็บ
            </div>
          ) : (
            <div className="space-y-3.5 overflow-y-auto max-h-[17.5rem] pr-1">
              {locations.map((loc, idx) => {
                const maxQty = locations[0]?.qty || 1;
                const percentage = Math.round((loc.qty / maxQty) * 100);
                return (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                      <span className="flex items-center gap-1">
                        <Badge className="bg-slate-100 text-slate-800 text-[9px] px-1.5 py-0">#{idx+1}</Badge>
                        {loc.name}
                      </span>
                      <span>{loc.qty.toLocaleString()} ชิ้น <span className="text-[10px] text-slate-400 font-normal">({loc.skus} SKUs)</span></span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-indigo-600 h-2 rounded-full transition-[width] duration-300"
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
      <div className="bg-gradient-to-r from-indigo-900 to-indigo-950 p-6 rounded-2xl text-white shadow-md relative overflow-hidden flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="space-y-1 text-center sm:text-left z-10">
          <h3 className="font-bold text-md flex items-center justify-center sm:justify-start gap-2">
            <FileSpreadsheet className="w-5 h-5 text-indigo-300" />
            นำเข้าข้อมูลสต๊อกอย่างรวดเร็ว (CSV Stock Uploader)
          </h3>
          <p className="text-xs text-indigo-200 max-w-xl">
            คุณสามารถอัปเดตยอดสต๊อกหรืออัปโหลดโครงสร้างข้อมูลคลังสินค้าของคุณผ่านหน้าจัดการคลังสินค้าได้โดยตรง สะดวก และรวดเร็ว
          </p>
        </div>
        <Button onClick={navigateToStock} className="bg-white text-indigo-950 hover:bg-indigo-50 font-bold shrink-0 shadow-sm transition-transform duration-300 hover:scale-[1.02] text-xs">
          เริ่มต้นอัปโหลดสต๊อกสินค้า
        </Button>
        <div className="absolute -bottom-10 -right-10 w-44 h-44 rounded-full bg-indigo-800 opacity-20 pointer-events-none" />
      </div>
    </PageShell>
  );
}
