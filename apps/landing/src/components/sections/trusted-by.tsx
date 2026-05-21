import { Container } from "@/components/ui/container";

const trustedByLogos = [
  { name: "TechCorp", width: 120 },
  { name: "StartupThai", width: 140 },
  { name: "BizSoft", width: 100 },
  { name: "CloudNet", width: 110 },
  { name: "DataPro", width: 90 },
];

export function TrustedBySection() {
  return (
    <section className="border-y border-border bg-background-secondary py-12">
      <Container>
        <p className="mb-8 text-center text-sm text-foreground-muted">
          ไว้วางใจโดยธุรกิจ SME กว่า 1,000+ รายทั่วประเทศไทย
        </p>
        <div className="flex flex-wrap items-center justify-center gap-8 md:gap-16">
          {trustedByLogos.map((logo) => (
            <div
              key={logo.name}
              className="flex items-center justify-center text-foreground-muted"
            >
              <div
                className="flex h-10 items-center justify-center rounded-lg bg-foreground/5 px-4"
                style={{ minWidth: logo.width }}
              >
                <span className="text-sm font-medium opacity-60">{logo.name}</span>
              </div>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
