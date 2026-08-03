import { describe, expect, it } from 'vitest';
import {
  WAVE_AUTO_START_DELAY_SECONDS,
  clearWaveTiming,
  createWaveTiming,
  getWaveCountdown,
  isWaveDue,
  scheduleNextWave,
} from '../src/game/waveTiming';

describe('wave timing', () => {
  it('schedules the first wave five simulation seconds after startup', () => {
    expect(WAVE_AUTO_START_DELAY_SECONDS).toBe(5);
    expect(createWaveTiming()).toEqual({ autoStartAt: 5 });
    expect(createWaveTiming(12.5)).toEqual({ autoStartAt: 17.5 });
  });

  it('uses zero as a safe fallback for a malformed startup clock', () => {
    expect(createWaveTiming(Number.NaN)).toEqual({ autoStartAt: 5 });
    expect(createWaveTiming(Number.POSITIVE_INFINITY)).toEqual({
      autoStartAt: 5,
    });
  });

  it('schedules each intermission immutably from its current simulation time', () => {
    const first = createWaveTiming(2);
    const next = scheduleNextWave(first, 10);

    expect(first).toEqual({ autoStartAt: 7 });
    expect(next).toEqual({ autoStartAt: 15 });
    expect(next).not.toBe(first);
  });

  it('clears a pending start immutably', () => {
    const timing = createWaveTiming(0);
    const cleared = clearWaveTiming(timing);

    expect(cleared).toEqual({ autoStartAt: null });
    expect(cleared).not.toBe(timing);
    expect(clearWaveTiming(cleared)).toBe(cleared);
  });

  it('reports a clamped countdown and due state at the target time', () => {
    const timing = createWaveTiming(10);

    expect(getWaveCountdown(timing, 11.25)).toBe(3.75);
    expect(getWaveCountdown(timing, 15)).toBe(0);
    expect(getWaveCountdown(timing, 20)).toBe(0);
    expect(isWaveDue(timing, 14.999)).toBe(false);
    expect(isWaveDue(timing, 15)).toBe(true);
  });

  it('hides inactive or malformed schedules from a bad clock', () => {
    const inactive = clearWaveTiming(createWaveTiming());
    const malformed = { autoStartAt: Number.NaN };

    expect(getWaveCountdown(inactive, 0)).toBeNull();
    expect(getWaveCountdown(malformed, 0)).toBeNull();
    expect(getWaveCountdown(createWaveTiming(), Number.NaN)).toBeNull();
    expect(isWaveDue(inactive, 100)).toBe(false);
    expect(isWaveDue(createWaveTiming(), Number.NEGATIVE_INFINITY)).toBe(false);
  });
});
