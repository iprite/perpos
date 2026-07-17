# P2P Holding — Design & Implementation Spec (approved by director)

> visual-designer output. Director decisions on flagged items:
>
> - Fonts: **Noto Sans Thai Variable (bundled) + Inter (Google Fonts `<link>`)** — approved (faster than Sarabun; acceptable substitution).
> - S9 journey horizontal flow-line: **hide below `lg:` (1024px)** — approved.
> - S5 dashboard mockup: **hybrid** (SVG chrome/chart + real HTML text for KPI numbers) — approved.
> - Contact: **static placeholder** text (no live form) — approved.

## 0. File/scope plan

```
apps/landing-astro/src/
  layouts/P2PLayout.astro          ← new, standalone head/fonts/OG, no PERPOS nav
  pages/p2p-holding.astro          ← new route, imports P2PLayout + section components
  styles/p2p-holding.css           ← new, scoped token block + P2P-only utilities (imported only by P2PLayout)
  components/p2p/
    P2PHeader.astro  P2PFooter.astro  Section.astro  Eyebrow.astro  Pill.astro
    Button.astro  Card.astro  StatCard.astro  IconCircle.astro  ServiceRow.astro
    LayerCard.astro  OrgCard.astro  ModuleCard.astro  StepNode.astro  Callout.astro
    HeroStack.astro  DashboardMockup.astro  FlowLine.astro
```

Do NOT reuse `@/components/ui/*` from the ERP app (charcoal Hydrogen components). Build P2P-local Astro components. Content (headline/company names/service copy/stats) verbatim from `P2P_BRIEF.md` + `.claude/presentation-factory/specs/p2p-holding.md` + deck `.claude/presentation-factory/_out/p2p-holding.html`. **No rewriting copy.** Titanicom = service (design/build/deploy on client site), never "we own/host a data center".

## 1. Tokens & scoping

- Do NOT touch `globals.css` `@theme` (charcoal). P2PLayout imports `globals.css` (for Tailwind engine + reset + prefers-reduced-motion + neutral utilities) THEN `p2p-holding.css` (scoped `.p2p` vars + utilities). Do NOT re-`@import "tailwindcss"` in p2p-holding.css.
- Root wrapper in page: `<div class="p2p"> ... </div>`. Colors via arbitrary Tailwind values referencing vars: `bg-[var(--p2p-primary)]`, `text-[var(--p2p-muted)]`, `border-[var(--p2p-border)]`.

`src/styles/p2p-holding.css`:

