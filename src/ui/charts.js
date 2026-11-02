/**
 * @fileoverview Live Telemetry Line Charts powered by Chart.js (`#charts-mount`).
 * Follows `design-taste-frontend/references/app-screens.md` Chart & Data-Vis Discipline:
 * - Zero animation lag (`animation: false`) for smooth 60 FPS real-time updates
 * - Hairline `#262626` gridlines, muted monospace axis labels (`#b4b4b4`)
 * - 3 synchronized time-series graphs:
 *   1. Component Temperatures (°C): CPU, GPU, VRM, SSD
 *   2. Operating Clock Speeds (GHz): CPU Clock, GPU Clock
 *   3. System Throughput (FPS / Task Rate): Config A (and Config B overlay in Compare Mode)
 */

import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Legend,
  Tooltip,
  Filler,
} from 'chart.js';

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Legend,
  Tooltip,
  Filler
);

const BASE_CHART_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  interaction: {
    mode: 'index',
    intersect: false,
  },
  plugins: {
    legend: {
      display: true,
      position: 'top',
      align: 'end',
      labels: {
        color: '#b4b4b4',
        boxWidth: 10,
        boxHeight: 2,
        padding: 8,
        font: {
          family: "'JetBrains Mono', monospace",
          size: 10,
        },
      },
    },
    tooltip: {
      backgroundColor: '#111111',
      borderColor: '#3d3d3d',
      borderWidth: 1,
      titleColor: '#ffffff',
      bodyColor: '#b4b4b4',
      titleFont: { family: "'JetBrains Mono', monospace", size: 10 },
      bodyFont: { family: "'JetBrains Mono', monospace", size: 10 },
      padding: 6,
    },
  },
  scales: {
    x: {
      ticks: {
        color: '#949494',
        maxTicksLimit: 6,
        font: { family: "'JetBrains Mono', monospace", size: 9 },
      },
      grid: {
        color: '#1b1b1b',
        drawBorder: false,
      },
    },
    y: {
      ticks: {
        color: '#b4b4b4',
        maxTicksLimit: 5,
        font: { family: "'JetBrains Mono', monospace", size: 9 },
      },
      grid: {
        color: '#262626',
        drawBorder: false,
      },
    },
  },
  elements: {
    point: {
      radius: 0,
      hoverRadius: 3,
    },
    line: {
      borderWidth: 1.6,
      tension: 0.15,
    },
  },
};

/**
 * Creates the 3 real-time telemetry charts inside `#charts-mount`.
 * @param {HTMLElement} mountEl - `#charts-mount` element.
 */
