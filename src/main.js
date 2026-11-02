/**
 * @fileoverview Main Application Entry Point (`ThermBench 3D`).
 * Connects the deterministic fixed-timestep simulation engine (`/src/sim`)
 * with the Three.js exploded laptop viewports (`/src/view`) and live UI/Charts (`/src/ui`).
 */

import * as THREE from 'three';
import { createSimulator } from './sim/simulator.js';
import { createThermalViewport } from './view/scene.js';
import { createInteractionController } from './view/interaction.js';
import { createControlsPanel } from './ui/controls.js';
import { createChartsPanel } from './ui/charts.js';
import { createDiagnosticsPanel } from './ui/panels.js';

const COMPONENT_LABELS = {
  cpu: 'CPU — Processor Die',
  gpu: 'GPU — Graphics Core',
  vrm: 'VRM — Power Delivery',
  ram: 'RAM — Memory Modules',
  ssd: 'SSD — NVMe Storage',
  battery: 'Battery — Li-Ion Pack',
};

// Instantiate two independent simulators:
// - simA: Default calibrated ASUS ROG Zephyrus G14 (2024)
// - simB: Default calibrated Lenovo Legion Pro 7i Gen 9 (used when Compare Mode is toggled ON)
const simA = createSimulator('zephyrus_g14_2024');
const simB = createSimulator('legion_pro_7i_g9');

let compareMode = false;
let activeSlot = 'A';
let isPaused = false;
const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
let reducedMotion = reducedMotionQuery.matches;
reducedMotionQuery.addEventListener('change', (e) => {
  reducedMotion = e.matches;
});

// DOM references matching index.html
const canvasStage = document.getElementById('canvas-stage');
const viewportPaneA = document.getElementById('viewport-a');
const viewportPaneB = document.getElementById('viewport-b');
const paneBadgeA = document.getElementById('pane-badge-a');
const viewportLabelA = document.getElementById('viewport-label-a');
const canvasA = document.getElementById('canvas-a');
const canvasB = document.getElementById('canvas-b');
const tooltipEl = document.getElementById('component-tooltip');
const webglFallbackEl = document.getElementById('webgl-fallback');
const fallbackTbody = document.getElementById('fallback-tbody');

const btnExplodeToggle = document.getElementById('btn-explode-toggle');
const btnResetCam = document.getElementById('btn-reset-cam');
const btnPauseSim = document.getElementById('btn-pause-sim');
const btnCompareMode = document.getElementById('btn-compare-mode');
const sliderExplode = document.getElementById('slider-explode');
const valExplode = document.getElementById('val-explode');
const findingLine = document.getElementById('finding-line');

// KPI Strip DOM Elements
const kpiFps = document.getElementById('kpi-fps');
const kpiFpsUnit = document.getElementById('kpi-fps-unit');
const kpiBottleneckShort = document.getElementById('kpi-bottleneck-short');
const kpiCpuTemp = document.getElementById('kpi-cpu-temp');
const kpiCpuClock = document.getElementById('kpi-cpu-clock');
const kpiGpuTemp = document.getElementById('kpi-gpu-temp');
const kpiGpuClock = document.getElementById('kpi-gpu-clock');
const kpiVrmTemp = document.getElementById('kpi-vrm-temp');
const kpiAuxTemps = document.getElementById('kpi-aux-temps');
const kpiFanRpm = document.getElementById('kpi-fan-rpm');
const kpiThrottleBadge = document.getElementById('kpi-throttle-badge');

// Initialize 3D Viewport A (and lazy-init or create Viewport B for Compare Mode)
const viewA = createThermalViewport(canvasA);
let viewB = null;
let interactionA = null;

if (viewA) {
  interactionA = createInteractionController({
    canvas: canvasA,
    camera: viewA.camera,
    laptopAssembly: viewA.laptop,
    tooltipEl,
    onSelectComponent: () => {
      updateTooltipNow();
    },
  });
} else {
  webglFallbackEl.hidden = false;
}

/**
 * Formats simulator snapshot into the shape expected by `laptopModel.js` and `interaction.js`.
 */
function adaptSnapshotForView(snapshot) {
  const components = {};
  for (const [id, comp] of Object.entries(snapshot.components)) {
    components[id] = {
      label: COMPONENT_LABELS[id] || id.toUpperCase(),
      temp: comp.temp,
      throttleTemp: comp.throttleTemp,
      clockDisplay: comp.clockText,
      load: comp.loadPct / 100,
      power: comp.powerW,
      isThrottling: comp.isThrottling,
      throttleFactor: 1 - comp.throttlePct / 100,
    };
  }
  return {
    fanRpm: snapshot.fanRpm,
    ambientTemp: snapshot.ambientTemp,
    bottleneck: {
      limitingStageId: snapshot.visualHighlightComponent,
    },
    components,
  };
}

