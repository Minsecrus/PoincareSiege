import { describe, expect, it } from 'vitest';
import {
  IDENTITY_MOBIUS,
  applyMobius,
  composeMobius,
  hyperbolicDistance,
  hyperboloidToPoincare,
  invertMobius,
  poincareToHyperboloid,
  translationToOrigin,
  viewFocus,
  type Vec2,
} from '../src/math/hyperbolic';

function expectPointClose(actual: Vec2, expected: Vec2): void {
  expect(actual.x).toBeCloseTo(expected.x, 10);
  expect(actual.y).toBeCloseTo(expected.y, 10);
}

describe('Poincaré geometry', () => {
  it('round-trips points through the hyperboloid model', () => {
    const point = { x: 0.31, y: -0.42 };
    expectPointClose(
      hyperboloidToPoincare(poincareToHyperboloid(point)),
      point,
    );
  });

  it('maps a selected focus point to the disk origin', () => {
    const focus = { x: 0.24, y: -0.17 };
    expectPointClose(applyMobius(translationToOrigin(focus), focus), {
      x: 0,
      y: 0,
    });
  });

  it('preserves hyperbolic distance under a Möbius view transform', () => {
    const pointA = { x: -0.28, y: 0.12 };
    const pointB = { x: 0.53, y: -0.18 };
    const transform = composeMobius(
      translationToOrigin({ x: 0.08, y: 0.19 }),
      translationToOrigin({ x: -0.22, y: 0.04 }),
    );
    const before = hyperbolicDistance(pointA, pointB);
    const after = hyperbolicDistance(
      applyMobius(transform, pointA),
      applyMobius(transform, pointB),
    );
    expect(after).toBeCloseTo(before, 10);
  });

  it('inverts a composed view transform', () => {
    const transform = composeMobius(
      translationToOrigin({ x: 0.21, y: 0.05 }),
      IDENTITY_MOBIUS,
    );
    const point = { x: -0.17, y: 0.38 };
    const transformed = applyMobius(transform, point);
    expectPointClose(applyMobius(invertMobius(transform), transformed), point);
    expectPointClose(
      applyMobius(transform, viewFocus(transform)),
      { x: 0, y: 0 },
    );
  });
});
