// Bundle scheduler worker (src/worker/scheduler-worker.ts) → .next/worker/scheduler-worker.js
// ทำไมต้อง bundle: artifact ที่ deploy คือ Next standalone (มีเฉพาะ node_modules ที่ Next trace ให้
// server.js) — worker เป็น process แยกจึงต้องพกทุก dependency ไว้ในไฟล์เดียว ไม่พึ่ง node_modules
// ของ standalone · NEXT_PUBLIC_* ถูก inline ตอน build เหมือนที่ Next ทำ (บนเครื่องอาจไม่มีใน .env)
// ใช้: `pnpm build:worker` (CI เรียกต่อจาก `pnpm build` แล้ว copy เข้า artifact — ดู deploy-vps.yml)
import { build } from "esbuild";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outdir = path.join(root, ".next", "worker");
mkdirSync(outdir, { recursive: true });

const define = Object.fromEntries(
  Object.entries(process.env)
    .filter(([k]) => k.startsWith("NEXT_PUBLIC_"))
    .map(([k, v]) => [`process.env.${k}`, JSON.stringify(v ?? "")]),
);

// `server-only` เป็นแค่ marker ของ Next (โยน error ถ้าถูก import ฝั่ง client) — ใน worker = โมดูลว่าง
const stubServerOnly = {
  name: "stub-server-only",
  setup(b) {
    b.onResolve({ filter: /^server-only$/ }, (args) => ({ path: args.path, namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "", loader: "js" }));
  },
};

await build({
  plugins: [stubServerOnly],
  entryPoints: [path.join(root, "src/worker/scheduler-worker.ts")],
  outfile: path.join(outdir, "scheduler-worker.js"),
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  sourcemap: false,
  minify: false,
  legalComments: "none",
  tsconfig: path.join(root, "tsconfig.json"),
  define: { ...define, "process.env.NEXT_RUNTIME": '"nodejs"' },
  logLevel: "info",
});
