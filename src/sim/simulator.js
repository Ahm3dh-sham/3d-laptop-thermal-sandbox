/**
 * @fileoverview Fixed-Timestep Laptop Thermal & Bottleneck Simulator (`FIXED_DT = 1/60`).
 * Pure JS state container combining `presets.js`, `thermal.js`, `throttle.js`, and `bottleneck.js`
 * with zero Three.js or DOM imports.
 */

import {
  CPU_PRESETS,
  GPU_PRESETS,
  RAM_PRESETS,
  SSD_PRESETS,
  COOLING_PRESETS,
  WORKLOAD_PRESETS,
  LAPTOP_PROFILES,
  findPresetById,
} from './presets.js';
import {
  COMPONENT_IDS,
  createThermalState,
  computeComponentPowers,
  stepThermalModel,
} from './thermal.js';
import {
  createThrottleState,
  stepThrottleState,
  computeOperatingClock,
} from './throttle.js';
import { evaluatePipelineBottleneck } from './bottleneck.js';

export const FIXED_DT = 1 / 60; // 60 Hz deterministic physics step (16.67 ms)
export const HISTORY_MAX_POINTS = 60; // 30 seconds of telemetry at 0.5 s sample interval
export const HISTORY_SAMPLE_INTERVAL = 0.5;

/**
 * Creates a self-contained simulation instance for a single laptop configuration.
 * Can be instantiated once for single mode or twice (`simA`, `simB`) for side-by-side Compare Mode.
 *
 * @param {string} [initialProfileId='zephyrus_g14_2024'] - Initial calibration profile ID.
 */
