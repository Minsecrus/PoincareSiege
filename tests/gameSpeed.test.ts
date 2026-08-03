import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GAME_SPEED,
  SUPPORTED_GAME_SPEEDS,
  createGameSpeed,
  cycleGameSpeed,
  isSupportedGameSpeed,
} from '../src/game/gameSpeed';

describe('game speed', () => {
  it('publishes the four supported simulation multipliers', () => {
    expect(SUPPORTED_GAME_SPEEDS).toEqual([1, 2, 3, 6]);
    expect(DEFAULT_GAME_SPEED).toBe(1);
  });

  it('starts at normal speed by default and accepts every supported speed', () => {
    expect(createGameSpeed()).toEqual({ multiplier: 1 });
    expect(createGameSpeed(2)).toEqual({ multiplier: 2 });
    expect(createGameSpeed(3)).toEqual({ multiplier: 3 });
    expect(createGameSpeed(6)).toEqual({ multiplier: 6 });
  });

  it('validates speeds and falls back to normal speed for invalid input', () => {
    expect(isSupportedGameSpeed(1)).toBe(true);
    expect(isSupportedGameSpeed(1.5)).toBe(false);
    expect(isSupportedGameSpeed(0)).toBe(false);
    expect(isSupportedGameSpeed(4)).toBe(false);
    expect(isSupportedGameSpeed(6)).toBe(true);
    expect(isSupportedGameSpeed(Number.NaN)).toBe(false);

    expect(createGameSpeed(0)).toEqual({ multiplier: 1 });
    expect(createGameSpeed(1.5)).toEqual({ multiplier: 1 });
    expect(createGameSpeed(Number.NaN)).toEqual({ multiplier: 1 });
  });

  it('cycles 1x to 2x to 3x to 6x and wraps back to 1x immutably', () => {
    const normal = createGameSpeed();
    const double = cycleGameSpeed(normal);
    const triple = cycleGameSpeed(double);
    const sextuple = cycleGameSpeed(triple);
    const wrapped = cycleGameSpeed(sextuple);

    expect(double).toEqual({ multiplier: 2 });
    expect(triple).toEqual({ multiplier: 3 });
    expect(sextuple).toEqual({ multiplier: 6 });
    expect(wrapped).toEqual({ multiplier: 1 });
    expect(double).not.toBe(normal);
    expect(normal).toEqual({ multiplier: 1 });
  });

  it('recovers a malformed state at normal speed', () => {
    const malformed = { multiplier: 99 } as unknown as ReturnType<
      typeof createGameSpeed
    >;

    expect(cycleGameSpeed(malformed)).toEqual({ multiplier: 1 });
  });
});
