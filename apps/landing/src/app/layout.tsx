import type { Metadata } from "next";
import { Noto_Sans_Thai } from "next/font/google";
import "./globals.css";

const notoSansThai = Noto_Sans_Thai({
  subsets: ["latin", "thai"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-noto-thai",
  display: "swap",
});

const BASE_URL = "https://perpos.io";

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
      "รวมงานขาย งานซื้อ บัญชี ภาษี และเงินเดือน พร้อมผู้ช่วย AI ผ่าน LINE — แพลตฟอร์มเดียวสำหรับ SME ไทย",
    url: BASE_URL,
    siteName: "PERPOS",
    locale: "th_TH",
    type: "website",
    images: [
      {
        url: `${BASE_URL}/og-image.png`,
        width: 1200,
        height: 630,
        alt: "PERPOS - ระบบบัญชีและ ERP สำหรับ SME ไทย",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "PERPOS - ระบบบัญชีและ ERP สำหรับ SME ไทย",
    description:
      "รวมงานขาย งานซื้อ บัญชี ภาษี และเงินเดือน พร้อมผู้ช่วย AI ผ่าน LINE — แพลตฟอร์มเดียวสำหรับ SME ไทย",
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
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
