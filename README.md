# ThermBench 3D — Laptop Thermal & Bottleneck Sandbox

An interactive 3D engineering sandbox built with **Vite**, **Vanilla JavaScript**, **Three.js (r186)**, and **Chart.js** where users configure a laptop's internal hardware, run real-time workloads, and inspect component heat dissipation, thermal throttling with hysteresis, airflow particles, and 4-stage pipeline bottlenecks (`CPU -> RAM -> GPU -> Storage`) in an exploded 3D assembly.

---

## Quick Start (`npm install && npm run dev`)

```bash
cd laptop-thermal-sandbox
npm install
npm run dev
```

Run the unit test suite (`Vitest`) for the pure-JS simulation modules (`/src/sim`):

```bash
npm test -- --run
```

Build for production:

```bash
npm run build
```

---

## Architecture Diagram

The project enforces a strict separation between the **pure JavaScript physics/bottleneck engine** (`/src/sim`, zero Three.js or DOM imports) and the **3D rendering & UI layers** (`/src/view`, `/src/ui`):

```text
+-----------------------------------------------------------------------------------+
|                                  src/main.js                                      |
|         Fixed-Timestep Loop (FIXED_DT = 1/60s) + THREE.Timer Render Loop          |
+-----------------------------------------+-----------------------------------------+
                                          |
            +-----------------------------+-----------------------------+
            |                                                           |
            v                                                           v
+---------------------------------------+   +---------------------------------------+
|       /src/sim (Pure JS Engine)       |   |     /src/view (Three.js r186 3D)      |
|  Zero Three.js or DOM imports         |   |                                       |
|                                       |   |  - scene.js: WebGLRenderer, ACES      |
|  - presets.js:                        |   |    Filmic, PCFShadowMap, OrbitControls|
|    CPU, GPU, RAM, SSD, Cooling,       |   |  - laptopModel.js: Exploded 3D chassis|
|    Workloads & Calibrated Profiles    |   |    motherboard, heatpipes, 48-fin     |
|                                       |   |    InstancedMesh, dual spinning fans  |
|  - thermal.js:                        |   |  - heatmapMaterial.js: Custom GLSL    |
|    Lumped RC ODE per component:       |   |    Blue->Cyan->Yellow->Red shader +   |
|    dT/dt = (P - k_cool*(T-T_amb)      |   |    Fresnel throttle glow + pulse      |
|             + sum G_ij*(T_j-T_i)) / C |   |  - particles.js: 140-instance airflow |
|    + Fan RPM forced convection        |   |    InstancedMesh (zero allocations)   |
|                                       |   |  - interaction.js: Layer-1 Raycaster  |
|  - throttle.js:                       |   |    picking + 3D projected tooltip     |
|    Over-temp clock/power reduction    |   +---------------------------------------+
|    with 3°C hysteresis recovery band  |                       |
|                                       |                       v
|  - bottleneck.js:                     |   +---------------------------------------+
|    4-stage pipeline:                  |   |       /src/ui (Controls & Charts)     |
|    CPU -> RAM -> GPU -> Storage       |   |                                       |
|    Throughput = min(stage_i),         |   |  - controls.js: Hardware dropdowns,   |
|    1-line root cause & upgrade hint   |   |    ambient/fan/power sliders, A/B tabs|
|                                       |   |  - panels.js: Bottleneck stage bars,  |
|  - simulator.js:                      |   |    1-click Upgrade Hint, Delta Table  |
|    Fixed-timestep accumulator &       |   |  - charts.js: 3 live Chart.js graphs  |
|    telemetry ring buffers             |   |    (Temps °C, Clocks GHz, FPS A vs B) |
+---------------------------------------+   +---------------------------------------+
```

---

## Features Checklist

