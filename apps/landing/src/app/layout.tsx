import type { Metadata } from "next";
import { Noto_Sans_Thai } from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "@/components/landing/language-context";

const notoSansThai = Noto_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-noto-thai",
  display: "swap",
});

const BASE_URL = "https://www.perpos.ai";

export const metadata: Metadata = {
  title: "PERPOS - Next-Gen Agentic AI ERP",
  description:
    "Next-Gen Agentic AI ERP: Tailored to Empower Your Business Flow. ระบบบัญชีและ ERP สำหรับธุรกิจ SME ยุคใหม่ ปฏิบัติงานเชิงรุกด้วย AI Agents แบบ Real-time",
  keywords: [
    "ระบบบัญชี",
    "ERP",
    "SME",
    "ไทย",
    "LINE Bot",
    "บริหารธุรกิจ",
    "บัญชี",
    "Agentic AI",
    "AI ERP"
  ],
  authors: [{ name: "PERPOS" }],
  openGraph: {
    title: "PERPOS - Next-Gen Agentic AI ERP",
    description:
      "Next-Gen Agentic AI ERP: Tailored to Empower Your Business Flow. ระบบบัญชีและ ERP สำหรับธุรกิจ SME ยุคใหม่ ปฏิบัติงานเชิงรุกด้วย AI Agents แบบ Real-time",
    url: BASE_URL,
    siteName: "PERPOS",
    locale: "th_TH",
    type: "website",
    images: [
      {
        url: `${BASE_URL}/og-image.png`,
        width: 1200,
        height: 630,
        alt: "PERPOS - Next-Gen Agentic AI ERP",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "PERPOS - Next-Gen Agentic AI ERP",
    description:
      "Next-Gen Agentic AI ERP: Tailored to Empower Your Business Flow. ระบบบัญชีและ ERP สำหรับธุรกิจ SME ยุคใหม่ ปฏิบัติงานเชิงรุกด้วย AI Agents แบบ Real-time",
    images: [`${BASE_URL}/og-image.png`],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th" className={notoSansThai.variable}>
      <body className="font-sans antialiased bg-white text-slate-900">
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}

