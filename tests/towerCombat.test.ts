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

function enemy(id: string, position: Vec2, health?: number): CombatEnemy {
  return { id, position, health };
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

  it('sniper attacks exactly one highest-health enemy in H² range', () => {
    const result = resolveTowerCombat(tower('sniper', { x: 0, y: 0 }), [
      enemy('low', pointAt(1.1), 80),
      enemy('highest', pointAt(2.8), 600),
      enemy('outside-range', pointAt(4.4), 9_000),
      enemy('middle', pointAt(1.8), 340),
    ]);

    expect(result.targetIds).toEqual(['highest']);
    expect(result.effects).toEqual([{ enemyId: 'highest', damage: 115 }]);
  });

  it('sniper resolves equal-health targets by H² distance, then ID', () => {
    const fromOrigin = tower('sniper', { x: 0, y: 0 });
    const byDistance = resolveTowerCombat(fromOrigin, [
      enemy('far', pointAt(1.7), 300),
      enemy('near', pointAt(0.7), 300),
    ]);
    const byId = resolveTowerCombat(fromOrigin, [
      enemy('zeta', pointAt(1.2, Math.PI / 2), 300),
      enemy('alpha', pointAt(1.2, 0), 300),
    ]);

    expect(byDistance.targetIds).toEqual(['near']);
    expect(byId.targetIds).toEqual(['alpha']);
  });

  it('support tower deals low damage to every enemy in its H² range', () => {
    const result = resolveTowerCombat(
      tower('support', { x: 0, y: 0 }),
      [
        enemy('near', pointAt(0.4)),
        enemy('edge', pointAt(1.45)),
        enemy('outside', pointAt(1.5)),
      ],
    );

    expect(result.targetIds).toEqual(['near', 'edge']);
    expect(result.effects).toEqual([
      { enemyId: 'near', damage: 6 },
      { enemyId: 'edge', damage: 6 },
    ]);
  });

  it('bulwark sends a deliberately weak shielding pulse through its taunt range', () => {
    const result = resolveTowerCombat(
      tower('bulwark', { x: 0, y: 0 }),
      [
        enemy('near', pointAt(0.4)),
        enemy('edge', pointAt(0.78)),
        enemy('outside', pointAt(0.82)),
      ],
    );

    expect(result.targetIds).toEqual(['near', 'edge']);
    expect(result.effects).toEqual([
      { enemyId: 'near', damage: 1 },
      { enemyId: 'edge', damage: 1 },
    ]);
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
