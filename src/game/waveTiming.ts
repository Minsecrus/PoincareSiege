/** Delay, in simulation seconds, before an eligible wave begins on its own. */
export const WAVE_AUTO_START_DELAY_SECONDS = 5;

/**
 * UI-agnostic scheduling state for the short interval between waves.
 * `autoStartAt` is measured in simulation time so game-speed changes and
 * pauses are handled by the caller's simulation clock.
 */
export interface WaveTiming {
  readonly autoStartAt: number | null;
}

function toFiniteTime(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function isFiniteTime(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

/** Schedules the first wave, falling back to simulation time zero if needed. */
export function createWaveTiming(now: number = 0): WaveTiming {
  return scheduleNextWave({ autoStartAt: null }, now);
}

/** Returns a new timing state for the next automatic wave start. */
export function scheduleNextWave(timing: WaveTiming, now: number): WaveTiming {
  void timing;

  return {
    autoStartAt: toFiniteTime(now) + WAVE_AUTO_START_DELAY_SECONDS,
  };
}

/** Removes any pending automatic start without changing the input state. */
export function clearWaveTiming(timing: WaveTiming): WaveTiming {
  if (timing.autoStartAt === null) {
    return timing;
  }

  return { autoStartAt: null };
}

/**
 * Gets the remaining simulation seconds, never returning a negative value.
 * Invalid clocks and inactive/malformed schedules are intentionally hidden.
 */
export function getWaveCountdown(
  timing: WaveTiming,
  now: number,
): number | null {
  if (!isFiniteTime(timing.autoStartAt) || !Number.isFinite(now)) {
    return null;
  }

  return Math.max(0, timing.autoStartAt - now);
}

/** Whether an active, valid schedule has reached its simulation-time target. */
export function isWaveDue(timing: WaveTiming, now: number): boolean {
  const countdown = getWaveCountdown(timing, now);

  return countdown === 0;
}
