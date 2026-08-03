import { describe, expect, it } from 'vitest';
import {
  PASSIVE_RESOURCE_PER_SECOND,
  getEnemyDefeatReward,
} from '../src/game/enemyRewards';

describe('enemy rewards', () => {
  it('provides five passive resources each second', () => {
    expect(PASSIVE_RESOURCE_PER_SECOND).toBe(5);
  });

  it('increases a bounty for tougher or faster enemies', () => {
    const baseline = getEnemyDefeatReward({ maxHealth: 100, speed: 0.5 });

    expect(getEnemyDefeatReward({ maxHealth: 140, speed: 0.5 })).toBeGreaterThan(
      baseline,
    );
    expect(getEnemyDefeatReward({ maxHealth: 100, speed: 0.7 })).toBeGreaterThan(
      baseline,
    );
    expect(getEnemyDefeatReward({ maxHealth: 208, speed: 0.7 })).toBe(17);
  });

  it('always returns a whole nonnegative reward and safely rejects bad traits', () => {
    expect(getEnemyDefeatReward({ maxHealth: 100, speed: 0.5 })).toBe(10);
    expect(Number.isInteger(getEnemyDefeatReward({ maxHealth: 123, speed: 0.57 }))).toBe(
      true,
    );

    expect(getEnemyDefeatReward({ maxHealth: 0, speed: 0.5 })).toBe(0);
    expect(getEnemyDefeatReward({ maxHealth: -100, speed: 0.5 })).toBe(0);
    expect(getEnemyDefeatReward({ maxHealth: 100, speed: -0.5 })).toBe(0);
    expect(getEnemyDefeatReward({ maxHealth: Number.NaN, speed: 0.5 })).toBe(0);
    expect(getEnemyDefeatReward({ maxHealth: 100, speed: Number.POSITIVE_INFINITY })).toBe(
      0,
    );
  });
});
