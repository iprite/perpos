import { useEffect, useState } from "react";
import { legal, type Lang } from "@/lib/legal";

const BTN_PRIMARY =
  "group/btn inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl px-5 py-2.5 text-sm font-medium bg-primary text-white shadow-xs shadow-primary/25 transition-all duration-200 hover:bg-primary-dark hover:shadow-lg hover:shadow-primary/30 active:scale-[0.98]";

/** Legal page body (privacy/terms) — picks language from localStorage / system,
 *  mirroring the old client LanguageProvider (default Thai, no toggle in the UI). */
export function LegalArticle({ doc }: { doc: "privacy" | "terms" }) {
  const [lang, setLang] = useState<Lang>("th");

  useEffect(() => {
    const saved = localStorage.getItem("lang");
    if (saved === "en" || saved === "th") {
      setLang(saved);
    } else if (navigator.language.toLowerCase().startsWith("en")) {
      setLang("en");
    }
  }, []);

  const dict = legal[lang === "en" ? "en" : "th"];
  const p = doc === "privacy" ? dict.privacyPage : dict.termsPage;

  // both shapes share section1..N; privacy has 6 (last = contact), terms has 7 (last = contact)
  const isPrivacy = doc === "privacy";
  const bodySections = isPrivacy
    ? [
        ["section1Title", "section1Desc"],
        ["section2Title", "section2Desc"],
        ["section3Title", "section3Desc"],
        ["section4Title", "section4Desc"],
        ["section5Title", "section5Desc"],
      ]
    : [
        ["section1Title", "section1Desc"],
        ["section2Title", "section2Desc"],
        ["section3Title", "section3Desc"],
        ["section4Title", "section4Desc"],
        ["section5Title", "section5Desc"],
        ["section6Title", "section6Desc"],
      ];
  const contactTitleKey = isPrivacy ? "section6Title" : "section7Title";
  const contactDescKey = isPrivacy ? "section6Desc" : "section7Desc";

  // index into the literal object without fighting the union types
  const t = p as Record<string, string>;

  return (
    <article className="mx-auto max-w-3xl px-5 py-16 sm:px-6 md:py-20 lg:px-8">
      <h1 className="text-foreground text-3xl font-semibold tracking-tight sm:text-4xl">
        {t.title}
      </h1>
      <p className="text-foreground-muted mt-3 text-sm">{t.lastUpdated}</p>

      <div className="mt-10 space-y-8">
        {bodySections.map(([titleKey, descKey]) => (
          <section key={titleKey}>
            <h2 className="text-foreground text-lg font-semibold">{t[titleKey]}</h2>
            <p className="text-foreground-secondary mt-2 leading-7">{t[descKey]}</p>
          </section>
        ))}
        <section>
          <h2 className="text-foreground text-lg font-semibold">{t[contactTitleKey]}</h2>
          <p className="text-foreground-secondary mt-2 leading-7">
            {t[contactDescKey]}{" "}
            <a href="mailto:contact@perpos.ai" className="text-primary underline">
              contact@perpos.ai
            </a>
          </p>
        </section>
      </div>

      <div className="mt-12">
        <a href="https://app.perpos.ai/signin" className={BTN_PRIMARY}>
          {t.signupCta}
        </a>
      </div>
    </article>
  );
}

export default LegalArticle;
