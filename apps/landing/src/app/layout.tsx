import type { Metadata } from "next";
import { Kanit, Inter } from "next/font/google";
import "./globals.css";

const kanit = Kanit({
  subsets: ["latin", "thai"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-kanit",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "PERPOS - ระบบบัญชีและ ERP สำหรับ SME ไทย",
  description:
    "ระบบบัญชีและ ERP สำหรับธุรกิจ SME ประเทศไทย พร้อม LINE Bot assistant อัจฉริยะ บริหารธุรกิจได้ทุกที่ทุกเวลา",
  keywords: [
    "ระบบบัญชี",
    "ERP",
    "SME",
    "ไทย",
    "LINE Bot",
    "บริหารธุรกิจ",
    "บัญชี",
  ],
  authors: [{ name: "PERPOS" }],
  openGraph: {
    title: "PERPOS - ระบบบัญชีและ ERP สำหรับ SME ไทย",
    description:
      "ระบบบัญชีและ ERP พร้อม LINE Bot assistant อัจฉริยะ",
    url: "https://perpos.io",
    siteName: "PERPOS",
    locale: "th_TH",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "PERPOS - ระบบบัญชีและ ERP สำหรับ SME ไทย",
    description:
      "ระบบบัญชีและ ERP พร้อม LINE Bot assistant อัจฉริยะ",
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
    <html lang="th" className={`${kanit.variable} ${inter.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
