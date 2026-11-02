# 001 — Replace width layout transition on bottleneck stage bars with GPU scaleX

- **Status**: DONE
- **Commit**: 8edcda4
- **Severity**: HIGH
- **Category**: Performance
- **Estimated scope**: 2 files (`src/ui/panels.js`, `src/style.css`), ~20 lines

## Problem

`src/ui/panels.js:34` animates the `width` property of `#bar-fill-cpu`, `#bar-fill-ram`, `#bar-fill-gpu`, and `#bar-fill-ssd` on every UI refresh tick (every 160ms):

```javascript
/* src/ui/panels.js:34 — current */
<div id="bar-fill-${id}" style="height: 100%; width: 50%; background: var(--accent); transition: width 180ms var(--ease-out), background-color 180ms ease;"></div>
```

Animating `width` triggers **Layout + Paint + Composite** on every frame (`animation-performance` §What You Animate).

## Target

Use `width: 100%; transform-origin: left center; transform: scaleX(0.5);` and transition only `transform` and `background-color` (composite-tier properties):

```css
/* src/style.css — target */
.stage-bar-fill {
  height: 100%;
  width: 100%;
  transform-origin: left center;
  transform: scaleX(0.5);
  background: var(--accent);
  transition:
    transform 180ms cubic-bezier(0.23, 1, 0.32, 1),
    background-color 180ms ease;
  will-change: transform;
}
```

## Repo conventions to follow

- Easing tokens live in `src/style.css:39`: `--ease-out: cubic-bezier(0.23, 1, 0.32, 1);`

## Steps

1. Add `.stage-bar-fill` in `src/style.css` using `transform: scaleX(...)` and `transform-origin: left center`.
2. Update `src/ui/panels.js` to set `barFills[stageId].style.transform = \`scaleX(\${(pct / 100).toFixed(3)})\`` instead of `style.width`.

## Boundaries

- Do NOT touch `/src/sim`.
- Do NOT add new dependencies.

## Verification

- **Mechanical**: `npm run build && npm test -- --run` passes with 0 errors.
- **Feel check**: Switch workloads (`Idle` -> `AAA Gaming` -> `Compiling`) and confirm the 4 stage bars scale smoothly from their left origin with zero layout recalculation.
