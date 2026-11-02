import * as THREE from "three";
import { createHeatmapMaterial, createDieLabelTexture } from "./heatmapMaterial.js";

/**
 * Builds the 3D exploded laptop assembly from reusable BufferGeometries.
 * Follows `3d-studio` §2.3 & `threejs-geometry` / `threejs-performance`:
 * - Pose (explode factor & fan rotation) is a pure function of state.
 * - Uses InstancedMesh for the 48 cooling fins (1 draw call).
 * - Assigns pickable thermal components to Raycaster Layer 1 (`layers.enable(1)`).
 */
export function createLaptopAssembly() {
  const root = new THREE.Group();
  root.name = "LaptopAssembly";

  // Shared non-thermal PBR materials (reused across parts)
  const chassisMat = new THREE.MeshStandardMaterial({
    color: 0x1e222a,
    roughness: 0.45,
    metalness: 0.65,
  });
  const bezelMat = new THREE.MeshStandardMaterial({
    color: 0x0d1017,
    roughness: 0.35,
    metalness: 0.2,
  });
  const screenMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    emissive: 0x0ea5e9,
    emissiveIntensity: 0.14,
    roughness: 0.2,
    metalness: 0.1,
  });
  const pcbMat = new THREE.MeshStandardMaterial({
    color: 0x0b2e25,
    roughness: 0.55,
    metalness: 0.25,
  });
  const copperMat = new THREE.MeshStandardMaterial({
    color: 0xd97742,
    roughness: 0.25,
    metalness: 0.88,
  });
  const finMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.3,
    metalness: 0.85,
  });
  const fanHousingMat = new THREE.MeshStandardMaterial({
    color: 0x181b22,
    roughness: 0.5,
    metalness: 0.4,
  });
  const fanBladeMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    roughness: 0.35,
    metalness: 0.5,
  });

  // 1. Lower Chassis Unibody Tray (Layer 0)
  const baseGroup = new THREE.Group();
  const baseTrayGeo = new THREE.BoxGeometry(5.6, 0.16, 3.8);
  const baseTray = new THREE.Mesh(baseTrayGeo, chassisMat);
  baseTray.receiveShadow = true;
  baseGroup.add(baseTray);

  // Subtle rubber feet
  const footGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.06, 16);
  const footPositions = [
    [-2.4, -0.1, -1.5],
    [2.4, -0.1, -1.5],
    [-2.4, -0.1, 1.5],
    [2.4, -0.1, 1.5],
  ];
  for (const [fx, fy, fz] of footPositions) {
    const foot = new THREE.Mesh(footGeo, bezelMat);
    foot.position.set(fx, fy, fz);
    foot.matrixAutoUpdate = false;
    foot.updateMatrix();
    baseGroup.add(foot);
  }
  root.add(baseGroup);

  // 2. Display Lid Assembly (Hinged at rear Z = -1.9)
  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, 0.12, -1.9);

  const lidPanel = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.1, 3.75), chassisMat);
  lidPanel.position.set(0, 1.85, -0.05);
  lidPanel.rotation.x = Math.PI / 2 - 0.22; // ~102 deg open angle
  lidPanel.castShadow = true;
  lidPivot.add(lidPanel);

  const displayGlass = new THREE.Mesh(new THREE.PlaneGeometry(5.25, 3.35), screenMat);
  displayGlass.position.set(0, 1.85, 0.01);
  displayGlass.rotation.x = -0.22;
  lidPivot.add(displayGlass);
  root.add(lidPivot);

  // 3. Main Motherboard Layer
  const moboGroup = new THREE.Group();
  const moboPlate = new THREE.Mesh(new THREE.BoxGeometry(4.9, 0.06, 2.35), pcbMat);
  moboPlate.position.set(0, 0.14, -0.45);
  moboPlate.receiveShadow = true;
  moboGroup.add(moboPlate);
  root.add(moboGroup);

  // 4. Interactive Thermal Components (Pickable on Layer 1)
  const componentGroup = new THREE.Group();
  const pickables = [];
  const componentMeshes = {};
  const componentMaterials = {};

  function registerThermalComponent({
    id,
    name,
    subtitle,
    geometry,
    position,
    throttleTemp,
    baseColor = 0x1e293b,
  }) {
    const labelTex = createDieLabelTexture(name, subtitle);
    const mat = createHeatmapMaterial({
      baseColor,
      initialTemp: 36,
      throttleTemp,
      labelTexture: labelTex,
    });

    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(position[0], position[1], position[2]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.layers.enable(1); // Layer 1 for fast Raycaster picking while staying on Layer 0 for camera
    mesh.userData = {
      componentId: id,
      displayName: name,
      baseY: position[1],
    };

    componentGroup.add(mesh);
    pickables.push(mesh);
    componentMeshes[id] = mesh;
    componentMaterials[id] = mat;
    return mesh;
  }

  // CPU Package (Left-center of motherboard)
  registerThermalComponent({
    id: "cpu",
    name: "CPU",
    subtitle: "Core Package",
    geometry: new THREE.BoxGeometry(0.92, 0.12, 0.78),
    position: [-0.85, 0.24, -0.55],
    throttleTemp: 95,
  });

  // GPU Die (Right-center of motherboard)
  registerThermalComponent({
    id: "gpu",
    name: "GPU",
    subtitle: "Graphics Core",
    geometry: new THREE.BoxGeometry(1.12, 0.12, 0.88),
    position: [0.85, 0.24, -0.55],
    throttleTemp: 87,
  });

  // VRM Power Stages (Between & above CPU/GPU near heatpipes)
  registerThermalComponent({
    id: "vrm",
    name: "VRM",
    subtitle: "Power Stages",
    geometry: new THREE.BoxGeometry(2.4, 0.1, 0.36),
    position: [0.0, 0.23, -1.22],
    throttleTemp: 105,
  });

  // Dual-Channel SO-DIMM / LPDDR5X RAM Module Pair (Center-front of board)
  registerThermalComponent({
    id: "ram",
    name: "RAM",
    subtitle: "Memory Bus",
    geometry: new THREE.BoxGeometry(1.35, 0.1, 0.58),
    position: [-0.15, 0.23, 0.22],
    throttleTemp: 85,
  });

  // M.2 NVMe 2280 SSD (Left front bay)
  registerThermalComponent({
    id: "ssd",
    name: "SSD",
    subtitle: "NVMe PCIe 4.0",
    geometry: new THREE.BoxGeometry(0.56, 0.09, 1.42),
    position: [-1.85, 0.22, 0.05],
    throttleTemp: 78,
  });

  // Lithium-Ion Battery Pack (Front palmrest span)
  registerThermalComponent({
    id: "battery",
    name: "BATTERY",
    subtitle: "76–99 Wh Li-Ion",
    geometry: new THREE.BoxGeometry(3.85, 0.18, 1.05),
    position: [0.25, 0.2, 1.18],
    throttleTemp: 60,
  });

  root.add(componentGroup);

  // 5. Thermal Assembly: Dual Copper Heatpipes + Fin Stacks + Dual Fans
  const coolingGroup = new THREE.Group();

  // Primary heatpipe spanning Left Exhaust -> CPU -> VRM -> GPU -> Right Exhaust
  const pipeCurve1 = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-2.35, 0.36, -1.35),
    new THREE.Vector3(-0.85, 0.36, -0.62),
    new THREE.Vector3(0.0, 0.36, -0.82),
    new THREE.Vector3(0.85, 0.36, -0.62),
    new THREE.Vector3(2.35, 0.36, -1.35),
  ]);
  const pipeCurve2 = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-2.35, 0.36, -1.12),
    new THREE.Vector3(-0.85, 0.36, -0.42),
    new THREE.Vector3(0.85, 0.36, -0.42),
    new THREE.Vector3(2.35, 0.36, -1.12),
  ]);

  const pipeMesh1 = new THREE.Mesh(new THREE.TubeGeometry(pipeCurve1, 40, 0.055, 12, false), copperMat);
  const pipeMesh2 = new THREE.Mesh(new THREE.TubeGeometry(pipeCurve2, 40, 0.05, 12, false), copperMat);
  pipeMesh1.castShadow = true;
  pipeMesh2.castShadow = true;
  coolingGroup.add(pipeMesh1, pipeMesh2);

  // InstancedMesh for 48 radiator cooling fins (24 left exhaust, 24 right exhaust) - 1 draw call
  const finCount = 48;
  const finGeo = new THREE.BoxGeometry(0.02, 0.18, 0.42);
  const finInstanced = new THREE.InstancedMesh(finGeo, finMat, finCount);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 24; i++) {
    // Left heatsink fin array
    dummy.position.set(-2.35 + i * 0.042, 0.36, -1.48);
    dummy.updateMatrix();
    finInstanced.setMatrixAt(i, dummy.matrix);

    // Right heatsink fin array
    dummy.position.set(1.38 + i * 0.042, 0.36, -1.48);
    dummy.updateMatrix();
    finInstanced.setMatrixAt(24 + i, dummy.matrix);
  }
  finInstanced.instanceMatrix.needsUpdate = true;
  finInstanced.computeBoundingSphere();
  coolingGroup.add(finInstanced);

  // Dual Centrifugal Fans (Left CPU Fan, Right GPU Fan)
  const fanRotors = [];
  function createFanUnit(xPos) {
    const fanUnit = new THREE.Group();
    fanUnit.position.set(xPos, 0.32, -0.88);

    // Outer shroud ring
    const shroud = new THREE.Mesh(new THREE.RingGeometry(0.46, 0.58, 32), fanHousingMat);
    shroud.rotation.x = -Math.PI / 2;
    fanUnit.add(shroud);

    // Rotating hub + blades group
    const rotor = new THREE.Group();
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.09, 20), fanHousingMat);
    rotor.add(hub);

    const bladeGeo = new THREE.BoxGeometry(0.28, 0.06, 0.025);
    const bladeCount = 11;
    for (let b = 0; b < bladeCount; b++) {
      const angle = (b / bladeCount) * Math.PI * 2;
      const blade = new THREE.Mesh(bladeGeo, fanBladeMat);
      blade.position.set(Math.cos(angle) * 0.29, 0, Math.sin(angle) * 0.29);
      blade.rotation.y = -angle + 0.35;
      blade.matrixAutoUpdate = false;
      blade.updateMatrix();
      rotor.add(blade);
    }

    fanUnit.add(rotor);
    fanRotors.push(rotor);
    return fanUnit;
  }

  coolingGroup.add(createFanUnit(-1.95), createFanUnit(1.95));
  root.add(coolingGroup);

  // 6. Top Keyboard Deck Cover (Semi-translucent / wireframe exploded top shell)
  const topDeckGroup = new THREE.Group();
  const topDeckMat = new THREE.MeshStandardMaterial({
    color: 0x262b36,
    roughness: 0.4,
    metalness: 0.5,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  });
  const topDeckMesh = new THREE.Mesh(new THREE.BoxGeometry(5.56, 0.04, 3.76), topDeckMat);
  const topDeckEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(topDeckMesh.geometry, 15),
    new THREE.LineBasicMaterial({ color: 0x475569, transparent: true, opacity: 0.45 }),
  );
  topDeckGroup.add(topDeckMesh, topDeckEdges);
  root.add(topDeckGroup);

  // State tracking for smooth explode damping
  let currentExplode = 0.65;
  let targetExplode = 0.65;

  /**
   * Updates the 3D assembly purely from simulation state and frame delta.
   * Zero allocations per frame.
   */
  function update(simState, delta, elapsedTime, reducedMotion = false) {
    // 1. Smoothly damp explode factor (or snap immediately if prefers-reduced-motion)
    if (reducedMotion) {
      currentExplode = targetExplode;
    } else {
      currentExplode = THREE.MathUtils.damp(currentExplode, targetExplode, 7.5, delta);
    }

    // Position layers vertically according to currentExplode in [0, 1]
    moboGroup.position.y = currentExplode * 0.22;
    componentGroup.position.y = currentExplode * 0.58;
    coolingGroup.position.y = currentExplode * 1.05;
    topDeckGroup.position.y = 0.26 + currentExplode * 1.55;
    topDeckMat.opacity = THREE.MathUtils.lerp(0.65, 0.16, currentExplode);

    // 2. Spin fan rotors proportional to RPM
    const rpm = simState?.fanRpm ?? 2400;
    const radPerSec = (rpm / 60) * Math.PI * 2 * 0.08; // Visually scaled angular speed so blades don't strobe
    if (!reducedMotion) {
      for (let i = 0; i < fanRotors.length; i++) {
        fanRotors[i].rotation.y += radPerSec * delta * (i === 0 ? 1 : -1);
      }
    }

    // 3. Update component heat-map uniforms & bottleneck pulse
    if (simState && simState.components) {
      const limitingId = simState.bottleneck?.limitingStageId || null;
      const pulseWave = reducedMotion
        ? 0.75
        : (Math.sin(elapsedTime * 7.0) * 0.5 + 0.5) * 0.95;

      for (const id of Object.keys(componentMaterials)) {
        const compState = simState.components[id];
        const mat = componentMaterials[id];
        if (compState && mat) {
          mat.uniforms.uTemp.value = compState.temp;
          mat.uniforms.uThrottleTemp.value = compState.throttleTemp;
          mat.uniforms.uBottleneckPulse.value = limitingId === id ? pulseWave : 0.0;
        }
      }
    }
  }

  function setExplodeTarget(value) {
    targetExplode = THREE.MathUtils.clamp(value, 0, 1);
  }

  function getExplodeTarget() {
    return targetExplode;
  }

  return {
    root,
    pickables,
    componentMeshes,
    componentMaterials,
    update,
    setExplodeTarget,
    getExplodeTarget,
  };
}
