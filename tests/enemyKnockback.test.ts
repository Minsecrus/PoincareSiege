import { describe, expect, it } from 'vitest';
import {
  createEnemyKnockbackState,
  getEnemyKnockbackPolicy,
  resolveEnemyKindKnockback,
  resolveEnemyKnockback,
} from '../src/game/enemyKnockback';
import {
  hyperbolicDistance,
  hyperbolicRadiusToPoincare,
  type Vec2,
} from '../src/math/hyperbolic';

const CENTER: Vec2 = { x: 0, y: 0 };

function pointAt(radius: number, angle = 0): Vec2 {
  const diskRadius = hyperbolicRadiusToPoincare(radius);
  return {
    x: diskRadius * Math.cos(angle),
    y: diskRadius * Math.sin(angle),
  };
}

describe('enemy knockback', () => {
  it('moves an enemy directly away from the base along its radial H² geodesic', () => {
    const before = pointAt(2.15, 0.71);
    const result = resolveEnemyKindKnockback('basic', {
      position: before,
      requestedDistance: 0.42,
      now: 8,
    });
    const beforeRadius = hyperbolicDistance(CENTER, before);
    const afterRadius = hyperbolicDistance(CENTER, result.position);

    expect(result).toMatchObject({
      applied: true,
      blockedReason: null,
      appliedDistance: expect.closeTo(0.42, 9),
      cappedDistance: expect.closeTo(0.42, 9),
    });
    expect(afterRadius).toBeCloseTo(beforeRadius + 0.42, 9);
    expect(hyperbolicDistance(before, result.position)).toBeCloseTo(0.42, 9);
    // A radial Poincare-disk diameter is the base-centered H² geodesic. The
    // cross product remains zero, while the positive dot product rules out the
    // antipodal ray.
    expect(Math.abs(before.x * result.position.y - before.y * result.position.x)).toBeLessThan(1e-10);
    expect(before.x * result.position.x + before.y * result.position.y).toBeGreaterThan(0);
    expect(result.position.x * result.position.x + result.position.y * result.position.y).toBeLessThan(1);
  });

  it('does not read route progress and simply updates the canonical target position', () => {
    const before = pointAt(1.4, -1.2);
    const result = resolveEnemyKindKnockback('basic', {
      position: before,
      requestedDistance: 0.2,
      now: 3,
    });

    expect(result.position).not.toEqual(before);
    expect(result.position.x).toBeCloseTo(
      hyperbolicRadiusToPoincare(1.6) * Math.cos(-1.2),
      12,
    );
    expect(result.position.y).toBeCloseTo(
      hyperbolicRadiusToPoincare(1.6) * Math.sin(-1.2),
      12,
    );
  });

  it('uses one shared cooldown for an enemy, without a progress or radius recovery gate', () => {
    const first = resolveEnemyKindKnockback('basic', {
      position: pointAt(2, 0),
      requestedDistance: 0.4,
      now: 10,
      state: createEnemyKnockbackState(),
    });
    const sameFrame = resolveEnemyKindKnockback('basic', {
      position: first.position,
      requestedDistance: 0.4,
      now: 10,
      state: first.state,
    });
    const afterCooldown = resolveEnemyKindKnockback('basic', {
      position: first.position,
      requestedDistance: 0.4,
      now: first.state.nextAvailableAt,
      state: sameFrame.state,
    });

    expect(first).toMatchObject({
      applied: true,
      state: { nextAvailableAt: 12.4 },
    });
    expect(sameFrame).toMatchObject({
      applied: false,
      blockedReason: 'cooldown',
      position: first.position,
      appliedDistance: 0,
    });
    expect(afterCooldown).toMatchObject({
      applied: true,
      blockedReason: null,
      // No route-progress or radial-recovery threshold is part of state.
      state: { nextAvailableAt: 14.8 },
    });
  });

  it('applies heavier resistance and stricter per-hit caps to armored and Boss enemies', () => {
    const position = pointAt(2, 0);
    const common = resolveEnemyKindKnockback('basic', {
      position,
      requestedDistance: 0.9,
      now: 1,
    });
    const armored = resolveEnemyKindKnockback('armored', {
      position,
      requestedDistance: 0.9,
      now: 1,
    });
    const boss = resolveEnemyKindKnockback('boss', {
      position,
      requestedDistance: 0.9,
      now: 1,
    });

    expect(getEnemyKnockbackPolicy('armored')).toEqual({
      cooldownSeconds: 3.6,
      distanceMultiplier: 0.5,
      maxDistance: 0.21,
    });
    expect(getEnemyKnockbackPolicy('boss')).toEqual({
      cooldownSeconds: 5.4,
      distanceMultiplier: 0.25,
      maxDistance: 0.105,
    });
    expect(common.appliedDistance).toBeCloseTo(0.42, 9);
    expect(armored.appliedDistance).toBeCloseTo(0.21, 9);
    expect(boss.appliedDistance).toBeCloseTo(0.105, 9);
    expect(armored.state.nextAvailableAt).toBeGreaterThan(
      common.state.nextAvailableAt,
    );
    expect(boss.state.nextAvailableAt).toBeGreaterThan(
      armored.state.nextAvailableAt,
    );
  });

  it('does not spend the shared cooldown for a zero effect, while the exact center uses a deterministic outward ray', () => {
    const state = { nextAvailableAt: 3 };
    const zero = resolveEnemyKindKnockback('basic', {
      position: pointAt(1),
      requestedDistance: 0,
      now: 3,
      state,
    });
    const atCenter = resolveEnemyKindKnockback('basic', {
      position: CENTER,
      requestedDistance: 0.5,
      now: 3,
      state,
    });

    expect(zero).toMatchObject({
      applied: false,
      blockedReason: 'zero-distance',
      state,
    });
    expect(atCenter).toMatchObject({
      applied: true,
      blockedReason: null,
      appliedDistance: expect.closeTo(0.42, 9),
      position: {
        x: expect.closeTo(hyperbolicRadiusToPoincare(0.42), 9),
        y: expect.closeTo(0, 9),
      },
      state: { nextAvailableAt: 5.4 },
    });
  });

  it('rejects invalid canonical points, clock, policy, and distance input', () => {
    const policy = getEnemyKnockbackPolicy('basic');

    expect(() =>
      resolveEnemyKnockback({
        position: { x: 1, y: 0 },
        requestedDistance: 0.2,
        now: 0,
        policy,
      }),
    ).toThrow(RangeError);
    expect(() =>
      resolveEnemyKnockback({
        position: { x: Number.NaN, y: 0 },
        requestedDistance: 0.2,
        now: 0,
        policy,
      }),
    ).toThrow(RangeError);
    expect(() =>
      resolveEnemyKnockback({
        position: pointAt(1),
        requestedDistance: 0.2,
        now: -1,
        policy,
      }),
    ).toThrow(RangeError);
    expect(() =>
      resolveEnemyKnockback({
        position: pointAt(1),
        requestedDistance: 0.2,
        now: 0,
        policy: { ...policy, cooldownSeconds: 0 },
      }),
    ).toThrow(RangeError);
  });
});
