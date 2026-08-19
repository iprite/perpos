import { describe, expect, it } from "vitest";

import {
  diffAlerts,
  evaluateHostIssues,
  evaluateIssues,
  normalizeHeartbeat,
  withRestartDelta,
  type HostContainer,
  type MailHeartbeat,
} from "./server-monitor";

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
    containers: null,
    apps: null,
    cronActive: null,
    cronJobs: null,
    uptimeSeconds: null,
  },
  heartbeatAt: new Date(NOW - 5 * 60_000).toISOString(),
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
        containers: null,
        apps: null,
        cronActive: null,
        cronJobs: null,
        uptimeSeconds: null,
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

  it("heartbeat ขาดเกิน 30 นาที = ปัญหา และไม่ตัดสินดิสก์จากข้อมูลเก่า", () => {
    const issues = evaluateIssues({
      ...healthy,
      heartbeat: {
        diskPct: 99,
        backupAgeHours: 999,
        backupSizeMb: 0,
        serviceActive: false,
        smtp25Listening: false,
        containers: null,
        apps: null,
        cronActive: null,
        cronJobs: null,
        uptimeSeconds: null,
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

describe("backup ที่หายไปทั้งงาน", () => {
  it("backupAgeHours = null → เตือน (ไม่ใช่ปล่อยผ่าน)", () => {
    const issues = evaluateIssues({
      ...healthy,
      heartbeat: { ...healthy.heartbeat, backupAgeHours: null, backupSizeMb: null },
    });
    expect(issues.backup).toContain("ไม่พบไฟล์ backup");
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
      containers: null,
      apps: null,
      cronActive: null,
      cronJobs: null,
      uptimeSeconds: null,
    });
    expect(normalizeHeartbeat(null).diskPct).toBeNull();
    // container ที่ไม่มีชื่อถูกทิ้ง · memLimit 0 = ไม่มี limit → null
    const hb = normalizeHeartbeat({
      containers: [{ state: "x" }, { name: "caddy", memLimitBytes: 0 }],
    });
    expect(hb.containers).toHaveLength(1);
    expect(hb.containers![0].memLimitBytes).toBeNull();
  });
});

// ─── เว็บ 3 แอป + Caddy บนเครื่องเดียวกัน (2026-08-19) ─────────────────────────

const T0 = new Date(NOW - 2 * H).toISOString(); // container เริ่ม 2 ชม.ก่อน
function ctr(name: string, over: Partial<HostContainer> = {}): HostContainer {
  return {
    name,
    state: "running",
    restarts: 0,
    restartDelta: 0,
    oomKilled: false,
    exitCode: 0,
    startedAt: T0,
    memUsedBytes: 300 * 1048576,
    memLimitBytes: 1536 * 1048576,
    ...over,
  };
}
const hostOk: MailHeartbeat = {
  ...healthy.heartbeat,
  containers: ["caddy", "perpos", "exapp", "riekchang"].map((n) => ctr(n)),
  apps: [
    {
      app: "perpos",
      release: "r1",
      exists: true,
      currentChangedAt: (NOW - 3 * H) / 1000,
      sha: "abc",
    },
  ],
};

describe("evaluateHostIssues — container/deploy", () => {
  it("ทุก container running + release ตรง = ไม่มีปัญหา", () => {
    expect(evaluateHostIssues(hostOk, NOW)).toEqual({});
  });

  it("สคริปต์รุ่นเก่าไม่ส่ง containers/apps (null) = ไม่ตัดสินอะไร", () => {
    expect(evaluateHostIssues({ ...hostOk, containers: null, apps: null }, NOW)).toEqual({});
  });

  it("container ที่ต้องมี หายไป / ไม่ running / OOM → เตือนรายตัว", () => {
    const hb: MailHeartbeat = {
      ...hostOk,
      containers: [
        ctr("caddy"),
        ctr("perpos", { state: "exited", exitCode: 137, oomKilled: true }),
        ctr("exapp"),
        // riekchang หาย
      ],
    };
    const issues = evaluateHostIssues(hb, NOW);
    expect(Object.keys(issues).sort()).toEqual(["container:perpos", "container:riekchang"]);
    expect(issues["container:perpos"]).toContain("OOM");
  });

  it("crash แล้ว restart เอง (restartDelta>0) = แจ้งครั้งเดียว key crash: และไม่มี recovered ตามหลัง", () => {
    const hb: MailHeartbeat = {
      ...hostOk,
      containers: [
        ctr("caddy"),
        ctr("perpos", { restartDelta: 2 }),
        ctr("exapp"),
        ctr("riekchang"),
      ],
    };
    const issues = evaluateHostIssues(hb, NOW);
    expect(Object.keys(issues)).toEqual(["crash:perpos"]);
    const { recovered } = diffAlerts({ active: { "crash:perpos": NOW - H } }, {}, NOW);
    expect(recovered).toEqual([]);
  });

  it("RAM ≥90% ของ mem_limit → เตือน · ไม่มี limit (caddy) → ไม่เตือน", () => {
    const hb: MailHeartbeat = {
      ...hostOk,
      containers: [
        ctr("caddy", { memUsedBytes: 5e9, memLimitBytes: null }),
        ctr("perpos", { memUsedBytes: 1400 * 1048576 }),
        ctr("exapp"),
        ctr("riekchang"),
      ],
    };
    expect(Object.keys(evaluateHostIssues(hb, NOW))).toEqual(["mem:perpos"]);
  });

  it("deploy สลับ symlink แล้วเกิน 10 นาที แต่ container ยังไม่ restart → release ค้าง", () => {
    const hb: MailHeartbeat = {
      ...hostOk,
      apps: [
        {
          app: "perpos",
          release: "r2",
          exists: true,
          currentChangedAt: (NOW - 20 * 60_000) / 1000,
          sha: null,
        },
      ],
    };
    expect(evaluateHostIssues(hb, NOW)["deploy:perpos"]).toContain("r2");
    // เพิ่งสลับ 3 นาที = CI กำลัง restart ยังไม่เตือน
    const fresh: MailHeartbeat = {
      ...hostOk,
      apps: [
        {
          app: "perpos",
          release: "r2",
          exists: true,
          currentChangedAt: (NOW - 3 * 60_000) / 1000,
          sha: null,
        },
      ],
    };
    expect(evaluateHostIssues(fresh, NOW)).toEqual({});
  });

  it("symlink current ชี้ไป release ที่ไม่มีอยู่ → เตือน", () => {
    const hb: MailHeartbeat = {
      ...hostOk,
      apps: [{ app: "exapp", release: "gone", exists: false, currentChangedAt: null, sha: null }],
    };
    expect(Object.keys(evaluateHostIssues(hb, NOW))).toEqual(["deploy:exapp"]);
  });
});

describe("withRestartDelta", () => {
  it("RestartCount เพิ่ม = delta · ลดลง (container ถูกสร้างใหม่ตอน deploy) = 0", () => {
    const prev: MailHeartbeat = {
      ...hostOk,
      containers: [ctr("perpos", { restarts: 3 }), ctr("exapp", { restarts: 5 })],
    };
    const next: MailHeartbeat = {
      ...hostOk,
      containers: [ctr("perpos", { restarts: 5 }), ctr("exapp", { restarts: 0 }), ctr("caddy")],
    };
    const out = withRestartDelta(next, prev).containers!;
    expect(out.find((c) => c.name === "perpos")!.restartDelta).toBe(2);
    expect(out.find((c) => c.name === "exapp")!.restartDelta).toBe(0);
    expect(out.find((c) => c.name === "caddy")!.restartDelta).toBe(0);
  });
});

describe("cron + ใบรับรอง origin", () => {
  const withCron = (
    jobs: { url: string; lastRunAt: number }[] | null,
    uptime = 100 * 3600,
  ): MailHeartbeat => ({
    ...hostOk,
    cronActive: true,
    cronJobs: jobs,
    uptimeSeconds: uptime,
  });
  const nowS = NOW / 1000;

  it("scheduler ทุกนาที + exapp รายวัน สดทั้งคู่ = ไม่มีปัญหา", () => {
    const hb = withCron([
      { url: "http://127.0.0.1:3005/api/assistant/scheduler", lastRunAt: nowS - 60 },
      { url: "http://127.0.0.1:3006/api/admin/rep-usage/recalc", lastRunAt: nowS - 20 * 3600 },
    ]);
    expect(evaluateHostIssues(hb, NOW)).toEqual({});
  });

  it("exapp รายวันเกิน 26 ชม. / scheduler เกิน 10 นาที → เตือน · cron daemon หยุด → เตือน", () => {
    const hb = withCron([
      { url: "http://127.0.0.1:3005/api/assistant/scheduler", lastRunAt: nowS - 15 * 60 },
      { url: "http://127.0.0.1:3006/api/admin/rep-usage/recalc", lastRunAt: nowS - 30 * 3600 },
    ]);
    const issues = evaluateHostIssues({ ...hb, cronActive: false }, NOW);
    expect(Object.keys(issues).sort()).toEqual([
      "cron:exapp-daily",
      "cron:perpos-scheduler",
      "cron:service",
    ]);
  });

  it("ไม่เห็นใน journal: เครื่องเพิ่งบูต = ไม่เตือน · เปิดมา >30 ชม. = เตือน", () => {
    expect(evaluateHostIssues(withCron([], 2 * 3600), NOW)).toEqual({});
    expect(Object.keys(evaluateHostIssues(withCron([], 40 * 3600), NOW)).sort()).toEqual([
      "cron:exapp-daily",
      "cron:perpos-scheduler",
    ]);
  });

  it("ใบรับรอง origin: <14 วัน → cert: · ต่อไม่ได้ (null) → origin: · ไม่ส่ง = ไม่ตรวจ", () => {
    const issues = evaluateIssues({
      ...healthy,
      webCerts: { "app.perpos.ai": 80, "mail.perpos.ai": 5, "app.riekchang.com": null },
    });
    expect(Object.keys(issues).sort()).toEqual(["cert:mail.perpos.ai", "origin:app.riekchang.com"]);
    expect(evaluateIssues(healthy)).toEqual({});
  });
});
