/** โครงหน้าตั้งค่าบัญชี — skeleton ไม่ใช่ spinner (DESIGN.md §9) */
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-2xl animate-pulse space-y-4">
      <div className="h-7 w-40 rounded bg-gray-100" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="h-4 w-32 rounded bg-gray-100" />
          <div className="mt-3 h-9 w-full rounded bg-gray-50" />
        </div>
      ))}
    </div>
  );
}
