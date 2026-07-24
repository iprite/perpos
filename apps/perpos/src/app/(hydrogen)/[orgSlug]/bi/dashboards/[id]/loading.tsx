// loading.tsx — skeleton แดชบอร์ด (การ์ดคำนวณตอน SSR จึงต้องมีโครงรอ · DESIGN §9)
export default function Loading() {
  return (
    <div className="animate-pulse space-y-5">
      <div className="h-8 w-64 rounded bg-gray-200" />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
            <div className="h-3 w-1/3 rounded bg-gray-100" />
            <div className="h-40 rounded-lg bg-gray-100" />
            <div className="h-3 w-2/3 rounded bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
