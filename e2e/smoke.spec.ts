import { test, expect } from "@playwright/test";

// Smoke: แอป boot + เสิร์ฟหน้า key ได้ ไม่ crash (regression guard ของ "เปลือก")
// ไม่แตะ external/DB/auth จริง → deterministic

test("health endpoint ตอบ 200 + ok:true", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.ok).toBe(true);
});

test("หน้า signin render + มีปุ่ม LINE login", async ({ page }) => {
  const res = await page.goto("/signin");
  expect(res?.status()).toBeLessThan(400);
  await expect(page.getByRole("heading", { name: "เข้าสู่ระบบ" })).toBeVisible();
  // ปุ่ม LINE login = ลิงก์ไป /line/login
  const lineLogin = page.getByRole("link", { name: "เข้าสู่ระบบด้วย LINE" });
  await expect(lineLogin).toBeVisible();
  await expect(lineLogin).toHaveAttribute("href", /\/line\/login/);
});
