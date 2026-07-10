// loading.tsx — skeleton บอร์ดไปป์ไลน์ (DESIGN §9)
export default function Loading() {
  return (
    <div className="animate-pulse space-y-5">
      <div className="h-8 w-48 rounded bg-gray-200" />
      <div className="grid grid-cols-1 gap-3 lg:flex lg:gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-64 rounded-xl border border-gray-200 bg-white lg:w-[300px] lg:shrink-0"
          />
        ))}
      </div>
    </div>
  );
}
