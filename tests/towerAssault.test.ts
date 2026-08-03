import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TOWER_ASSAULT_RANGE,
  getTowerAssaultProfile,
  resolveTowerAssault,
  type TowerAssaultEnemy,
  type TowerAssaultTower,
} from '../src/game/towerAssault';
import { hyperbolicRadiusToPoincare, type Vec2 } from '../src/math/hyperbolic';

function pointAt(radius: number, angle = 0): Vec2 {
  const diskRadius = hyperbolicRadiusToPoincare(radius);
  return {
    x: diskRadius * Math.cos(angle),
    y: diskRadius * Math.sin(angle),
  };
}

function enemy(contactDamage = 125): TowerAssaultEnemy {
  return {
    id: 'enemy',
    position: pointAt(1),
    contactDamage,
  };
}

function tower(
  id: string,
  position: Vec2,
  health?: number,
): TowerAssaultTower {
  return health === undefined ? { id, position } : { id, position, health };
}

describe('tower assault', () => {
  it('stops beside the nearest living tower using an H² engagement range', () => {
    const result = resolveTowerAssault(enemy(), [
      tower('far', pointAt(1 + DEFAULT_TOWER_ASSAULT_RANGE * 0.9)),
      tower('near', pointAt(1 + DEFAULT_TOWER_ASSAULT_RANGE * 0.3)),
      // This point is close in the Poincare drawing near the rim but outside
      // the authored H² range, proving the resolver is not disk-Euclidean.
      tower('outside', pointAt(1 + DEFAULT_TOWER_ASSAULT_RANGE + 0.03)),
    ]);

    expect(result.shouldPauseMovement).toBe(true);
    expect(result.target).toEqual({
      towerId: 'near',
      distance: expect.closeTo(DEFAULT_TOWER_ASSAULT_RANGE * 0.3, 8),
    });
    expect(result.attack).toMatchObject({
      targetTowerId: 'near',
      damage: 25,
      intervalSeconds: expect.any(Number),
    });
  });

  it('breaks an equal-distance target tie by tower id, independent of input order', () => {
    const candidates = [
      tower('zeta', pointAt(1.1, 0.05)),
      tower('alpha', pointAt(1.1, -0.05)),
    ];

    const result = resolveTowerAssault(enemy(), candidates, {
      engagementRange: 0.3,
    });

    expect(result.target?.towerId).toBe('alpha');
  });

  it('does not stop for a destroyed tower and returns no attack when none remain nearby', () => {
    const result = resolveTowerAssault(enemy(), [
      tower('destroyed', pointAt(1.05), 0),
      tower('dead-negative', pointAt(1.06), -10),
      tower('distant', pointAt(1.8), 100),
    ]);

    expect(result).toEqual({
      target: null,
      shouldPauseMovement: false,
      attack: null,
    });
  });

  it('derives integer hit damage and a capped faster cadence from contact damage', () => {
    const swarm = getTowerAssaultProfile(48);
    const boss = getTowerAssaultProfile(500);

    expect(swarm).toEqual({
      damage: 10,
      intervalSeconds: expect.closeTo(1.0819, 3),
    });
    expect(boss).toEqual({
      damage: 100,
      intervalSeconds: expect.closeTo(0.8398, 3),
    });
    expect(boss?.intervalSeconds).toBeLessThan(swarm?.intervalSeconds ?? Infinity);
    expect(getTowerAssaultProfile(0)).toBeNull();
    expect(getTowerAssaultProfile(Number.NaN)).toBeNull();
  });

  it('never pauses an invalid or non-damaging enemy', () => {
    const target = tower('tower', pointAt(1.05), 100);

    expect(resolveTowerAssault(enemy(0), [target]).shouldPauseMovement).toBe(
      false,
    );
    expect(
      resolveTowerAssault(
        { id: 'enemy', position: { x: 1, y: 0 }, contactDamage: 125 },
        [target],
      ).shouldPauseMovement,
    ).toBe(false);
  });

  it('does not mutate caller-owned enemy or tower state', () => {
    const sourceEnemy = enemy();
    const sourceTowers = [
      tower('near', pointAt(1.05), 100),
      tower('far', pointAt(1.2), 100),
    ];
    const beforeEnemy = structuredClone(sourceEnemy);
    const beforeTowers = structuredClone(sourceTowers);

    resolveTowerAssault(sourceEnemy, sourceTowers);

    expect(sourceEnemy).toEqual(beforeEnemy);
    expect(sourceTowers).toEqual(beforeTowers);
  });
});
