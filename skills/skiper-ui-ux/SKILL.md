---
name: skiper-ui-ux
description: >-
  Design and build polished, animated UI with Skiper UI (un-common shadcn/ui
  components) and Motion (motion.dev, formerly Framer Motion). Use this skill
  whenever the task involves building or improving a React/Next.js interface —
  hero sections, cards, modals, drawers, navs, marquees, scroll effects,
  micro-interactions, page transitions, or "make it feel premium / add
  animation / smoother UX." Triggers on: "skiper", "skiper ui", "motion",
  "framer motion", "animate this", "add a transition", "micro-interaction",
  "scroll animation", "shadcn component", "make the UI nicer", "hover effect",
  "loading state", "page transition". Loads BEFORE writing component or
  animation code so the result is accessible, performant, and consistent.
---

# Skiper UI + Motion — Animated UI/UX

Build interfaces that feel premium: shadcn-native components from **Skiper UI**,
animated with **Motion** (`motion.dev` — the library formerly called Framer
Motion). This skill covers what to reach for, how to wire it up correctly, and
the motion/accessibility rules that separate a polished UI from a janky one.

## The stack in one breath

| Layer | Tool | Role |
|-------|------|------|
| Components | **Skiper UI** | 100+ un-common, single-file shadcn/ui components (cards, hero, marquee, dynamic island, image reveal, cursor trail, drawers…). You copy the source into your repo — **you own the code**, no runtime dep. |
| Animation | **Motion** (`motion`) | Hybrid engine: native Web Animations API + ScrollTimeline for 120fps, JS fallback for springs/gestures. Import from `motion/react`. |
| Styling | **Tailwind CSS** | Utilities + the `cn()` helper (clsx + tailwind-merge). |
| Foundation | **shadcn/ui + Radix** | Accessible primitives, `npx shadcn` CLI, `components/ui/*`. |
| Icons | **lucide-react** | Default icon set. |

Skiper UI ≠ a runtime package. It's a **registry** you pull from with the shadcn
CLI; the component lands in your tree as editable TSX. Requires React ≥ 18.2.

## Decision guide — reach for the right thing

1. **Is there a Skiper component for it?** Distinctive, motion-heavy widgets
   (image reveal, marquee, dynamic island, hover cards, scroll galleries,
   animated tooltips/drawers) — pull from Skiper UI, then tweak.
2. **Is it a standard primitive?** (button, dialog, input, dropdown) — use plain
   **shadcn/ui**; don't over-animate a form control.
3. **Is it a bespoke interaction?** — compose it yourself with **Motion**
   primitives (`motion.*`, variants, `AnimatePresence`, `layout`).
4. **Does it need to animate on scroll/enter?** — `whileInView` or
   `useScroll`, never a scroll-event listener that sets state per frame.

Prefer editing an existing Skiper/shadcn component in-repo over adding a new
dependency. The whole point of this stack is that you own the source.

## Installing Skiper UI components

Each component is a single file added through the shadcn registry CLI:

```bash
# shadcn must be initialized first (creates components.json + cn() util)
npx shadcn@latest init

# add a Skiper component by its registry id (e.g. skiper40)
npx shadcn@latest add @skiper-ui/skiper40
```

The command drops editable TSX into `components/` (and any deps into
`components/ui/`). After that, treat it as your code — restyle with Tailwind,
swap copy, delete what you don't use. If the CLI can't resolve the registry,
copy the source from the component's page and paste it in; the result is
identical because there's no runtime package.

## Motion — the core API you'll actually use

Always import from `motion/react` (not the legacy `framer-motion`):

```tsx
import { motion, AnimatePresence, useScroll, useReducedMotion } from "motion/react";
```

**Animate a value** — any `motion.*` element takes `animate`; it tweens from the
current state:

```tsx
<motion.div animate={{ x: 100, opacity: 1 }} transition={{ duration: 0.3 }} />
```

**Variants** — name states once, orchestrate children with `staggerChildren`:

```tsx
const list = { show: { transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } };

<motion.ul variants={list} initial="hidden" animate="show">
  {items.map((t) => <motion.li key={t} variants={item}>{t}</motion.li>)}
</motion.ul>
```

**Enter on scroll** — `whileInView` + `viewport={{ once: true }}` so it fires
once and doesn't thrash:

