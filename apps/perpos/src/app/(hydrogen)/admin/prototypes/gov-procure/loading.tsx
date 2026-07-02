// loading.tsx — skeleton ของ prototype gov_procure (banner + tab + 4 stat + block)
// ห้าม spinner กลางจอ (DESIGN §9) · ตาม GovProcureShell layout

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-none animate-pulse space-y-5 px-1 py-2 sm:px-2 lg:px-3">
      {/* prototype banner */}
      <div className="-mt-2 h-9 rounded-lg bg-amber-50" />
      {/* tab bar */}
      <div className="h-11 rounded-xl border border-gray-200 bg-white" />

      {/* title */}
      <div className="h-8 w-56 rounded bg-gray-200" />

      {/* KPI stat cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl border border-gray-200 bg-white" />
        ))}
      </div>

      {/* highlight card + pipeline */}
      <div className="h-40 rounded-xl border border-gray-200 bg-white" />
      <div className="h-64 rounded-xl border border-gray-200 bg-white" />
    </div>
  );
}
