// coverage.tsx — ป้ายบอก "ฐานประชากร" ของตัวเลขรวม
// contract §6: ทุก KPI ต้องบอกว่ามาจากกี่บริษัทจากทั้งหมดกี่บริษัทเสมอ
// (บทเรียน bi: ตัวเลขสองตัวที่ดูเทียบกันได้อาจมาจากคนละฐาน)

export function Coverage({ counted, total }: { counted: number; total: number }) {
  const incomplete = counted < total;
  return (
    <span className={incomplete ? "text-amber-600" : "text-gray-500"}>
      จาก {counted}/{total} บริษัท
      {incomplete ? " · ข้อมูลไม่ครบ" : ""}
    </span>
  );
}
