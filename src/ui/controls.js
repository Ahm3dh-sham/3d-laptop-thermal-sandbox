/**
 * @fileoverview Hardware & Workload Configuration Controls Sidebar (`#controls-mount`).
 * Renders dropdowns for Reference Profile, CPU, GPU, RAM, SSD, Cooling, and Workload,
 * plus sliders for Ambient Temp, Fan Curve Aggressiveness, and Power Limit.
 * Supports switching between Config A and Config B when Compare Mode is active.
 */

import {
  LAPTOP_PROFILES,
  CPU_PRESETS,
  GPU_PRESETS,
  RAM_PRESETS,
  SSD_PRESETS,
  COOLING_PRESETS,
  WORKLOAD_PRESETS,
} from '../sim/presets.js';

/**
 * Mounts the left hardware/thermal control panel and binds change listeners.
 *
 * @param {HTMLElement} mountEl - `#controls-mount` container.
 * @param {object} options
 * @param {() => object} options.getActiveSelection - Returns current selection object for active slot (A or B).
 * @param {(patch: object, isShared?: boolean) => void} options.onConfigChange - Called when user changes a control.
 * @param {() => void} options.onResetThermals - Resets component temperatures to ambient equilibrium.
 * @param {(slot: 'A' | 'B') => void} options.onSelectSlot - Switches active editing slot in Compare Mode.
 */
