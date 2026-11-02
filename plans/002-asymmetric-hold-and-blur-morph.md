# 002 — Add asymmetric clip-path hold-to-thermal-shock button and blur-masked upgrade transition

- **Status**: DONE
- **Commit**: 8edcda4
- **Severity**: MEDIUM
- **Category**: Interruptibility & Physicality
- **Estimated scope**: 3 files (`src/style.css`, `src/ui/controls.js`, `src/ui/panels.js`), ~45 lines

## Problem

1. `src/ui/controls.js:46` has a plain click button (`#btn-reset-thermals`) with no hold-to-stress counterpart demonstrating asymmetric press/release timing (`emil-design-eng` §Hold-to-delete / asymmetric enter-exit timing).
2. `src/ui/panels.js:56` (`#btn-apply-upgrade`) swaps its text label abruptly when an upgrade is applied without masking the state swap with a subtle `filter: blur(2px)` crossfade (`emil-design-eng` §Use blur to mask imperfect transitions).

## Target

```css
/* Asymmetric hold-to-confirm clip-path overlay (emil-design-eng) */
.btn-hold {
  position: relative;
  overflow: hidden;
  transition: transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
}
.btn-hold:active {
  transform: scale(0.97);
}
.btn-hold-overlay {
  position: absolute;
  inset: 0;
  background: rgba(229, 86, 111, 0.28);
  clip-path: inset(0 100% 0 0);
  transition: clip-path 200ms cubic-bezier(0.23, 1, 0.32, 1);
  pointer-events: none;
}
.btn-hold.is-holding .btn-hold-overlay {
  clip-path: inset(0 0 0 0);
  transition: clip-path 1200ms linear;
}

/* Blur-masked button content crossfade */
.btn-content-morph {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition:
    filter 180ms ease,
    opacity 180ms ease;
}
.btn-content-morph.is-transitioning {
  filter: blur(2px);
  opacity: 0.65;
}
```

## Steps

1. Add `.btn-hold`, `.btn-hold-overlay`, and `.btn-content-morph` in `src/style.css`.
2. Add the **Hold for Thermal Shock (100°C Spike)** button in `src/ui/controls.js` using pointer capture and asymmetric `clip-path` fill (`1200ms linear` on press, `200ms cubic-bezier(0.23, 1, 0.32, 1)` snap-back on release).
3. Wrap `#btn-apply-upgrade` label in `.btn-content-morph` in `src/ui/panels.js` so applying an upgrade smoothly blurs (`blur(2px)`) and crossfades the button copy.

## Boundaries

- Keep blur strictly at `2px` (well under the `20px` Safari threshold).

## Verification

- **Feel check**: Press and release the Thermal Shock button early — the crimson `clip-path` overlay snaps back in `200ms ease-out`. Hold for the full `1.2s` — it triggers a thermal spike and fires a toast notification.
