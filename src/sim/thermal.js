/**
 * @fileoverview Lumped-Parameter RC Thermal Network with 2D Neighbor Conduction & Fan Curve Cooling.
 * Pure JS module (no Three.js or DOM imports) so it can be unit-tested independently.
 *
 * Physics Equations & Modeling Assumptions:
 * -----------------------------------------
 * 1. Lumped Capacitance Energy Balance per Component i (CPU, GPU, VRM, RAM, SSD, Battery):
 *      C_i * (dT_i / dt) = P_i - k_cool,i(RPM) * (T_i - T_ambient) + Σ_j G_ij * (T_j - T_i)
 *    Therefore:
 *      dT_i / dt = (P_i - k_cool,i(RPM) * (T_i - T_ambient) + Q_cond,i) / C_i
 *
 *    Where:
 *    - T_i       : Component temperature (°C)
 *    - T_ambient : Ambient room air temperature (°C)
 *    - P_i       : Instantaneous heat dissipation (Watts) = P_idle + (P_max - P_idle) * load * powerFactor
 *    - C_i       : Effective thermal capacitance (J/°C = W·s/°C), combining silicon die, copper heatspreader,
 *                  and local PCB mass. Time constants τ = C / k_cool are calibrated to 8–25 seconds so users
 *                  can observe realistic transient heating and cooling curves in real time.
 *    - k_cool,i  : Effective convective + heatpipe conductance to ambient air (W/°C).
 *    - G_ij      : Symmetric 2D thermal conduction coupling matrix between neighboring components on the
 *                  motherboard and across shared copper heatpipes (W/°C).
 *
 * 2. Forced Convection Scaling with Fan RPM:
 *      k_cool,i(RPM) = k_passive,i + k_forced,i * (RPM / RPM_ref)^0.8
 *    Assumption: Flat-plate / fin-array Nusselt number for turbulent/transitional forced convection scales
 *    approximately with Reynolds number^0.8 (Nu ∝ Re^0.8 ∝ airflow_velocity^0.8 ∝ RPM^0.8).
 *    Components directly attached to the heatpipe assembly (CPU, GPU, VRM) receive full forced-air cooling;
 *    secondary board components (RAM, SSD, Battery) rely primarily on chassis natural convection plus a
 *    smaller chassis-airflow coupling fraction.
 */

export const COMPONENT_IDS = ['cpu', 'gpu', 'vrm', 'ram', 'ssd', 'battery'];

/**
 * Component thermal capacitance C_i (J/°C) and baseline passive/active cooling weights.
 * - `cThermal`: Thermal mass in J/°C.
 * - `kPassive`: Natural convection conductance at 0 RPM (W/°C).
 * - `kForcedWeight`: Fraction of the cooler preset's `k_cool_base` coupled to this component at reference RPM.
 */
export const COMPONENT_THERMAL_PARAMS = {
  cpu: {
    cThermal: 14.5,
    kPassive: 0.22,
    kForcedWeight: 0.88,
  },
  gpu: {
    cThermal: 19.0,
    kPassive: 0.28,
    kForcedWeight: 1.05,
  },
  vrm: {
    cThermal: 10.5,
    kPassive: 0.24,
    kForcedWeight: 0.52,
  },
  ram: {
    cThermal: 8.5,
    kPassive: 0.26,
    kForcedWeight: 0.16,
  },
  ssd: {
    cThermal: 7.0,
    kPassive: 0.25,
    kForcedWeight: 0.14,
  },
  battery: {
    cThermal: 34.0, // High thermal mass lithium-ion pouch cells
    kPassive: 0.55,
    kForcedWeight: 0.08,
  },
};

/**
 * 2D Motherboard + Shared Heatpipe Neighbor Conduction Matrix G_ij (W/°C).
 * Physical layout on the laptop PCB (top view):
 *   [CPU (-1.15, -0.42)] --- [VRM (0.0, -0.58)] --- [GPU (+1.15, -0.42)]  (shared heatpipes)
 *           |                        |                       |
 *   [RAM (-0.75, +0.28)] ------------------------ [SSD (+0.85, +0.28)]
 *           |                                                |
 *   [---------------- Battery (0.0, +1.02) ------------------]
 *
 * Notice that CPU <-> GPU also share direct heatpipe coupling scaled by the cooler's `heatpipeCoupling`.
 */
