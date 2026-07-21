// loading.tsx — skeleton แฟ้มพนักงาน 360° (DESIGN §9 — ห้าม spinner กลางจอ)
export default function Loading() {
  return (
    <div className="animate-pulse space-y-5">
      <div className="h-8 w-48 rounded bg-gray-200" />
      <div className="h-32 rounded-xl border border-gray-200 bg-white" />
      <div className="h-12 rounded-xl border border-gray-200 bg-white" />
      <div className="h-64 rounded-xl border border-gray-200 bg-white" />
    </div>
  );
}
