// loading.tsx — skeleton หน้ารายงาน (DESIGN §9)
export default function Loading() {
  return (
    <div className="animate-pulse space-y-5">
      <div className="h-8 w-40 rounded bg-gray-200" />
      <div className="h-24 rounded-xl border border-gray-200 bg-white" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl border border-gray-200 bg-white" />
        ))}
      </div>
      <div className="h-64 rounded-xl border border-gray-200 bg-white" />
    </div>
  );
}
