// loading.tsx — skeleton ของโซนแคตตาล็อก (header + disclaimer + KPI 4 ใบ + ตาราง)
// DESIGN §9: skeleton เท่านั้น ห้าม spinner กลางจอ
export default function Loading() {
  return (
    <div className="animate-pulse space-y-5">
      <div className="h-8 w-64 rounded bg-gray-200" />
      <div className="h-16 rounded-xl border border-gray-200 bg-white" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl border border-gray-200 bg-white" />
        ))}
      </div>
      <div className="h-12 rounded-xl border border-gray-200 bg-white" />
      <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-9 rounded bg-gray-100" />
        ))}
      </div>
    </div>
  );
}
