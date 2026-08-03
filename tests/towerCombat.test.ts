import { describe, expect, it } from 'vitest';
import { hyperbolicRadiusToPoincare, type Vec2 } from '../src/math/hyperbolic';
import {
  resolveTowerCombat,
  type CombatEnemy,
  type CombatTower,
} from '../src/game/towerCombat';

function pointAt(radius: number, angle = 0): Vec2 {
  const diskRadius = hyperbolicRadiusToPoincare(radius);
  return {
    x: diskRadius * Math.cos(angle),
    y: diskRadius * Math.sin(angle),
  };
}

function tower(kind: CombatTower['kind'], position = pointAt(1)): CombatTower {
  return { kind, level: 1, position };
}

function enemy(id: string, position: Vec2): CombatEnemy {
  return { id, position };
}

describe('tower combat', () => {
  it('targets only the outward H² fan for a sector tower', () => {
    const result = resolveTowerCombat(tower('sector'), [
      enemy('outward', pointAt(1.9)),
      enemy('inward', pointAt(0.3)),
      enemy('side', pointAt(1.4, Math.PI / 2)),
      enemy('far', pointAt(3.5)),
    ]);

    expect(result.targetIds).toEqual(['outward']);
    expect(result.effects).toEqual([
      expect.objectContaining({ enemyId: 'outward', damage: expect.any(Number) }),
    ]);
  });

  it('selects the nearest-to-base prism primary then pierces its forward H² geodesic', () => {
    const result = resolveTowerCombat(tower('prism'), [
      enemy('middle-inline', pointAt(0.7)),
      enemy('primary', pointAt(0.4)),
      enemy('off-line', pointAt(1.1, Math.PI / 2)),
    ]);

    expect(result.targetIds[0]).toBe('primary');
    expect(result.targetIds).toContain('middle-inline');
    expect(result.targetIds).not.toContain('off-line');
  });

  it('uses an H² circle rather than a disk-space circle for pulse damage', () => {
    const result = resolveTowerCombat(tower('pulse'), [
      enemy('inside', pointAt(1.4)),
      enemy('outside', pointAt(3.2)),
    ]);

    expect(result.targetIds).toEqual(['inside']);
  });

  it('returns slow metadata for every enemy in an anchor H² circle', () => {
    const result = resolveTowerCombat(tower('anchor'), [
      enemy('near', pointAt(1.25)),
      enemy('far', pointAt(3.5)),
    ]);

    expect(result.targetIds).toEqual(['near']);
    expect(result.effects[0]).toMatchObject({
      enemyId: 'near',
      slow: {
        multiplier: expect.any(Number),
        durationSeconds: expect.any(Number),
      },
    });
  });

  it('starts an arc at the nearest-to-base enemy and follows H²-nearest hops', () => {
    const result = resolveTowerCombat(tower('arc'), [
      enemy('primary', pointAt(0.45)),
      enemy('nearest-hop', pointAt(0.8, 0.04)),
      enemy('second-hop', pointAt(1.1, 0.04)),
      enemy('distant', pointAt(1.5, Math.PI)),
    ]);

    expect(result.targetIds[0]).toBe('primary');
    expect(result.targetIds).toContain('nearest-hop');
    expect(result.targetIds).not.toContain('distant');
    expect(result.effects.every((effect) => Number.isInteger(effect.damage))).toBe(
      true,
    );
  });

  it('does not mutate its input enemy collection or resolve duplicate IDs twice', () => {
    const enemies = [
      enemy('same', pointAt(1.2)),
      enemy('same', pointAt(1.3)),
    ];
    const before = structuredClone(enemies);

    const result = resolveTowerCombat(tower('pulse'), enemies);

    expect(enemies).toEqual(before);
    expect(result.targetIds).toEqual(['same']);
  });
});
