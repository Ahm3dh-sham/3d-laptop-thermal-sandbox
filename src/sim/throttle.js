/**
 * @fileoverview Thermal & Power Throttling Controller with Hysteresis.
 * Pure JS module (no Three.js or DOM imports) for deterministic simulation and unit testing.
 *
 * Physics / Engineering Assumptions:
 * 1. Proportional Over-Temperature Throttling (PROCHOT / Dynamic Boost model):
 *    When a silicon die exceeds its thermal threshold (T > T_throttle), the embedded controller (EC)
 *    and SMU/PCU step down the frequency/power multiplier at a rate proportional to the thermal
 *    overshoot:
 *      d(factor)/dt = -k_attack * ((T - T_throttle) / 10 + 0.25)
 *    bounded below by `minFactor` (0.35 = 35% minimum safe operating clock).
 *
 * 2. Hysteresis Recovery Band:
 *    To prevent rapid oscillation ("clock sawtoothing") around the threshold temperature,
 *    clock recovery is inhibited until the component cools below `T_throttle - hysteresisBand`
 *    (default 3.0 °C hysteresis band). Once T < (T_throttle - ΔT_hyst), the multiplier recovers
 *    gradually toward 1.0 at rate `k_recover`:
 *      d(factor)/dt = +k_recover
 *
 * 3. User Power Limit Scaling (PL1 / TGP slider):
 *    Clock frequency scales sub-linearly with power according to the CMOS dynamic power law
 *    (P ∝ C * V^2 * f, where V scales roughly with f, so P ∝ f^2.4 in boost regions, or f ∝ P^0.45).
 */

export const DEFAULT_HYSTERESIS_BAND_C = 3.0;
export const MIN_THROTTLE_FACTOR = 0.35;
export const ATTACK_RATE_PER_SEC = 0.28;
export const RECOVERY_RATE_PER_SEC = 0.16;

/**
 * Creates a fresh throttling state object for a single component.
 * @param {number} throttleTemp - Thermal threshold (°C) where throttling begins.
 * @param {number} [hysteresisBand=DEFAULT_HYSTERESIS_BAND_C] - Cooling band (°C) required before recovery.
 */
export function createThrottleState(throttleTemp, hysteresisBand = DEFAULT_HYSTERESIS_BAND_C) {
  return {
    throttleTemp,
    hysteresisBand,
    thermalFactor: 1.0, // 1.0 = unthrottled, < 1.0 = thermally throttled
    isThrottling: false, // Latches true at T > throttleTemp, clears at T <= throttleTemp - hysteresisBand
    effectivePowerFactor: 1.0,
    effectiveClockFactor: 1.0,
  };
}

/**
 * Advances component throttling state by fixed timestep `dt` (seconds).
 *
 * @param {object} state - Component throttle state created by `createThrottleState`.
 * @param {number} currentTemp - Current component temperature (°C).
 * @param {number} userPowerLimitRatio - User slider ratio (e.g. 0.50 to 1.25, where 1.0 = 100% rated TDP).
 * @param {number} dt - Fixed simulation step in seconds.
 * @returns {object} Mutated `state` for zero-allocation fixed-step updates.
 */
export function stepThrottleState(state, currentTemp, userPowerLimitRatio, dt) {
  const { throttleTemp, hysteresisBand } = state;

  // Formula 1: Hysteresis latch evaluation
  // Enters throttling when T > T_throttle; remains latched until T <= T_throttle - ΔT_hyst.
  if (currentTemp > throttleTemp) {
    state.isThrottling = true;
  } else if (currentTemp <= throttleTemp - hysteresisBand) {
    state.isThrottling = false;
  }

  // Formula 2: Gradual thermal multiplier adjustment
  if ( currentTemp > throttleTemp ) {
    // Active over-temperature: step down clock/power proportional to degrees above threshold
    const overshoot = currentTemp - throttleTemp;
    const stepDownRate = ATTACK_RATE_PER_SEC * (0.3 + overshoot * 0.18);
    state.thermalFactor = Math.max(
      MIN_THROTTLE_FACTOR,
      state.thermalFactor - stepDownRate * dt
    );
  } else if (state.isThrottling) {
    // Inside the hysteresis deadband (T_throttle - ΔT_hyst < T <= T_throttle):
    // Hold current throttle level with a very slight damping drift if right near the top of the band
    const bandProgress = (currentTemp - (throttleTemp - hysteresisBand)) / Math.max(0.1, hysteresisBand);
    if (bandProgress > 0.75) {
      state.thermalFactor = Math.max(
        MIN_THROTTLE_FACTOR,
        state.thermalFactor - 0.03 * dt
      );
    }
  } else if (state.thermalFactor < 1.0) {
    // Below (T_throttle - ΔT_hyst): gradually recover toward 1.0
    state.thermalFactor = Math.min(1.0, state.thermalFactor + RECOVERY_RATE_PER_SEC * dt);
  }

  // Formula 3: Combine thermal throttling with user Power Limit (PL1/TGP) slider
  // Effective power is bounded by the user's power limit * thermal throttle reduction.
  const clampedPowerLimit = Math.max(0.4, Math.min(1.3, userPowerLimitRatio));
  state.effectivePowerFactor = clampedPowerLimit * state.thermalFactor;

  // Formula 4: Voltage-Frequency scaling law (f / f_base ≈ (P / P_base)^0.55 for boost clocks)
  // At 100% power & no thermal throttle, factor = 1.0.
  const powerClockScale = Math.pow(clampedPowerLimit, 0.55);
  state.effectiveClockFactor = Math.max(
    MIN_THROTTLE_FACTOR,
    Math.min(1.12, powerClockScale * state.thermalFactor)
  );

  return state;
}

/**
 * Computes instantaneous clock frequency from base/boost specs, load, and throttle factor.
 *
 * Assumption: Under idle/low load (<15%), modern DVFS parks clocks near baseClock;
 * under active load, clocks target boostClock scaled by `effectiveClockFactor`.
 *
 * @param {number} baseClock - Base frequency (GHz or MHz).
 * @param {number} boostClock - Max boost frequency (GHz or MHz).
 * @param {number} utilization - Component utilization (0.0 to 1.0).
 * @param {number} effectiveClockFactor - Combined thermal + power clock multiplier.
 * @returns {number} Instantaneous operating clock.
 */
export function computeOperatingClock(baseClock, boostClock, utilization, effectiveClockFactor) {
  const activeRamp = Math.min(1.0, Math.max(0.0, utilization * 1.25));
  const targetUnthrottled = baseClock + (boostClock - baseClock) * activeRamp;
  // Thermal throttling can pull frequency below baseClock down to 40% of baseClock in severe overheat
  const minFloor = baseClock * 0.42;
  return Math.max(minFloor, targetUnthrottled * effectiveClockFactor);
}