function getActiveSimulator() {
  return compareMode && activeSlot === 'B' ? simB : simA;
}

// Mount Left Sidebar Controls
const controlsMount = document.getElementById('controls-mount');
const controlsPanel = createControlsPanel(controlsMount, {
  getActiveSelection: () => getActiveSimulator().getSelection(),
  onConfigChange: (patch, isShared = false) => {
    if (isShared) {
      simA.setConfig(patch);
      simB.setConfig(patch);
    } else {
      getActiveSimulator().setConfig(patch);
    }
    refreshUiNow();
  },
  onResetThermals: () => {
    simA.resetThermals();
    simB.resetThermals();
    refreshUiNow();
  },
  onSelectSlot: (slot) => {
    activeSlot = slot;
    refreshUiNow();
  },
});

// Mount Right Diagnostics & Optimization Panel
const diagnosticsMount = document.getElementById('diagnostics-mount');
const diagnosticsPanel = createDiagnosticsPanel(diagnosticsMount, {
  onApplyUpgrade: (hint) => {
    const targetSim = getActiveSimulator();
    const patch = {};
    if (hint.category === 'cpu') patch.cpuId = hint.targetPresetId;
    if (hint.category === 'gpu') patch.gpuId = hint.targetPresetId;
    if (hint.category === 'ram') patch.ramId = hint.targetPresetId;
    if (hint.category === 'ssd') patch.ssdId = hint.targetPresetId;
    if (hint.category === 'cooling') patch.coolingId = hint.targetPresetId;

    if (Object.keys(patch).length > 0) {
      targetSim.setConfig(patch);
      controlsPanel.syncInputsFromSelection();
      refreshUiNow();
    }
  },
  onSelectComponent: (compId) => {
    if (interactionA) {
      interactionA.selectComponent(compId);
      updateTooltipNow();
    }
  },
});

// Mount Bottom Chart.js Panel
const chartsMount = document.getElementById('charts-mount');
const chartsPanel = createChartsPanel(chartsMount);

// Top Toolbar & Footer Controls
sliderExplode.addEventListener('input', () => {
  const val = parseFloat(sliderExplode.value);
  valExplode.textContent = `${Math.round(val * 100)}%`;
  btnExplodeToggle.setAttribute('aria-pressed', val > 0.15 ? 'true' : 'false');
  if (viewA) viewA.laptop.setExplodeTarget(val);
  if (viewB) viewB.laptop.setExplodeTarget(val);
});

btnExplodeToggle.addEventListener('click', () => {
  const current = parseFloat(sliderExplode.value);
  const next = current > 0.15 ? 0.0 : 0.65;
  sliderExplode.value = String(next);
  valExplode.textContent = `${Math.round(next * 100)}%`;
  btnExplodeToggle.setAttribute('aria-pressed', next > 0.15 ? 'true' : 'false');
  if (viewA) viewA.laptop.setExplodeTarget(next);
  if (viewB) viewB.laptop.setExplodeTarget(next);
});

btnResetCam.addEventListener('click', () => {
  if (viewA) viewA.resetCamera();
  if (viewB) viewB.resetCamera();
});

btnPauseSim.addEventListener('click', () => {
  isPaused = !isPaused;
  btnPauseSim.setAttribute('aria-pressed', isPaused ? 'true' : 'false');
  btnPauseSim.textContent = isPaused ? 'Resume Sim' : 'Pause Sim';
});

btnCompareMode.addEventListener('click', () => {
  compareMode = !compareMode;
  btnCompareMode.setAttribute('aria-pressed', compareMode ? 'true' : 'false');
  btnCompareMode.textContent = compareMode ? 'Compare Mode: On' : 'Compare Mode: Off';

  canvasStage.classList.toggle('compare-active', compareMode);
  paneBadgeA.hidden = !compareMode;
  viewportPaneB.hidden = !compareMode;

  if (compareMode && !viewB) {
    viewB = createThermalViewport(canvasB);
    if (viewB) {
      viewB.laptop.setExplodeTarget(parseFloat(sliderExplode.value));
    }
  }

  controlsPanel.setCompareMode(compareMode);

  // Resize both viewports after grid layout transition
  requestAnimationFrame(() => {
    if (viewA) viewA.resize();
    if (viewB && compareMode) viewB.resize();
  });

  refreshUiNow();
});

window.addEventListener('resize', () => {
  if (viewA) viewA.resize();
  if (viewB && compareMode) viewB.resize();
});

function updateTooltipNow() {
  if (!interactionA) return;
  const snapA = simA.getSnapshot();
  interactionA.updateTooltip(adaptSnapshotForView(snapA));
}

