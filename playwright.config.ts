import { defineConfig, devices } from "@playwright/test";

// Smoke E2E — รันแอป (dev server) แล้วเช็คว่า boot + เสิร์ฟหน้า key ได้ ไม่ crash
// scope: deterministic เท่านั้น (health + render) ไม่แตะ external/DB/auth จริง
// (deep-flow E2E รอ test DB + drift หาย — ดู docs/แผน Phase 3)
const PORT = 3002;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm --filter starter dev",
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      // placeholder พอสำหรับ smoke (health + signin render) — ไม่ต้องต่อ Supabase จริง
      NEXT_PUBLIC_SUPABASE_URL:
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder",
    },
  },
});
