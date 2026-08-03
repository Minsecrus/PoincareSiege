import { describe, expect, it } from 'vitest';
import {
  applyMobius,
  hyperbolicDistance,
  translationToOrigin,
  type Vec2,
} from '../src/math/hyperbolic';
import {
  createHyperbolicAttackSectorGeometry,
  type HyperbolicAttackSectorSpec,
} from '../src/scene/HyperbolicAttackSector';

const SPEC: HyperbolicAttackSectorSpec = {
  center: { x: 0.28, y: -0.19 },
  hyperbolicRadius: 1.7,
  centerAngle: 0.64,
  halfAngle: 0.52,
  radialSegments: 8,
  arcSegments: 24,
};

function cross(a: Vec2, b: Vec2): number {
  return a.x * b.y - a.y * b.x;
}

describe('hyperbolic attack sector', () => {
  it('keeps every perimeter-arc sample at the requested H2 radius', () => {
    const geometry = createHyperbolicAttackSectorGeometry(SPEC);

    expect(geometry.arc).toHaveLength(25);
    for (const point of geometry.arc) {
      expect(hyperbolicDistance(geometry.center, point)).toBeCloseTo(
        SPEC.hyperbolicRadius,
        10,
      );
    }
  });

  it('builds each radial boundary from a hyperbolic geodesic', () => {
    const geometry = createHyperbolicAttackSectorGeometry(SPEC);
    const moveCenterToOrigin = translationToOrigin(geometry.center);

    for (const ray of [geometry.leftRay, geometry.rightRay]) {
      const tangentEnd = applyMobius(
        moveCenterToOrigin,
        ray[ray.length - 1],
      );
      for (let index = 0; index < ray.length; index += 1) {
        const tangentPoint = applyMobius(moveCenterToOrigin, ray[index]);
        expect(cross(tangentEnd, tangentPoint)).toBeCloseTo(0, 10);
        expect(hyperbolicDistance(geometry.center, ray[index])).toBeCloseTo(
          (SPEC.hyperbolicRadius * index) / (SPEC.radialSegments ?? 1),
          10,
        );
      }
    }
  });

  it('keeps its radial extent after a Mobius view transform', () => {
    const geometry = createHyperbolicAttackSectorGeometry(SPEC);
    const viewTransform = translationToOrigin({ x: -0.17, y: 0.23 });
    const transformedCenter = applyMobius(viewTransform, geometry.center);

    for (const point of geometry.arc) {
      const transformedPoint = applyMobius(viewTransform, point);
      expect(
        hyperbolicDistance(transformedCenter, transformedPoint),
      ).toBeCloseTo(SPEC.hyperbolicRadius, 10);
    }
  });

  it('closes the outline at the tower center for perimeter rendering', () => {
    const geometry = createHyperbolicAttackSectorGeometry(SPEC);
    const first = geometry.outline[0];
    const last = geometry.outline[geometry.outline.length - 1];

    expect(first).toEqual(geometry.center);
    expect(last).toEqual(geometry.center);
  });
});