export function createSimulator(initialProfileId = 'zephyrus_g14_2024') {
  const profile = findPresetById(LAPTOP_PROFILES, initialProfileId);

  const selection = {
    profileId: profile.id,
    cpuId: profile.cpuId,
    gpuId: profile.gpuId,
    ramId: profile.ramId,
    ssdId: profile.ssdId,
    coolingId: profile.coolingId,
    workloadId: 'gaming',
    ambientTemp: 25,
    fanCurveAggressiveness: 0.65, // 65% default balanced fan curve
    powerLimitRatio: 1.0, // 100% rated PL1/TGP
  };

  let resolvedConfig = resolveConfig(selection);
  const thermalState = createThermalState(selection.ambientTemp);

  // Start component temperatures slightly warm above ambient (idle equilibrium ~32-36 °C)
  thermalState.temps.cpu = selection.ambientTemp + 11;
  thermalState.temps.gpu = selection.ambientTemp + 9;
  thermalState.temps.vrm = selection.ambientTemp + 8;
  thermalState.temps.ram = selection.ambientTemp + 5;
  thermalState.temps.ssd = selection.ambientTemp + 6;
  thermalState.temps.battery = selection.ambientTemp + 3;

  const throttleStates = createAllThrottleStates(resolvedConfig);

  let simTime = 0;
  let accumulator = 0;
  let historyTimer = 0;

  // Ring buffer arrays for live Chart.js telemetry
  const history = {
    labels: [],
    cpuTemp: [],
    gpuTemp: [],
    vrmTemp: [],
    ssdTemp: [],
    cpuClockGHz: [],
    gpuClockGHz: [],
    fps: [],
  };

  // Pre-allocated snapshot object updated each step (zero per-frame allocations)
  const snapshot = {
    simTime: 0,
    ambientTemp: selection.ambientTemp,
    fanRpm: thermalState.fanRpm,
    fanNormalized: thermalState.fanNormalized,
    totalPowerW: 0,
    estimatedFps: 60,
    unitLabel: 'FPS',
    limitingStage: 'gpu',
    visualHighlightComponent: 'gpu',
    explanation: '',
    upgradeHint: null,
    stageThroughputs: { cpu: 100, ram: 100, gpu: 100, ssd: 100 },
    components: {
      cpu: { temp: 36, throttleTemp: 95, powerW: 15, clockText: '4.00 GHz', clockGHz: 4.0, loadPct: 50, isThrottling: false, throttlePct: 0, bottleneckPulse: 0 },
      gpu: { temp: 34, throttleTemp: 87, powerW: 25, clockText: '2100 MHz', clockGHz: 2.1, loadPct: 80, isThrottling: false, throttlePct: 0, bottleneckPulse: 0 },
      vrm: { temp: 33, throttleTemp: 105, powerW: 5, clockText: '90% Eff', clockGHz: 0, loadPct: 60, isThrottling: false, throttlePct: 0, bottleneckPulse: 0 },
      ram: { temp: 30, throttleTemp: 85, powerW: 3, clockText: '5600 MT/s', clockGHz: 2.8, loadPct: 55, isThrottling: false, throttlePct: 0, bottleneckPulse: 0 },
      ssd: { temp: 31, throttleTemp: 75, powerW: 3, clockText: '5000 MB/s', clockGHz: 0, loadPct: 25, isThrottling: false, throttlePct: 0, bottleneckPulse: 0 },
      battery: { temp: 28, throttleTemp: 60, powerW: 1.5, clockText: '15.4 V DC', clockGHz: 0, loadPct: 30, isThrottling: false, throttlePct: 0, bottleneckPulse: 0 },
    },
    history,
  };

  /**
   * Executes one deterministic fixed physics step (`FIXED_DT`).
   */
  function stepFixed(dt) {
    simTime += dt;
    historyTimer += dt;

    // 1. Evaluate 4-stage pipeline bottleneck & stage utilizations
    const pipeline = evaluatePipelineBottleneck(
      resolvedConfig,
      throttleStates,
      thermalState.temps
    );

    // 2. Step thermal & power throttling state with hysteresis for each component
    stepThrottleState(throttleStates.cpu, thermalState.temps.cpu, selection.powerLimitRatio, dt);
    stepThrottleState(throttleStates.gpu, thermalState.temps.gpu, selection.powerLimitRatio, dt);
    stepThrottleState(throttleStates.vrm, thermalState.temps.vrm, 1.0, dt);
    stepThrottleState(throttleStates.ssd, thermalState.temps.ssd, 1.0, dt);

    // 3. Compute component heat dissipation P_i (Watts)
    computeComponentPowers(
      resolvedConfig,
      pipeline.stageUtilizations,
      throttleStates,
      thermalState.powers
    );

    // 4. Advance lumped RC thermal ODE + 2D neighbor conduction + fan RPM
    stepThermalModel(
      thermalState,
      resolvedConfig.cooling,
      selection.ambientTemp,
      selection.fanCurveAggressiveness,
      dt
    );

    // 5. Update telemetry snapshot in place (no object allocations)
    updateSnapshot(pipeline);

    // 6. Push to telemetry history ring buffer every HISTORY_SAMPLE_INTERVAL (0.5 s)
    if (historyTimer >= HISTORY_SAMPLE_INTERVAL) {
      historyTimer -= HISTORY_SAMPLE_INTERVAL;
      recordHistorySample();
    }
  }

  /**
   * Updates the pre-allocated snapshot dictionary with current temperatures, clocks, and bottleneck status.
   */
  function updateSnapshot(pipeline) {
    const { cpu, gpu, ram, ssd, cooling } = resolvedConfig;
    const { temps, powers } = thermalState;

    snapshot.simTime = simTime;
    snapshot.ambientTemp = selection.ambientTemp;
    snapshot.fanRpm = thermalState.fanRpm;
    snapshot.fanNormalized = thermalState.fanNormalized;
    snapshot.totalPowerW =
      powers.cpu + powers.gpu + powers.vrm + powers.ram + powers.ssd + powers.battery;
    snapshot.estimatedFps = pipeline.estimatedFps;
    snapshot.unitLabel = pipeline.unitLabel;
    snapshot.limitingStage = pipeline.limitingStage;
    snapshot.visualHighlightComponent = pipeline.visualHighlightComponent;
    snapshot.explanation = pipeline.explanation;
    snapshot.upgradeHint = pipeline.upgradeHint;
    snapshot.stageThroughputs.cpu = pipeline.stageThroughputs.cpu;
    snapshot.stageThroughputs.ram = pipeline.stageThroughputs.ram;
    snapshot.stageThroughputs.gpu = pipeline.stageThroughputs.gpu;
    snapshot.stageThroughputs.ssd = pipeline.stageThroughputs.ssd;

    // CPU telemetry
    const cpuClockGHz = computeOperatingClock(
      cpu.baseClockGHz,
      cpu.boostClockGHz,
      pipeline.stageUtilizations.cpu,
      throttleStates.cpu.effectiveClockFactor
    );
    const cpuComp = snapshot.components.cpu;
    cpuComp.temp = temps.cpu;
    cpuComp.throttleTemp = cpu.throttleTemp;
    cpuComp.powerW = powers.cpu;
    cpuComp.clockGHz = cpuClockGHz;
    cpuComp.clockText = `${cpuClockGHz.toFixed(2)} GHz`;
    cpuComp.loadPct = Math.round(pipeline.stageUtilizations.cpu * 100);
    cpuComp.isThrottling = throttleStates.cpu.isThrottling;
    cpuComp.throttlePct = Math.round((1 - throttleStates.cpu.thermalFactor) * 100);
    cpuComp.bottleneckPulse = pipeline.visualHighlightComponent === 'cpu' && resolvedConfig.workload.id !== 'idle' ? 1.0 : 0.0;

    // GPU telemetry
    const gpuClockMHz = computeOperatingClock(
      gpu.baseClockMHz,
      gpu.boostClockMHz,
      pipeline.stageUtilizations.gpu,
      throttleStates.gpu.effectiveClockFactor
    );
    const gpuComp = snapshot.components.gpu;
    gpuComp.temp = temps.gpu;
    gpuComp.throttleTemp = gpu.throttleTemp;
    gpuComp.powerW = powers.gpu;
    gpuComp.clockGHz = gpuClockMHz / 1000;
    gpuComp.clockText = `${Math.round(gpuClockMHz)} MHz`;
    gpuComp.loadPct = Math.round(pipeline.stageUtilizations.gpu * 100);
    gpuComp.isThrottling = throttleStates.gpu.isThrottling;
    gpuComp.throttlePct = Math.round((1 - throttleStates.gpu.thermalFactor) * 100);
    gpuComp.bottleneckPulse = pipeline.visualHighlightComponent === 'gpu' && resolvedConfig.workload.id !== 'idle' ? 1.0 : 0.0;

    // VRM telemetry
    const vrmComp = snapshot.components.vrm;
    vrmComp.temp = temps.vrm;
    vrmComp.throttleTemp = 105;
    vrmComp.powerW = powers.vrm;
    vrmComp.clockText = `${Math.round(89.5 * throttleStates.vrm.thermalFactor)}% Eff`;
    vrmComp.loadPct = Math.min(100, Math.round(((powers.cpu + powers.gpu) / Math.max(45, cooling.maxDissipationW)) * 85));
    vrmComp.isThrottling = throttleStates.vrm.isThrottling;
    vrmComp.throttlePct = Math.round((1 - throttleStates.vrm.thermalFactor) * 100);
    vrmComp.bottleneckPulse = pipeline.visualHighlightComponent === 'vrm' && resolvedConfig.workload.id !== 'idle' ? 1.0 : 0.0;

    // RAM telemetry
    const ramComp = snapshot.components.ram;
    ramComp.temp = temps.ram;
    ramComp.throttleTemp = 85;
    ramComp.powerW = powers.ram;
    ramComp.clockText = `${ram.speedMTs} MT/s (${ram.channels}ch)`;
    ramComp.loadPct = Math.round(pipeline.stageUtilizations.ram * 100);
    ramComp.isThrottling = temps.ram > 85;
    ramComp.throttlePct = 0;
    ramComp.bottleneckPulse = pipeline.visualHighlightComponent === 'ram' && resolvedConfig.workload.id !== 'idle' ? 1.0 : 0.0;

    // SSD telemetry
    const ssdComp = snapshot.components.ssd;
    ssdComp.temp = temps.ssd;
    ssdComp.throttleTemp = ssd.throttleTemp;
    ssdComp.powerW = powers.ssd;
    const effRead = Math.round(ssd.readMBs * throttleStates.ssd.thermalFactor * pipeline.stageUtilizations.ssd);
    ssdComp.clockText = `${effRead} MB/s`;
    ssdComp.loadPct = Math.round(pipeline.stageUtilizations.ssd * 100);
    ssdComp.isThrottling = throttleStates.ssd.isThrottling;
    ssdComp.throttlePct = Math.round((1 - throttleStates.ssd.thermalFactor) * 100);
    ssdComp.bottleneckPulse = pipeline.visualHighlightComponent === 'ssd' && resolvedConfig.workload.id !== 'idle' ? 1.0 : 0.0;

    // Battery telemetry
    const batComp = snapshot.components.battery;
    batComp.temp = temps.battery;
    batComp.throttleTemp = 60;
    batComp.powerW = powers.battery;
    batComp.clockText = `${snapshot.totalPowerW.toFixed(0)}W Sys Draw`;
    batComp.loadPct = Math.min(100, Math.round((snapshot.totalPowerW / 220) * 100));
    batComp.isThrottling = temps.battery > 58;
    batComp.throttlePct = 0;
    batComp.bottleneckPulse = 0.0;
  }

  function recordHistorySample() {
    const timeLabel = `${simTime.toFixed(1)}s`;
    pushRing(history.labels, timeLabel);
    pushRing(history.cpuTemp, Number(thermalState.temps.cpu.toFixed(1)));
    pushRing(history.gpuTemp, Number(thermalState.temps.gpu.toFixed(1)));
    pushRing(history.vrmTemp, Number(thermalState.temps.vrm.toFixed(1)));
    pushRing(history.ssdTemp, Number(thermalState.temps.ssd.toFixed(1)));
    pushRing(history.cpuClockGHz, Number(snapshot.components.cpu.clockGHz.toFixed(2)));
    pushRing(history.gpuClockGHz, Number(snapshot.components.gpu.clockGHz.toFixed(2)));
    pushRing(history.fps, Number(snapshot.estimatedFps.toFixed(1)));
  }

  // Warm up 10 steps (0.16s) and record initial point so charts & UI start populated
  for (let i = 0; i < 10; i++) {
    stepFixed(FIXED_DT);
  }
  recordHistorySample();

  return {
    /**
     * Advances simulation using a fixed-timestep accumulator independent of render FPS.
     * @param {number} frameDeltaSeconds - Elapsed wall-clock time since last frame.
     * @returns {number} Number of fixed physics steps executed this frame.
     */
    update(frameDeltaSeconds) {
      // Clamp frame delta to 0.25s max to avoid spiral of death when browser tab is backgrounded
      const clampedDelta = Math.min(0.25, Math.max(0, frameDeltaSeconds));
      accumulator += clampedDelta;
      let steps = 0;
      while (accumulator >= FIXED_DT && steps < 15) {
        stepFixed(FIXED_DT);
        accumulator -= FIXED_DT;
        steps++;
      }
      return steps;
    },

    /**
     * Directly steps the simulator `count` fixed steps (useful for deterministic unit tests and calibration).
     */
    stepCount(count = 1) {
      for (let i = 0; i < count; i++) {
        stepFixed(FIXED_DT);
      }
      return snapshot;
    },

    /**
     * Updates one or more configuration parameters (CPU, GPU, RAM, SSD, Cooling, Workload, sliders).
     */
    setConfig(partialSelection) {
      if (partialSelection.profileId && partialSelection.profileId !== selection.profileId) {
        const prof = findPresetById(LAPTOP_PROFILES, partialSelection.profileId);
        selection.profileId = prof.id;
        selection.cpuId = prof.cpuId;
        selection.gpuId = prof.gpuId;
        selection.ramId = prof.ramId;
        selection.ssdId = prof.ssdId;
        selection.coolingId = prof.coolingId;
      }
      Object.assign(selection, partialSelection);
      resolvedConfig = resolveConfig(selection);

      // Keep component throttle thresholds synchronized with newly selected CPU/GPU/SSD
      throttleStates.cpu.throttleTemp = resolvedConfig.cpu.throttleTemp;
      throttleStates.gpu.throttleTemp = resolvedConfig.gpu.throttleTemp;
      throttleStates.ssd.throttleTemp = resolvedConfig.ssd.throttleTemp;

      // Immediately refresh pipeline evaluation so UI reflects new hardware without waiting a frame
      const pipeline = evaluatePipelineBottleneck(
        resolvedConfig,
        throttleStates,
        thermalState.temps
      );
      updateSnapshot(pipeline);
    },

    /**
     * Resets component temperatures to near-ambient equilibrium and clears throttling latches.
     */
    resetThermals() {
      for (let i = 0; i < COMPONENT_IDS.length; i++) {
        const id = COMPONENT_IDS[i];
        thermalState.temps[id] = selection.ambientTemp + (id === 'cpu' ? 9 : id === 'gpu' ? 7 : 4);
        thermalState.dTdt[id] = 0;
      }
      Object.assign(throttleStates, createAllThrottleStates(resolvedConfig));
      history.labels.length = 0;
      history.cpuTemp.length = 0;
      history.gpuTemp.length = 0;
      history.vrmTemp.length = 0;
      history.ssdTemp.length = 0;
      history.cpuClockGHz.length = 0;
      history.gpuClockGHz.length = 0;
      history.fps.length = 0;
      simTime = 0;
      historyTimer = 0;
      stepFixed(FIXED_DT);
      recordHistorySample();
    },

    getSelection() {
      return { ...selection };
    },

    getResolvedConfig() {
      return resolvedConfig;
    },

    getSnapshot() {
      return snapshot;
    },
  };
}

function resolveConfig(selection) {
  return {
    cpu: findPresetById(CPU_PRESETS, selection.cpuId),
    gpu: findPresetById(GPU_PRESETS, selection.gpuId),
    ram: findPresetById(RAM_PRESETS, selection.ramId),
    ssd: findPresetById(SSD_PRESETS, selection.ssdId),
    cooling: findPresetById(COOLING_PRESETS, selection.coolingId),
    workload: findPresetById(WORKLOAD_PRESETS, selection.workloadId),
  };
}

function createAllThrottleStates(resolvedConfig) {
  return {
    cpu: createThrottleState(resolvedConfig.cpu.throttleTemp, 3.0),
    gpu: createThrottleState(resolvedConfig.gpu.throttleTemp, 3.0),
    vrm: createThrottleState(105, 4.0),
    ssd: createThrottleState(resolvedConfig.ssd.throttleTemp, 3.0),
  };
}

function pushRing(arr, val) {
  if (arr.length >= HISTORY_MAX_POINTS) {
    arr.shift();
  }
  arr.push(val);
}
