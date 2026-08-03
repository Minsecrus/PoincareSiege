import { describe, expect, it } from 'vitest';
import {
  getTowerAttackImpactDelays,
  getPrecisionProjectileTiming,
  resolveTowerAttackEffectRange,
} from '../src/game/towerAttackTiming';
import { hyperbolicRadiusToPoincare, type Vec2 } from '../src/math/hyperbolic';

const ORIGIN: Vec2 = { x: 0, y: 0 };

function pointAt(radius: number, angle = 0): Vec2 {
  const diskRadius = hyperbolicRadiusToPoincare(radius);
  return {
    x: diskRadius * Math.cos(angle),
    y: diskRadius * Math.sin(angle),
  };
}

describe('tower attack contact timing', () => {
  it('waits for precision projectiles to reach their targets', () => {
    expect(
      getTowerAttackImpactDelays({
        kind: 'sniper',
        origin: ORIGIN,
        targets: [pointAt(2)],
      }),
    ).toEqual([expect.closeTo(0.368, 9)]);
    expect(
      getTowerAttackImpactDelays({
        kind: 'sniper',
        origin: ORIGIN,
        targets: [pointAt(2)],
        style: 'base-projectile',
      }),
    ).toEqual([expect.closeTo(0.5328, 9)]);
    expect(getPrecisionProjectileTiming().flightEndProgress).toBe(0.8);
  });

  it('orders expanding and chained effects by visible contact rather than firing time', () => {
    const targets = [pointAt(0.3), pointAt(1.2), pointAt(1.8)];
    const pulseDelays = getTowerAttackImpactDelays({
      kind: 'pulse',
      origin: ORIGIN,
      targets,
      range: 1.8,
    });
    const arcDelays = getTowerAttackImpactDelays({
      kind: 'arc',
      origin: ORIGIN,
      targets,
    });

    expect(pulseDelays[0]).toBeLessThan(pulseDelays[1]);
    expect(pulseDelays[1]).toBeLessThan(pulseDelays[2]);
    expect(arcDelays[0]).toBeLessThan(arcDelays[1]);
    expect(arcDelays[1]).toBeLessThan(arcDelays[2]);
  });

  it('uses beam propagation and anchor-field expansion contact times', () => {
    const prismDelays = getTowerAttackImpactDelays({
      kind: 'prism',
      origin: ORIGIN,
      targets: [pointAt(0.6), pointAt(2.2)],
    });
    const anchorDelays = getTowerAttackImpactDelays({
      kind: 'anchor',
      origin: ORIGIN,
      targets: [pointAt(0.9), pointAt(1.5)],
      range: 1.5,
    });

    expect(prismDelays[0]).toBeLessThan(prismDelays[1]);
    expect(prismDelays[1]).toBeCloseTo(0.162, 9);
    expect(anchorDelays[0]).toBe(0);
    expect(anchorDelays[1]).toBeGreaterThan(0);
  });

  it('shares renderer fallback ranges with contact scheduling', () => {
    expect(
      resolveTowerAttackEffectRange(ORIGIN, [pointAt(1.1)], undefined, 0.8),
    ).toBeCloseTo(1.2, 9);
  });
});
