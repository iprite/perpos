// loading.tsx — skeleton ของ prototype nursing_home (โครง sidebar + content ตาม NursingShell)
// ห้าม spinner กลางจอ (DESIGN §9)

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-none animate-pulse space-y-5 px-1 py-2 sm:px-2 lg:px-3">
      {/* prototype banner */}
      <div className="-mt-2 h-9 rounded-lg bg-amber-50" />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* sidebar */}
        <aside className="hidden lg:col-span-3 lg:block xl:col-span-2">
          <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-3">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-7 rounded bg-gray-100" />
            ))}
          </div>
        </aside>

        {/* content */}
        <main className="min-w-0 space-y-5 lg:col-span-9 xl:col-span-10">
          <div className="h-8 w-64 rounded bg-gray-200" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 rounded-xl border border-gray-200 bg-white" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-24 rounded-xl border border-gray-200 bg-white" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="h-64 rounded-xl border border-gray-200 bg-white lg:col-span-2" />
            <div className="h-64 rounded-xl border border-gray-200 bg-white" />
          </div>
        </main>
      </div>
    </div>
  );
}
