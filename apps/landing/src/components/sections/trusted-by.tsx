import { Container } from "@/components/ui/container";
import { statsContent } from "@/data/landing-content";

export function TrustedBySection() {
  return (
    <section className="relative border-y border-border bg-background-secondary">
      <Container className="py-12 md:py-14">
        <p className="text-center text-sm font-medium text-foreground-muted">
          ได้รับความไว้วางใจจากธุรกิจ SME ทั่วประเทศไทย
        </p>

        <div className="mt-8 grid grid-cols-2 gap-y-8 sm:gap-x-6 md:grid-cols-4">
          {statsContent.map((stat, i) => (
            <div
              key={stat.label}
              className={`flex flex-col items-center text-center md:px-6 ${
                i !== 0 ? "md:border-l md:border-border" : ""
              }`}
            >
              <div className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
                <span className="gradient-text">{stat.value}</span>
              </div>
              <div className="mt-1.5 text-sm text-foreground-secondary">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
