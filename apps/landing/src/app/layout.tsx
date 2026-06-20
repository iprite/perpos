import type { Metadata } from "next";
import { Noto_Sans_Thai } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { LanguageProvider } from "@/components/landing/language-context";

const notoSansThai = Noto_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-noto-thai",
  display: "swap",
});

const neoTech = localFont({
  src: "./_fonts/NeoTech.ttf",
  variable: "--font-neo-tech",
  display: "swap",
});

const BASE_URL = "https://www.perpos.ai";

export const metadata: Metadata = {
  title: "PERPOS - Flow & Suite",
  description:
    "PERPOS Flow ผู้ช่วย AI บน LINE สำหรับ PDF และเสียงประชุม และ PERPOS Suite ระบบ AI ERP สำหรับองค์กรและ workflow เฉพาะธุรกิจ",
  keywords: [
    "PERPOS Flow",
    "PERPOS Suite",
    "ระบบบัญชี",
    "ERP",
    "SME",
    "ไทย",
    "LINE Bot",
    "บีบ PDF",
    "ถอดเสียงประชุม",
    "บริหารธุรกิจ",
    "บัญชี",
    "AI ERP",
  ],
  authors: [{ name: "PERPOS" }],
  icons: {
    icon: "/logo-short.svg",
  },
  openGraph: {
    title: "PERPOS - Flow & Suite",
    description:
      "AI tools and ERP systems for modern Thai work. ใช้ PERPOS Flow บน LINE หรือวางระบบ PERPOS Suite สำหรับองค์กร",
    url: BASE_URL,
    siteName: "PERPOS",
    locale: "th_TH",
    type: "website",
    images: [
      {
        url: `${BASE_URL}/og-image.png`,
        width: 1200,
        height: 630,
        alt: "PERPOS Flow and PERPOS Suite",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "PERPOS - Flow & Suite",
    description: "PERPOS Flow ผู้ช่วย AI บน LINE และ PERPOS Suite ระบบ AI ERP สำหรับองค์กร",
    images: [`${BASE_URL}/og-image.png`],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${notoSansThai.variable} ${neoTech.variable}`}>
      <body className="bg-white font-sans text-foreground antialiased">
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