```tsx
<motion.section
  initial={{ opacity: 0, y: 24 }}
  whileInView={{ opacity: 1, y: 0 }}
  viewport={{ once: true, amount: 0.3 }}
  transition={{ duration: 0.5, ease: "easeOut" }}
/>
```

**Exit + mount/unmount** — wrap in `AnimatePresence`; give a stable `key`:

```tsx
<AnimatePresence mode="wait">
  {open && (
    <motion.div key="panel"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
  )}
</AnimatePresence>
```

**Layout animation** — the `layout` prop animates position/size changes
(reorder, expand, shared element) for free. Add `layoutId` to morph one element
into another across trees.

**Gestures** — `whileHover`, `whileTap`, `whileFocus`, `drag`. These are the
cheap wins for micro-interactions (a button that dips 2% on tap reads as
responsive).

**Springs beat durations for anything interactive:**

```tsx
transition={{ type: "spring", stiffness: 400, damping: 30 }}
```

## Motion & UX rules (the part that makes it feel good)

- **Animate only `transform` and `opacity`.** They're GPU-composited and don't
  trigger layout/paint. Animating `width`, `height`, `top`, `left`, or
  `margin` per frame causes jank — use `scale`/`x`/`y` or the `layout` prop
  instead.
- **Duration budget:** micro-interactions **150–250 ms**, entrances/transitions
  **300–500 ms**, ambient/looping longer. If it feels slow, it's too long.
- **Easing:** `easeOut` for things entering (fast → settle), `easeIn` for things
  leaving, spring for anything the user directly drives. Avoid linear except for
  continuous loops (marquee, spinner).
- **Stagger, don't dump.** Reveal lists with a 40–80 ms `staggerChildren`, not
  all at once. Cap total orchestration under ~600 ms.
- **Respect `prefers-reduced-motion` — non-negotiable.** Gate large-motion
  effects; keep opacity fades. Motion exposes `useReducedMotion()`:

  ```tsx
  const reduce = useReducedMotion();
  <motion.div animate={{ y: reduce ? 0 : -20, opacity: 1 }} />
  ```

- **Purpose over decoration.** Animation should explain a state change (where did
  this come from, where did it go, what's loading). Motion with no meaning is
  noise — and a cost on every low-end device.
- **Don't block input.** Never gate a click/submit behind an animation
  finishing. Interactions stay interruptible.
- **60fps floor, 120fps target.** If a Skiper component stutters, check you
  aren't animating layout properties and that heavy work isn't on the main
  thread during the tween.

## Accessibility & structure (shadcn/Radix already helps)

- Keep Skiper/shadcn's Radix primitives for anything interactive — you get
  focus management, `aria-*`, and keyboard nav for free. Don't rebuild a
  `Dialog` out of a `div` just to animate it; animate the Radix content.
- Preserve focus order and visible focus rings through transitions.
- Decorative motion elements: `aria-hidden` and don't put content only there.
- Color/contrast: components are Tailwind — verify contrast in **both** light
  and dark themes, not just the one you're looking at.

## A good build workflow

1. **Detect the stack** — confirm Next.js/React + Tailwind + shadcn are set up
   (`components.json` present, `cn()` util exists). Init shadcn if not.
2. **Compose from Skiper first**, shadcn second, hand-rolled Motion last.
3. **Wire animation with the primitives above** — variants for orchestration,
   `whileInView` for scroll, `AnimatePresence` for exit, `layout` for reflow.
4. **Add the reduced-motion path** in the same pass, not later.
5. **Verify** — drive the actual UI: hover/tap/scroll/open-close, toggle the OS
   reduced-motion setting, check light + dark. Confirm no layout-property
   animations are causing jank.

## Quick checklist before you call it done

- [ ] Only `transform`/`opacity` animated (or `layout` prop) — no per-frame `width`/`top`
- [ ] Durations within budget; spring for interactive, easeOut for entrances
- [ ] Lists stagger; nothing dumps in all at once
- [ ] `prefers-reduced-motion` handled via `useReducedMotion()`
- [ ] `AnimatePresence` + stable `key` for anything that mounts/unmounts
- [ ] Radix/shadcn accessibility preserved; focus + keyboard still work
- [ ] Verified in light **and** dark, on real interaction — not just a screenshot
- [ ] Imports come from `motion/react`, not `framer-motion`

## Reference

- Skiper UI — https://skiper-ui.com (registry ids like `@skiper-ui/skiper40`)
- Motion for React — https://motion.dev/docs/react
- shadcn/ui — https://ui.shadcn.com
