/**
 * @fileoverview 4-Stage Pipeline Bottleneck & System Throughput Engine (`CPU -> RAM -> GPU -> Storage`).
 * Pure JS module (no Three.js or DOM imports) for deterministic simulation and unit testing.
 *
 * Pipeline Model & Engineering Assumptions:
 * -----------------------------------------
 * A laptop executing a real-time or batch workload forms a 4-stage serial/coupled pipeline:
 *   Stage 1 (CPU) -> Stage 2 (RAM) -> Stage 3 (GPU) -> Stage 4 (Storage)
 *
 * 1. Stage Throughput Normalization:
 *    Each stage i has a raw hardware score `S_i` (calibrated around ~100 for midrange hardware)
 *    adjusted by its active clock/thermal throttle factor `f_throttle,i` and divided by the
 *    workload's stage demand weight `w_i`:
 *      T_stage,i = (S_i * f_throttle,i * penalty_i) / w_i
 *
 * 2. Memory Channel & Capacity Spill Penalties:
 *    - Single-channel DDR5 halves memory bus concurrency, imposing a 22%–32% effective bandwidth
 *      penalty on RAM-sensitive workloads (gaming frame pacing and CPU compilation).
 *    - If `workload.requiredRamGB > ram.capacityGB`, the OS pages to NVMe swap, penalizing both
 *      RAM effective throughput (-38%) and Storage throughput (-30%).
 *    - If GPU VRAM (`gpu.vramGB`) is exceeded by high-VRAM gaming/rendering workloads, PCIe texture
 *      spillover penalizes GPU stage throughput (-22%).
 *
 * 3. System Throughput (Amdahl / Pipeline Minimum Law):
 *      T_system = min(T_stage,CPU, T_stage,RAM, T_stage,GPU, T_stage,Storage)
 *      Estimated FPS (or Task Rate) = workload.baseFpsScale * (T_system / 100)
 *
 * 4. Bottleneck & Concrete Upgrade Recommendation:
 *    The stage with the lowest `T_stage,i` is returned as `limitingStage` (`cpu`, `ram`, `gpu`, or `ssd`),
 *    along with a one-line root-cause explanation and a concrete single-component upgrade suggestion.
 */

import {
  CPU_PRESETS,
  GPU_PRESETS,
  RAM_PRESETS,
  SSD_PRESETS,
  COOLING_PRESETS,
} from './presets.js';

/**
 * Evaluates the 4-stage pipeline (`CPU -> RAM -> GPU -> Storage`) for the current configuration
 * and thermal throttling state.
 *
 * @param {object} config - Active preset objects `{ cpu, gpu, ram, ssd, cooling, workload }`.
 * @param {object} throttleStates - Current throttle states `{ cpu, gpu, vrm, ssd }`.
 * @param {object} temps - Current component temperatures `{ cpu, gpu, vrm, ram, ssd, battery }`.
 * @returns {{
 *   stageThroughputs: { cpu: number, ram: number, gpu: number, ssd: number },
 *   stageUtilizations: { cpu: number, ram: number, gpu: number, ssd: number },
 *   limitingStage: 'cpu' | 'ram' | 'gpu' | 'ssd',
 *   visualHighlightComponent: 'cpu' | 'ram' | 'gpu' | 'ssd' | 'vrm',
 *   systemThroughputScore: number,
 *   estimatedFps: number,
 *   unitLabel: string,
 *   explanation: string,
 *   upgradeHint: {
 *     category: 'cpu' | 'gpu' | 'ram' | 'ssd' | 'cooling',
 *     targetPresetId: string,
 *     title: string,
 *     detail: string,
 *     estimatedGainPct: number
 *   }
 * }}
 */
