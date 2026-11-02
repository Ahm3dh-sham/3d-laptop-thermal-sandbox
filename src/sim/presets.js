/**
 * @fileoverview Hardware Component Presets, Cooling Systems, Workloads, and Calibrated Laptop Reference Profiles.
 * Pure JS data objects — no Three.js or DOM imports.
 */

export const CPU_PRESETS = [
  {
    id: 'r7_7735hs',
    name: 'AMD Ryzen 7 7735HS (8C / 16T)',
    shortName: 'Ryzen 7 7735HS',
    cores: 8,
    threads: 16,
    baseClockGHz: 3.2,
    boostClockGHz: 4.75,
    tdpW: 35,
    maxW: 54,
    idleW: 5.5,
    throttleTemp: 95,
    computeScore: 100,
  },
  {
    id: 'r9_8945hs',
    name: 'AMD Ryzen 9 8945HS (8C / 16T)',
    shortName: 'Ryzen 9 8945HS',
    cores: 8,
    threads: 16,
    baseClockGHz: 4.0,
    boostClockGHz: 5.2,
    tdpW: 45,
    maxW: 65,
    idleW: 6.0,
    throttleTemp: 95,
    computeScore: 128,
  },
  {
    id: 'i7_14650hx',
    name: 'Intel Core i7-14650HX (16C / 24T)',
    shortName: 'Core i7-14650HX',
    cores: 16,
    threads: 24,
    baseClockGHz: 2.2,
    boostClockGHz: 5.2,
    tdpW: 55,
    maxW: 95,
    idleW: 8.0,
    throttleTemp: 97,
    computeScore: 146,
  },
  {
    id: 'i9_14900hx',
    name: 'Intel Core i9-14900HX (24C / 32T)',
    shortName: 'Core i9-14900HX',
    cores: 24,
    threads: 32,
    baseClockGHz: 2.2,
    boostClockGHz: 5.6,
    tdpW: 55,
    maxW: 115,
    idleW: 9.5,
    throttleTemp: 99,
    computeScore: 178,
  },
];

export const GPU_PRESETS = [
  {
    id: 'rtx_4050',
    name: 'NVIDIA RTX 4050 Laptop (6GB, 75W)',
    shortName: 'RTX 4050 6GB',
    vramGB: 6,
    baseClockMHz: 1605,
    boostClockMHz: 2370,
    tdpW: 75,
    maxW: 75,
    idleW: 6.0,
    throttleTemp: 87,
    computeScore: 92,
  },
  {
    id: 'rtx_4060',
    name: 'NVIDIA RTX 4060 Laptop (8GB, 90W)',
    shortName: 'RTX 4060 8GB',
    vramGB: 8,
    baseClockMHz: 1545,
    boostClockMHz: 2420,
    tdpW: 90,
    maxW: 90,
    idleW: 7.0,
    throttleTemp: 87,
    computeScore: 124,
  },
  {
    id: 'rtx_4070',
    name: 'NVIDIA RTX 4070 Laptop (8GB, 105W)',
    shortName: 'RTX 4070 8GB',
    vramGB: 8,
    baseClockMHz: 1695,
    boostClockMHz: 2475,
    tdpW: 105,
    maxW: 105,
    idleW: 8.0,
    throttleTemp: 87,
    computeScore: 148,
  },
  {
    id: 'rtx_4080',
    name: 'NVIDIA RTX 4080 Laptop (12GB, 175W)',
    shortName: 'RTX 4080 12GB',
    vramGB: 12,
    baseClockMHz: 1860,
    boostClockMHz: 2490,
    tdpW: 175,
    maxW: 175,
    idleW: 10.5,
    throttleTemp: 87,
    computeScore: 215,
  },
];

export const RAM_PRESETS = [
  {
    id: 'ddr5_8gb_single',
    name: '8GB DDR5-4800 (Single Channel)',
    shortName: '8GB DDR5-4800 (1ch)',
    capacityGB: 8,
    speedMTs: 4800,
    channels: 1,
    bandwidthGBs: 38.4,
    powerW: 3.2,
  },
  {
    id: 'ddr5_16gb_dual',
    name: '16GB DDR5-5600 (Dual Channel)',
    shortName: '16GB DDR5-5600 (2ch)',
    capacityGB: 16,
    speedMTs: 5600,
    channels: 2,
    bandwidthGBs: 89.6,
    powerW: 4.8,
  },
  {
    id: 'lpddr5x_32gb_6400',
    name: '32GB LPDDR5X-6400 (Dual Channel)',
    shortName: '32GB LPDDR5X-6400',
    capacityGB: 32,
    speedMTs: 6400,
    channels: 2,
    bandwidthGBs: 102.4,
    powerW: 4.4,
  },
  {
    id: 'ddr5_64gb_5600',
    name: '64GB DDR5-5600 (Dual Rank 2ch)',
    shortName: '64GB DDR5-5600 (2ch)',
    capacityGB: 64,
    speedMTs: 5600,
    channels: 2,
    bandwidthGBs: 112.0,
    powerW: 6.2,
  },
];

