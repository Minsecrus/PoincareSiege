import { describe, expect, it } from 'vitest';
import {
  ENEMY_KINDS,
  ENEMY_TYPE_CATALOG,
  getEligibleEnemyKinds,
  getEnemySpawnCount,
  getEnemyType,
  isEnemyKind,
  isEnemyTypeEligibleForWave,
  selectEnemyKindForWave,
} from '../src/game/enemyTypes';

describe('enemy type catalog', () => {
  it('contains the baseline and all five planned enemy families', () => {
    expect(ENEMY_KINDS).toEqual([
      'basic',
      'swarm',
      'armored',
      'splitter',
      'raider',
      'boss',
    ]);
    expect(Object.keys(ENEMY_TYPE_CATALOG)).toEqual([...ENEMY_KINDS]);
  });

  it('keeps each family speed and base health fixed for the wave planner', () => {
    const basic = getEnemyType('basic');
    const raider = getEnemyType('raider');
    const armored = getEnemyType('armored');
    const boss = getEnemyType('boss');

    expect(basic.speed).toBe(0.1);
    expect(raider.speed).toBe(0.15);
    expect(armored.speed).toBe(0.055);
    expect(boss.speed).toBe(0.04);
    expect(basic.baseHealth).toBe(100);
    expect(raider.baseHealth).toBe(82);
    expect(armored.baseHealth).toBe(260);
    expect(boss.baseHealth).toBe(1_000);
    expect(basic).not.toHaveProperty('healthPerWave');
  });

  it('offers a complete render and gameplay profile for every family', () => {
    for (const kind of ENEMY_KINDS) {
      const enemy = getEnemyType(kind);

      expect(enemy.speed).toBeGreaterThan(0);
      expect(enemy.baseHealth).toBeGreaterThan(0);
      expect(enemy.contactDamage).toBeGreaterThan(0);
      expect(enemy.reward).toBeGreaterThan(0);
      expect(enemy.spawn.weight).toBeGreaterThan(0);
      expect(enemy.spawn.countMultiplier).toBeGreaterThan(0);
      expect(enemy.visual.model).toBeTruthy();
      expect(enemy.visual.modelScale).toBeGreaterThan(0);
      expect(enemy.visual.palette.body).toBeGreaterThan(0);
    }
  });

  it('exposes splitter children without attaching the rule to other families', () => {
    expect(getEnemyType('splitter').onDefeat).toEqual({
      kind: 'spawn-children',
      childKind: 'swarm',
      count: 2,
      healthMultiplier: 0.5,
    });
    expect(getEnemyType('basic').onDefeat).toBeUndefined();
  });

  it('gates special families by their intended first and milestone waves', () => {
    expect(getEligibleEnemyKinds(1)).toEqual(['basic']);
    expect(getEligibleEnemyKinds(3)).toEqual(['basic', 'swarm', 'armored']);
    expect(isEnemyTypeEligibleForWave('boss', 4)).toBe(false);
    expect(isEnemyTypeEligibleForWave('boss', 5)).toBe(true);
    expect(isEnemyTypeEligibleForWave('boss', 6)).toBe(false);
    expect(isEnemyTypeEligibleForWave('boss', 10)).toBe(true);
  });

  it('makes population intent usable by a wave planner', () => {
    expect(getEnemySpawnCount('swarm', 10)).toBe(16);
    expect(getEnemySpawnCount('armored', 10)).toBe(5);
    expect(getEnemySpawnCount('boss', 10)).toBe(1);
    expect(getEnemySpawnCount('basic', 0)).toBe(0);
    expect(getEnemySpawnCount('basic', Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('validates keys, clones accessors, and picks eligible weighted families', () => {
    expect(isEnemyKind('splitter')).toBe(true);
    expect(isEnemyKind('not-an-enemy')).toBe(false);
    expect(isEnemyKind(null)).toBe(false);

    const first = getEnemyType('basic');
    Reflect.set(first.visual.palette, 'body', 0);
    expect(getEnemyType('basic').visual.palette.body).toBe(0xff3d63);

    expect(selectEnemyKindForWave(1, 0.75)).toBe('basic');
    expect(selectEnemyKindForWave(5, Number.NaN)).toBe('basic');
    expect(selectEnemyKindForWave(5, 1)).toBe('boss');
  });
});
