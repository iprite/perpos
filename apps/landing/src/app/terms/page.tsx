"use client";

import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/landing/language-context";
import { translations } from "@/components/landing/locales";

export default function TermsPage() {
  const { lang } = useLanguage();
  const t = translations[lang];
  const p = t.termsPage;

  return (
    <>
      <Header />
      <main className="pt-24 pb-16">
        <Container>
          <div className="mx-auto max-w-3xl">
            <h1 className="mb-8 text-3xl font-heading font-bold text-foreground">
              {p.title}
            </h1>
            <div className="prose prose-lg max-w-none text-foreground-secondary">
              <p>{p.lastUpdated}</p>

              <h2>{p.section1Title}</h2>
              <p>{p.section1Desc}</p>

              <h2>{p.section2Title}</h2>
              <p>{p.section2Desc}</p>

              <h2>{p.section3Title}</h2>
              <p>{p.section3Desc}</p>

              <h2>{p.section4Title}</h2>
              <p>{p.section4Desc}</p>

              <h2>{p.section5Title}</h2>
              <p>{p.section5Desc}</p>

              <h2>{p.section6Title}</h2>
              <p>{p.section6Desc}</p>

              <h2>{p.section7Title}</h2>
              <p>
                {p.section7Desc}{" "}
                <a href="mailto:contact@perpos.io" className="text-primary hover:underline">
                  contact@perpos.io
                </a>
              </p>
            </div>

            <div className="mt-12">
              <Button href="https://app.perpos.io/signup">
                {p.signupCta}
              </Button>
            </div>
          </div>
        </Container>
      </main>
      <Footer />
    </>
  );
}
