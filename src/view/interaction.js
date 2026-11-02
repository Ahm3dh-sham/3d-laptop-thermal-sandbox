import * as THREE from "three";

/**
 * Layer-1 Raycaster picking & 3D-to-screen projected component tooltip.
 * Follows `threejs-interaction` & `threejs-performance`:
 * - Restricts Raycaster to Layer 1 (`raycaster.layers.set(1)`)
 * - Tests only the explicit `pickables` array (`intersectObjects(pickables, false)`)
 * - Reuses scratch `Vector2` and `Vector3` instances (zero per-frame allocations)
 */
export function createInteractionController({
  canvas,
  camera,
  laptopAssembly,
  tooltipEl,
  onSelectComponent,
}) {
  const raycaster = new THREE.Raycaster();
  raycaster.layers.set(1); // Only test thermal components on Layer 1

  const pointer = new THREE.Vector2();
  const pointerDownPos = new THREE.Vector2();
  const scratchWorldPos = new THREE.Vector3();

  let hoveredId = null;
  let selectedId = "cpu"; // Default selected component so users immediately see live telemetry
  let tooltipAlreadyOpen = false;

  const ttName = document.getElementById("tt-name");
  const ttStatus = document.getElementById("tt-status");
  const ttTemp = document.getElementById("tt-temp");
  const ttClock = document.getElementById("tt-clock");
  const ttLoad = document.getElementById("tt-load");
  const ttThrottle = document.getElementById("tt-throttle");

  function setPointerFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
  }

  function applySelectionUniforms() {
    for (const [id, mat] of Object.entries(laptopAssembly.componentMaterials)) {
      mat.uniforms.uSelected.value = id === selectedId ? 1.0 : 0.0;
      mat.uniforms.uHovered.value = id === hoveredId ? 1.0 : 0.0;
    }
    const chips = document.querySelectorAll(".comp-chip");
    chips.forEach((chip) => {
      chip.classList.toggle("active", chip.dataset.comp === selectedId);
    });
  }

  function selectComponent(id) {
    selectedId = id;
    applySelectionUniforms();
    if (onSelectComponent) onSelectComponent(selectedId);
  }

  canvas.addEventListener("pointermove", (event) => {
    setPointerFromEvent(event);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(laptopAssembly.pickables, false);
    const hitId = hits.length > 0 ? hits[0].object.userData.componentId : null;

    if (hitId !== hoveredId) {
      hoveredId = hitId;
      canvas.style.cursor = hoveredId ? "pointer" : "grab";
      applySelectionUniforms();
    }
  });

  canvas.addEventListener("pointerdown", (event) => {
    pointerDownPos.set(event.clientX, event.clientY);
  });

  canvas.addEventListener("pointerup", (event) => {
    const moveDist = Math.hypot(
      event.clientX - pointerDownPos.x,
      event.clientY - pointerDownPos.y,
    );
    // Distinguish a clean click/tap (< 8px drag) from an OrbitControls drag
    if (moveDist > 8) return;

    setPointerFromEvent(event);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(laptopAssembly.pickables, false);
    if (hits.length > 0) {
      const hitId = hits[0].object.userData.componentId;
      selectComponent(hitId);
    } else {
      selectComponent(null);
    }
  });

  // Wire keyboard / toolbar component chips
  document.querySelectorAll(".comp-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const compId = chip.dataset.comp;
      selectComponent(selectedId === compId ? null : compId);
    });
  });

  applySelectionUniforms();

  /**
   * Projects the active component's 3D world position to 2D canvas coordinates
   * and updates the live DOM tooltip without allocating new Vectors.
   */
  function updateTooltip(simState) {
    const activeId = selectedId || hoveredId;
    if (!activeId || !simState?.components?.[activeId]) {
      tooltipEl.hidden = true;
      tooltipAlreadyOpen = false;
      return;
    }

    const mesh = laptopAssembly.componentMeshes[activeId];
    const comp = simState.components[activeId];
    if (!mesh || !comp) {
      tooltipEl.hidden = true;
      return;
    }

    mesh.getWorldPosition(scratchWorldPos);
    scratchWorldPos.y += 0.22; // Anchor slightly above component top surface
    scratchWorldPos.project(camera);

    // Hide if behind near/far clip planes
    if (scratchWorldPos.z < -1 || scratchWorldPos.z > 1) {
      tooltipEl.hidden = true;
      tooltipAlreadyOpen = false;
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const x = ((scratchWorldPos.x + 1) * 0.5) * rect.width;
    const y = ((-scratchWorldPos.y + 1) * 0.5) * rect.height;

    // `emil-design-eng` §Tooltips: skip delay/animation on subsequent hovers once one tooltip is open
    tooltipEl.toggleAttribute("data-instant", tooltipAlreadyOpen);
    tooltipEl.hidden = false;
    tooltipAlreadyOpen = true;
    tooltipEl.style.left = `${Math.min(Math.max(x, 125), rect.width - 125)}px`;
    tooltipEl.style.top = `${Math.min(Math.max(y, 118), rect.height - 16)}px`;

    ttName.textContent = comp.label;
    ttTemp.textContent = `${comp.temp.toFixed(1)} °C`;
    ttClock.textContent = comp.clockDisplay;
    ttLoad.textContent = `${Math.round(comp.load * 100)}% · ${comp.power.toFixed(1)} W`;
    ttThrottle.textContent = comp.isThrottling
      ? `Throttling (-${Math.round((1 - comp.throttleFactor) * 100)}%)`
      : `Limit ${comp.throttleTemp}°C`;

    if (comp.isThrottling) {
      ttStatus.textContent = "Throttling";
      ttStatus.className = "pill pill-negative";
    } else if (simState.bottleneck?.limitingStageId === activeId) {
      ttStatus.textContent = "Bottleneck";
      ttStatus.className = "pill pill-warning";
    } else {
      ttStatus.textContent = "Nominal";
      ttStatus.className = "pill pill-positive";
    }
  }

  return {
    selectComponent,
    getSelectedComponent: () => selectedId,
    updateTooltip,
  };
}
