import type { Metadata } from "next";
import { inter, lexendDeca, neoTech } from "@/app/fonts";
import cn from "@core/utils/class-names";
import NextProgress from "@core/components/next-progress";
import { ThemeProvider, JotaiProvider } from "@/app/shared/theme-provider";
import GlobalDrawer from "@/app/shared/drawer-views/container";
import GlobalModal from "@/app/shared/modal-views/container";
import { AuthProvider } from "@/app/shared/auth-provider";
import { ConfirmDialogProvider } from "@/app/shared/confirm-dialog/provider";
import AppToaster from "@/app/shared/toaster";
import { Analytics } from "@vercel/analytics/next";
import GoogleAnalytics from "@/components/analytics/google-analytics";

import "./globals.css";

const APP_TITLE = "PERPOS";
const APP_DESCRIPTION = "ระบบผู้ช่วยทำงาน PERPOS";
// การ์ดตอนแชร์ลิงก์ (LINE/Facebook/X) — รูปสร้างจาก scripts/og-app-card.mjs
const OG_DESCRIPTION = "ระบบบัญชี ERP และผู้ช่วย AI สำหรับธุรกิจไทย — PERPOS Suite และ PERPOS Flow";

// อ่าน APP_BASE_URL ตอน runtime (ไม่ bake ตอน build) — เหมือน robots.ts/sitemap.ts
export function generateMetadata(): Metadata {
  const baseUrl = process.env.APP_BASE_URL || "https://app.perpos.ai";
  return {
    metadataBase: new URL(baseUrl),
    title: APP_TITLE,
    description: APP_DESCRIPTION,
    openGraph: {
      title: APP_TITLE,
      description: OG_DESCRIPTION,
      type: "website",
      siteName: "PERPOS",
      locale: "th_TH",
      // ไม่ตั้ง og:url — ปล่อยให้ crawler ใช้ URL ที่แชร์จริง (ตั้งค่าเดียวทั้งแอป = การ์ดทุกหน้า
      // ถูกยุบเป็นหน้าเดียวกันในระบบของ Facebook/LINE)
      images: [{ url: "/og/app.png", width: 1200, height: 630, alt: OG_DESCRIPTION }],
    },
    twitter: {
      card: "summary_large_image",
      title: APP_TITLE,
      description: OG_DESCRIPTION,
      images: ["/og/app.png"],
    },
    icons: {
      icon: [
        { url: "/brand/perpos-icon-32.png", sizes: "32x32", type: "image/png" },
        { url: "/brand/perpos-icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/brand/perpos-icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      shortcut: "/brand/perpos-icon-192.png",
      apple: { url: "/brand/perpos-icon-180.png", sizes: "180x180", type: "image/png" },
    },
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      // 💡 Prevent next-themes hydration warning
      lang="th"
      suppressHydrationWarning
    >
      <body
        // to prevent any warning that is caused by third party extensions like Grammarly
        suppressHydrationWarning
        className={cn(inter.variable, lexendDeca.variable, neoTech.variable, "font-inter")}
      >
        <ThemeProvider>
          <NextProgress />
          <JotaiProvider>
            <AuthProvider>
              <ConfirmDialogProvider>
                {children}
                <GlobalDrawer />
                <GlobalModal />
                <AppToaster />
                <Analytics />
                <GoogleAnalytics />
                <div id="react-datepicker-portal" />
              </ConfirmDialogProvider>
            </AuthProvider>
          </JotaiProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