export function createControlsPanel(mountEl, options) {
  let activeSlot = 'A';
  let compareEnabled = false;

  mountEl.innerHTML = `
    <div class="control-section" id="slot-switcher-group" hidden>
      <div class="field-label-row">
        <span class="section-heading">Editing Target</span>
        <span class="pill pill-positive" id="slot-badge">Config A</span>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
        <button type="button" class="btn-secondary" data-slot="A" id="tab-slot-a" aria-pressed="true">Config A</button>
        <button type="button" class="btn-secondary" data-slot="B" id="tab-slot-b" aria-pressed="false">Config B</button>
      </div>
    </div>

    <div class="control-section">
      <div class="field-label-row">
        <h2 class="section-heading">Reference Laptop Profile</h2>
        <button type="button" class="comp-chip" id="btn-reset-thermals" title="Cool components back to ambient equilibrium">Reset °C</button>
      </div>
      <div class="field-group">
        <label class="field-label-row" for="ctrl-profile"><span>Calibrated Baseline</span></label>
        <select class="field-select" id="ctrl-profile">
          ${LAPTOP_PROFILES.map((p) => `<option value="${p.id}">${p.name}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="control-section">
      <h2 class="section-heading">Hardware Config (<span id="active-slot-label">Config A</span>)</h2>

      <div class="field-group">
        <label class="field-label-row" for="ctrl-cpu"><span>Processor (CPU)</span></label>
        <select class="field-select" id="ctrl-cpu">
          ${CPU_PRESETS.map((c) => `<option value="${c.id}">${c.name}</option>`).join('')}
        </select>
      </div>

      <div class="field-group">
        <label class="field-label-row" for="ctrl-gpu"><span>Graphics (GPU)</span></label>
        <select class="field-select" id="ctrl-gpu">
          ${GPU_PRESETS.map((g) => `<option value="${g.id}">${g.name}</option>`).join('')}
        </select>
      </div>

      <div class="field-group">
        <label class="field-label-row" for="ctrl-ram"><span>Memory (RAM)</span></label>
        <select class="field-select" id="ctrl-ram">
          ${RAM_PRESETS.map((r) => `<option value="${r.id}">${r.name}</option>`).join('')}
        </select>
      </div>

      <div class="field-group">
        <label class="field-label-row" for="ctrl-ssd"><span>Storage (NVMe SSD)</span></label>
        <select class="field-select" id="ctrl-ssd">
          ${SSD_PRESETS.map((s) => `<option value="${s.id}">${s.name}</option>`).join('')}
        </select>
      </div>

      <div class="field-group">
        <label class="field-label-row" for="ctrl-cooling"><span>Cooling Module</span></label>
        <select class="field-select" id="ctrl-cooling">
          ${COOLING_PRESETS.map((c) => `<option value="${c.id}">${c.name}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="control-section">
      <h2 class="section-heading">Workload &amp; Thermal Controls</h2>

      <div class="field-group">
        <label class="field-label-row" for="ctrl-workload"><span>Active Workload</span></label>
        <select class="field-select" id="ctrl-workload">
          ${WORKLOAD_PRESETS.map((w) => `<option value="${w.id}">${w.name}</option>`).join('')}
        </select>
        <span id="workload-desc" style="font-size: 11px; color: var(--faint); line-height: 1.35;"></span>
      </div>

      <div class="field-group">
        <div class="field-label-row">
          <label for="ctrl-ambient">Ambient Temp</label>
          <strong class="num" id="val-ambient">25 °C</strong>
        </div>
        <input type="range" class="field-range" id="ctrl-ambient" min="15" max="42" step="1" value="25" />
      </div>

      <div class="field-group">
        <div class="field-label-row">
          <label for="ctrl-fancurve">Fan Curve Profile</label>
          <strong class="num" id="val-fancurve">65%</strong>
        </div>
        <input type="range" class="field-range" id="ctrl-fancurve" min="20" max="100" step="5" value="65" />
      </div>

      <div class="field-group">
        <div class="field-label-row">
          <label for="ctrl-powerlimit">Power Limit (PL1 / TGP)</label>
          <strong class="num" id="val-powerlimit">100%</strong>
        </div>
        <input type="range" class="field-range" id="ctrl-powerlimit" min="50" max="125" step="5" value="100" />
      </div>
    </div>
  `;

  const slotGroupEl = mountEl.querySelector('#slot-switcher-group');
  const tabSlotA = mountEl.querySelector('#tab-slot-a');
  const tabSlotB = mountEl.querySelector('#tab-slot-b');
  const slotBadge = mountEl.querySelector('#slot-badge');
  const activeSlotLabel = mountEl.querySelector('#active-slot-label');

  const ctrlProfile = mountEl.querySelector('#ctrl-profile');
  const ctrlCpu = mountEl.querySelector('#ctrl-cpu');
  const ctrlGpu = mountEl.querySelector('#ctrl-gpu');
  const ctrlRam = mountEl.querySelector('#ctrl-ram');
  const ctrlSsd = mountEl.querySelector('#ctrl-ssd');
  const ctrlCooling = mountEl.querySelector('#ctrl-cooling');
  const ctrlWorkload = mountEl.querySelector('#ctrl-workload');
  const workloadDesc = mountEl.querySelector('#workload-desc');

  const ctrlAmbient = mountEl.querySelector('#ctrl-ambient');
  const valAmbient = mountEl.querySelector('#val-ambient');
  const ctrlFanCurve = mountEl.querySelector('#ctrl-fancurve');
  const valFanCurve = mountEl.querySelector('#val-fancurve');
  const ctrlPowerLimit = mountEl.querySelector('#ctrl-powerlimit');
  const valPowerLimit = mountEl.querySelector('#val-powerlimit');
  const btnResetThermals = mountEl.querySelector('#btn-reset-thermals');

  function syncInputsFromSelection() {
    const sel = options.getActiveSelection();
    ctrlProfile.value = sel.profileId || 'zephyrus_g14_2024';
    ctrlCpu.value = sel.cpuId;
    ctrlGpu.value = sel.gpuId;
    ctrlRam.value = sel.ramId;
    ctrlSsd.value = sel.ssdId;
    ctrlCooling.value = sel.coolingId;
    ctrlWorkload.value = sel.workloadId;

    const wl = WORKLOAD_PRESETS.find((w) => w.id === sel.workloadId) || WORKLOAD_PRESETS[0];
    workloadDesc.textContent = wl.description;

    ctrlAmbient.value = String(sel.ambientTemp);
    valAmbient.textContent = `${sel.ambientTemp} °C`;

    const fanPct = Math.round(sel.fanCurveAggressiveness * 100);
    ctrlFanCurve.value = String(fanPct);
    valFanCurve.textContent = `${fanPct}%`;

    const pwrPct = Math.round(sel.powerLimitRatio * 100);
    ctrlPowerLimit.value = String(pwrPct);
    valPowerLimit.textContent = `${pwrPct}%`;
  }

  ctrlProfile.addEventListener('change', () => {
    options.onConfigChange({ profileId: ctrlProfile.value }, false);
    syncInputsFromSelection();
  });

  ctrlCpu.addEventListener('change', () => {
    options.onConfigChange({ cpuId: ctrlCpu.value }, false);
  });

  ctrlGpu.addEventListener('change', () => {
    options.onConfigChange({ gpuId: ctrlGpu.value }, false);
  });

  ctrlRam.addEventListener('change', () => {
    options.onConfigChange({ ramId: ctrlRam.value }, false);
  });

  ctrlSsd.addEventListener('change', () => {
    options.onConfigChange({ ssdId: ctrlSsd.value }, false);
  });

  ctrlCooling.addEventListener('change', () => {
    options.onConfigChange({ coolingId: ctrlCooling.value }, false);
  });

  // Workload & Ambient Temp apply to BOTH configs in Compare Mode
  ctrlWorkload.addEventListener('change', () => {
    options.onConfigChange({ workloadId: ctrlWorkload.value }, true);
    syncInputsFromSelection();
  });

  ctrlAmbient.addEventListener('input', () => {
    const ambientTemp = parseFloat(ctrlAmbient.value);
    valAmbient.textContent = `${ambientTemp} °C`;
    options.onConfigChange({ ambientTemp }, true);
  });

  ctrlFanCurve.addEventListener('input', () => {
    const pct = parseFloat(ctrlFanCurve.value);
    valFanCurve.textContent = `${Math.round(pct)}%`;
    options.onConfigChange({ fanCurveAggressiveness: pct / 100 }, false);
  });

  ctrlPowerLimit.addEventListener('input', () => {
    const pct = parseFloat(ctrlPowerLimit.value);
    valPowerLimit.textContent = `${Math.round(pct)}%`;
    options.onConfigChange({ powerLimitRatio: pct / 100 }, false);
  });

  btnResetThermals.addEventListener('click', () => {
    options.onResetThermals();
  });

  tabSlotA.addEventListener('click', () => {
    setActiveSlot('A');
    options.onSelectSlot('A');
  });

  tabSlotB.addEventListener('click', () => {
    setActiveSlot('B');
    options.onSelectSlot('B');
  });

  function setActiveSlot(slot) {
    activeSlot = slot;
    tabSlotA.setAttribute('aria-pressed', slot === 'A' ? 'true' : 'false');
    tabSlotB.setAttribute('aria-pressed', slot === 'B' ? 'true' : 'false');
    slotBadge.textContent = `Config ${slot}`;
    activeSlotLabel.textContent = compareEnabled ? `Config ${slot}` : 'Config A';
    syncInputsFromSelection();
  }

  syncInputsFromSelection();

  return {
    syncInputsFromSelection,
    setCompareMode(enabled) {
      compareEnabled = enabled;
      slotGroupEl.hidden = !enabled;
      if (!enabled && activeSlot !== 'A') {
        setActiveSlot('A');
      } else {
        activeSlotLabel.textContent = enabled ? `Config ${activeSlot}` : 'Config A';
      }
    },
    getActiveSlot() {
      return activeSlot;
    },
  };
}
