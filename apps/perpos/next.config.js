const { withSentryConfig } = require("@sentry/nextjs");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Skip in-build type-check + lint — เรา gate `tsc --noEmit`=0 และ `pnpm lint` clean แยกก่อน merge
  // (AGENTS.md §Verify) อยู่แล้ว. in-build type-check กิน RAM สูงจน OOM (exit 137) บนเครื่อง build
  // Vercel Hobby (8GB) เมื่อ codebase โต — ข้ามได้ปลอดภัยเพราะ redundant กับ gate ภายนอก + build เร็ว/เบา
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "isomorphic-furyroad.s3.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "randomuser.me",
      },
      {
        protocol: "https",
        hostname: "zftnyipifpaiqzukiyzi.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  transpilePackages: ["core"],
  experimental: {
    // เครื่อง build ของ Vercel = 2 cores / 8 GB — ค่า default ให้ Next spawn worker ตามจำนวน core
    // แล้วแต่ละตัวถือ heap ของตัวเอง → รวมทะลุ RAM จริงจนโดน OOM killer (SIGKILL) กลาง build
    // บังคับ worker เดียว + เปิด optimization ของ webpack ที่ Next เตรียมไว้สำหรับเครื่อง RAM จำกัด
    cpus: 1,
    webpackMemoryOptimizations: true,
  },
};

// Sentry wrap — upload source maps เฉพาะเมื่อมี SENTRY_AUTH_TOKEN (CI/local ไม่มี = ข้าม ไม่ fail)
module.exports = withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  webpack: { treeshake: { removeDebugLogging: true } }, // แทน disableLogger (deprecated)
});