```css
/* Scoped P2P Holding brand tokens — DOES NOT touch globals.css @theme (charcoal) */
.p2p {
  --p2p-bg: #ffffff;
  --p2p-alt: #f4f7fc;
  --p2p-card: #ffffff;
  --p2p-border: #e2e8f0;
  --p2p-primary: #2b7fff;
  --p2p-primary-rgb: 43, 127, 255;
  --p2p-secondary: #0ea5e9;
  --p2p-text: #0f172a;
  --p2p-muted: #64748b;
  --p2p-hi: #eff6ff;
  --p2p-dark: #0f172a;
  --p2p-neutral-tag: #94a3b8;
  --p2p-radius-sm: 8px;
  --p2p-radius-lg: 16px;
  --p2p-shadow-card: 0 2px 12px rgba(0, 0, 0, 0.08);
  --p2p-shadow-btn: 0 4px 16px rgba(43, 127, 255, 0.3);
  --p2p-shadow-lift: 0 12px 28px rgba(15, 23, 42, 0.12);
  font-family:
    "Inter", "Noto Sans Thai Variable", "Noto Sans Thai", ui-sans-serif, system-ui, sans-serif;
  color: var(--p2p-text);
  background: var(--p2p-bg);
}
.p2p h1,
.p2p h2,
.p2p h3,
.p2p h4 {
  font-family: "Inter", "Noto Sans Thai Variable", sans-serif;
  font-weight: 800;
  line-height: 1.3;
  letter-spacing: -0.01em;
  color: var(--p2p-text);
}
.p2p p,
.p2p li {
  line-height: 1.65;
}
.p2p .p2p-h1 {
  font-size: clamp(1.9rem, 1.35rem + 2.3vw, 3.25rem);
}
.p2p .p2p-h2 {
  font-size: clamp(1.6rem, 1.25rem + 1.6vw, 2.5rem);
}
.p2p .p2p-h2-tight {
  font-size: clamp(1.45rem, 1.2rem + 1.1vw, 2.1rem);
}
.p2p .p2p-subtitle {
  font-size: clamp(1rem, 0.92rem + 0.35vw, 1.15rem);
  font-weight: 600;
  color: var(--p2p-primary);
}
.p2p .p2p-body {
  font-size: clamp(0.95rem, 0.9rem + 0.2vw, 1.02rem);
  color: var(--p2p-muted);
}
.p2p .p2p-eyebrow {
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--p2p-primary);
}
.p2p [data-reveal] {
  opacity: 0;
  transform: translateY(20px);
  transition:
    opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1),
    transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}
.p2p [data-reveal].is-visible {
  opacity: 1;
  transform: translateY(0);
}
.p2p [data-reveal-stagger="1"] {
  transition-delay: 80ms;
}
.p2p [data-reveal-stagger="2"] {
  transition-delay: 160ms;
}
.p2p [data-reveal-stagger="3"] {
  transition-delay: 240ms;
}
.p2p [data-reveal-stagger="4"] {
  transition-delay: 320ms;
}
.p2p [data-reveal-stagger="5"] {
  transition-delay: 400ms;
}
.p2p [data-reveal-stagger="6"] {
  transition-delay: 480ms;
}
@media (prefers-reduced-motion: reduce) {
  .p2p [data-reveal] {
    opacity: 1;
    transform: none;
    transition: none;
  }
}
```

Fonts in `P2PLayout.astro` head: keep `import "@fontsource-variable/noto-sans-thai"` + add

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
  rel="stylesheet"
