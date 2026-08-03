import { describe, expect, it } from 'vitest';
import {
  applyTowerRingDamage,
  getTowerRingDamageMultiplier,
  isBuildableTowerRing,
} from '../src/game/towerRingRules';

describe('tower ring rules', () => {
  it('opens every visible non-base ring for tower placement', () => {
    expect([0, 1, 2, 3, 4, 5].map(isBuildableTowerRing)).toEqual([
      false,
      true,
      true,
      true,
      true,
      false,
    ]);
  });

  it('rewards the four rings with the configured damage multipliers', () => {
    expect([1, 2, 3, 4].map(getTowerRingDamageMultiplier)).toEqual([
      1,
      2,
      5,
      15,
    ]);
  });

  it('scales resolved damage while keeping invalid damage harmless', () => {
    expect(applyTowerRingDamage(18, 1)).toBe(18);
    expect(applyTowerRingDamage(18, 2)).toBe(36);
    expect(applyTowerRingDamage(18, 3)).toBe(90);
    expect(applyTowerRingDamage(18, 4)).toBe(270);
    expect(applyTowerRingDamage(Number.NaN, 4)).toBe(0);
  });
});
