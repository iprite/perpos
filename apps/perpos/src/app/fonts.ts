import { Noto_Sans_Thai } from "next/font/google";
import localFont from "next/font/local";

export const inter = Noto_Sans_Thai({
  subsets: ["thai", "latin"],
  variable: "--font-inter",
  weight: ["300", "400", "500", "600", "700"],
});

// โลโก้ตัวอักษร PERPOS — ฟอนต์ NeoTech (local)
export const neoTech = localFont({
  src: "./_fonts/NeoTech.ttf",
  variable: "--font-neo-tech",
  display: "swap",
});

export const lexendDeca = Noto_Sans_Thai({
  subsets: ["thai", "latin"],
  variable: "--font-lexend",
  weight: ["300", "400", "500", "600", "700"],
});
