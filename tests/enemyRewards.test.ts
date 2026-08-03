import { describe, expect, it } from 'vitest';
import {
  MAX_WAVE_ENEMY_REWARD_MULTIPLIER,
  PASSIVE_RESOURCE_PER_SECOND,
  getWaveEnemyReward,
} from '../src/game/enemyRewards';

describe('enemy rewards', () => {
  it('provides five passive resources each second', () => {
    expect(PASSIVE_RESOURCE_PER_SECOND).toBe(5);
  });

  it('uses a bounded logarithmic reward curve for wave-scaled health', () => {
    const baseline = getWaveEnemyReward({
      baseReward: 6,
      baseHealth: 100,
      actualHealth: 100,
    });

    expect(baseline).toBe(6);
    expect(
      getWaveEnemyReward({
        baseReward: 6,
        baseHealth: 100,
        actualHealth: 200,
      }),
    ).toBe(9);
    expect(
      getWaveEnemyReward({
        baseReward: 6,
        baseHealth: 100,
        actualHealth: Number.MAX_VALUE,
      }),
    ).toBe(Math.round(6 * MAX_WAVE_ENEMY_REWARD_MULTIPLIER));
  });

  it('never lowers rewards, remains nondecreasing, and safely rejects bad values', () => {
    const healths = [25, 100, 140, 250, 1_000, 100_000];
    const rewards = healths.map((actualHealth) =>
      getWaveEnemyReward({ baseReward: 8, baseHealth: 100, actualHealth }),
    );

    expect(rewards[0]).toBe(8);
    expect(rewards.every((reward, index) => index === 0 || reward >= rewards[index - 1])).toBe(
      true,
    );
    expect(rewards.every(Number.isInteger)).toBe(true);

    expect(
      getWaveEnemyReward({ baseReward: 0, baseHealth: 100, actualHealth: 100 }),
    ).toBe(0);
    expect(
      getWaveEnemyReward({ baseReward: 6, baseHealth: 0, actualHealth: 100 }),
    ).toBe(0);
    expect(
      getWaveEnemyReward({ baseReward: 6, baseHealth: 100, actualHealth: 0 }),
    ).toBe(0);
    expect(
      getWaveEnemyReward({ baseReward: Number.NaN, baseHealth: 100, actualHealth: 100 }),
    ).toBe(0);
    expect(
      getWaveEnemyReward({
        baseReward: 6,
        baseHealth: Number.POSITIVE_INFINITY,
        actualHealth: 100,
      }),
    ).toBe(0);
  });
});
