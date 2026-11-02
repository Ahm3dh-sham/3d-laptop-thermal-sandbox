/**
 * @fileoverview Right Diagnostics Rail (`#diagnostics-mount`).
 * Renders:
 * 1. Pipeline Bottleneck Analyzer (`CPU -> RAM -> GPU -> Storage`) with pulsing red status badge
 *    and one-line root-cause explanation.
 * 2. Concrete Optimization Hint card with a one-click "Apply Upgrade" action button.
 * 3. Live Component Thermal Matrix (or Side-by-Side Config A vs Config B Delta Table in Compare Mode).
 */

/**
 * Creates the right-hand diagnostics & optimization panels inside `#diagnostics-mount`.
 *
 * @param {HTMLElement} mountEl - `#diagnostics-mount` element.
 * @param {object} callbacks
 * @param {(hint: object) => void} callbacks.onApplyUpgrade - Applies the suggested concrete upgrade.
 * @param {(compId: string) => void} callbacks.onSelectComponent - Highlights component in 3D view when row clicked.
 */
export function createDiagnosticsPanel(mountEl, callbacks) {
  let currentUpgradeHint = null;

  mountEl.innerHTML = `
    <!-- Card 1: Pipeline Bottleneck Highlight -->
    <div class="panel-card" id="bottleneck-card">
      <div class="panel-header-row">
        <span class="panel-title">Pipeline Bottleneck</span>
        <span class="pill pill-negative" id="bn-stage-pill">GPU Stage</span>
      </div>
      <p id="bn-explanation" style="margin: 0; font-size: 12px; color: var(--text); line-height: 1.4;">
        Evaluating 4-stage pipeline...
      </p>
      <div id="bn-bars" style="display: flex; flex-direction: column; gap: 6px; margin-top: 4px;">
        ${['cpu', 'ram', 'gpu', 'ssd']
          .map(
            (id) => `
          <div style="display: grid; grid-template-columns: 42px 1fr 48px; align-items: center; gap: 8px; font-size: 11px;">
            <span style="color: var(--muted); font-weight: 500; text-transform: uppercase;">${id}</span>
            <div style="height: 6px; background: var(--raised); border-radius: 3px; overflow: hidden;">
              <div id="bar-fill-${id}" style="height: 100%; width: 50%; background: var(--accent);"></div>
            </div>
            <span id="bar-val-${id}" class="num" style="text-align: right; color: var(--muted);">100</span>
          </div>
        `
          )
          .join('')}
      </div>
    </div>

    <!-- Card 2: Concrete Optimization Hint -->
    <div class="panel-card" id="optimization-card">
      <div class="panel-header-row">
        <span class="panel-title">Optimization Hint</span>
        <span class="pill pill-positive" id="opt-gain-pill">+24% Output</span>
      </div>
      <div id="opt-title" style="font-size: 13px; font-weight: 600; color: var(--text);">
        Upgrade recommendation
      </div>
      <p id="opt-detail" style="margin: 0; font-size: 12px; color: var(--muted); line-height: 1.4;">
        Analyzing hardware balance...
      </p>
      <button type="button" class="btn-primary" id="btn-apply-upgrade" style="width: 100%; margin-top: 4px;">
        Apply Recommended Upgrade
      </button>
    </div>

    <!-- Card 3: Live Component Telemetry Table / Compare Delta Table -->
    <div class="panel-card">
      <div class="panel-header-row">
        <span class="panel-title" id="matrix-table-title">Component Matrix</span>
        <span style="font-size: 11px; color: var(--muted);" id="matrix-table-sub">Total Power: 65 W</span>
      </div>
      <table class="data-table" id="telemetry-table">
        <thead id="telemetry-thead">
          <tr>
            <th>Node</th>
            <th class="num">Temp</th>
            <th class="num">Clock / Rate</th>
            <th class="num">Power</th>
          </tr>
        </thead>
        <tbody id="telemetry-tbody"></tbody>
      </table>
    </div>
  `;

  const bnStagePill = mountEl.querySelector('#bn-stage-pill');
  const bnExplanation = mountEl.querySelector('#bn-explanation');
  const optGainPill = mountEl.querySelector('#opt-gain-pill');
  const optTitle = mountEl.querySelector('#opt-title');
  const optDetail = mountEl.querySelector('#opt-detail');
  const btnApplyUpgrade = mountEl.querySelector('#btn-apply-upgrade');
  const matrixTableTitle = mountEl.querySelector('#matrix-table-title');
  const matrixTableSub = mountEl.querySelector('#matrix-table-sub');
  const telemetryThead = mountEl.querySelector('#telemetry-thead');
  const telemetryTbody = mountEl.querySelector('#telemetry-tbody');

  const barFills = {
    cpu: mountEl.querySelector('#bar-fill-cpu'),
    ram: mountEl.querySelector('#bar-fill-ram'),
    gpu: mountEl.querySelector('#bar-fill-gpu'),
    ssd: mountEl.querySelector('#bar-fill-ssd'),
  };
  const barVals = {
    cpu: mountEl.querySelector('#bar-val-cpu'),
    ram: mountEl.querySelector('#bar-val-ram'),
    gpu: mountEl.querySelector('#bar-val-gpu'),
    ssd: mountEl.querySelector('#bar-val-ssd'),
  };

  btnApplyUpgrade.addEventListener('click', () => {
    if (currentUpgradeHint && callbacks.onApplyUpgrade) {
      callbacks.onApplyUpgrade(currentUpgradeHint);
    }
  });

  function update(activeSnapshot, snapshotA, snapshotB, compareMode) {
    // 1. Update Bottleneck Card
    const lim = activeSnapshot.limitingStage;
    bnStagePill.textContent = `${lim.toUpperCase()} Limiting`;
    bnExplanation.textContent = activeSnapshot.explanation;

    const scores = activeSnapshot.stageThroughputs;
    const maxScore = Math.max(180, scores.cpu, scores.ram, scores.gpu, scores.ssd);
    for (const stageId of ['cpu', 'ram', 'gpu', 'ssd']) {
      const score = scores[stageId];
      const pct = Math.min(100, Math.max(8, (score / maxScore) * 100));
      const isLimiting = stageId === lim;
      barFills[stageId].style.width = `${pct.toFixed(0)}%`;
      barFills[stageId].style.background = isLimiting ? 'var(--negative)' : 'var(--accent)';
      barVals[stageId].textContent = `${Math.round(score)} pts`;
      barVals[stageId].style.color = isLimiting ? 'var(--negative)' : 'var(--muted)';
    }

    // 2. Update Concrete Optimization Hint Card
    const hint = activeSnapshot.upgradeHint;
    currentUpgradeHint = hint;
    if (hint) {
      optTitle.textContent = hint.title;
      optDetail.textContent = hint.detail;
      if (hint.estimatedGainPct > 0) {
        optGainPill.textContent = `+${hint.estimatedGainPct}% ${activeSnapshot.unitLabel}`;
        optGainPill.className = 'pill pill-positive';
      } else {
        optGainPill.textContent = 'Optimal';
        optGainPill.className = 'pill pill-warning';
      }
    }

    // 3. Update Telemetry Matrix (Single Mode vs Side-by-Side Compare Mode)
    if (!compareMode || !snapshotB) {
      matrixTableTitle.textContent = 'Component Matrix';
      matrixTableSub.textContent = `${activeSnapshot.totalPowerW.toFixed(0)} W Package`;
      telemetryThead.innerHTML = `
        <tr>
          <th>Part</th>
          <th class="num">Temp</th>
          <th class="num">Clock / Rate</th>
          <th class="num">Power</th>
        </tr>
      `;
      const rows = ['cpu', 'gpu', 'vrm', 'ram', 'ssd', 'battery']
        .map((id) => {
          const c = activeSnapshot.components[id];
          const tempClass = c.isThrottling
            ? 'status-crit'
            : c.temp > c.throttleTemp - 6
              ? 'status-warn'
              : '';
          return `
            <tr data-comp="${id}" style="cursor: pointer;">
              <td><strong>${id.toUpperCase()}</strong></td>
              <td class="num ${tempClass}">${c.temp.toFixed(1)}°C</td>
              <td class="num">${c.clockText}</td>
              <td class="num">${c.powerW.toFixed(1)}W</td>
            </tr>
          `;
        })
        .join('');
      telemetryTbody.innerHTML = rows;

      telemetryTbody.querySelectorAll('tr[data-comp]').forEach((tr) => {
        tr.addEventListener('click', () => {
          if (callbacks.onSelectComponent) {
            callbacks.onSelectComponent(tr.dataset.comp);
          }
        });
      });
    } else {
      // Compare Mode: Config A vs Config B side-by-side delta table
      const fpsDelta = snapshotB.estimatedFps - snapshotA.estimatedFps;
      const sign = fpsDelta >= 0 ? '+' : '';
      matrixTableTitle.textContent = 'Compare A vs B';
      matrixTableSub.textContent = `B vs A: ${sign}${fpsDelta.toFixed(1)} ${snapshotA.unitLabel}`;
      telemetryThead.innerHTML = `
        <tr>
          <th>Metric</th>
          <th class="num">Config A</th>
          <th class="num">Config B</th>
          <th class="num">Delta (B-A)</th>
        </tr>
      `;

      const cpuDiff = snapshotB.components.cpu.temp - snapshotA.components.cpu.temp;
      const gpuDiff = snapshotB.components.gpu.temp - snapshotA.components.gpu.temp;
      const pwrDiff = snapshotB.totalPowerW - snapshotA.totalPowerW;
      const rpmDiff = snapshotB.fanRpm - snapshotA.fanRpm;

      telemetryTbody.innerHTML = `
        <tr>
          <td><strong>${snapshotA.unitLabel}</strong></td>
          <td class="num">${snapshotA.estimatedFps.toFixed(1)}</td>
          <td class="num">${snapshotB.estimatedFps.toFixed(1)}</td>
          <td class="num ${fpsDelta >= 0 ? 'status-ok' : 'status-crit'}">${sign}${fpsDelta.toFixed(1)}</td>
        </tr>
        <tr>
          <td><strong>CPU Temp</strong></td>
          <td class="num">${snapshotA.components.cpu.temp.toFixed(1)}°C</td>
          <td class="num">${snapshotB.components.cpu.temp.toFixed(1)}°C</td>
          <td class="num ${cpuDiff <= 0 ? 'status-ok' : 'status-warn'}">${cpuDiff >= 0 ? '+' : ''}${cpuDiff.toFixed(1)}°C</td>
        </tr>
        <tr>
          <td><strong>GPU Temp</strong></td>
          <td class="num">${snapshotA.components.gpu.temp.toFixed(1)}°C</td>
          <td class="num">${snapshotB.components.gpu.temp.toFixed(1)}°C</td>
          <td class="num ${gpuDiff <= 0 ? 'status-ok' : 'status-warn'}">${gpuDiff >= 0 ? '+' : ''}${gpuDiff.toFixed(1)}°C</td>
        </tr>
        <tr>
          <td><strong>Sys Power</strong></td>
          <td class="num">${snapshotA.totalPowerW.toFixed(0)}W</td>
          <td class="num">${snapshotB.totalPowerW.toFixed(0)}W</td>
          <td class="num">${pwrDiff >= 0 ? '+' : ''}${pwrDiff.toFixed(0)}W</td>
        </tr>
        <tr>
          <td><strong>Fan Speed</strong></td>
          <td class="num">${Math.round(snapshotA.fanRpm)}</td>
          <td class="num">${Math.round(snapshotB.fanRpm)}</td>
          <td class="num">${rpmDiff >= 0 ? '+' : ''}${Math.round(rpmDiff)}</td>
        </tr>
        <tr>
          <td><strong>Limiting</strong></td>
          <td class="num">${snapshotA.limitingStage.toUpperCase()}</td>
          <td class="num">${snapshotB.limitingStage.toUpperCase()}</td>
          <td class="num">—</td>
        </tr>
      `;
    }
  }

  return {
    update,
  };
}
