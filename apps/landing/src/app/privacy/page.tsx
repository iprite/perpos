"use client";

import { Button } from "@/components/ui/button";
import { SiteFooter, SiteHeader } from "@/components/landing/site-chrome";
import { useLanguage } from "@/components/landing/language-context";
import { legal } from "@/components/landing/legal-content";

export default function PrivacyPage() {
  const { lang } = useLanguage();
  const p = legal[lang === "en" ? "en" : "th"].privacyPage;

  const sections = [
    [p.section1Title, p.section1Desc],
    [p.section2Title, p.section2Desc],
    [p.section3Title, p.section3Desc],
    [p.section4Title, p.section4Desc],
    [p.section5Title, p.section5Desc],
  ] as const;

  return (
    <main className="min-h-screen bg-white">
      <SiteHeader />
      <article className="mx-auto max-w-3xl px-5 py-16 sm:px-6 md:py-20 lg:px-8">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {p.title}
        </h1>
        <p className="mt-3 text-sm text-foreground-muted">{p.lastUpdated}</p>

        <div className="mt-10 space-y-8">
          {sections.map(([title, desc]) => (
            <section key={title}>
              <h2 className="text-lg font-semibold text-foreground">{title}</h2>
              <p className="mt-2 leading-7 text-foreground-secondary">{desc}</p>
            </section>
          ))}
          <section>
            <h2 className="text-lg font-semibold text-foreground">{p.section6Title}</h2>
            <p className="mt-2 leading-7 text-foreground-secondary">
              {p.section6Desc}{" "}
              <a href="mailto:contact@perpos.ai" className="text-primary underline">
                contact@perpos.ai
              </a>
            </p>
          </section>
        </div>

        <div className="mt-12">
          <Button href="https://app.perpos.ai/signin">{p.signupCta}</Button>
        </div>
      </article>
      <SiteFooter />
    </main>
  );
}
