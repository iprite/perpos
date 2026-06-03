"use client";

import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Logo } from "@/components/ui/logo";
import { footerContent } from "@/data/landing-content";
import { useLanguage } from "../landing/language-context";
import { translations } from "../landing/locales";

const getColumnTitle = (title: string, lang: "th" | "en") => {
  if (lang === "en") {
    switch (title) {
      case "ผลิตภัณฑ์": return "Product";
      case "บริษัท": return "Company";
      case "กฎหมาย": return "Legal";
    }
  }
  return title;
};

const getLinkLabel = (label: string, lang: "th" | "en") => {
  if (lang === "en") {
    switch (label) {
      case "ฟีเจอร์": return "Features";
      case "โมดูล": return "Modules";
      case "LINE Bot": return "LINE Bot";
      case "ราคา": return "Pricing";
      case "คำถามที่พบบ่อย": return "FAQ";
      case "ติดต่อเรา": return "Contact Us";
      case "เข้าสู่ระบบ": return "Sign In";
      case "นโยบายความเป็นส่วนตัว": return "Privacy Policy";
      case "เงื่อนไขการใช้งาน": return "Terms of Use";
    }
  }
  return label;
};

export function Footer() {
  const { lang } = useLanguage();
  const t = translations[lang];

  return (
    <footer className="border-t border-slate-200 bg-slate-50 text-slate-650 text-center md:text-left">
      <Container className="py-14 md:py-16">
        <div className="grid gap-10 md:grid-cols-12">
          {/* Brand */}
          <div className="md:col-span-5 flex flex-col items-center md:items-start">
            <Logo tone="dark" />
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-500">
              {t.footer.desc}
            </p>
          </div>

          {/* Link columns */}
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 md:col-span-7">
            {footerContent.columns.map((col) => (
              <div key={col.title}>
                <h4 className="text-sm font-semibold text-slate-800">{getColumnTitle(col.title, lang)}</h4>
                <ul className="mt-4 space-y-2.5">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="text-sm text-slate-500 transition-colors hover:text-blue-600"
                      >
                        {getLinkLabel(link.label, lang)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-slate-200 pt-8 sm:flex-row">
          <p className="text-sm text-slate-400">{t.footer.rights}</p>
          <p className="text-sm text-slate-400">
            {lang === "en" ? "Built for Thai SMEs with ❤️" : "สร้างเพื่อธุรกิจ SME ไทย ด้วย ❤️"}
          </p>
        </div>
      </Container>
    </footer>
  );
}
