import * as THREE from "three";

/**
 * Airflow Particle System using a single InstancedMesh (1 draw call, zero per-frame allocations).
 * Particles enter through the bottom/side intake vents, swirl through the dual centrifugal fans,
 * and exit out the rear fin stacks, shifting color from cool blue intake to warm amber/red exhaust.
 */
export function createAirflowParticles(count = 140) {
  const geometry = new THREE.BoxGeometry(0.035, 0.018, 0.14);
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  });

  const instancedMesh = new THREE.InstancedMesh(geometry, material, count);
  instancedMesh.frustumCulled = false;

  // Per-particle state stored in typed arrays (zero GC pressure)
  const phases = new Float32Array(count);
  const lanes = new Float32Array(count); // -1 for left fan/exhaust, +1 for right fan/exhaust
  const offsets = new Float32Array(count);

  const dummyMatrix = new THREE.Matrix4();
  const dummyPosition = new THREE.Vector3();
  const dummyQuaternion = new THREE.Quaternion();
  const dummyScale = new THREE.Vector3(1, 1, 1);
  const dummyEuler = new THREE.Euler();
  const scratchColor = new THREE.Color();
  const coolColor = new THREE.Color(0x38bdf8);
  const warmColor = new THREE.Color(0xf59e0b);
  const hotColor = new THREE.Color(0xef4444);

  for (let i = 0; i < count; i++) {
    phases[i] = i / count;
    lanes[i] = i % 2 === 0 ? -1 : 1;
    offsets[i] = ((i * 7) % 13) / 13 - 0.5;
    instancedMesh.setColorAt(i, coolColor);
  }
  instancedMesh.instanceColor.needsUpdate = true;

  function update(simState, explodeFactor, delta, reducedMotion = false) {
    if (reducedMotion) {
      instancedMesh.visible = false;
      return;
    }
    instancedMesh.visible = true;

    const rpm = simState?.fanRpm ?? 2400;
    const cpuTemp = simState?.components?.cpu?.temp ?? 42;
    const gpuTemp = simState?.components?.gpu?.temp ?? 40;
    const avgCoreTemp = (cpuTemp + gpuTemp) * 0.5;
    const heatNorm = THREE.MathUtils.clamp((avgCoreTemp - 30) / 65, 0, 1);

    // Speed scales with fan RPM (from 0.35 cycles/sec at 1500 RPM to 1.65 cycles/sec at 6200 RPM)
    const speed = THREE.MathUtils.mapLinear(rpm, 1000, 6500, 0.32, 1.65);
    const layerY = 0.32 + explodeFactor * 1.05;

    for (let i = 0; i < count; i++) {
      phases[i] = (phases[i] + delta * speed) % 1.0;
      const p = phases[i];
      const side = lanes[i]; // -1 left, +1 right
      const spread = offsets[i] * 0.55;

      let x = side * 1.95 + spread;
      let y = layerY;
      let z = 0;
      let yaw = 0;

      if (p < 0.45) {
        // Intake phase: rising from front/underneath toward the fan hub
        const t = p / 0.45;
        z = THREE.MathUtils.lerp(0.25, -0.88, t);
        y = layerY - (1 - t) * 0.25;
        yaw = side * (1 - t) * 0.25;
      } else {
        // Exhaust phase: pushed through fin stack out the rear (-Z)
        const t = (p - 0.45) / 0.55;
        z = THREE.MathUtils.lerp(-0.88, -2.45, t);
        x = side * (1.88 + t * 0.15) + spread * 0.85;
        y = layerY + t * 0.08;
        yaw = 0;
      }

      dummyPosition.set(x, y, z);
      dummyEuler.set(0, yaw, 0);
      dummyQuaternion.setFromEuler(dummyEuler);
      const lengthScale = 0.7 + (rpm / 6000) * 0.8;
      dummyScale.set(1, 1, lengthScale);

      dummyMatrix.compose(dummyPosition, dummyQuaternion, dummyScale);
      instancedMesh.setMatrixAt(i, dummyMatrix);

      // Color shifts from intake blue (p < 0.45) to exhaust temp color (p >= 0.45)
      const exhaustBlend = THREE.MathUtils.smoothstep(p, 0.35, 0.75);
      if (heatNorm < 0.5) {
        scratchColor.copy(coolColor).lerp(warmColor, exhaustBlend * (heatNorm * 2));
      } else {
        scratchColor
          .copy(coolColor)
          .lerp(warmColor, exhaustBlend)
          .lerp(hotColor, exhaustBlend * ((heatNorm - 0.5) * 2));
      }
      instancedMesh.setColorAt(i, scratchColor);
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    instancedMesh.instanceColor.needsUpdate = true;
  }

  return {
    mesh: instancedMesh,
    update,
  };
}
