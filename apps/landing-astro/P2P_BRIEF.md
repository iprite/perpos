# P2P Holding — Landing Microsite Creative Brief (single source of truth)

> เพจ company-profile ของ **P2P Holding Group** ใน `apps/landing-astro` — route `/p2p-holding`.
> ยกระดับจาก Reveal deck เดิม → เว็บจริง เพดานดีไซน์สูง. **standalone brand (electric-blue) แยกจาก perpos.ai (charcoal).**

## Goal / Audience / CTA

- **Goal:** โน้มน้าว prospect B2B ว่า P2P Holding ส่งมอบครบทั้ง AI stack 3 ชั้น (จุดต่างเดียวในตลาด)
- **Audience:** ผู้บริหาร/ลูกค้าองค์กรที่มองหา AI transformation partner
- **Primary CTA:** "เริ่มต้นปรึกษาฟรี →" (hero) / "📩 ติดต่อเราวันนี้" (contact) → anchor #contact
- **Success:** เข้าใจ positioning "คุยที่เดียวจบครบ 3 ชั้น" + กดติดต่อ

## ⚠️ กฎห้ามเคลมเกินจริง (BINDING)

P2P **ไม่ได้**เป็นเจ้าของ/เปิด data center เป็นบริการ · **ไม่ host workload ลูกค้า · ไม่เป็นเจ้าของ compute**.
Titanicom = **service**: ออกแบบ+สร้าง+deploy AI infrastructure **ให้ลูกค้า บน site ของลูกค้าเอง** (On-Premise, Client-Owned). เฟรมทุกอย่างเป็น service capability. **ห้ามเปลี่ยน/แต่งข้อความหลัก** (headline/ชื่อบริษัท/service desc/stats ใช้ตาม deck เดิมเป๊ะ).

## Brand tokens (electric-blue light — scope เฉพาะเพจนี้ ห้ามแตะ global @theme)

bg #FFFFFF · alt #F4F7FC · card #FFFFFF · border #E2E8F0 · primary #2B7FFF · secondary #0EA5E9 · text #0F172A · muted #64748B · subtle-highlight #EFF6FF · footer-dark #0F172A.
Type: **Inter** (heading/EN 700-800, ต้องโหลดเพิ่ม — ไม่มีในไซต์) + **Noto Sans Thai / Sarabun** (Thai body). eyebrow = uppercase letter-spaced electric-blue. shadow 0 2px 12px rgba(0,0,0,.08). radius 12-16px. white space เยอะ. **no dark mode.** line-height ไทย body ≥1.6 heading ≥1.3.

## House-standard ที่ต้อง reuse (จาก Discovery)

- stack: Astro SSR (Cloudflare) + Tailwind v4 (`@theme` global = charcoal — **ห้ามแก้**). ทำ P2P brand ด้วย **arbitrary values `bg-[#2B7FFF]` / CSS vars scope `.p2p`** ในเพจ.
- Layout.astro = shared (มี GTM/GA + noto-thai) — **ทำ `P2PLayout.astro` ใหม่** (own head/meta/OG, โหลด Inter via `@fontsource-variable/inter` ถ้ามี ไม่งั้น Google Fonts `<link>`, own P2P header/footer, ไม่มี PERPOS chrome).
- reuse utilities brand-neutral ได้: `section-padding` `container-custom` `animate-fade-up` `animate-stagger-*` `flow-path` (marching dashes) `bg-grid` `glass`. **หลีกเลี่ยง** `gradient-text`/`bg-brand-gradient` (charcoal).
- scroll-reveal: IntersectionObserver + class (vanilla `<script>` ตาม pattern ไซต์).

## Storyline (9 section — ลำดับล็อก · เนื้อหาเต็มดูใน `.claude/presentation-factory/specs/p2p-holding.md` + deck `_out/p2p-holding.html`)

1. HERO (sticky glass nav + full-bleed) — wordmark "P2P HOLDING" · headline "เราสร้าง AI Stack ให้ธุรกิจคุณ / ตั้งแต่ Infrastructure จนถึง ERP" · EN sub "Full-Stack AI Delivery — Infrastructure · Platform · Integration" · body · 6 pill · **hero SVG 3-layer stack (animated)** · CTA "เริ่มต้นปรึกษาฟรี →"
2. THE FULL AI STACK ⭐ (alt bg, จุดต่าง = hero moment) — 3 layer (L3 Integration: P2P Solutions·P2P Supply·ExCon / L2 Platform: Perpos AI ERP·ExWorker / L1 Infrastructure: Titanicom·Network Evolution) เชื่อมด้วย flow line animate · callout "✦ ลูกค้าเจ้าอื่นต้องประสาน 3 vendor — กับ P2P คุณคุยที่เดียวจบ"
3. GROUP STRUCTURE — org chart P2P Holding → 6 บริษัท (2 FLAGSHIP: Titanicom, P2P Solutions) + layer tag + connector lines
4. TITANICOM AI INFRASTRUCTURE (alt bg) — 4 service + 4 stat + callout data-sovereignty
5. PERPOS AI ERP — 4 bullets + dashboard mockup (device frame) + 6 module cards
6. SI CAPABILITIES (alt bg) — 4 capability
7. AI SOLUTIONS — 5 service + 4 stat (count-up)
8. END-TO-END JOURNEY (alt bg) — 5 step + animated horizontal flow line + callout
9. CONTACT/CTA — gradient blue band · big CTA · contact 2×2 (placeholder) · footer bar

## Design ceiling (ยกเหนือ deck)

full-bleed section · sticky glass nav + scroll-active + mobile hamburger · hero stack float/parallax + gradient accent บนคำคีย์ · flow lines marching (flow-path) ที่ section 2 + journey · stat count-up on view · scroll fade-up + stagger ทั้งเพจ · device-framed dashboard · hover lift บนการ์ด · เคารพ prefers-reduced-motion · responsive 375→1440 ไม่ล้น/ไม่ตัด.

## Review Log

- (append ทุกการตัดสิน/issue)
