import type { Metadata } from "next";
import { Noto_Sans_Thai } from "next/font/google";
import localFont from "next/font/local";
import Script from "next/script";
import "./globals.css";
import { LanguageProvider } from "@/components/landing/language-context";

const GTM_ID = "GTM-T96WG437";

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
  metadataBase: new URL(BASE_URL),
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
      <head>
        {/* Google Tag Manager */}
        <Script id="gtm-base" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_ID}');`}
        </Script>
        {/* End Google Tag Manager */}
      </head>
      <body className="bg-white font-sans text-foreground antialiased">
        {/* Google Tag Manager (noscript) */}
        <noscript>
          <iframe
            src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
          />
        </noscript>
        {/* End Google Tag Manager (noscript) */}
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
