/**
 * chart.test.ts — คุมกติกาเลือกชนิดกราฟ (contract §3.3)
 * ผิดชนิดกราฟ = ผู้บริหารตีความข้อมูลผิด → ทุกแถวในตาราง §3.3 ต้องมีเทส
 */
import { describe, it, expect } from "vitest";
import {
  chooseChart,
  buildChartSpec,
  collapseToTopN,
  CATEGORY_LIMIT,
  OTHER_LABEL,
  type BiResultShape,
} from "./chart";

const shape = (over: Partial<BiResultShape> = {}): BiResultShape => ({
  rowCount: 5,
  measureCount: 1,
  dimensionCount: 1,
  hasTimeDimension: false,
  ...over,
});

describe("chooseChart — ตาราง §3.3", () => {
  it("ตัวเลขเดียว → stat", () => {
    const c = chooseChart(shape({ rowCount: 1, dimensionCount: 0 }));
    expect(c.type).toBe("stat");
  });

  it("อนุกรมเวลา 1 ชุด → line", () => {
    expect(chooseChart(shape({ rowCount: 12, hasTimeDimension: true })).type).toBe("line");
  });

  it("อนุกรมเวลาหลาย measure → line (multi-line)", () => {
    expect(chooseChart(shape({ rowCount: 12, hasTimeDimension: true, measureCount: 3 })).type).toBe(
      "line",
    );
  });

  it("หมวดหมู่ ≤ 8 กลุ่ม → bar (ไม่ยุบ อื่น ๆ)", () => {
    const c = chooseChart(shape({ rowCount: 8 }));
    expect(c.type).toBe("bar");
    expect(c.top_n).toBeUndefined();
  });

  it("หมวดหมู่ > 8 กลุ่ม → bar top-N + อื่น ๆ", () => {
    const c = chooseChart(shape({ rowCount: 25 }));
    expect(c.type).toBe("bar");
    expect(c.top_n).toBe(CATEGORY_LIMIT);
    expect(c.other_label).toBe(OTHER_LABEL);
  });

  it("สัดส่วนของทั้งหมด ≤ 5 กลุ่ม → donut", () => {
    expect(chooseChart(shape({ rowCount: 4, isPartToWhole: true })).type).toBe("donut");
  });

  it("สัดส่วนของทั้งหมด > 5 กลุ่ม → กลับไปใช้ bar (pie อ่านไม่ออก)", () => {
    expect(chooseChart(shape({ rowCount: 6, isPartToWhole: true })).type).toBe("bar");
  });

  it("ขั้นตอน/สถานะเป็นลำดับ → funnel", () => {
    expect(chooseChart(shape({ rowCount: 6, isSequentialStage: true })).type).toBe("funnel");
  });

  it("สองมิติ × เวลา → stacked_bar", () => {
    const c = chooseChart(shape({ rowCount: 24, hasTimeDimension: true, dimensionCount: 2 }));
    expect(c.type).toBe("stacked_bar");
    expect(c.stacked).toBe(true);
  });

  it("มิติเดียวแต่หลาย measure → table", () => {
    expect(chooseChart(shape({ rowCount: 5, measureCount: 3 })).type).toBe("table");
  });

  it("grain รายการ (transaction) → table", () => {
    expect(chooseChart(shape({ rowCount: 120, isDetailGrain: true })).type).toBe("table");
  });
});

describe("chooseChart — chart_hint override", () => {
  it("hint ที่ปลอดภัย override รูปทรงได้", () => {
    const c = chooseChart(shape({ rowCount: 4 }), "donut");
    expect(c.type).toBe("donut");
    expect(c.source).toBe("hint");
  });

  it("hint = donut ที่กลุ่มเกิน 5 → ไม่ override (คงตามรูปทรง)", () => {
    const c = chooseChart(shape({ rowCount: 9 }), "donut");
    expect(c.type).toBe("bar");
    expect(c.source).toBe("shape");
  });

  it("hint = stat กับผลหลายแถว → ไม่ override", () => {
    expect(chooseChart(shape({ rowCount: 6 }), "stat").type).toBe("bar");
  });

  it("grain รายการ ห้าม override เป็นกราฟ (data boundary §5)", () => {
    expect(chooseChart(shape({ rowCount: 100, isDetailGrain: true }), "bar").type).toBe("table");
  });

  it("hint ที่ไม่รู้จัก → ใช้รูปทรงตามปกติ", () => {
    expect(chooseChart(shape({ rowCount: 3 }), "pie").type).toBe("bar");
  });
});

describe("buildChartSpec", () => {
  it("stat ไม่มีแกน x และใช้ทศนิยมตามหน่วยเงิน", () => {
    const spec = buildChartSpec({
      shape: shape({ rowCount: 1, dimensionCount: 0 }),
      labelTh: "มูลค่าพอร์ต (รวม VAT)",
      unit: "thb",
      xKey: "stage",
      series: [{ key: "value", label_th: "มูลค่า" }],
    });
    expect(spec.type).toBe("stat");
    expect(spec.x).toBeNull();
    expect(spec.decimals).toBe(2);
  });

  it("bar เกิน 8 กลุ่ม → spec พก top_n + other_label", () => {
    const spec = buildChartSpec({
      shape: shape({ rowCount: 20 }),
      labelTh: "ลูกค้าอันดับต้น",
      unit: "thb",
      xKey: "customer_name",
      series: [{ key: "value", label_th: "มูลค่า" }],
    });
    expect(spec.top_n).toBe(CATEGORY_LIMIT);
    expect(spec.other_label).toBe(OTHER_LABEL);
  });

  it("หน่วย count → ทศนิยม 0", () => {
    const spec = buildChartSpec({
      shape: shape({ rowCount: 6 }),
      labelTh: "จำนวนงาน",
      unit: "count",
      xKey: "stage",
      series: [{ key: "value", label_th: "จำนวน" }],
    });
    expect(spec.decimals).toBe(0);
  });
});

describe("collapseToTopN", () => {
  it("ยอดรวมหลังยุบ 'อื่น ๆ' ต้องเท่ากับยอดรวมเดิม (ห้ามทิ้งข้อมูล)", () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ name: `c${i}`, value: i + 1 }));
    const out = collapseToTopN(rows, { labelKey: "name", valueKey: "value", topN: 8 });
    expect(out).toHaveLength(9);
    expect(out[8].name).toBe(OTHER_LABEL);
    const sumBefore = rows.reduce((s, r) => s + r.value, 0);
    const sumAfter = out.reduce((s, r) => s + Number(r.value), 0);
    expect(sumAfter).toBe(sumBefore);
  });

  it("กลุ่มไม่เกิน topN → คืนของเดิม", () => {
    const rows = [{ name: "a", value: 1 }];
    expect(collapseToTopN(rows, { labelKey: "name", valueKey: "value", topN: 8 })).toHaveLength(1);
  });
});
