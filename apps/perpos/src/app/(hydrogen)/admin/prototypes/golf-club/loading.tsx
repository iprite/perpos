// loading.tsx — skeleton ของ prototype golf-club (banner + tab + KPI + grid) — ห้าม spinner (DESIGN §9)

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-none animate-pulse space-y-5 px-1 py-2 sm:px-2 lg:px-3">
      <div className="h-8 w-64 rounded bg-gray-200" />
      {/* prototype banner */}
      <div className="h-9 rounded-lg bg-amber-50" />
      {/* tab bar */}
      <div className="h-11 rounded-xl border border-gray-200 bg-white" />
      {/* KPI */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl border border-gray-200 bg-white" />
        ))}
      </div>
      {/* content */}
      <div className="h-96 rounded-xl border border-gray-200 bg-white" />
    </div>
  );
}
