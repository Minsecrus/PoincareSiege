import { describe, expect, it } from 'vitest';
import {
  ENEMY_KINDS,
  ENEMY_WAVE_COUNT,
  getEnemyCountForWave,
  getEnemyHealthMultiplierForWave,
  getEnemyWavePlan,
} from '../src/game/enemyWavePlan';
import { getEnemyType } from '../src/game/enemyTypes';

function getWaveHealthBudget(wave: number): number {
  return getEnemyWavePlan(wave).reduce(
    (total, spawn) =>
      total +
      Math.round(getEnemyType(spawn.kind).baseHealth * spawn.healthMultiplier),
    0,
  );
}

function averageWaveHealthBudget(waves: readonly number[]): number {
  return (
    waves.reduce((total, wave) => total + getWaveHealthBudget(wave), 0) /
    waves.length
  );
}

describe('enemy wave plan', () => {
  it('authors a deterministic twenty-wave enemy schedule', () => {
    expect(ENEMY_WAVE_COUNT).toBe(20);
    expect(ENEMY_KINDS).toEqual([
      'basic',
      'swarm',
      'armored',
      'splitter',
      'raider',
      'boss',
    ]);
    expect(Array.from({ length: ENEMY_WAVE_COUNT }, (_, index) =>
      getEnemyCountForWave(index + 1),
    )).toEqual([
      7, 8, 10, 12, 14, 16, 22, 25, 29, 33, 37, 41, 45, 49, 54, 58, 62,
      66, 70, 74,
    ]);
    expect(getEnemyWavePlan(5)).toEqual(getEnemyWavePlan(5));
    expect(getEnemyWavePlan(5)).toBe(getEnemyWavePlan(5));
  });

  it('keeps the first four teaching waves basic-led and introduces new kinds gradually', () => {
    const firstWaveKinds = getEnemyWavePlan(1).map((spawn) => spawn.kind);
    expect(firstWaveKinds).toEqual(Array(7).fill('basic'));

    const firstWaveForKind = Object.fromEntries(
      ENEMY_KINDS.map((kind) => [
        kind,
        Array.from({ length: ENEMY_WAVE_COUNT }, (_, index) => index + 1).find(
          (wave) => getEnemyWavePlan(wave).some((spawn) => spawn.kind === kind),
        ),
      ]),
    );

    expect(firstWaveForKind).toEqual({
      basic: 1,
      swarm: 2,
      armored: 3,
      splitter: 5,
      raider: 5,
      boss: 5,
    });

    for (let wave = 1; wave <= 3; wave += 1) {
      expect(
        new Set(getEnemyWavePlan(wave).map((spawn) => spawn.routeBehavior)),
      ).toEqual(new Set(['direct']));
    }
    expect(getEnemyWavePlan(4).some((spawn) => spawn.routeBehavior === 'flank')).toBe(
      true,
    );
  });

  it('reserves bosses for every fifth-wave milestone', () => {
    const bossWaves = Array.from(
      { length: ENEMY_WAVE_COUNT },
      (_, index) => index + 1,
    ).filter((wave) =>
      getEnemyWavePlan(wave).some((spawn) => spawn.kind === 'boss'),
    );

    expect(bossWaves).toEqual([5, 10, 15, 20]);
    expect(getEnemyWavePlan(5).filter((spawn) => spawn.kind === 'boss')).toHaveLength(1);
    expect(getEnemyWavePlan(10).filter((spawn) => spawn.kind === 'boss')).toHaveLength(1);
    expect(getEnemyWavePlan(15).filter((spawn) => spawn.kind === 'boss')).toHaveLength(1);
    expect(getEnemyWavePlan(20).filter((spawn) => spawn.kind === 'boss')).toHaveLength(1);
  });

  it('scales only health from wave to wave, never an enemy speed value', () => {
    const healthMultipliers = Array.from(
      { length: ENEMY_WAVE_COUNT },
      (_, index) => getEnemyHealthMultiplierForWave(index + 1),
    );
    expect(healthMultipliers.slice(0, 4)).toEqual([1, 1, 1, 1]);
    expect(healthMultipliers.slice(4).every((multiplier) => multiplier > 1)).toBe(
      true,
    );

    for (let wave = 1; wave <= ENEMY_WAVE_COUNT; wave += 1) {
      const plan = getEnemyWavePlan(wave);
      expect(new Set(plan.map((spawn) => spawn.healthMultiplier))).toEqual(
        new Set([getEnemyHealthMultiplierForWave(wave)]),
      );
      for (const spawn of plan) {
        expect('speed' in spawn).toBe(false);
        expect('speedMultiplier' in spawn).toBe(false);
      }
    }
  });

  it('keeps late-wave health durable but bounded for finite tower ranges', () => {
    // Individual units should become tougher, but a tower only gets a finite
    // firing window as an enemy traverses its H² range. Keep the hard cap well
    // below the former 50×+ curve. The additional low-health swarm/basic/
    // raider population and route shapes provide gold and battlefield pressure
    // without increasing armored or boss durability beyond this same cap.
    expect(getEnemyHealthMultiplierForWave(7)).toBe(2.8);
    expect(getEnemyHealthMultiplierForWave(10)).toBe(4.5);
    expect(getEnemyHealthMultiplierForWave(15)).toBe(8);
    expect(getEnemyHealthMultiplierForWave(20)).toBe(12);

    const lateMultipliers = Array.from(
      { length: ENEMY_WAVE_COUNT - 6 },
      (_, index) => getEnemyHealthMultiplierForWave(index + 7),
    );
    expect(lateMultipliers.every((multiplier) => multiplier <= 12)).toBe(true);

    const waveSevenBudget = getWaveHealthBudget(7);
    const earlyPostSevenBudget = averageWaveHealthBudget([8, 9]);
    const middlePostSevenBudget = averageWaveHealthBudget([11, 12, 13, 14]);
    const latePostSevenBudget = averageWaveHealthBudget([16, 17, 18, 19]);

    // Boss milestones 10, 15, and 20 are deliberately excluded: this checks
    // the sustained regular-wave trend instead of requiring a monotonic line.
    expect(earlyPostSevenBudget).toBeGreaterThanOrEqual(waveSevenBudget * 1.5);
    expect(middlePostSevenBudget).toBeGreaterThanOrEqual(waveSevenBudget * 4);
    expect(latePostSevenBudget).toBeGreaterThanOrEqual(waveSevenBudget * 9.5);
  });

  it('assigns stable direct, flank, and zigzag route inputs', () => {
    const routeKinds = new Set(
      Array.from({ length: ENEMY_WAVE_COUNT }, (_, index) =>
        getEnemyWavePlan(index + 1),
      )
        .flat()
        .map((spawn) => spawn.routeBehavior),
    );
    expect(routeKinds).toEqual(new Set(['direct', 'flank', 'zigzag']));

    for (let wave = 1; wave <= ENEMY_WAVE_COUNT; wave += 1) {
      const plan = getEnemyWavePlan(wave);
      expect(new Set(plan.map((spawn) => spawn.routeSeed)).size).toBe(plan.length);
      expect(plan.map((spawn) => spawn.routeSeed)).toEqual(
        plan.map((_, index) => wave * 100 + index),
      );
    }
  });

  it('keeps the first three teaching waves on direct routes', () => {
    for (const wave of [1, 2, 3]) {
      expect(
        getEnemyWavePlan(wave).every(
          (spawn) => spawn.routeBehavior === 'direct',
        ),
      ).toBe(true);
    }
  });

  it('rejects an un-authored wave number', () => {
    expect(() => getEnemyWavePlan(0)).toThrow(RangeError);
    expect(() => getEnemyWavePlan(20.5)).toThrow(RangeError);
    expect(() => getEnemyWavePlan(21)).toThrow(RangeError);
  });
});