export function createChartsPanel(mountEl) {
  mountEl.innerHTML = `
    <div class="chart-card">
      <div class="panel-header-row">
        <span class="panel-title">Thermal Telemetry (°C)</span>
        <span class="pill pill-positive" id="chart-temp-badge">Live 60Hz ODE</span>
      </div>
      <div class="chart-wrap">
        <canvas id="chart-temps" aria-label="Component temperatures over time"></canvas>
      </div>
    </div>

    <div class="chart-card">
      <div class="panel-header-row">
        <span class="panel-title">Clock Frequency (GHz)</span>
        <span class="pill pill-positive" id="chart-clock-badge">DVFS / Hysteresis</span>
      </div>
      <div class="chart-wrap">
        <canvas id="chart-clocks" aria-label="CPU and GPU clock speeds over time"></canvas>
      </div>
    </div>

    <div class="chart-card">
      <div class="panel-header-row">
        <span class="panel-title" id="chart-fps-title">Throughput (FPS)</span>
        <span class="pill pill-positive" id="chart-fps-badge">Pipeline Output</span>
      </div>
      <div class="chart-wrap">
        <canvas id="chart-fps" aria-label="System throughput over time"></canvas>
      </div>
    </div>
  `;

  const ctxTemps = mountEl.querySelector('#chart-temps').getContext('2d');
  const ctxClocks = mountEl.querySelector('#chart-clocks').getContext('2d');
  const ctxFps = mountEl.querySelector('#chart-fps').getContext('2d');
  const chartFpsTitle = mountEl.querySelector('#chart-fps-title');

  // 1. Temperature Chart
  const tempChart = new Chart(ctxTemps, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        { label: 'CPU °C', data: [], borderColor: '#38bdf8' },
        { label: 'GPU °C', data: [], borderColor: '#3fc07a' },
        { label: 'VRM °C', data: [], borderColor: '#f59e0b', borderDash: [3, 2] },
        { label: 'SSD °C', data: [], borderColor: '#e5566f', borderDash: [2, 2] },
      ],
    },
    options: {
      ...BASE_CHART_OPTIONS,
      scales: {
        ...BASE_CHART_OPTIONS.scales,
        y: {
          ...BASE_CHART_OPTIONS.scales.y,
          suggestedMin: 25,
          suggestedMax: 105,
        },
      },
    },
  });

  // 2. Clock Speed Chart
  const clockChart = new Chart(ctxClocks, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        { label: 'CPU GHz', data: [], borderColor: '#38bdf8' },
        { label: 'GPU GHz', data: [], borderColor: '#f59e0b' },
      ],
    },
    options: {
      ...BASE_CHART_OPTIONS,
      scales: {
        ...BASE_CHART_OPTIONS.scales,
        y: {
          ...BASE_CHART_OPTIONS.scales.y,
          suggestedMin: 1.0,
          suggestedMax: 5.5,
        },
      },
    },
  });

  // 3. Throughput / FPS Chart (supports Config A + Config B in Compare Mode)
  const fpsChart = new Chart(ctxFps, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Config A',
          data: [],
          borderColor: '#3fc07a',
          backgroundColor: 'rgba(63, 192, 122, 0.12)',
          fill: true,
        },
        {
          label: 'Config B',
          data: [],
          borderColor: '#38bdf8',
          backgroundColor: 'rgba(56, 189, 248, 0.08)',
          fill: false,
          hidden: true,
        },
      ],
    },
    options: {
      ...BASE_CHART_OPTIONS,
      scales: {
        ...BASE_CHART_OPTIONS.scales,
        y: {
          ...BASE_CHART_OPTIONS.scales.y,
          suggestedMin: 0,
          suggestedMax: 150,
        },
      },
    },
  });

  let lastHistoryLen = -1;
  let lastLabel = '';

  return {
    /**
     * Refreshes the 3 charts from simulator ring buffers when a new telemetry sample arrives.
     * @param {object} snapshotA - Active or Config A snapshot.
     * @param {object|null} snapshotB - Config B snapshot when Compare Mode is enabled.
     * @param {boolean} compareMode - Whether side-by-side Compare Mode is active.
     */
    update(snapshotA, snapshotB, compareMode) {
      const histA = snapshotA.history;
      const latestLabel = histA.labels[histA.labels.length - 1] || '';
      if (histA.labels.length === lastHistoryLen && latestLabel === lastLabel) {
        return;
      }
      lastHistoryLen = histA.labels.length;
      lastLabel = latestLabel;

      chartFpsTitle.textContent = `Throughput (${snapshotA.unitLabel})`;

      tempChart.data.labels = histA.labels;
      tempChart.data.datasets[0].data = histA.cpuTemp;
      tempChart.data.datasets[1].data = histA.gpuTemp;
      tempChart.data.datasets[2].data = histA.vrmTemp;
      tempChart.data.datasets[3].data = histA.ssdTemp;
      tempChart.update('none');

      clockChart.data.labels = histA.labels;
      clockChart.data.datasets[0].data = histA.cpuClockGHz;
      clockChart.data.datasets[1].data = histA.gpuClockGHz;
      clockChart.update('none');

      fpsChart.data.labels = histA.labels;
      fpsChart.data.datasets[0].data = histA.fps;
      if (compareMode && snapshotB) {
        fpsChart.data.datasets[1].hidden = false;
        fpsChart.data.datasets[1].data = snapshotB.history.fps;
      } else {
        fpsChart.data.datasets[1].hidden = true;
      }
      fpsChart.update('none');
    },
  };
}
