// loading.tsx — skeleton รายการแดชบอร์ด (DESIGN §9 — ห้าม spinner กลางจอ)
export default function Loading() {
  return (
    <div className="animate-pulse space-y-5">
      <div className="h-8 w-56 rounded bg-gray-200" />
      <div className="h-8 w-40 rounded-lg bg-gray-100" />
      <div className="h-56 rounded-xl border border-gray-200 bg-white" />
    </div>
  );
}
