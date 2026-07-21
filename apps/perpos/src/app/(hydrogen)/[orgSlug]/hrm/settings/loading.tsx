// loading.tsx — skeleton หน้าตั้งค่า (production) — ห้าม spinner กลางจอ (DESIGN §9)
export default function Loading() {
  return (
    <div className="animate-pulse space-y-5">
      <div className="h-8 w-40 rounded bg-gray-200" />
      <div className="h-12 rounded-xl border border-gray-200 bg-white" />
      <div className="h-96 rounded-xl border border-gray-200 bg-white" />
    </div>
  );
}
