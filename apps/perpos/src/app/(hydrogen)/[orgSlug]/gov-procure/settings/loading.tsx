// loading.tsx — skeleton หน้าตั้งค่า/แจ้งเตือน (DESIGN §9)
export default function Loading() {
  return (
    <div className="animate-pulse space-y-5">
      <div className="h-8 w-48 rounded bg-gray-200" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-52 rounded-xl border border-gray-200 bg-white" />
      ))}
    </div>
  );
}
