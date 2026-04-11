import type { Metadata } from "next";
import { inter, lexendDeca } from "@/app/fonts";
import cn from "@core/utils/class-names";
import NextProgress from "@core/components/next-progress";
import { ThemeProvider, JotaiProvider } from "@/app/shared/theme-provider";
import GlobalDrawer from "@/app/shared/drawer-views/container";
import GlobalModal from "@/app/shared/modal-views/container";
import { AuthProvider } from "@/app/shared/auth-provider";
import { ConfirmDialogProvider } from "@/app/shared/confirm-dialog/provider";
import AppToaster from "@/app/shared/toaster";

import "./globals.css";

export const metadata: Metadata = {
  title: "ExApp",
  description: "Company Management Dashboard",
};

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
        className={cn(inter.variable, lexendDeca.variable, "font-inter")}
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
              </ConfirmDialogProvider>
            </AuthProvider>
          </JotaiProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