export const BASE_CONDUCTION_EDGES = [
  { a: 'cpu', b: 'vrm', g: 0.16 }, // Adjacent on north PCB + shared heatpipe saddle
  { a: 'gpu', b: 'vrm', g: 0.18 }, // Adjacent on north PCB + shared power plane
  { a: 'cpu', b: 'gpu', g: 0.12, isHeatpipe: true }, // Direct shared copper heatpipe / vapor chamber
  { a: 'cpu', b: 'ram', g: 0.06 }, // DDR traces & PCB ground plane
  { a: 'vrm', b: 'ram', g: 0.04 },
  { a: 'gpu', b: 'ssd', g: 0.07 }, // NVMe slot sits directly south of GPU die
  { a: 'ram', b: 'ssd', g: 0.04 },
  { a: 'ram', b: 'battery', g: 0.05 }, // Palmrest / battery bay adjacency
  { a: 'ssd', b: 'battery', g: 0.05 },
];

/**
 * Creates a fresh thermal state dictionary initialized at ambient temperature.
 * @param {number} [ambientTemp=25] - Initial ambient temperature (°C).
 */
export function createThermalState(ambientTemp = 25) {
  const temps = {};
  const powers = {};
  const dTdt = {};
  for (let i = 0; i < COMPONENT_IDS.length; i++) {
    const id = COMPONENT_IDS[i];
    temps[id] = ambientTemp;
    powers[id] = 0;
    dTdt[id] = 0;
  }
  return {
    ambientTemp,
    temps,
    powers,
    dTdt,
    fanRpm: 1200,
    fanNormalized: 0.25,
  };
}

/**
 * Computes target fan RPM based on peak silicon temperature (CPU/GPU/VRM), ambient temp,
 * cooler RPM limits, and user fan-curve aggressiveness slider (0.20 to 1.00).
 *
 * Assumption: Laptop EC fan controller interpolates linearly between T_quiet (42 °C)
 * and T_maxFan (86 °C), shifted by the user's fan curve aggressiveness setting.
 *
 * @param {number} peakCoreTemp - Highest temperature among CPU, GPU, and VRM (°C).
 * @param {object} coolingPreset - Selected cooler preset from `COOLING_PRESETS`.
 * @param {number} fanCurveAggressiveness - User slider (0.20 = silent/relaxed, 0.65 = balanced, 1.0 = max boost).
 * @param {number} currentRpm - Previous step fan RPM (for realistic rotor inertia smoothing).
 * @param {number} dt - Timestep in seconds.
 * @returns {{ rpm: number, normalized: number }}
 */
export function computeFanSpeed(peakCoreTemp, coolingPreset, fanCurveAggressiveness, currentRpm, dt) {
  const minRpm = coolingPreset.minRpm || 0;
  const maxRpm = coolingPreset.maxRpm || 0;
  if (maxRpm <= 0) {
    return { rpm: 0, normalized: 0 };
  }

  // Higher aggressiveness lowers the ramp-start temperature and raises the minimum floor
  const aggr = Math.max(0.2, Math.min(1.0, fanCurveAggressiveness));
  const rampStartTemp = 48 - (aggr - 0.5) * 16; // 40 °C at max aggr, 52.8 °C at low aggr
  const rampFullTemp = 88 - (aggr - 0.5) * 18; // 79 °C at max aggr, 93.4 °C at low aggr

  const thermalDemand = Math.max(
    0,
    Math.min(1, (peakCoreTemp - rampStartTemp) / Math.max(5, rampFullTemp - rampStartTemp))
  );

  // Combine thermal demand curve with minimum floor set by aggressiveness slider
  const floorDemand = Math.max(0, (aggr - 0.35) * 0.65);
  const targetNormalized = Math.min(1.0, Math.max(floorDemand, thermalDemand * (0.45 + 0.55 * aggr)));
  const targetRpm = minRpm + (maxRpm - minRpm) * targetNormalized;

  // First-order rotor inertia lag (τ_fan ≈ 0.85 s) so fans spin up/down smoothly
  const alpha = Math.min(1.0, dt / 0.85);
  const smoothedRpm = currentRpm + (targetRpm - currentRpm) * alpha;
  const normalized = Math.max(0, Math.min(1, smoothedRpm / maxRpm));

  return {
    rpm: smoothedRpm,
    normalized,
  };
}

