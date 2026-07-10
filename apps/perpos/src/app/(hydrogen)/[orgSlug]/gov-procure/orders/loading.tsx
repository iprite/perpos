// loading.tsx — skeleton หน้ารายการงาน (DESIGN §9)
export default function Loading() {
  return (
    <div className="animate-pulse space-y-5">
      <div className="h-8 w-48 rounded bg-gray-200" />
      <div className="h-20 rounded-xl border border-gray-200 bg-white" />
      <div className="h-80 rounded-xl border border-gray-200 bg-white" />
    </div>
  );
}
