/**
 * @fileoverview Adversarial UI Stress-Testing & Prototype Variant Picker (`break-ui` + `prototype` PICKER.md).
 *
 * Combines:
 * 1. `prototype` skill's verbatim floating dark pill (`.proto-picker`, sliding `.proto-picker-highlight`,
 *    number keys / arrow keys, URL persistence) to switch between 3 genuinely distinct HUD layout/density
 *    variants:
 *    - `Bench` (Default ruled engineering bench)
 *    - `Compact` (High-density telemetry strips for dual-screen / lab monitors)
 *    - `Cinema` (Expanded 540px 3D stage with translucent HUD overlay focus)
 * 2. `break-ui` skill's **Demo data / Worst case** adversarial dataset toggle (`?data=worst`),
 *    injecting realistic worst-case hardware names, German compound labels, Vietnamese stacked diacritics,
 *    long SKU identifiers (`bartholomew.fitzgerald@northwind-industries-holdings.example.com`),
 *    extreme thermal/power numbers, and single-item / high-count edge cases at the data boundary.
 */

export const WORST_CASE_OVERRIDE = {
  profileName: ' Aleksandr Wiśniewski-Kowalczyk Custom Engineering Rig — BIOS_REV_9f8e7d6c-5b4a-4c3d-8e2f_FINAL_v12 ',
  explanation:
    'GPU & CPU limited by Benachrichtigungseinstellungen_DDR5_SingleChannel_SwapSpill (bartholomew.fitzgerald@northwind-industries-holdings.example.com · Đặng Thị Ngọc Hân Lab)',
  upgradeHint: {
    category: 'ram',
    targetPresetId: 'lpddr5x_32gb_6400',
    title:
      'Upgrade RAM to 32GB LPDDR5X-6400 (Paramètres de confidentialité et de sécurité — Dual-Channel Ultra-Low-Latency Kit)',
    detail:
      'Resolves single-channel bus starvation across IMG_20250914_183022_HDR_portrait_edited_edited.HEIC asset streaming and eliminates NVMe\u00A0pagefile\u00A0thrashing.',
    actionLabel: 'Apply: 32GB LPDDR5X-6400 Dual-Channel (+142%)',
    estimatedGainPct: 142,
  },
  components: {
    cpu: {
      label: 'CPU — Intel® Core™ i9-14900HX Extreme Edition (Đặng Thị Ngọc Hân Validation Sample)',
      temp: 104.8,
      throttleTemp: 99,
      powerW: 138.4,
      clockText: '5.58 GHz (PROCHOT)',
      clockGHz: 5.58,
      loadPct: 100,
      isThrottling: true,
      throttlePct: 28,
      bottleneckPulse: 1.0,
    },
    gpu: {
      label: 'GPU — NVIDIA RTX 4080 Max-Q / Benachrichtigungseinstellungen GDDR6X',
      temp: 91.6,
      throttleTemp: 87,
      powerW: 174.9,
      clockText: '2490 MHz',
      clockGHz: 2.49,
      loadPct: 99,
      isThrottling: true,
      throttlePct: 19,
      bottleneckPulse: 0.0,
    },
    vrm: {
      label: 'VRM — 16+4 Phase Monolithic Power Stage (نور الهدى عبد الرحمن)',
      temp: 108.2,
      throttleTemp: 105,
      powerW: 31.4,
      clockText: '78% Eff (HOT)',
      clockGHz: 0,
      loadPct: 98,
      isThrottling: true,
      throttlePct: 22,
      bottleneckPulse: 1.0,
    },
    ram: {
      label: 'RAM — 8GB DDR5-4800 Single-Channel (🦊 Fox / 👩🏽‍💻 Priya Test Profile)',
      temp: 86.4,
      throttleTemp: 85,
      powerW: 6.8,
      clockText: '4800 MT/s (1ch)',
      clockGHz: 2.4,
      loadPct: 100,
      isThrottling: true,
      throttlePct: 12,
      bottleneckPulse: 1.0,
    },
    ssd: {
      label: 'SSD — Q3 Board Deck — FINAL (revised) v12 [approved by legal].nvme',
      temp: 83.9,
      throttleTemp: 80,
      powerW: 8.4,
      clockText: '7,450 MB/s',
      clockGHz: 0,
      loadPct: 96,
      isThrottling: true,
      throttlePct: 15,
      bottleneckPulse: 0.0,
    },
    battery: {
      label: 'Battery — 99.9Wh Li-Ion Pack (王秀英 High-Discharge Telemetry)',
      temp: 59.4,
      throttleTemp: 60,
      powerW: 9.2,
      clockText: '369W Sys Draw',
      clockGHz: 0,
      loadPct: 100,
      isThrottling: false,
      throttlePct: 0,
      bottleneckPulse: 0.0,
    },
  },
};

/**
 * Applies the worst-case fixture at the data boundary (`break-ui` Hard Rule 2) when `dataMode === 'worst'`.
 * Does not mutate the underlying simulator state.
 */
export function applyDatasetBoundary(snapshot, dataMode) {
  if (dataMode !== 'worst') return snapshot;

  const clonedComponents = {};
  for (const [id, comp] of Object.entries(snapshot.components)) {
    clonedComponents[id] = {
      ...comp,
      ...(WORST_CASE_OVERRIDE.components[id] || {}),
    };
  }

  return {
    ...snapshot,
    totalPowerW: 369.1,
    estimatedFps: 1284.5,
    unitLabel: 'Samples/s',
    limitingStage: 'ram',
    visualHighlightComponent: 'ram',
    explanation: WORST_CASE_OVERRIDE.explanation,
    upgradeHint: WORST_CASE_OVERRIDE.upgradeHint,
    components: clonedComponents,
  };
}