export const SSD_PRESETS = [
  {
    id: 'pcie3_512gb',
    name: '512GB PCIe 3.0 NVMe (3,400 MB/s)',
    shortName: '512GB PCIe 3.0',
    readMBs: 3400,
    powerW: 4.8,
    throttleTemp: 76,
  },
  {
    id: 'pcie4_1tb',
    name: '1TB PCIe 4.0 NVMe (7,000 MB/s)',
    shortName: '1TB PCIe 4.0',
    readMBs: 7000,
    powerW: 6.5,
    throttleTemp: 80,
  },
  {
    id: 'pcie4_2tb_heatsink',
    name: '2TB PCIe 4.0 Pro + Copper Spreader (7,450 MB/s)',
    shortName: '2TB PCIe 4.0 Pro',
    readMBs: 7450,
    powerW: 7.2,
    throttleTemp: 84,
  },
];

export const COOLING_PRESETS = [
  {
    id: 'slim_2pipe',
    name: 'Slim 2-Heatpipe Dual Fan (Ultrabook)',
    shortName: 'Slim 2-Heatpipe',
    k_cool_base: 0.92, // Forced convective conductance W/°C at reference RPM
    maxDissipationW: 95,
    minRpm: 1600,
    maxRpm: 4800,
    heatpipeCoupling: 0.14,
  },
  {
    id: 'tri_fan_3pipe',
    name: 'Tri-Fan 3-Heatpipe + Liquid Metal (G14 Class)',
    shortName: 'Tri-Fan 3-Pipe LM',
    k_cool_base: 1.52,
    maxDissipationW: 145,
    minRpm: 1800,
    maxRpm: 5600,
    heatpipeCoupling: 0.22,
  },
  {
    id: 'vapor_chamber_lm',
    name: 'Full Vapor Chamber + Liquid Metal (Legion Pro Class)',
    shortName: 'Vapor Chamber + LM',
    k_cool_base: 2.45,
    maxDissipationW: 235,
    minRpm: 1800,
    maxRpm: 6200,
    heatpipeCoupling: 0.32,
  },
];

export const WORKLOAD_PRESETS = [
  {
    id: 'idle',
    name: 'Desktop Idle & Web Browsing',
    description: 'Low background OS activity (~12–20W system package power).',
    unit: 'FPS',
    baseFpsScale: 144,
    requiredRamGB: 4,
    baseUtilization: { cpu: 0.08, ram: 0.15, gpu: 0.06, ssd: 0.04 },
    stageWeights: { cpu: 0.4, ram: 0.3, gpu: 0.3, ssd: 0.2 },
  },
  {
    id: 'gaming',
    name: 'AAA Gaming (Cyberpunk 2077 1440p Ultra)',
    description: 'Heavy GPU raster/raytracing + high memory bandwidth & CPU frame dispatch.',
    unit: 'FPS',
    baseFpsScale: 78,
    requiredRamGB: 16,
    baseUtilization: { cpu: 0.65, ram: 0.72, gpu: 0.96, ssd: 0.25 },
    stageWeights: { cpu: 0.85, ram: 0.95, gpu: 1.25, ssd: 0.45 },
  },
  {
    id: 'rendering',
    name: '3D Path-Tracing Render (Blender Cycles)',
    description: 'Sustained 100% combined CPU + GPU compute load with heavy VRM & cooler stress.',
    unit: 'Samples/s',
    baseFpsScale: 115,
    requiredRamGB: 24,
    baseUtilization: { cpu: 0.95, ram: 0.84, gpu: 0.96, ssd: 0.35 },
    stageWeights: { cpu: 1.1, ram: 0.98, gpu: 1.2, ssd: 0.5 },
  },
  {
    id: 'compiling',
    name: 'Large Codebase Compile & Link (Rust / LLVM)',
    description: 'All-core CPU saturation, heavy RAM channel traffic, and high NVMe I/O.',
    unit: 'Crates/min',
    baseFpsScale: 96,
    requiredRamGB: 16,
    baseUtilization: { cpu: 0.98, ram: 0.88, gpu: 0.12, ssd: 0.9 },
    stageWeights: { cpu: 1.35, ram: 1.1, gpu: 0.2, ssd: 1.18 },
  },
];

/**
 * Calibrated Reference Laptop Profiles (documented in /docs/calibration.md)
 */
export const LAPTOP_PROFILES = [
  {
    id: 'zephyrus_g14_2024',
    name: 'ASUS ROG Zephyrus G14 (2024, GA403UV)',
    cpuId: 'r9_8945hs',
    gpuId: 'rtx_4060',
    ramId: 'lpddr5x_32gb_6400',
    ssdId: 'pcie4_1tb',
    coolingId: 'tri_fan_3pipe',
  },
  {
    id: 'legion_pro_7i_g9',
    name: 'Lenovo Legion Pro 7i Gen 9 (16IRX9H)',
    cpuId: 'i9_14900hx',
    gpuId: 'rtx_4080',
    ramId: 'lpddr5x_32gb_6400',
    ssdId: 'pcie4_2tb_heatsink',
    coolingId: 'vapor_chamber_lm',
  },
  {
    id: 'budget_thin_15',
    name: 'Entry 15" Thin Book (Single-Ch RAM Bottleneck)',
    cpuId: 'r7_7735hs',
    gpuId: 'rtx_4060',
    ramId: 'ddr5_8gb_single',
    ssdId: 'pcie3_512gb',
    coolingId: 'slim_2pipe',
  },
];

/**
 * Helper to look up a preset object by `id` from any preset array (with fallback to index 0).
 * @template T
 * @param {T[]} list
 * @param {string} id
 * @returns {T}
 */
export function findPresetById(list, id) {
  return list.find((item) => item.id === id) || list[0];
}