1. **Exploded 3D Laptop Assembly (`/src/view/laptopModel.js`)**:
   - Interactive Explode Factor slider (`0%` closed to `100%` exploded) separating the unibody tray, motherboard, Layer-1 pickable silicon components (`CPU`, `GPU`, `VRM`, `RAM`, `SSD`, `Battery`), dual copper heatpipes, 48-fin `InstancedMesh` radiators, and spinning dual centrifugal fans.
   - Click or hover any 3D component (or use the keyboard toolbar chips) to project a live 2D tooltip anchored to the 3D die showing **Temperature (°C)**, **Clock/Transfer Rate**, **Load & Power (W)**, and **Throttle Status**.
2. **Custom GLSL Heat-Map Shader (`/src/view/heatmapMaterial.js`)**:
   - Smoothly blends component surface color from **Cool Blue (25°C) → Cyan (50°C) → Amber/Yellow (75°C) → Critical Red (95°C+)**.
   - Adds a soft Fresnel rim glow as temperature approaches the component's throttle threshold (`uThrottleTemp`) and pulses crimson (`uBottleneckPulse`) on the pipeline's limiting stage.
3. **Hardware & Thermal Controls (`/src/ui/controls.js`)**:
   - Dropdowns for **Calibrated Laptop Baseline**, **CPU**, **GPU**, **RAM**, **Storage (SSD)**, **Cooling Module**, and **Workload** (`Idle`, `AAA Gaming`, `3D Rendering`, `Codebase Compiling`).
   - Sliders for **Ambient Room Temp (15°C–42°C)**, **Fan Curve Aggressiveness (20%–100%)**, and **Power Limit PL1/TGP (50%–125%)**.
4. **Live Telemetry Charts (`/src/ui/charts.js`)**:
   - Three real-time `Chart.js` streaming line charts updating with zero animation lag: **Thermal Telemetry (°C)**, **Clock Frequency (GHz)**, and **Pipeline Throughput (FPS / Task Rate)**.
5. **Bottleneck Highlight & Concrete Optimization Hint (`/src/ui/panels.js`)**:
   - Displays per-stage throughput bars (`CPU`, `RAM`, `GPU`, `SSD`), a one-line root-cause explanation (e.g., *"GPU & CPU limited by RAM bandwidth (8GB DDR5-4800 1ch @ 38.4 GB/s)"*), and a concrete **Apply Recommended Upgrade** button.
6. **Side-by-Side Compare Mode**:
   - Toggle **Compare Mode: On** in the header to split the 3D stage into two synchronized viewports (`Config A` vs `Config B`) running the same workload and ambient temperature, complete with a live **Compare A vs B Delta Table** and dual-line FPS chart.

---

## Model Assumptions & Limitations

1. **Lumped-Capacitance RC Approximation**: Each component is represented as a single isothermal node $C_i$ rather than a 3D finite-element mesh. Real silicon dies exhibit internal hotspot gradients ($T_{\text{hotspot}} - T_{\text{edge}} \approx 8\text{–}15^\circ\text{C}$) that are folded into the effective threshold temperature.
2. **Accelerated Thermal Time Constants**: Real laptop chassis soak times (especially the aluminum palmrest and 80 Wh battery pack) take 8–15 minutes to reach full equilibrium. Thermal capacitances $C_i$ are scaled so steady-state equilibrium is reached in $\sim 15\text{–}30\text{ seconds}$ for interactive classroom demonstration while preserving accurate steady-state temperatures ($\Delta T = P / k_{\text{cool}}$).
3. **Static Workload Utilization Weights**: Workloads are modeled with steady stage demand weights (`CPU -> RAM -> GPU -> Storage`) rather than frame-by-frame trace replay, so bursty shader compilation stutters or I/O spikes are smoothed into continuous throughput estimates.
4. **Simplified Airflow Geometry**: Airflow particles illustrate intake-to-exhaust velocity and thermal color shift using parametric streamlines rather than solving the Navier-Stokes equations in real time.

See [`docs/calibration.md`](docs/calibration.md) for full calibration tables and sources against the **ASUS ROG Zephyrus G14 (2024)** and **Lenovo Legion Pro 7i Gen 9**.
