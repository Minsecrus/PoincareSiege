import { describe, expect, it } from 'vitest';
import {
  getTowerAttackImpactDelays,
  getPrecisionProjectileTiming,
  resolveTowerAttackEffectRange,
  TOWER_ATTACK_EFFECT_TIMING,
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

  it('schedules support damage when the cyan wavefront reaches each enemy', () => {
    const targets = [pointAt(0.3), pointAt(1.2), pointAt(1.8)];
    const delays = getTowerAttackImpactDelays({
      kind: 'support',
      origin: ORIGIN,
      targets,
      range: 1.8,
    });

    expect(delays[0]).toBeLessThan(delays[1]);
    expect(delays[1]).toBeLessThan(delays[2]);
    expect(delays[2]).toBeCloseTo(0.648, 9);
  });

  it('schedules the bulwark shock ring at its visible shield front', () => {
    const targets = [pointAt(0.2), pointAt(0.6), pointAt(1)];
    const delays = getTowerAttackImpactDelays({
      kind: 'bulwark',
      origin: ORIGIN,
      targets,
      range: 1,
    });

    expect(delays[0]).toBeLessThan(delays[1]);
    expect(delays[1]).toBeLessThan(delays[2]);
    expect(delays[2]).toBeCloseTo(
      TOWER_ATTACK_EFFECT_TIMING.bulwark.durationSeconds *
        TOWER_ATTACK_EFFECT_TIMING.bulwark.wavefrontEndProgress,
      9,
    );
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
