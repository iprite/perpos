import { Noto_Sans_Thai } from "next/font/google";

export const inter = Noto_Sans_Thai({
  subsets: ["thai", "latin"],
  variable: "--font-inter",
  weight: ["300", "400", "500", "600", "700"],
});

export const lexendDeca = Noto_Sans_Thai({
  subsets: ["thai", "latin"],
  variable: "--font-lexend",
  weight: ["300", "400", "500", "600", "700"],
});
