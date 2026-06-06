---
name: design-engineering
description: Emil Kowalski's philosophy on UI polish, animation decisions, and the invisible details that make software feel great. Use when building or reviewing UI components in PERPOS.
sources:
  - https://github.com/emilkowalski/skill
  - https://animations.dev
---

# Design Engineering (Emil Kowalski)

> "All those unseen details combine to produce something that's just stunning, like a thousand barely audible voices all singing in tune." — Paul Graham

Beauty is underutilized in software. In a world where every app is "good enough," taste is the differentiator. Use it as leverage.

---

## Animation Decision Framework

Before writing ANY animation, answer these in order:

### 1. Should this animate at all?

| How often will users see it? | Decision |
|---|---|
| 100+ times/day (keyboard shortcuts, command palette) | **No animation. Ever.** |
| Tens of times/day (hover effects, list navigation) | Remove or drastically reduce |
| Occasional (modals, drawers, toasts) | Standard animation |
| Rare/first-time (onboarding, celebrations) | Can add delight |

**Never animate keyboard-initiated actions.** Raycast has no open/close animation — that is the optimal experience for something used hundreds of times daily.

### 2. What is the purpose?
Every animation must answer "why does this animate?" Valid purposes: spatial consistency, state indication, feedback, preventing jarring changes. "It looks cool" is NOT valid if the user sees it often.

### 3. Easing rules

| Situation | Easing |
|---|---|
| Element entering | `ease-out` (starts fast, feels responsive) |
| Element exiting | `ease-in` |
| Moving/morphing on screen | `ease-in-out` |
| Hover/color change | `ease` |
| Constant motion (marquee) | `linear` |

**Never use ease-in for UI animations** — it starts slow, making the interface feel sluggish at exactly the moment the user is watching.

**Use custom easing curves** — built-in CSS easings are too weak:
```css
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
```

### 4. Duration

| Element | Duration |
|---|---|
| Button press feedback | 100–160ms |
| Tooltips, small popovers | 125–200ms |
| Dropdowns, selects | 150–250ms |
| Modals, drawers | 200–500ms |

**UI animations under 300ms.** A 180ms dropdown feels more responsive than 400ms. Perceived speed matters as much as actual speed.

---

## Component Rules

### Buttons must feel responsive
```css
.button { transition: transform 160ms ease-out; }
.button:active { transform: scale(0.97); }
```

### Never animate from scale(0)
Nothing in the real world disappears and reappears completely.
```css
/* Bad */  .entering { transform: scale(0); }
/* Good */ .entering { transform: scale(0.95); opacity: 0; }
```

### Popovers scale from their trigger (not center)
```css
/* Radix UI */
.popover { transform-origin: var(--radix-popover-content-transform-origin); }
```
**Exception: modals stay centered** — they're not anchored to a trigger.

### Tooltips: skip delay on subsequent hovers
Once one tooltip is open, hovering adjacent ones opens instantly. Feels faster without defeating the initial delay's purpose.

### Use CSS transitions (not keyframes) for interruptible UI
Transitions retarget mid-animation. Keyframes restart from zero. Use transitions for toasts, state toggles, list items.

### Stagger for list entries
```css
.item { animation: fadeIn 300ms ease-out forwards; }
.item:nth-child(1) { animation-delay: 0ms; }
.item:nth-child(2) { animation-delay: 50ms; }
.item:nth-child(3) { animation-delay: 100ms; }
/* Keep delays 30–80ms — longer feels slow */
```

### Asymmetric enter/exit timing
Slow when the user is deciding, fast when the system is responding:
```css
.overlay { transition: clip-path 200ms ease-out; }         /* exit: fast */
.button:active .overlay { transition: clip-path 2s linear; } /* press: deliberate */
```

---

## Performance Rules

- **Only animate `transform` and `opacity`** — skip layout and paint, runs on GPU.
- **Avoid animating padding, margin, height, width** — triggers full render pipeline.
- **CSS animations beat JS under load** — CSS runs off-main-thread; Framer Motion uses rAF which drops frames during page loads.
- **Framer Motion shorthand (`x`, `y`) is NOT hardware accelerated** — use `transform: "translateX()"` string instead.

---

## Accessibility

```css
@media (prefers-reduced-motion: reduce) {
  /* Fewer, gentler animations — not zero */
  .element { animation: fade 0.2s ease; /* no transform-based motion */ }
}

/* Touch device hover guard */
@media (hover: hover) and (pointer: fine) {
  .element:hover { transform: scale(1.05); }
}
```

---

## Review Checklist (Before/After Table Format)

When reviewing UI code, output a markdown table:

| Before | After | Why |
|---|---|---|
| `transition: all 300ms` | `transition: transform 200ms ease-out` | Specify exact properties |
| `transform: scale(0)` | `transform: scale(0.95); opacity: 0` | Nothing appears from nothing |
| `ease-in` on dropdown | `ease-out` with custom curve | ease-in feels sluggish |
| No `:active` state | `transform: scale(0.97)` on `:active` | Buttons must respond to press |
| `transform-origin: center` on popover | Radix CSS variable | Scale from trigger, not center |
| Animation on keyboard action | Remove entirely | Used 100+ times/day |
| Duration > 300ms on UI element | Reduce to 150–250ms | Perceived as slow |
| Hover without media query | Add `@media (hover: hover) and (pointer: fine)` | Touch devices false-trigger hover |
| Keyframes on rapidly-triggered element | CSS transitions | Interruptibility |
