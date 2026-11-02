# 003 — Instant subsequent tooltip transitions & zero-animation keyboard chip selection

- **Status**: DONE
- **Commit**: 8edcda4
- **Severity**: MEDIUM
- **Category**: Easing & Duration / Purpose & Frequency
- **Estimated scope**: 2 files (`src/style.css`, `src/view/interaction.js`), ~25 lines

## Problem

1. `src/style.css:455` transitions `.component-tooltip` on every hover even when the tooltip is already open and moving between adjacent components (`emil-design-eng` §Tooltips: skip delay on subsequent hovers).
2. Keyboard shortcuts (`1–6`) and `.comp-chip` toolbar buttons are high-frequency actions; per `remove-animations`, switching between components via keyboard must set `data-instant` so the tooltip snaps without lag.

## Target

```css
/* src/style.css */
.component-tooltip[data-instant] {
  transition-duration: 0ms !important;
}
```

## Steps

1. Add `.component-tooltip[data-instant]` rule in `src/style.css`.
2. In `src/view/interaction.js`, track whether the tooltip was already visible (`wasOpen`) and set `tooltipEl.toggleAttribute('data-instant', wasOpen)` so subsequent component hovers/keyboard switches are instantaneous.

## Boundaries

- Do NOT remove the initial `@starting-style` entrance when the tooltip opens from a closed state.

## Verification

- **Feel check**: Hover CPU (tooltip animates in over `140ms ease-out`), then glide directly to GPU or press keys `1`–`6` (tooltip updates with `0ms` transition lag).