/**
 * Computes instantaneous power dissipation P_i (Watts) for every laptop component.
 *
 * Assumptions:
 * - CPU & GPU power scale between idleW and maxW according to workload utilization * throttle power factor.
 * - VRM (Voltage Regulator Module) power loss is modeled as switching + conduction inefficiency:
 *     P_vrm = P_vrm_idle + (1 - η_vrm) * (P_cpu + P_gpu)
 *   where η_vrm ≈ 89%–91% under heavy current draw.
 * - RAM, SSD, and Battery internal heating (I^2 * R_internal) scale with their respective activity loads.
 *
 * @param {object} config - Active hardware + workload presets.
 * @param {object} workloads - Effective utilization ratios { cpu, gpu, ram, ssd }.
 * @param {object} throttleStates - Dictionary of component throttle states.
 * @param {object} outPowers - Target dictionary mutated in place with Watts per component.
 */
export function computeComponentPowers(config, workloads, throttleStates, outPowers) {
  const { cpu, gpu, ram, ssd, cooling } = config;

  // CPU dynamic + leakage power (Watts)
  const cpuLoad = Math.max(0, Math.min(1, workloads.cpu));
  const cpuPowerFactor = throttleStates.cpu ? throttleStates.cpu.effectivePowerFactor : 1.0;
  outPowers.cpu = cpu.idleW + (cpu.maxW - cpu.idleW) * Math.pow(cpuLoad, 0.92) * cpuPowerFactor;

  // GPU dynamic + VRAM power (Watts)
  const gpuLoad = Math.max(0, Math.min(1, workloads.gpu));
  const gpuPowerFactor = throttleStates.gpu ? throttleStates.gpu.effectivePowerFactor : 1.0;
  outPowers.gpu = gpu.idleW + (gpu.maxW - gpu.idleW) * Math.pow(gpuLoad, 0.92) * gpuPowerFactor;

  // VRM power dissipation: ~10.5% conversion loss on total CPU + GPU rail delivery, scaled by VRM throttle
  const vrmFactor = throttleStates.vrm ? throttleStates.vrm.thermalFactor : 1.0;
  const totalCorePower = outPowers.cpu + outPowers.gpu;
  outPowers.vrm = (1.6 + totalCorePower * 0.105) * (0.65 + 0.35 * vrmFactor);

  // RAM power dissipation (SODIMM / LPDDR5X chips)
  const ramLoad = Math.max(0, Math.min(1, workloads.ram));
  outPowers.ram = 0.9 + (ram.powerW - 0.9) * ramLoad;

  // NVMe SSD controller + NAND flash power dissipation
  const ssdLoad = Math.max(0, Math.min(1, workloads.ssd));
  const ssdFactor = throttleStates.ssd ? throttleStates.ssd.thermalFactor : 1.0;
  outPowers.ssd = 0.8 + (ssd.powerW - 0.8) * ssdLoad * ssdFactor;

  // Battery & power delivery rail Joule heating (I^2 * R_internal during high system draw)
  const totalSystemWatts = outPowers.cpu + outPowers.gpu + outPowers.vrm + outPowers.ram + outPowers.ssd;
  const maxCoolerWatts = cooling ? cooling.maxDissipationW : 120;
  const loadFraction = Math.min(1.4, totalSystemWatts / Math.max(60, maxCoolerWatts));
  outPowers.battery = 0.6 + 3.2 * loadFraction * loadFraction;

  return outPowers;
}

