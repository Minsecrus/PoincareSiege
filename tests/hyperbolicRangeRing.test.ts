import { describe, expect, it } from 'vitest';
import {
  applyMobius,
  hyperbolicDistance,
  translationToOrigin,
} from '../src/math/hyperbolic';
import {
  createHyperbolicRangeRingGeometry,
  type HyperbolicRangeRingSpec,
} from '../src/scene/HyperbolicRangeRing';

const SPEC: HyperbolicRangeRingSpec = {
  center: { x: 0.31, y: -0.22 },
  hyperbolicRadius: 1.8,
  segments: 64,
};

describe('hyperbolic range ring', () => {
  it('keeps every perimeter sample at the requested H2 radius', () => {
    const geometry = createHyperbolicRangeRingGeometry(SPEC);

    expect(geometry.perimeter).toHaveLength(65);
    for (const point of geometry.perimeter) {
      expect(hyperbolicDistance(geometry.center, point)).toBeCloseTo(
        SPEC.hyperbolicRadius,
        10,
      );
    }
  });

  it('closes the perimeter without changing the sampled H2 circle', () => {
    const geometry = createHyperbolicRangeRingGeometry(SPEC);
    const first = geometry.perimeter[0];
    const last = geometry.perimeter[geometry.perimeter.length - 1];

    expect(last.x).toBeCloseTo(first.x, 12);
    expect(last.y).toBeCloseTo(first.y, 12);
  });

  it('keeps the circle radius after a Mobius view transform', () => {
    const geometry = createHyperbolicRangeRingGeometry(SPEC);
    const viewTransform = translationToOrigin({ x: -0.18, y: 0.16 });
    const transformedCenter = applyMobius(viewTransform, geometry.center);

    for (const point of geometry.perimeter) {
      const transformedPoint = applyMobius(viewTransform, point);
      expect(
        hyperbolicDistance(transformedCenter, transformedPoint),
      ).toBeCloseTo(SPEC.hyperbolicRadius, 10);
    }
  });

  it('rejects invalid canonical circles', () => {
    expect(() =>
      createHyperbolicRangeRingGeometry({
        center: { x: 1, y: 0 },
        hyperbolicRadius: 1,
      }),
    ).toThrow(RangeError);
    expect(() =>
      createHyperbolicRangeRingGeometry({
        center: { x: 0, y: 0 },
        hyperbolicRadius: 0,
      }),
    ).toThrow(RangeError);
    expect(() =>
      createHyperbolicRangeRingGeometry({
        center: { x: 0, y: 0 },
        hyperbolicRadius: 1,
        segments: 2,
      }),
    ).toThrow(RangeError);
  });
});