export function evaluatePipelineBottleneck(config, throttleStates, temps) {
  const { cpu, gpu, ram, ssd, cooling, workload } = config;
  const weights = workload.stageWeights;

  // Effective clock/thermal multipliers from throttle.js
  const cpuClockFactor = throttleStates.cpu ? throttleStates.cpu.effectiveClockFactor : 1.0;
  const gpuClockFactor = throttleStates.gpu ? throttleStates.gpu.effectiveClockFactor : 1.0;
  const vrmThermalFactor = throttleStates.vrm ? throttleStates.vrm.thermalFactor : 1.0;
  const ssdThermalFactor = throttleStates.ssd ? throttleStates.ssd.thermalFactor : 1.0;

  // VRM thermal throttling caps both CPU and GPU power delivery if VRM overheats
  const vrmDeliveryCap = vrmThermalFactor < 0.95 ? 0.75 + 0.25 * vrmThermalFactor : 1.0;

  // 1. Stage 1: CPU Throughput
  const cpuRawCapacity = cpu.computeScore * cpuClockFactor * vrmDeliveryCap;
  const cpuStageThroughput = cpuRawCapacity / Math.max(0.15, weights.cpu);

  // 2. Stage 2: RAM Throughput (Bandwidth + Channel Concurrency + Capacity Spill Check)
  const ramDeficitRatio =
    ram.capacityGB < workload.requiredRamGB
      ? (workload.requiredRamGB - ram.capacityGB) / workload.requiredRamGB
      : 0;
  const ramSpillPenalty = ramDeficitRatio > 0 ? Math.max(0.48, 1.0 - ramDeficitRatio * 0.72) : 1.0;
  const singleChannelPenalty = ram.channels === 1 ? 0.74 : 1.0;
  // Normalize RAM bandwidth around 75 GB/s baseline (= score 100)
  const ramRawCapacity = (ram.bandwidthGBs / 0.75) * singleChannelPenalty * ramSpillPenalty;
  const ramStageThroughput = ramRawCapacity / Math.max(0.15, weights.ram);

  // 3. Stage 3: GPU Throughput (Compute/Raster + VRAM Spill + RAM Feed Factor)
  // If single-channel RAM is feeding an integrated or high-end GPU in gaming, GPU is partially starved
  const vramDeficitPenalty =
    workload.id === 'gaming' && gpu.vramGB < 8
      ? 0.82
      : workload.id === 'rendering' && gpu.vramGB < 8
        ? 0.85
        : 1.0;
  const gpuRawCapacity = gpu.computeScore * gpuClockFactor * vrmDeliveryCap * vramDeficitPenalty;
  const gpuStageThroughput = gpuRawCapacity / Math.max(0.15, weights.gpu);

  // 4. Stage 4: Storage (NVMe SSD) Throughput
  // Normalize sequential/random composite score around 4500 MB/s (= score 100)
  const swapCongestionPenalty = ramDeficitRatio > 0 ? 0.68 : 1.0;
  const ssdRawCapacity = (ssd.readMBs / 45.0) * ssdThermalFactor * swapCongestionPenalty;
  const ssdStageThroughput = ssdRawCapacity / Math.max(0.15, weights.ssd);

  const stageThroughputs = {
    cpu: cpuStageThroughput,
    ram: ramStageThroughput,
    gpu: gpuStageThroughput,
    ssd: ssdStageThroughput,
  };

  // System throughput = minimum of the 4 pipeline stages
  const stages = ['cpu', 'ram', 'gpu', 'ssd'];
  let limitingStage = 'gpu';
  let minThroughput = Infinity;

  for (let i = 0; i < stages.length; i++) {
    const stageId = stages[i];
    if (stageThroughputs[stageId] < minThroughput) {
      minThroughput = stageThroughputs[stageId];
      limitingStage = stageId;
    }
  }

  // Compute actual component utilizations:
  // The limiting stage runs near workload peak demand, while faster upstream/downstream stages scale
  // proportionally to (minThroughput / stageThroughput) plus background overhead.
  const baseLoad = workload.baseUtilization;
  const stageUtilizations = {
    cpu: Math.min(
      1.0,
      baseLoad.cpu * (0.35 + 0.65 * Math.min(1.0, minThroughput / Math.max(1, cpuStageThroughput)))
    ),
    ram: Math.min(
      1.0,
      baseLoad.ram * (0.4 + 0.6 * Math.min(1.0, minThroughput / Math.max(1, ramStageThroughput)))
    ),
    gpu: Math.min(
      1.0,
      baseLoad.gpu * (0.3 + 0.7 * Math.min(1.0, minThroughput / Math.max(1, gpuStageThroughput)))
    ),
    ssd: Math.min(
      1.0,
      baseLoad.ssd * (0.35 + 0.65 * Math.min(1.0, minThroughput / Math.max(1, ssdStageThroughput))) +
        (ramDeficitRatio > 0 ? 0.35 : 0)
    ),
  };

  // Force the active bottleneck stage to reflect high saturation during non-idle workloads
  if (workload.id !== 'idle') {
    stageUtilizations[limitingStage] = Math.max(
      stageUtilizations[limitingStage],
      Math.min(0.99, baseLoad[limitingStage] * 1.08)
    );
  }

  // Estimated FPS / task rate scaled from the workload's reference baseline
  const systemThroughputScore = minThroughput;
  const estimatedFps = Math.max(1, workload.baseFpsScale * (systemThroughputScore / 115));

  // Determine if thermal throttling on CPU/GPU/VRM is the true underlying cause of the bottleneck
  const cpuThrottled = throttleStates.cpu && throttleStates.cpu.thermalFactor < 0.91;
  const gpuThrottled = throttleStates.gpu && throttleStates.gpu.thermalFactor < 0.91;
  const vrmThrottled = throttleStates.vrm && throttleStates.vrm.thermalFactor < 0.92;

  let visualHighlightComponent = limitingStage;
  if (vrmThrottled && (limitingStage === 'cpu' || limitingStage === 'gpu')) {
    visualHighlightComponent = 'vrm';
  }

  // Build concise 1-line explanation & concrete single upgrade suggestion
  const { explanation, upgradeHint } = buildExplanationAndUpgradeHint({
    config,
    limitingStage,
    stageThroughputs,
    cpuThrottled,
    gpuThrottled,
    vrmThrottled,
    ramDeficitRatio,
    temps,
  });

  return {
    stageThroughputs,
    stageUtilizations,
    limitingStage,
    visualHighlightComponent,
    systemThroughputScore,
    estimatedFps,
    unitLabel: workload.unit || 'FPS',
    explanation,
    upgradeHint,
  };
}