function refreshUiNow() {
  const snapA = simA.getSnapshot();
  const snapB = simB.getSnapshot();
  const activeSnap = compareMode && activeSlot === 'B' ? snapB : snapA;
  const activeConfig = getActiveSimulator().getResolvedConfig();

  viewportLabelA.textContent = compareMode
    ? `Side-by-Side Compare — ${simA.getResolvedConfig().cpu.shortName} vs ${simB.getResolvedConfig().cpu.shortName}`
    : `Config A — ${activeConfig.cpu.shortName} + ${activeConfig.gpu.shortName} (${activeConfig.cooling.shortName})`;

  findingLine.textContent = activeSnap.explanation;

  // KPI Strip updates
  kpiFps.textContent = activeSnap.estimatedFps.toFixed(1);
  kpiFpsUnit.textContent = activeSnap.unitLabel;
  kpiBottleneckShort.textContent = `Limiting: ${activeSnap.limitingStage.toUpperCase()} (${activeSnap.components[activeSnap.limitingStage].loadPct}% load)`;

  const cpuC = activeSnap.components.cpu;
  kpiCpuTemp.textContent = cpuC.temp.toFixed(1);
  kpiCpuClock.textContent = `${cpuC.clockText} · ${cpuC.powerW.toFixed(0)} W`;

  const gpuC = activeSnap.components.gpu;
  kpiGpuTemp.textContent = gpuC.temp.toFixed(1);
  kpiGpuClock.textContent = `${gpuC.clockText} · ${gpuC.powerW.toFixed(0)} W`;

  const vrmC = activeSnap.components.vrm;
  const ssdC = activeSnap.components.ssd;
  const batC = activeSnap.components.battery;
  kpiVrmTemp.textContent = vrmC.temp.toFixed(1);
  kpiAuxTemps.textContent = `SSD ${ssdC.temp.toFixed(0)}°C · Batt ${batC.temp.toFixed(0)}°C`;

  kpiFanRpm.textContent = Math.round(activeSnap.fanRpm).toLocaleString();
  const anyThrottling = cpuC.isThrottling || gpuC.isThrottling || vrmC.isThrottling || ssdC.isThrottling;
  if (anyThrottling) {
    const maxDrop = Math.max(cpuC.throttlePct, gpuC.throttlePct, vrmC.throttlePct);
    kpiThrottleBadge.textContent = `Thermal Throttle (-${maxDrop}%)`;
    kpiThrottleBadge.className = 'kpi-sub status-crit';
  } else if (cpuC.temp > cpuC.throttleTemp - 5 || gpuC.temp > gpuC.throttleTemp - 5) {
    kpiThrottleBadge.textContent = 'Near Throttle Threshold';
    kpiThrottleBadge.className = 'kpi-sub status-warn';
  } else {
    kpiThrottleBadge.textContent = 'No thermal throttle';
    kpiThrottleBadge.className = 'kpi-sub status-ok';
  }

  diagnosticsPanel.update(activeSnap, snapA, snapB, compareMode);
  chartsPanel.update(activeSnap, snapB, compareMode);
  updateTooltipNow();

  // Populate non-WebGL accessible fallback table if needed
  if (!viewA && fallbackTbody) {
    fallbackTbody.innerHTML = Object.entries(activeSnap.components)
      .map(
        ([id, c]) =>
          `<tr><td>${id.toUpperCase()}</td><td class="num">${c.temp.toFixed(1)}</td><td class="num">${c.clockText}</td><td class="num">${c.loadPct}%</td></tr>`
      )
      .join('');
  }
}

// Initial UI render
refreshUiNow();

// Main 60 FPS Render & Fixed-Timestep Simulation Loop using THREE.Timer
const timer = new THREE.Timer();
let uiRefreshAccum = 0;

function animate(timestamp) {
  requestAnimationFrame(animate);
  timer.update(timestamp);
  const dt = timer.getDelta();
  const elapsed = timer.getElapsed();

  if (!isPaused) {
    simA.update(dt);
    if (compareMode) {
      simB.update(dt);
    }
  }

  const viewStateA = adaptSnapshotForView(simA.getSnapshot());
  if (viewA) {
    viewA.renderFrame(viewStateA, dt, elapsed, reducedMotion);
  }
  if (compareMode && viewB) {
    const viewStateB = adaptSnapshotForView(simB.getSnapshot());
    viewB.renderFrame(viewStateB, dt, elapsed, reducedMotion);
  }

  if (interactionA) {
    interactionA.updateTooltip(viewStateA);
  }

  uiRefreshAccum += dt;
  if (uiRefreshAccum >= 0.16) {
    uiRefreshAccum = 0;
    refreshUiNow();
  }
}

requestAnimationFrame(animate);