/>
```

Radius 8 (chips/tags) / 16 (cards/buttons). Shadow card `0 2px 12px rgba(0,0,0,.08)`; hover-lift `0 12px 28px rgba(15,23,42,.12)` + `translateY(-4px)`. Tailwind default spacing + breakpoints (md=768 tablet, lg/xl=desktop).

## 2. Components (build all in components/p2p/)

- **P2PLayout**: own head/meta/OG for P2P (title "P2P Holding Group — Full-Stack AI Delivery", canonical /p2p-holding, favicon reuse /logo-short.svg or omit). Keep GTM/GA. Body wraps `<slot/>` in `<div class="p2p">`. No PERPOS chrome.
- **P2PHeader**: sticky top, `glass` + `border-b border-[var(--p2p-border)]` (recommend ALWAYS glass — zero-JS, no layout shift). Left wordmark "P2P HOLDING" (Inter 800, tracking .06em). Desktop ≥1024 anchor nav (จุดต่าง #stack, โครงสร้าง #structure, Titanicom #infra, Perpos #perpos, โซลูชัน #ai, ติดต่อ #contact) with scroll-spy active (blue + underline). Right small CTA "เริ่มต้นปรึกษาฟรี" → #contact. Mobile <1024 hamburger → glass dropdown (max-height 250ms), tap closes+smooth-scroll. Height 64/72px, z-50. a11y: `<nav aria-label>`, `<button aria-expanded aria-controls>`, focus-visible ring, skip-link first.
- **P2PFooter**: full-bleed dark bar `bg-[var(--p2p-dark)] text-white text-center py-4 text-sm` = "P2P Holding Group · AI Infrastructure · Perpos AI ERP · System Integration". Normal flow (not absolute).
- **Section**: props id/bg(white|alt|gradient)/class → `<section id class="section-padding {bg}"><div class="container-custom"><slot/></div></section>`. alt=`bg-[var(--p2p-alt)]`; gradient (S9 only)=`bg-[linear-gradient(180deg,var(--p2p-hi)_0%,#fff_60%)]`. Reuse `section-padding`+`container-custom` from globals.
- **Eyebrow**: `.p2p-eyebrow mb-3` + data-reveal.
- **Pill**: rounded-full border bg-[var(--p2p-hi)] text-[var(--p2p-primary)] px-3.5 py-1.5 text-[13px] font-semibold.
- **Button**: real `<a href>` styled: rounded-xl bg-primary text-white font-bold px-7 py-3.5 shadow-btn; hover bg-#1E6FE0 +shadow +-translate-y-0.5 (180ms); focus-visible ring-2; active:scale-.97 (120ms). small variant for nav.
- **Card**: rounded-2xl border bg-white shadow-card p-5 sm:p-6; optional hover → -translate-y-1 + shadow-lift (200ms).
- **StatCard**: number `text-[1.4rem] sm:text-[1.7rem] font-extrabold text-[var(--p2p-primary)] tabular-nums` + label muted. numeric → count-up (data-count-to + data-suffix); non-numeric (On-Premise/High-Density/24/7/100%) → static text, fade-up only.
- **IconCircle**: rounded-full bg-[var(--p2p-hi)] border-[#DBEAFE] text-primary, size prop (30/34/36/44). accepts emoji or number.
- **ServiceRow**: flex gap-3 items-start + IconCircle + (title bold 15px / desc muted 13px, text container min-w-0). data-reveal + stagger.
- **LayerCard** (S2): flex items-center gap-4 p-5, border-l-[6px] per layer (L3 primary / L2 secondary / L1 #94A3B8), num-badge colored circle + title/companies/desc. min-w-0 text.
- **OrgCard** (S3): Card + optional flagship (border-2 primary + FLAGSHIP badge top-right) + bottom tag (infra=blue-50/blue-600, platform=cyan-50/cyan-600, delivery=slate-100/slate-500). hover lift.
- **ModuleCard** (S6): emoji text-2xl + title + desc, border-t-[5px] primary, hover lift.
- **StepNode** (S8/journey): num-badge 01-05 + title + desc, bare column (no card).
- **Callout**: rounded-xl bg-[var(--p2p-hi)] border-l-4 border-primary px-5 py-4 text-[15px] font-medium leading-relaxed. data-reveal.
- **HeroStack** (S1 SVG): 3 stacked rounded rects Integration(top solid primary/white text)→Platform(mid secondary tint)→Infrastructure(bottom primary tint outline) + upward arrows. reference deck SVG lines 96-109. wrapper `animate-float-slow`; connector paths use `flow-path` util.
- **DashboardMockup** (S5, hybrid): outer div = browser window frame (rounded-2xl border shadow-lift overflow-hidden bg-white) + traffic-light dots + fake URL chip "app.perpos.ai/dashboard"; inside: SVG sidebar skeleton + line chart, but **3 KPI number tiles = real HTML `<div>`** in CSS grid (crisp/reflowable): ฿2.4M/รายรับเดือนนี้, 98%/ความแม่นยำ AI, 312/รายการวันนี้. subtle `animate-float` on frame.
- **FlowLine**: SVG line/path with `flow-path` util (marching dashes) + arrow marker. vertical short (S2 between layers, `hidden lg:block`), horizontal full-width (S9 journey, `hidden lg:block`).

## 3. Layout per section (grids use minmax(0,1fr); flex text siblings min-w-0; no overflow/clip)

- **S1 HERO** (white, id top): desktop 2-col flex (left content flex-1 / right HeroStack flex-shrink-0 w-[380px] lg:w-[420px]), items-center, min-h ~calc(100vh-72px), pt to clear header. Stack to column below `lg:` (SVG max-w-[280px] mx-auto below content on mobile). 6 pills flex-wrap max-w-[560px]. CTA w-full sm:w-auto on mobile.
- **S2 STACK** (alt, id=stack): eyebrow+H2+subtitle left. 3 LayerCards flex-col gap-3 full width. optional vertical FlowLine `hidden lg:block`. Callout below.
- **S3 STRUCTURE** (white, id=structure): eyebrow+H2 + centered "P2P HOLDING" badge chip. grid lg:grid-cols-3 md:grid-cols-2 grid-cols-1 gap-4, 6 OrgCards, 2 flagship FIRST in DOM. No per-card connector lines.
- **S4 TITANICOM** (alt, id=infra): eyebrow+H2-tight+subtitle. 2-col flex ≥768 (left flex-[1.3] 4 ServiceRows / right flex-1 StatCard grid-cols-2 gap-3), stack <768 (services then 2×2 stats). Callout below.
- **S5 PERPOS** (white, id=perpos): PERPOS badge chip + eyebrow+H2-tight+subtitle. 2-col flex ≥1024 (left flex-1 body+4 check bullets / right flex-1 DashboardMockup), stack <1024 (mockup full-width below). 6 ModuleCards grid grid-cols-2 lg:grid-cols-3 gap-4 below.
- **S6** is merged into S5's module grid (per deck S5+S6). Keep modules under Perpos.
- **S7 SI CAPABILITIES** (alt, id after perpos): eyebrow+H2-tight. grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4/5, 4 capability Cards (hover).
- **S8 AI SOLUTIONS** (white, id=ai): eyebrow+H2-tight+subtitle. 2-col flex ≥1024 (left flex-[1.3] 5 numbered ServiceRows / right flex-1 StatCard grid-cols-2, count-up 5+/3x/24-7/100%), stack below.
- **S9 JOURNEY** (alt, id=journey): eyebrow+H2-tight. horizontal FlowLine `hidden lg:block` above grid. 5 StepNodes grid lg:grid-cols-5 md:grid-cols-3 grid-cols-1 (no line on <lg, numbers convey order). Callout below.
- **S10 CONTACT** (gradient, id=contact): centered max-w-[760px]. H1+subtitle+body+CTA "📩 ติดต่อเราวันนี้". contact grid grid-cols-1 sm:grid-cols-2 (Email info@p2pholding.co.th / LINE OA @p2pholding / Website www.p2pholding.co.th / Phone 02-XXX-XXXX). Then P2PFooter full-bleed flush.

> NOTE section numbering: deck had 10 slides (Perpos split intro+modules). On the page merge into 9 visible sections: Hero, Full Stack, Group Structure, Titanicom, Perpos(+modules), SI Capabilities, AI Solutions, Journey, Contact. Nav has 6 anchors.

## 4. Motion

- Scroll-reveal: one IntersectionObserver (threshold .15, rootMargin "0px 0px -60px 0px"), add .is-visible, unobserve (one-shot). data-reveal + data-reveal-stagger.
- Hero stack: animate-float-slow (10s). optional tiny parallax (skip if janky).
- Flow-path marching: reuse util on S2 vertical + S9 horizontal (lg only).
- Count-up: same IO, rAF tween 0→target 900ms ease-out, preserve suffix via data-suffix. Only genuine numerics; string stats static.
- Hover lift: OrgCard/ModuleCard/SI cards only.
- Sticky nav: recommend always-glass (zero-JS). Scroll-spy active link via IO on sections (rootMargin "-40% 0px -55% 0px").
- Button active scale .97 (120ms). Mobile nav panel 250ms ease-out.
- All respect prefers-reduced-motion (globals.css blanket + the [data-reveal] override above so content never stays invisible).

## 5. Signature moments

Hero floating 3-layer stack · S2 vertical marching flow-line (core pitch) · S5 device-framed dashboard · sticky glass scroll-spy nav · stat count-up · S9 horizontal journey flow-line+arrow (desktop).

## Verify before handoff

`pnpm --filter landing-astro dev` (astro dev port 3100) → screenshot /p2p-holding at 375/768/1440 → no overflow/clip, fonts load, reveal+count-up+flow animate, nav sticky+scroll-spy+mobile hamburger works, `astro check` clean.