/**
 * Mounts the floating `.proto-picker` harness (verbatim from `prototype/PICKER.md`) with
 * 3 workspace variants (`Bench`, `Compact`, `Cinema`) + the `break-ui` **Demo data / Worst case** switch.
 */
export function createPrototypeAndBreakHarness({
  onChangeVariant,
  onVariantChange,
  onChangeDataMode,
  onDataModeChange,
  onReplay,
}) {
  const handleVariantChange = onVariantChange || onChangeVariant;
  const handleDataModeChange = onDataModeChange || onChangeDataMode;
  const nav = document.createElement('nav');
  nav.className = 'proto-picker';
  nav.setAttribute('aria-label', 'Prototype variants and break-ui stress toggle');

  const variants = ['Bench', 'Compact', 'Cinema'];
  nav.innerHTML = `
    <span class="proto-picker-highlight" aria-hidden="true"></span>
    ${variants
      .map(
        (name, idx) =>
          `<button type="button" class="proto-picker-item" data-variant-idx="${idx}" ${
            idx === 0 ? 'data-active aria-selected="true" aria-current="true"' : 'aria-selected="false"'
          }>${name}</button>`
      )
      .join('')}
    <span class="proto-picker-divider" aria-hidden="true"></span>
    <button type="button" class="proto-picker-item proto-picker-data-toggle" data-break-toggle="demo" title="Toggle break-ui Worst-Case Data Stress Test">Demo data</button>
    <span class="proto-picker-divider" aria-hidden="true"></span>
    <button type="button" class="proto-picker-item proto-picker-replay" aria-label="Replay thermal entrance (R)" title="Reset & replay thermal curve (R)">↻</button>
  `;

  document.body.appendChild(nav);

  const highlight = nav.querySelector('.proto-picker-highlight');
  const variantBtns = [...nav.querySelectorAll('[data-variant-idx]')];
  const breakBtn = nav.querySelector('[data-break-toggle]');
  const replayBtn = nav.querySelector('.proto-picker-replay');

  let currentVariant = 0;
  let dataMode = new URLSearchParams(window.location.search).get('data') === 'worst' ? 'worst' : 'demo';

  function moveHighlight() {
    const el = variantBtns[currentVariant];
    if (!el) return;
    highlight.style.width = `${el.offsetWidth}px`;
    highlight.style.transform = `translateX(${el.offsetLeft}px)`;
  }

  function setVariant(idx, notify = true) {
    if (idx < 0 || idx >= variants.length) return;
    currentVariant = idx;
    variantBtns.forEach((btn, j) => {
      btn.toggleAttribute('data-active', j === idx);
      btn.setAttribute('aria-selected', j === idx ? 'true' : 'false');
      if (j === idx) btn.setAttribute('aria-current', 'true');
      else btn.removeAttribute('aria-current');
    });
    moveHighlight();

    const variantSlug = variants[idx].toLowerCase();
    document.documentElement.dataset.layoutVariant = variantSlug;

    if (notify) {
      const url = new URL(window.location.href);
      url.searchParams.set('v', String(idx + 1));
      window.history.replaceState(null, '', url);
      if (handleVariantChange) handleVariantChange(variantSlug);
    }
  }

  function setDataMode(mode, notify = true) {
    dataMode = mode;
    const isWorst = dataMode === 'worst';
    breakBtn.textContent = isWorst ? 'Worst case' : 'Demo data';
    breakBtn.toggleAttribute('data-active', isWorst);
    breakBtn.setAttribute('aria-pressed', isWorst ? 'true' : 'false');

    if (notify) {
      const url = new URL(window.location.href);
      if (isWorst) url.searchParams.set('data', 'worst');
      else url.searchParams.delete('data');
      window.history.replaceState(null, '', url);
      if (handleDataModeChange) handleDataModeChange(dataMode);
    }
  }

  variantBtns.forEach((btn, idx) => {
    btn.addEventListener('click', () => setVariant(idx));
  });

  breakBtn.addEventListener('click', () => {
    setDataMode(dataMode === 'demo' ? 'worst' : 'demo');
  });

  replayBtn.addEventListener('click', () => {
    if (onReplay) onReplay();
  });

  window.addEventListener('keydown', (e) => {
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      setVariant((currentVariant + 1) % variants.length);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setVariant((currentVariant - 1 + variants.length) % variants.length);
    }
  });

  window.addEventListener('resize', moveHighlight);

  // Initial state from URL params (`?v=1..3` and `?data=worst`)
  const initialV = (parseInt(new URLSearchParams(window.location.search).get('v') || '1', 10) || 1) - 1;
  setVariant(Math.max(0, Math.min(variants.length - 1, initialV)), false);
  setDataMode(dataMode, false);

  // Enable highlight slide only after first paint (`prototype/PICKER.md` rule)
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      nav.setAttribute('data-ready', '');
      moveHighlight();
    });
  });

  return {
    getDataMode: () => dataMode,
    setDataMode,
    setVariant,
    getCurrentVariant: () => currentVariant,
    getVariantsCount: () => variants.length,
  };
}
