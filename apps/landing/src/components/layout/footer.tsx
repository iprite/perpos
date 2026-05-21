import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Logo } from "@/components/ui/logo";
import { footerContent } from "@/data/landing-content";

export function Footer() {
  return (
    <footer className="border-t border-ink-line bg-ink text-white">
      <Container className="py-14 md:py-16">
        <div className="grid gap-10 md:grid-cols-12">
          {/* Brand */}
          <div className="md:col-span-5">
            <Logo tone="light" />
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-400">
              {footerContent.brand.description}
            </p>
          </div>

          {/* Link columns */}
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 md:col-span-7">
            {footerContent.columns.map((col) => (
              <div key={col.title}>
                <h4 className="text-sm font-semibold text-white">{col.title}</h4>
                <ul className="mt-4 space-y-2.5">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="text-sm text-slate-400 transition-colors hover:text-white"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-ink-line pt-8 sm:flex-row">
          <p className="text-sm text-slate-500">{footerContent.copyright}</p>
          <p className="text-sm text-slate-500">
            สร้างเพื่อธุรกิจ SME ไทย ด้วย ❤️
          </p>
        </div>
      </Container>
    </footer>
  );
}
