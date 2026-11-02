# Animation Improvement Plans (`improve-animations`)

Generated following the `improve-animations` skill workflow (`AUDIT.md` & `PLAN-TEMPLATE.md`).

| Plan | Title | Severity | Category | Status |
| :--- | :--- | :---: | :--- | :---: |
| [001](001-gpu-composited-stage-bars.md) | Replace `width` layout transition on bottleneck stage bars with GPU `scaleX` | HIGH | Performance | DONE |
| [002](002-asymmetric-hold-and-blur-morph.md) | Add asymmetric `clip-path` hold-to-thermal-shock button and blur-masked upgrade transition | MEDIUM | Interruptibility & Physicality | DONE |
| [003](003-instant-subsequent-tooltips.md) | Instant subsequent tooltip transitions & zero-animation keyboard chip selection | MEDIUM | Easing & Duration / Frequency | DONE |

## Recommended Execution Order
1. **001** (eliminates layout recalculation on every 160ms telemetry tick)
2. **002** (adds physical hold-to-confirm `clip-path` and blur-masked state transition)
3. **003** (eliminates lag on subsequent tooltip hovers and keyboard `1–6` selection)
