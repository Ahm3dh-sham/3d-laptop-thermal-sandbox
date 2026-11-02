/**
 * @fileoverview Sonner-Style Stacked Toast Notification System (`ask-sonner` + `emil-design-eng`).
 * Implements Emil Kowalski's Sonner principles in vanilla JS:
 * - Mounted once at the document root (`<ol data-sonner-toaster>`), never inside a clipping container
 * - Uses interruptible CSS transitions (`transform`, `opacity`), never keyframes
 * - Enters and exits from the bottom-right edge using percentage `translateY(100%)` + `@starting-style`
 * - Pauses auto-close timers when `document.hidden` is true (tab backgrounded)
 * - Supports swipe-to-dismiss with momentum velocity check (`Math.abs(dragDistance) / elapsedMs > 0.11`)
 * - Deduplicates / updates in-place when called with an existing `{ id }`
 */

let toasterEl = null;
const activeToasts = new Map();

export function initToaster() {
  if (toasterEl) return toasterEl;
  toasterEl = document.createElement('ol');
  toasterEl.className = 'sonner-toaster';
  toasterEl.setAttribute('data-sonner-toaster', '');
  toasterEl.setAttribute('aria-live', 'polite');
  toasterEl.setAttribute('aria-label', 'Telemetry notifications');
  document.body.appendChild(toasterEl);

  // Sonner principle #4: Pause toast timers invisibly when browser tab is hidden
  document.addEventListener('visibilitychange', () => {
    for (const entry of activeToasts.values()) {
      if (document.hidden) {
        entry.pause();
      } else {
        entry.resume();
      }
    }
  });

  return toasterEl;
}

/**
 * Triggers or updates a Sonner-style toast notification.
 * @param {string} title
 * @param {object} [options]
 * @param {string} [options.id] - Stable ID to update an existing toast in-place instead of duplicating.
 * @param {string} [options.description] - Secondary telemetry detail line.
 * @param {'info' | 'success' | 'warning' | 'error'} [options.type='info']
 * @param {number} [options.duration=3600]
 * @param {{ label: string, onClick: () => void }} [options.action]
 */
export function toast(title, options = {}) {
  initToaster();

  const id = options.id || `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const type = options.type || 'info';
  const duration = options.duration ?? 3600;

  // If toast with this ID already exists, update it in place (Sonner recipe)
  if (activeToasts.has(id)) {
    const existing = activeToasts.get(id);
    existing.update(title, options);
    return id;
  }

  // Cap visible stack to 3 toasts
  if (activeToasts.size >= 3) {
    const oldestId = activeToasts.keys().next().value;
    if (oldestId) dismissToast(oldestId);
  }

  const li = document.createElement('li');
  li.className = `sonner-toast sonner-${type}`;
  li.dataset.toastId = id;

  function renderInner(tTitle, tOpts) {
    const badgeMap = {
      success: '<span class="pill pill-positive">Applied</span>',
      warning: '<span class="pill pill-warning">Thermal Alert</span>',
      error: '<span class="pill pill-negative">PROCHOT</span>',
      info: '<span class="pill pill-positive">Telemetry</span>',
    };
    li.innerHTML = `
      <div class="sonner-toast-header">
        <strong class="sonner-toast-title">${escapeHtml(tTitle)}</strong>
        ${badgeMap[tOpts.type || type] || badgeMap.info}
      </div>
      ${
        tOpts.description
          ? `<div class="sonner-toast-desc num">${escapeHtml(tOpts.description)}</div>`
          : ''
      }
      ${
        tOpts.action
          ? `<button type="button" class="sonner-toast-action">${escapeHtml(tOpts.action.label)}</button>`
          : ''
      }
    `;

    if (tOpts.action) {
      const actionBtn = li.querySelector('.sonner-toast-action');
      actionBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        tOpts.action.onClick();
        dismissToast(id);
      });
    }
  }

  renderInner(title, options);
  toasterEl.appendChild(li);

  // Momentum-based swipe-to-dismiss (`emil-design-eng` §Momentum-based dismissal: velocity > 0.11)
  let dragStartY = 0;
  let dragStartTime = 0;
  let currentY = 0;
  let isDragging = false;

  li.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    if (isDragging) return; // Multi-touch protection
    isDragging = true;
    dragStartY = e.clientY;
    dragStartTime = performance.now();
    currentY = 0;
    li.setPointerCapture(e.pointerId);
    li.style.transition = 'none';
  });

  li.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    const rawDelta = e.clientY - dragStartY;
    // Damping at upward boundary (friction instead of hard stop)
    currentY = rawDelta < 0 ? rawDelta * 0.25 : rawDelta;
    li.style.transform = `translateY(${currentY}px)`;
  });

  function endDrag() {
    if (!isDragging) return;
    isDragging = false;
    li.style.transition = '';
    const elapsed = Math.max(1, performance.now() - dragStartTime);
    const velocity = Math.abs(currentY) / elapsed;
    if (currentY > 36 || (currentY > 8 && velocity > 0.11)) {
      dismissToast(id);
    } else {
      li.style.transform = '';
    }
  }

  li.addEventListener('pointerup', endDrag);
  li.addEventListener('pointercancel', endDrag);
  li.addEventListener('lostpointercapture', endDrag);

  // Pause-aware timer
  let remaining = duration;
  let startStamp = performance.now();
  let timerId = null;

  function startTimer() {
    if (duration === Infinity) return;
    clearTimeout(timerId);
    startStamp = performance.now();
    timerId = setTimeout(() => dismissToast(id), remaining);
  }

  function pauseTimer() {
    if (!timerId) return;
    clearTimeout(timerId);
    timerId = null;
    remaining = Math.max(400, remaining - (performance.now() - startStamp));
  }

  li.addEventListener('pointerenter', pauseTimer);
  li.addEventListener('pointerleave', startTimer);

  startTimer();

  activeToasts.set(id, {
    el: li,
    pause: pauseTimer,
    resume: startTimer,
    update(newTitle, newOpts = {}) {
      li.className = `sonner-toast sonner-${newOpts.type || type}`;
      renderInner(newTitle, newOpts);
      remaining = newOpts.duration ?? duration;
      startTimer();
    },
  });

  return id;
}

export function dismissToast(id) {
  const entry = activeToasts.get(id);
  if (!entry) return;
  entry.pause();
  activeToasts.delete(id);
  entry.el.setAttribute('data-ending-style', '');
  setTimeout(() => {
    entry.el.remove();
  }, 180);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