/**
 * Advances the lumped thermal model and 2D neighbor conduction grid by fixed timestep `dt` (seconds).
 *
 * Uses explicit forward Euler integration on the coupled ODE system:
 *   dT_i/dt = (P_i - k_cool,i(RPM) * (T_i - T_amb) + Σ_j G_ij * (T_j - T_i)) / C_i
 *
 * @param {object} thermalState - State created by `createThermalState`.
 * @param {object} coolingPreset - Selected cooler preset from `COOLING_PRESETS`.
 * @param {number} ambientTemp - Ambient room temperature (°C).
 * @param {number} fanCurveAggressiveness - User fan curve slider (0.20 to 1.00).
 * @param {number} dt - Fixed simulation timestep (seconds, e.g. 1/60).
 * @returns {object} Mutated `thermalState`.
 */
export function stepThermalModel(
  thermalState,
  coolingPreset,
  ambientTemp,
  fanCurveAggressiveness,
  dt
) {
  thermalState.ambientTemp = ambientTemp;
  const { temps, powers, dTdt } = thermalState;

  // 1. Update fan speed from peak silicon temperature (CPU, GPU, VRM)
  const peakCoreTemp = Math.max(temps.cpu, temps.gpu, temps.vrm - 4);
  const fanState = computeFanSpeed(
    peakCoreTemp,
    coolingPreset,
    fanCurveAggressiveness,
    thermalState.fanRpm,
    dt
  );
  thermalState.fanRpm = fanState.rpm;
  thermalState.fanNormalized = fanState.normalized;

  // 2. Compute forced-convection scaling factor: (RPM / 4800)^0.8
  // Reference RPM = 4800 RPM where `coolingPreset.k_cool_base` is defined.
  const rpmRatio = fanState.rpm > 0 ? Math.pow(fanState.rpm / 4800, 0.8) : 0;
  const kCoolBase = coolingPreset.k_cool_base;
  const heatpipeCoupling = coolingPreset.heatpipeCoupling || 0.14;

  // 3. Reset net derivative accumulator with internal heat generation minus ambient convective cooling
  for (let i = 0; i < COMPONENT_IDS.length; i++) {
    const id = COMPONENT_IDS[i];
    const params = COMPONENT_THERMAL_PARAMS[id];
    const tComp = temps[id];

    // Formula: k_cool,i(RPM) = k_passive,i + k_forcedWeight,i * k_cool_base * (RPM / RPM_ref)^0.8
    const kCoolEffective = params.kPassive + params.kForcedWeight * kCoolBase * rpmRatio;

    // Convective heat rejection to ambient air: Q_conv = k_cool,i * (T_i - T_ambient)
    const qCooling = kCoolEffective * (tComp - ambientTemp);

    // Store net (P_i - Q_conv) temporarily in dTdt[id] before adding neighbor conduction
    dTdt[id] = powers[id] - qCooling;
  }

  // 4. Add 2D neighbor heat conduction across PCB traces and shared copper heatpipes:
  //    Q_cond,ij = G_ij * (T_j - T_i)
  //    Symmetric conservation: heat leaving j enters i, so Σ_i Q_cond,i = 0.
  for (let e = 0; e < BASE_CONDUCTION_EDGES.length; e++) {
    const edge = BASE_CONDUCTION_EDGES[e];
    const g = edge.isHeatpipe ? heatpipeCoupling : edge.g;
    const heatFlowAtoB = g * (temps[edge.a] - temps[edge.b]);
    dTdt[edge.a] -= heatFlowAtoB;
    dTdt[edge.b] += heatFlowAtoB;
  }

  // 5. Divide by component thermal capacitance C_i and integrate T_i(t + dt) = T_i(t) + (dT_i/dt) * dt
  for (let i = 0; i < COMPONENT_IDS.length; i++) {
    const id = COMPONENT_IDS[i];
    const cThermal = COMPONENT_THERMAL_PARAMS[id].cThermal;
    const rate = dTdt[id] / cThermal;
    dTdt[id] = rate;
    // Clamp within physically realistic bounds [ambient - 2, 125 °C]
    temps[id] = Math.max(ambientTemp - 2, Math.min(125, temps[id] + rate * dt));
  }

  return thermalState;
}
