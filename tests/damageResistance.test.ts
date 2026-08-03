import { describe, expect, it } from 'vitest';
import {
  applyEnemyDamageResistance,
  getEnemyDamageResistance,
  getTowerDamageType,
  type DamageType,
  type DamageTowerKind,
} from '../src/game/damageResistance';
import { ENEMY_KINDS, type EnemyKind } from '../src/game/enemyTypes';

describe('tower damage types', () => {
  it('maps kinetic and energy tower families exhaustively', () => {
    const expected: Readonly<Record<DamageTowerKind, DamageType>> = {
      sector: 'kinetic',
      sniper: 'kinetic',
      bulwark: 'kinetic',
      prism: 'energy',
      pulse: 'energy',
      anchor: 'energy',
      arc: 'energy',
      support: 'energy',
    };

    for (const [kind, damageType] of Object.entries(expected)) {
      expect(getTowerDamageType(kind as DamageTowerKind)).toBe(damageType);
    }
  });
});

describe('enemy damage resistance', () => {
  it('exposes every authored kinetic and energy resistance', () => {
    const expected: Readonly<
      Record<EnemyKind, readonly [kinetic: number, energy: number]>
    > = {
      basic: [0, 0],
      swarm: [-0.15, 0.2],
      armored: [0.35, -0.15],
      splitter: [0, 0.3],
      raider: [0.25, -0.1],
      boss: [0.15, 0.15],
    };

    for (const kind of ENEMY_KINDS) {
      expect(getEnemyDamageResistance(kind, 'kinetic')).toBe(
        expected[kind][0],
      );
      expect(getEnemyDamageResistance(kind, 'energy')).toBe(expected[kind][1]);
    }
  });

  it('makes pure damage ignore every resistance profile', () => {
    for (const kind of ENEMY_KINDS) {
      expect(getEnemyDamageResistance(kind, 'pure')).toBe(0);
      expect(applyEnemyDamageResistance(100, kind, 'pure')).toBe(100);
    }
  });

  it('reduces resisted damage and increases damage against weaknesses', () => {
    expect(applyEnemyDamageResistance(100, 'armored', 'kinetic')).toBe(65);
    expect(applyEnemyDamageResistance(100, 'armored', 'energy')).toBeCloseTo(
      115,
    );
    expect(applyEnemyDamageResistance(100, 'swarm', 'kinetic')).toBeCloseTo(
      115,
    );
    expect(applyEnemyDamageResistance(100, 'splitter', 'energy')).toBe(70);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'normalizes invalid damage %s to zero',
    (damage) => {
      expect(applyEnemyDamageResistance(damage, 'basic', 'kinetic')).toBe(0);
    },
  );
});