/**
 * Generates the required one-line bottleneck explanation (e.g., "GPU limited by RAM bandwidth")
 * and a concrete one-click hardware upgrade recommendation.
 */
function buildExplanationAndUpgradeHint({
  config,
  limitingStage,
  stageThroughputs,
  cpuThrottled,
  gpuThrottled,
  vrmThrottled,
  ramDeficitRatio,
  temps,
}) {
  const { cpu, gpu, ram, ssd, cooling, workload } = config;

  // Idle workload special case
  if (workload.id === 'idle') {
    return {
      explanation: 'System at desktop idle — all pipeline stages operating with >85% thermal headroom.',
      upgradeHint: {
        category: 'cooling',
        targetPresetId: cooling.id,
        title: 'Switch workload to Gaming, Rendering, or Compiling to stress the pipeline',
        detail: 'At idle (~12–20W total package power), no hardware stage is saturated.',
        estimatedGainPct: 0,
      },
    };
  }

  // Case A: Thermal throttling is actively causing the limiting stage to drop throughput
  if ((limitingStage === 'cpu' && cpuThrottled) || (limitingStage === 'gpu' && gpuThrottled) || vrmThrottled) {
    const nextCooler = findNextUpgrade(COOLING_PRESETS, cooling.id);
    const hotPart = vrmThrottled ? 'VRM power stage' : limitingStage.toUpperCase();
    const hotTemp = Math.round(temps[vrmThrottled ? 'vrm' : limitingStage]);
    const coolerGain = nextCooler ? Math.round((1 - (cooling.k_cool_base / nextCooler.k_cool_base)) * 28 + 12) : 14;

    return {
      explanation: `${limitingStage.toUpperCase()} throttled by ${hotPart} overheating (${hotTemp}°C on ${cooling.shortName}).`,
      upgradeHint: nextCooler
        ? {
            category: 'cooling',
            targetPresetId: nextCooler.id,
            title: `Upgrade cooling to ${nextCooler.name}`,
            detail: `Increases convective heat rejection from ${cooling.maxDissipationW}W to ${nextCooler.maxDissipationW}W, eliminating thermal clock drop.`,
            estimatedGainPct: coolerGain,
          }
        : {
            category: 'cooling',
            targetPresetId: cooling.id,
            title: 'Increase Fan Curve Aggressiveness to 90%+ or lower Ambient Temp',
            detail: 'Top-tier Vapor Chamber is installed; raising fan RPM increases forced convection.',
            estimatedGainPct: 11,
          },
    };
  }

  // Case B: RAM is the limiting stage (either single-channel bandwidth or capacity spill to swap)
  if (limitingStage === 'ram') {
    const nextRam = findNextUpgrade(RAM_PRESETS, ram.id) || RAM_PRESETS[RAM_PRESETS.length - 1];
    const secondSlowest = Math.min(stageThroughputs.cpu, stageThroughputs.gpu, stageThroughputs.ssd);
    const potentialGain = Math.min(48, Math.max(12, Math.round(((secondSlowest - stageThroughputs.ram) / stageThroughputs.ram) * 100)));

    if (ramDeficitRatio > 0 && ram.channels === 1) {
      return {
        explanation: `${workload.WeightsLabel || 'GPU/CPU'} limited by single-channel RAM bandwidth (${ram.bandwidthGBs} GB/s) & ${ram.capacityGB}GB swap spill.`,
        upgradeHint: {
          category: 'ram',
          targetPresetId: nextRam.id,
          title: `Upgrade RAM to ${nextRam.name}`,
          detail: `Doubles memory bus channels to dual-channel (${nextRam.bandwidthGBs} GB/s) and prevents NVMe swap thrashing.`,
          estimatedGainPct: potentialGain,
        },
      };
    }

    return {
      explanation: `GPU & CPU limited by RAM bandwidth (${ram.shortName} @ ${ram.bandwidthGBs} GB/s).`,
      upgradeHint: {
        category: 'ram',
        targetPresetId: nextRam.id,
        title: `Upgrade RAM to ${nextRam.name}`,
        detail: `Raises effective memory throughput from ${ram.bandwidthGBs} GB/s to ${nextRam.bandwidthGBs} GB/s for faster frame & asset feeding.`,
        estimatedGainPct: potentialGain,
      },
    };
  }

  // Case C: GPU is the limiting stage
  if (limitingStage === 'gpu') {
    const nextGpu = findNextUpgrade(GPU_PRESETS, gpu.id);
    const nextRam = findNextUpgrade(RAM_PRESETS, ram.id);

    // If user is on integrated GPU or entry GPU with single-channel RAM
    if (ram.channels === 1 && nextRam) {
      return {
        explanation: `GPU limited by ${gpu.shortName} shader throughput and single-channel memory feed.`,
        upgradeHint: nextGpu
          ? {
              category: 'gpu',
              targetPresetId: nextGpu.id,
              title: `Upgrade GPU to ${nextGpu.name}`,
              detail: `Increases graphics compute score from ${gpu.computeScore} to ${nextGpu.computeScore} with dedicated GDDR6 VRAM.`,
              estimatedGainPct: Math.min(85, Math.round(((nextGpu.computeScore - gpu.computeScore) / gpu.computeScore) * 75)),
            }
          : {
              category: 'ram',
              targetPresetId: nextRam.id,
              title: `Upgrade RAM to ${nextRam.name}`,
              detail: 'Unlocks dual-channel memory bandwidth for faster frame buffer transfers.',
              estimatedGainPct: 18,
            },
      };
    }

    if (nextGpu) {
      const gain = Math.min(75, Math.max(14, Math.round(((nextGpu.computeScore - gpu.computeScore) / gpu.computeScore) * 65)));
      return {
        explanation: `Pipeline GPU-bound: ${gpu.shortName} (${gpu.vramGB}GB VRAM) saturated at 99% raster/compute load.`,
        upgradeHint: {
          category: 'gpu',
          targetPresetId: nextGpu.id,
          title: `Upgrade GPU to ${nextGpu.name}`,
          detail: `Boosts shader throughput by +${gain}% and expands thermal/VRAM headroom for ${workload.name}.`,
          estimatedGainPct: gain,
        },
      };
    }

    // Already on top GPU (RTX 4090) -> suggest cooling or RAM to unlock extra boost headroom
    const nextCooler = findNextUpgrade(COOLING_PRESETS, cooling.id);
    return {
      explanation: `Pipeline GPU-bound: flagship ${gpu.shortName} running at peak TGP limit.`,
      upgradeHint: nextCooler
        ? {
            category: 'cooling',
            targetPresetId: nextCooler.id,
            title: `Upgrade cooling to ${nextCooler.name}`,
            detail: 'Keeps GPU core 6–9°C cooler to sustain higher Dynamic Boost clocks.',
            estimatedGainPct: 9,
          }
        : {
            category: 'gpu',
            targetPresetId: gpu.id,
            title: 'Raise Power Limit slider to 115% for maximum GPU Dynamic Boost',
            detail: 'Flagship GPU and Vapor Chamber cooler are already selected.',
            estimatedGainPct: 7,
          },
    };
  }

  // Case D: CPU is the limiting stage
  if (limitingStage === 'cpu') {
    const nextCpu = findNextUpgrade(CPU_PRESETS, cpu.id);
    if (nextCpu) {
      const gain = Math.min(55, Math.max(12, Math.round(((nextCpu.computeScore - cpu.computeScore) / cpu.computeScore) * 70)));
      return {
        explanation: `GPU & pipeline waiting on CPU dispatch (${cpu.shortName}, ${cpu.cores}C/${cpu.threads}T saturated).`,
        upgradeHint: {
          category: 'cpu',
          targetPresetId: nextCpu.id,
          title: `Upgrade CPU to ${nextCpu.name}`,
          detail: `Expands multi-core throughput from ${cpu.cores}C/${cpu.threads}T to ${nextCpu.cores}C/${nextCpu.threads}T (+${gain}% stage capacity).`,
          estimatedGainPct: gain,
        },
      };
    }

    const nextCooler = findNextUpgrade(COOLING_PRESETS, cooling.id);
    return {
      explanation: `Pipeline CPU-bound: ${cpu.shortName} all-core boost saturated by ${workload.name}.`,
      upgradeHint: nextCooler
        ? {
            category: 'cooling',
            targetPresetId: nextCooler.id,
            title: `Upgrade cooling to ${nextCooler.name}`,
            detail: 'Improves heat dissipation so all 24 cores hold peak 5.8 GHz boost longer.',
            estimatedGainPct: 10,
          }
        : {
            category: 'ram',
            targetPresetId: RAM_PRESETS[RAM_PRESETS.length - 1].id,
            title: `Pair with ${RAM_PRESETS[RAM_PRESETS.length - 1].name}`,
            detail: 'Maximizes memory bandwidth feeding the 24-core processor.',
            estimatedGainPct: 8,
          },
    };
  }

  // Case E: Storage (SSD) is the limiting stage
  const nextSsd = findNextUpgrade(SSD_PRESETS, ssd.id) || SSD_PRESETS[SSD_PRESETS.length - 1];
  const ssdGain = Math.min(60, Math.max(15, Math.round(((nextSsd.readMBs - ssd.readMBs) / Math.max(1, ssd.readMBs)) * 55)));
  return {
    explanation: `Pipeline I/O-bound: ${ssd.shortName} (${ssd.readMBs} MB/s) saturated by ${workload.name} asset streaming.`,
    upgradeHint: {
      category: 'ssd',
      targetPresetId: nextSsd.id,
      title: `Upgrade Storage to ${nextSsd.name}`,
      detail: `Increases sequential NVMe throughput from ${ssd.readMBs} MB/s to ${nextSsd.readMBs} MB/s.`,
      estimatedGainPct: ssdGain,
    },
  };
}

/**
 * Helper to find the next higher tier preset in a preset array.
 */
function findNextUpgrade(presetList, currentId) {
  const idx = presetList.findIndex((item) => item.id === currentId);
  if (idx >= 0 && idx < presetList.length - 1) {
    return presetList[idx + 1];
  }
  return null;
}
