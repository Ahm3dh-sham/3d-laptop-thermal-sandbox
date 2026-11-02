# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Computer engineering students, hardware enthusiasts, and system architects exploring how laptop internal components (CPU, GPU, VRM, RAM, NVMe SSD, Battery) thermally interact and create pipeline bottlenecks under realistic workloads.

## Product Purpose

ThermBench 3D ("3D Laptop Thermal & Bottleneck Sandbox") lets users configure a laptop's silicon and cooling module, run sustained workloads, and observe real-time 3D heat conduction, fan convection, hysteresis clock throttling, and 4-stage pipeline bottlenecks (`CPU -> RAM -> GPU -> Storage`) without needing physical hardware bench equipment.

## Positioning

Unlike static bottleneck calculators or black-box benchmark databases, ThermBench 3D couples a deterministic 60 Hz lumped-RC thermal and 2D neighbor-conduction ODE directly to an interactive exploded 3D Three.js assembly and a 4-stage throughput pipeline, calibrated against published hardware telemetry.

## Operating Context

Used in university computer architecture demos, engineering labs, and browser-based hardware comparisons on desktop and mobile/tablet browsers, supporting both single-assembly inspection and side-by-side Compare Mode (`Config A` vs `Config B`).

## Capabilities and Constraints

- Pure JavaScript simulation engine (`/src/sim`) with zero Three.js or DOM imports so all physics and bottleneck equations are deterministic and unit-tested (`Vitest`).
- 60 FPS target with reusable `BufferGeometry`, `InstancedMesh` fin arrays and airflow particles, zero per-frame allocations, and a fixed-timestep accumulator (`FIXED_DT = 1/60`).
- Calibrated against two published laptop baselines (`ASUS ROG Zephyrus G14 2024 GA403UV` and `Lenovo Legion Pro 7i Gen 9 16IRX9H`) documented in `/docs/calibration.md`.

## Brand Commitments

- **Name**: ThermBench 3D — Thermal & Bottleneck Lab
- **Voice**: Precise, empirical, hardware-instrumented, and direct.

## Evidence on Hand

- Calibrated thermal and throughput presets in `src/sim/presets.js` and `docs/calibration.md`.
- Unit test suite in `tests/sim.test.js`.

## Product Principles

1. **Physics-driven visual truth**: Every color shift, fan speed change, and bottleneck pulse in the 3D viewport is driven directly by the underlying ODE state.
2. **Separation of simulation and view**: `/src/sim` never imports rendering or DOM code.
3. **Instantaneous instrumentation**: Telemetry charts, KPI readouts, and 3D tooltips respond immediately with tabular numeral stability (`tabular-nums`).
4. **Actionable diagnostics**: Every bottleneck detection pairs a one-line root cause with a concrete, one-click hardware upgrade.
