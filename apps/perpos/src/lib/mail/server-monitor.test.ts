import { describe, expect, it } from "vitest";

import { diffAlerts, evaluateIssues, normalizeHeartbeat } from "./server-monitor";

const NOW = 1_800_000_000_000;
const H = 3_600_000;

const healthy = {
  smtpError: null,
  jmapError: null,
  certDaysLeft: 80,
  heartbeat: {
    diskPct: 20,
    backupAgeHours: 5,
    backupSizeMb: 600,
    serviceActive: true,
    smtp25Listening: true,
  },
  heartbeatAt: new Date(NOW - H).toISOString(),
  now: NOW,
};

describe("evaluateIssues", () => {
  it("ระบบปกติ = ไม่มีปัญหา", () => {
    expect(evaluateIssues(healthy)).toEqual({});
  });

  it("จับครบทุกด้าน: พอร์ต/เว็บ/cert/ดิสก์/backup/service", () => {
    const issues = evaluateIssues({
      ...healthy,
      smtpError: "x",
      jmapError: "y",
      certDaysLeft: 3,
      heartbeat: {
        diskPct: 91,
        backupAgeHours: 40,
        backupSizeMb: 1,
        serviceActive: false,
        smtp25Listening: false,
      },
    });
    expect(Object.keys(issues).sort()).toEqual([
      "backup",
      "cert",
      "disk",
      "jmap",
      "service",
      "smtp",
      "smtp25",
    ]);
  });

  it("heartbeat ขาดเกิน 3 ชม. = ปัญหา และไม่ตัดสินดิสก์จากข้อมูลเก่า", () => {
    const issues = evaluateIssues({
      ...healthy,
      heartbeat: {
        diskPct: 99,
        backupAgeHours: 999,
        backupSizeMb: 0,
        serviceActive: false,
        smtp25Listening: false,
      },
      heartbeatAt: new Date(NOW - 4 * H).toISOString(),
    });
    expect(Object.keys(issues)).toEqual(["heartbeat"]);
  });

  it("ไม่เคยมี heartbeat เลยก็ต้องเตือน (deploy แรก/ตัวส่งตายเงียบ)", () => {
    expect(evaluateIssues({ ...healthy, heartbeat: null, heartbeatAt: null }).heartbeat).toContain(
      "ยังไม่เคยได้",
    );
  });

  it("สคริปต์รุ่นเก่าไม่ส่ง smtp25Listening (null) = ไม่เตือน — อย่าเดาแทนเครื่อง", () => {
    expect(
      evaluateIssues({
        ...healthy,
        heartbeat: { ...healthy.heartbeat, smtp25Listening: null },
      }),
    ).toEqual({});
  });

  it("วัด cert ไม่ได้ (null) ≠ cert ใกล้หมด — อย่าเตือนมั่ว (443 ล่มมี jmap เตือนอยู่แล้ว)", () => {
    expect(evaluateIssues({ ...healthy, certDaysLeft: null })).toEqual({});
  });
});

describe("diffAlerts — กัน spam LINE", () => {
  it("ปัญหาใหม่ → แจ้ง · ปัญหาเดิมยังไม่ครบ 6 ชม. → เงียบ", () => {
    const issues = { smtp: "รับเมลไม่ได้" };
    const first = diffAlerts({ active: {} }, issues, NOW);
    expect(first.notify).toHaveLength(1);
    const second = diffAlerts(first.next, issues, NOW + H);
    expect(second.notify).toHaveLength(0);
    expect(second.next.active.smtp).toBe(NOW); // เวลาแจ้งเดิมคงไว้ ไม่เลื่อน
  });

  it("ยังพังครบ 6 ชม. → เตือนซ้ำพร้อมป้าย 'ยังไม่หาย'", () => {
    const r = diffAlerts({ active: { smtp: NOW - 7 * H } }, { smtp: "รับเมลไม่ได้" }, NOW);
    expect(r.notify[0]).toContain("ยังไม่หาย");
    expect(r.next.active.smtp).toBe(NOW);
  });

  it("ปัญหาหายไป → เข้า recovered และหลุดจาก state", () => {
    const r = diffAlerts({ active: { smtp: NOW - H } }, {}, NOW);
    expect(r.recovered).toEqual(["smtp"]);
    expect(r.next.active).toEqual({});
  });
});

describe("normalizeHeartbeat — payload จากเครื่องคือข้อมูลภายนอก", () => {
  it("ค่าที่ไม่ใช่ตัวเลข/บูลีน → null ไม่โยน", () => {
    expect(normalizeHeartbeat({ diskPct: "91; drop table", serviceActive: "true" })).toEqual({
      diskPct: null,
      backupAgeHours: null,
      backupSizeMb: null,
      serviceActive: null,
      smtp25Listening: null,
    });
    expect(normalizeHeartbeat(null).diskPct).toBeNull();
  });
});
