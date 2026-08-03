import { describe, expect, it } from 'vitest';
import {
  SECTOR_TOWER_MAX_LEVEL,
  TOWER_KINDS,
  type TowerKind,
} from '../src/game/towerEconomy';
import {
  SECTOR_TOWER_HEALTH_PER_SEGMENT,
  getSectorTowerHealthSegments,
  getSectorTowerStats,
  getTowerHealthSegments,
  getTowerStats,
} from '../src/game/towerStats';

describe('tower catalog stats', () => {
  it('keeps the sector tower values used by existing gameplay callers', () => {
    const levelOne = getSectorTowerStats(1);
    const levelTwo = getSectorTowerStats(2);
    const levelThree = getSectorTowerStats(SECTOR_TOWER_MAX_LEVEL);

    expect(levelOne).toMatchObject({
      kind: 'sector',
      level: 1,
      maxHealth: 200,
      damage: 18,
      range: 1.5,
      attackMode: 'sector',
    });
    expect(levelOne.attackAngleRadians).toBeCloseTo(Math.PI);
    expect(levelTwo).toMatchObject({
      level: 2,
      maxHealth: 300,
      damage: 30,
      range: 1.8,
    });
    expect(levelTwo.attackAngleRadians).toBeCloseTo((10 * Math.PI) / 9);
    expect(levelThree).toMatchObject({
      level: 3,
      maxHealth: 450,
      damage: 48,
      range: 2.1,
    });
    expect(levelThree.attackAngleRadians).toBeCloseTo((11 * Math.PI) / 9);
  });

  it('defines all five tower families at every level with integral combat values', () => {
    expect(TOWER_KINDS).toEqual([
      'sector',
      'prism',
      'pulse',
      'anchor',
      'arc',
      'sniper',
    ] satisfies readonly TowerKind[]);

    for (const kind of TOWER_KINDS) {
      const levelOne = getTowerStats(kind, 1);
      const levelTwo = getTowerStats(kind, 2);
      const levelThree = getTowerStats(kind, 3);

      expect(levelOne.kind).toBe(kind);
      expect(levelOne.level).toBe(1);
      expect(levelTwo.level).toBe(2);
      expect(levelThree.level).toBe(3);
      expect(levelTwo.maxHealth).toBeGreaterThan(levelOne.maxHealth);
      expect(levelThree.maxHealth).toBeGreaterThan(levelTwo.maxHealth);
      expect(levelTwo.damage).toBeGreaterThan(levelOne.damage);
      expect(levelThree.damage).toBeGreaterThan(levelTwo.damage);

      for (const stats of [levelOne, levelTwo, levelThree]) {
        expect(Number.isInteger(stats.maxHealth)).toBe(true);
        expect(Number.isInteger(stats.damage)).toBe(true);
        expect(stats.range).toBeGreaterThan(0);
        expect(stats.attackIntervalSeconds).toBeGreaterThan(0);
      }
    }
  });

  it('includes attack-mode-specific data needed to resolve every weapon', () => {
    const sector = getTowerStats('sector', 1);
    const prism = getTowerStats('prism', 1);
    const pulse = getTowerStats('pulse', 1);
    const anchor = getTowerStats('anchor', 1);
    const arc = getTowerStats('arc', 1);
    const sniper = getTowerStats('sniper', 1);

    expect(sector).toMatchObject({
      attackMode: 'sector',
      attackAngleRadians: Math.PI,
    });
    expect(prism).toMatchObject({
      attackMode: 'geodesic-beam',
      pierceCount: 2,
      beamWidth: 0.16,
    });
    expect(pulse).toMatchObject({
      attackMode: 'pulse',
      pulseRadius: 1.1,
    });
    expect(anchor).toMatchObject({
      attackMode: 'slow-field',
      slowMultiplier: 0.7,
      slowDurationSeconds: 1.25,
    });
    expect(arc).toMatchObject({
      attackMode: 'chain-arc',
      chainCount: 3,
      chainRange: 0.85,
      chainDamageMultiplier: 0.8,
    });
    expect(sniper).toMatchObject({
      attackMode: 'single-target',
      maxHealth: 130,
      damage: 115,
      range: 3.2,
    });
  });

  it('clamps invalid levels to the same one-to-three range as tower economy', () => {
    for (const kind of TOWER_KINDS) {
      expect(getTowerStats(kind, 0).level).toBe(1);
      expect(getTowerStats(kind, 1.9).level).toBe(1);
      expect(getTowerStats(kind, Number.NaN).level).toBe(1);
      expect(getTowerStats(kind, 99).level).toBe(SECTOR_TOWER_MAX_LEVEL);
    }
  });

  it('turns health into square-pip counts without returning numeric UI state', () => {
    expect(SECTOR_TOWER_HEALTH_PER_SEGMENT).toBe(50);
    expect(getSectorTowerHealthSegments(1, 200)).toEqual({
      totalSegments: 4,
      filledSegments: 4,
    });
    expect(getSectorTowerHealthSegments(2, 149)).toEqual({
      totalSegments: 6,
      filledSegments: 3,
    });
    expect(getTowerHealthSegments('anchor', 3, 1)).toEqual({
      totalSegments: 12,
      filledSegments: 1,
    });
  });

  it('clamps empty, overfull, and invalid health before creating pips', () => {
    expect(getSectorTowerHealthSegments(1, -20)).toEqual({
      totalSegments: 4,
      filledSegments: 0,
    });
    expect(getSectorTowerHealthSegments(1, 1_000)).toEqual({
      totalSegments: 4,
      filledSegments: 4,
    });
    expect(getTowerHealthSegments('arc', 1, Number.NaN)).toEqual({
      totalSegments: 4,
      filledSegments: 0,
    });
  });
});
