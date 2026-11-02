---
name: ThermBench 3D
description: 3D Laptop Thermal & Bottleneck Engineering Sandbox
colors:
  ground: "#000000"
  surface: "#111111"
  raised: "#1a1a1a"
  active: "#242424"
  border: "#262626"
  rule: "#1b1b1b"
  control: "#3d3d3d"
  text: "#ffffff"
  muted: "#b4b4b4"
  faint: "#949494"
  accent: "#38bdf8"
  accent-warm: "#f59e0b"
  positive: "#3fc07a"
  negative: "#e5566f"
typography:
  display:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  title:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.35
rounded:
  card: "6px"
  control: "4px"
  chip: "4px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "14px"
  lg: "20px"
components:
  button-primary:
    backgroundColor: "{colors.text}"
    textColor: "{colors.ground}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "32px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "32px"
  card-panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.card}"
    padding: "16px"
---

# Design System: ThermBench 3D

## Overview

**Creative North Star: "The Precision Thermal Bench"**

ThermBench 3D is an engineering telemetry bench where the exploded 3D silicon assembly and real-time thermal/pipeline instruments share a ruled dark-room workspace (`#000000` ground, `#111111` cards, `1px solid #262626` structural hairlines). Because color encodes physical die temperature (`Blue 25°C -> Cyan 50°C -> Yellow 75°C -> Red 95°C+`) and pipeline bottleneck state, the surrounding chrome stays disciplined and neutral so thermal states read unambiguously at a glance.

**Key Characteristics:**
- Ruled T-frame data-terminal shell with `1px solid #262626` structural hairlines.
- Technical grotesque (`IBM Plex Sans`) paired with tabular monospace (`JetBrains Mono`) for live telemetry counters.
- Origin-aware 3D projected tooltips, physical press feedback (`scale(0.97)`), and interruptible `clip-path` hold-to-stress interactions.

## Colors

High-contrast dark telemetry surfaces designed to let the 3D heat-map shader and semantic status pills carry chromatic weight.

### Primary
- **Cryo Intake Cyan** (`#38bdf8`): Primary interactive accent, active viewport indicators, and cool intake airflow state.

### Secondary
- **Heatpipe Amber** (`#f59e0b`): Thermal warning threshold and GPU clock series highlight.
- **Throttle Crimson** (`#e5566f`): Active thermal throttling alert and pipeline bottleneck pulse indicator.
- **Nominal Emerald** (`#3fc07a`): Unthrottled thermal headroom and positive throughput delta.

### Neutral
- **Anodized Ground** (`#000000`): Root application background and sidebar ground.
- **Instrument Surface** (`#111111`): Card and panel container background.
- **Raised Control** (`#1a1a1a`): Hover surface and progress track background.
- **Hairline Rule** (`#262626`): Structural 1px borders and KPI cell dividers.

### Named Rules
**The Thermal Chromatic Priority Rule.** Chrome never competes with the heat map: saturated red, amber, and cyan are reserved for live temperature, throttling status, and active selection.

## Typography

**Display Font:** IBM Plex Sans (with `system-ui, sans-serif` fallback)
**Body Font:** IBM Plex Sans
**Label/Mono Font:** JetBrains Mono

**Character:** Crisp hardware-lab grotesque paired with fixed-width tabular numerals so 60 Hz live counters never jitter horizontally.

### Hierarchy
- **Display** (`600`, `1.75rem`, `1.15`): Primary KPI lead throughput readout (`#kpi-fps`).
- **Headline** (`600`, `1.375rem`, `1.2`): Workspace title (`h1`) with `text-wrap: balance`.
- **Title** (`600`, `0.875rem`, `1.35`): Panel headers and tooltip component titles.
- **Body** (`400`, `0.875rem`, `1.45`): Diagnostic explanations and upgrade recommendations (`text-wrap: pretty`).
- **Label** (`500`, `0.75rem`, `1.35`): Tabular telemetry metrics, axis ticks, and status pills.

### Named Rules
**The Tabular Telemetry Rule.** Every live-updating temperature, clock frequency, wattage, RPM, and FPS readout must apply `font-variant-numeric: tabular-nums` (`.num`).

## Layout

Two-column T-frame shell (`276px` fixed hardware configuration sidebar + flexible `1fr` main workspace capped at `1600px`), collapsing cleanly to a single column below `1120px` with `100dvh` mobile-native viewport sizing and safe-area insets.

## Elevation & Depth

Surfaces are flat at rest and separated by `1px solid #262626` borders. Depth shadows are reserved for floating overlays that sit above the 3D WebGL canvas.

### Shadow Vocabulary
- **Floating Tooltip** (`box-shadow: 0 10px 28px -6px rgba(0, 0, 0, 0.72)`): Separates the 3D-projected component tooltip and toast notifications from the underlying 3D scene.

## Shapes

Crisp instrument geometry: `6px` radius on cards and floating overlays (`--radius-card`), `4px` radius on buttons, selects, and status pills (`--radius-control`).

## Components

### Buttons
- **Shape:** `4px` border radius, `32px` height, `0 12px` horizontal padding.
- **Primary:** `#ffffff` fill with `#000000` ink (`#38bdf8` fill when toggled active via `aria-pressed="true"`).
- **Hover / Focus:** Hover gated behind `@media (hover: hover) and (pointer: fine)`; `:active` scales to `scale(0.97)` over `120ms cubic-bezier(0.23, 1, 0.32, 1)`.

### Chips
- **Style:** `26px` height, `#1a1a1a` background, `1px solid #262626` border.
- **State:** Active component chip highlights border with `#38bdf8` and text with `#ffffff`.

### Cards / Containers
- **Corner Style:** `6px` radius (`--radius-card`).
- **Background:** `#111111` (`--surface`).
- **Border:** `1px solid #262626` (`--border`).
- **Internal Padding:** `16px` (`--card-pad`).

### Inputs / Fields
- **Style:** `32px` height `#111111` select controls with `1px solid #3d3d3d` border; `16px` font size on `@media (pointer: coarse)` to prevent iOS Safari auto-zoom.
- **Focus:** `2px solid #38bdf8` outline with `2px` offset.

## Do's and Don'ts

### Do:
- **Do** use `font-variant-numeric: tabular-nums` on every live numerical readout.
- **Do** gate all `:hover` states behind `@media (hover: hover) and (pointer: fine)` and provide `:active { transform: scale(0.97) }` press feedback.
- **Do** animate only `transform`, `opacity`, and `clip-path` on UI elements under `300ms` using `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`.

### Don't:
- **Don't** use `transition: all` or `ease-in` on any UI control.
- **Don't** animate high-frequency keyboard actions (such as the `1–6` component quick-select keys or prototype/dataset switcher pills).
- **Don't** import Three.js or DOM APIs inside `/src/sim`.
