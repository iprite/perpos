import Link from "next/link";
import { Container } from "@/components/ui/container";
import { footerContent } from "@/data/landing-content";

export function Footer() {
  return (
    <footer className="border-t border-border bg-foreground text-white">
      <Container className="py-12 md:py-16">
        <div className="grid gap-8 md:grid-cols-4">
          <div className="md:col-span-2">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <span className="text-lg font-bold text-white">P</span>
              </div>
              <span className="text-xl font-heading font-bold">
                {footerContent.brand.name}
              </span>
            </div>
            <p className="max-w-sm text-gray-400">
              {footerContent.brand.description}
            </p>
          </div>

          <div>
            <h4 className="mb-4 font-heading font-semibold">ลิงก์ด่วน</h4>
            <ul className="space-y-2">
              {footerContent.quickLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-gray-400 transition-colors hover:text-white"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="mb-4 font-heading font-semibold">แอปพลิเคชัน</h4>
            <ul className="space-y-2">
              {footerContent.appLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-gray-400 transition-colors hover:text-white"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-gray-800 pt-8 md:flex-row">
          <p className="text-sm text-gray-400">{footerContent.copyright}</p>
          <div className="flex gap-6">
            {footerContent.legal.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-gray-400 transition-colors hover:text-white"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </Container>
    </footer>
  );
}
