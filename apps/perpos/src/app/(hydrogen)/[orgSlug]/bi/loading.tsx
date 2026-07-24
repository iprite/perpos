// loading.tsx — skeleton ห้องถาม-ตอบ BI (DESIGN §9 — ห้าม spinner กลางจอ)
export default function Loading() {
  return (
    <div className="animate-pulse space-y-5">
      <div className="h-8 w-64 rounded bg-gray-200" />
      <div className="h-9 w-72 rounded-lg bg-gray-100" />
      <div className="h-64 rounded-xl border border-gray-200 bg-white" />
      <div className="h-24 rounded-xl border border-gray-200 bg-white" />
    </div>
  );
}
