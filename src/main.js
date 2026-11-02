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
import { initToaster, toast } from './ui/toaster.js';
import { createPrototypeAndBreakHarness, applyDatasetBoundary } from './ui/breakHarness.js';

initToaster();

const COMPONENT_LABELS = {
  cpu: 'CPU — Processor Die',
  gpu: 'GPU — Graphics Core',
  vrm: 'VRM — Power Delivery',
  ram: 'RAM — Memory Modules',
  ssd: 'SSD — NVMe Storage',
  battery: 'Battery — Li-Ion Pack',
};

const SHORTCUT_MAP = {
  '1': 'cpu',
  '2': 'gpu',
  '3': 'vrm',
  '4': 'ram',
  '5': 'ssd',
  '6': 'battery',
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
      label: comp.label || comp.customLabel || COMPONENT_LABELS[id] || id.toUpperCase(),
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

// Mount Prototype & Break-UI Harness (floating bottom pill: Bench / Compact / Cinema + Demo data / Worst case + Replay)
let lastThrottleToastActive = false;
const harness = createPrototypeAndBreakHarness({
  onVariantChange: (variantId) => {
    requestAnimationFrame(() => {
      if (viewA) viewA.resize();
      if (viewB && compareMode) viewB.resize();
    });
    toast(`Layout Variant: ${variantId.toUpperCase()}`, {
      id: 'proto-variant-toast',
      type: 'info',
      description: 'Switched workspace layout via prototype picker (←/→ or 1–3).',
      duration: 2400,
    });
  },
  onDataModeChange: (dataMode) => {
    refreshUiNow();
    toast(dataMode === 'worst' ? 'Worst-Case Data Active (?data=worst)' : 'Demo Data Restored', {
      id: 'break-ui-mode-toast',
      type: dataMode === 'worst' ? 'warning' : 'success',
      description:
        dataMode === 'worst'
          ? 'Injecting long German compounds, diacritics, and extreme numbers at the data boundary.'
          : 'Reverted telemetry to calibrated hardware strings.',
      duration: 3400,
    });
  },
  onReplay: () => {
    simA.resetThermals();
    simB.resetThermals();
    refreshUiNow();
    toast('Thermal Replay Triggered', {
      id: 'thermal-replay-toast',
      type: 'info',
      description: 'Reset component temperatures to ambient baseline.',
      duration: 2400,
    });
  },
});

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
    if (patch.presetId || patch.workloadId) {
      const cfg = getActiveSimulator().getResolvedConfig();
      toast(`Active Profile: ${cfg.cpu.shortName} · ${cfg.workload.name}`, {
        id: 'profile-change-toast',
        type: 'info',
        description: `Cooling: ${cfg.cooling.name} (${cfg.powerLimitScale}% Power Limit)`,
        duration: 2600,
      });
    }
  },
  onResetThermals: () => {
    simA.resetThermals();
    simB.resetThermals();
    lastThrottleToastActive = false;
    refreshUiNow();
    toast('Thermals Reset to Ambient', {
      id: 'reset-thermals-toast',
      type: 'success',
      description: `All components cooled to ${simA.getSelection().ambientTemp}°C ambient.`,
      duration: 2500,
    });
  },
  onThermalShock: () => {
    getActiveSimulator().triggerThermalShock();
    refreshUiNow();
    toast('Thermal Shock Injected (101°C)', {
      id: 'thermal-shock-toast',
      type: 'error',
      description: 'Hold-to-confirm completed: forced instant TjMax thermal throttling & max fan RPM.',
      duration: 4200,
    });
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
      toast(`Upgrade Applied: ${hint.title}`, {
        id: 'upgrade-applied-toast',
        type: 'success',
        description: hint.actionLabel,
        duration: 3400,
      });
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
  toast(compareMode ? 'Side-by-Side Compare Mode Enabled' : 'Single Config View Restored', {
    id: 'compare-mode-toast',
    type: 'info',
    description: compareMode
      ? 'Running Config A (Zephyrus G14) vs Config B (Legion Pro 7i) simultaneously.'
      : 'Focused on Config A.',
    duration: 2800,
  });
});

window.addEventListener('resize', () => {
  if (viewA) viewA.resize();
  if (viewB && compareMode) viewB.resize();
});

// Keyboard shortcuts (emil-design-eng & remove-animations: instant 0ms selection for keyboard actions)
window.addEventListener('keydown', (e) => {
  const tag = (e.target && e.target.tagName) || '';
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;

  if (SHORTCUT_MAP[e.key]) {
    e.preventDefault();
    const compId = SHORTCUT_MAP[e.key];
    if (interactionA) {
      tooltipEl.setAttribute('data-instant', '');
      interactionA.selectComponent(compId);
      updateTooltipNow();
    }
    const chips = document.querySelectorAll('#component-pills .comp-chip');
    chips.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.comp === compId);
    });
  } else if (e.key === 'r' || e.key === 'R') {
    e.preventDefault();
    simA.resetThermals();
    simB.resetThermals();
    lastThrottleToastActive = false;
    refreshUiNow();
    toast('Thermal Replay (Shortcut R)', {
      id: 'thermal-replay-toast',
      type: 'info',
      description: 'Reset component temperatures to ambient baseline.',
      duration: 2200,
    });
  }
});

function updateTooltipNow() {
  if (!interactionA) return;
  const snapA = applyDatasetBoundary(simA.getSnapshot(), harness.getDataMode());
  interactionA.updateTooltip(adaptSnapshotForView(snapA));
}

function refreshUiNow() {
  const dataMode = harness.getDataMode();
  const snapA = applyDatasetBoundary(simA.getSnapshot(), dataMode);
  const snapB = applyDatasetBoundary(simB.getSnapshot(), dataMode);
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
    if (!lastThrottleToastActive) {
      lastThrottleToastActive = true;
      toast(`Thermal Throttling Active (-${maxDrop}% Clock)`, {
        id: 'thermal-throttle-alert',
        type: 'warning',
        description: 'Exceeded TjMax threshold. Upgrade cooling or reduce power limit.',
        duration: 4000,
      });
    }
  } else if (cpuC.temp > cpuC.throttleTemp - 5 || gpuC.temp > gpuC.throttleTemp - 5) {
    kpiThrottleBadge.textContent = 'Near Throttle Threshold';
    kpiThrottleBadge.className = 'kpi-sub status-warn';
    lastThrottleToastActive = false;
  } else {
    kpiThrottleBadge.textContent = 'No thermal throttle';
    kpiThrottleBadge.className = 'kpi-sub status-ok';
    lastThrottleToastActive = false;
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

// Initial UI render + initial toast notification
refreshUiNow();
toast('ThermBench 3D Ready — All Skills Active', {
  id: 'welcome-toast',
  type: 'info',
  description: 'Keys 1–6 inspect dies · Hold 1.2s for Thermal Shock · Bottom pill switches layouts & Worst-case data.',
  duration: 5000,
});

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

  const dataMode = harness.getDataMode();
  const viewStateA = adaptSnapshotForView(applyDatasetBoundary(simA.getSnapshot(), dataMode));
  if (viewA) {
    viewA.renderFrame(viewStateA, dt, elapsed, reducedMotion);
  }
  if (compareMode && viewB) {
    const viewStateB = adaptSnapshotForView(applyDatasetBoundary(simB.getSnapshot(), dataMode));
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
