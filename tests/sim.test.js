import { describe, it, expect } from 'vitest';
import {
  createThrottleState,
  stepThrottleState,
  computeOperatingClock,
} from '../src/sim/throttle.js';
import {
  createThermalState,
  computeComponentPowers,
  stepThermalModel,
  computeFanSpeed,
} from '../src/sim/thermal.js';
import { evaluatePipelineBottleneck } from '../src/sim/bottleneck.js';
import { createSimulator, FIXED_DT } from '../src/sim/simulator.js';
import {
  CPU_PRESETS,
  GPU_PRESETS,
  RAM_PRESETS,
  SSD_PRESETS,
  COOLING_PRESETS,
  WORKLOAD_PRESETS,
  findPresetById,
} from '../src/sim/presets.js';

describe('Thermal Throttling & Hysteresis (throttle.js)', () => {
  it('reduces thermalFactor when T > throttleTemp and holds latch inside hysteresis band', () => {
    const state = createThrottleState(95, 3.0);
    expect(state.thermalFactor).toBe(1.0);
    expect(state.isThrottling).toBe(false);

    // Step for 2 seconds at 98°C (3°C above 95°C threshold)
    for (let i = 0; i < 120; i++) {
      stepThrottleState(state, 98, 1.0, FIXED_DT);
    }
    expect(state.isThrottling).toBe(true);
    expect(state.thermalFactor).toBeLessThan(0.85);
    const factorAt98 = state.thermalFactor;

    // Cool slightly to 93.5°C (still inside the 3°C hysteresis band [92°C, 95°C])
    for (let i = 0; i < 60; i++) {
      stepThrottleState(state, 93.5, 1.0, FIXED_DT);
    }
    // Should remain latched and NOT recover yet
    expect(state.isThrottling).toBe(true);
    expect(state.thermalFactor).toBeLessThanOrEqual(factorAt98);

    // Cool below hysteresis floor (91.0°C <= 95 - 3)
    for (let i = 0; i < 120; i++) {
      stepThrottleState(state, 91.0, 1.0, FIXED_DT);
    }
    expect(state.isThrottling).toBe(false);
    expect(state.thermalFactor).toBeGreaterThan(factorAt98);
  });

  it('scales operating clock with load and throttle multiplier', () => {
    const unthrottled = computeOperatingClock(3.2, 5.0, 0.9, 1.0);
    const throttled = computeOperatingClock(3.2, 5.0, 0.9, 0.7);
    expect(unthrottled).toBeCloseTo(5.0, 2);
    expect(throttled).toBeLessThan(unthrottled);
  });
});

describe('Lumped RC Thermal Network & Conduction (thermal.js)', () => {
  it('heats components under load and conducts heat to neighbors', () => {
    const thermal = createThermalState(25);
    const config = {
      cpu: findPresetById(CPU_PRESETS, 'i9_14900hx'),
      gpu: findPresetById(GPU_PRESETS, 'rtx_4080'),
      ram: findPresetById(RAM_PRESETS, 'lpddr5x_32gb_6400'),
      ssd: findPresetById(SSD_PRESETS, 'pcie4_2tb_heatsink'),
      cooling: findPresetById(COOLING_PRESETS, 'vapor_chamber_lm'),
    };
    const throttleStates = {
      cpu: createThrottleState(99),
      gpu: createThrottleState(87),
      vrm: createThrottleState(105),
      ssd: createThrottleState(84),
    };

    computeComponentPowers(
      config,
      { cpu: 0.95, gpu: 0.95, ram: 0.8, ssd: 0.5 },
      throttleStates,
      thermal.powers
    );

    expect(thermal.powers.cpu).toBeGreaterThan(80);
    expect(thermal.powers.gpu).toBeGreaterThan(140);

    // Step 10 seconds of simulation
    for (let i = 0; i < 600; i++) {
      stepThermalModel(thermal, config.cooling, 25, 0.8, FIXED_DT);
    }

    expect(thermal.temps.cpu).toBeGreaterThan(55);
    expect(thermal.temps.gpu).toBeGreaterThan(55);
    expect(thermal.temps.vrm).toBeGreaterThan(35);
    expect(thermal.fanRpm).toBeGreaterThan(3000);
  });

  it('scales fan RPM with core temperature and fan curve aggressiveness', () => {
    const cooler = findPresetById(COOLING_PRESETS, 'tri_fan_3pipe');
    const lowFan = computeFanSpeed(75, cooler, 0.3, 2000, 1.0);
    const highFan = computeFanSpeed(75, cooler, 1.0, 2000, 1.0);
    expect(highFan.rpm).toBeGreaterThan(lowFan.rpm);
  });
});

describe('4-Stage Pipeline Bottleneck Engine (bottleneck.js)', () => {
  it('identifies single-channel 8GB RAM as the bottleneck during AAA gaming with RTX 4070', () => {
    const config = {
      cpu: findPresetById(CPU_PRESETS, 'r9_8945hs'),
      gpu: findPresetById(GPU_PRESETS, 'rtx_4070'),
      ram: findPresetById(RAM_PRESETS, 'ddr5_8gb_single'),
      ssd: findPresetById(SSD_PRESETS, 'pcie4_1tb'),
      cooling: findPresetById(COOLING_PRESETS, 'tri_fan_3pipe'),
      workload: findPresetById(WORKLOAD_PRESETS, 'gaming'),
    };
    const throttleStates = {
      cpu: createThrottleState(95),
      gpu: createThrottleState(87),
      vrm: createThrottleState(105),
      ssd: createThrottleState(80),
    };
    const temps = { cpu: 72, gpu: 70, vrm: 68, ram: 52, ssd: 48, battery: 34 };

    const result = evaluatePipelineBottleneck(config, throttleStates, temps);
    expect(result.limitingStage).toBe('ram');
    expect(result.explanation.toLowerCase()).toContain('ram');
    expect(result.upgradeHint.category).toBe('ram');
  });

  it('identifies GPU as the limiting stage in balanced 1440p AAA gaming on G14 (RTX 4060 + 32GB LPDDR5X)', () => {
    const sim = createSimulator('zephyrus_g14_2024');
    sim.setConfig({ workloadId: 'gaming' });
    const snap = sim.stepCount(300); // 5 seconds
    expect(snap.limitingStage).toBe('gpu');
    expect(snap.estimatedFps).toBeGreaterThan(45);
    expect(snap.estimatedFps).toBeLessThan(110);
  });
});
