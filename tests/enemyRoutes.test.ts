import { describe, expect, it } from 'vitest';
import {
  buildEnemyRoute,
  continueEnemyRoute,
  sampleEnemyRoute,
  type EnemyRoute,
} from '../src/game/enemyRoutes';
import {
  hyperbolicDistance,
  hyperbolicRadiusToPoincare,
  vec2LengthSquared,
  type Vec2,
} from '../src/math/hyperbolic';

const CENTER: Vec2 = { x: 0, y: 0 };

function expectPointClose(actual: Vec2, expected: Readonly<Vec2>): void {
  expect(actual.x).toBeCloseTo(expected.x, 10);
  expect(actual.y).toBeCloseTo(expected.y, 10);
}

function expectRouteInsideDisk(route: EnemyRoute): void {
  for (let step = 0; step <= 120; step += 1) {
    const position = sampleEnemyRoute(
      route,
      (route.totalLength * step) / 120,
    );
    expect(vec2LengthSquared(position)).toBeLessThan(1);
  }
}

describe('enemy routes', () => {
  it('builds a direct boundary-to-base route with H² arc-length sampling', () => {
    const route = buildEnemyRoute({
      entryAngle: Math.PI / 3,
      startRadius: 4.7,
      behavior: 'direct',
    });

    expect(route.points).toHaveLength(2);
    expect(route.segments).toHaveLength(1);
    expect(route.totalLength).toBeCloseTo(4.7, 9);
    expectPointClose(sampleEnemyRoute(route, 0), {
      x: hyperbolicRadiusToPoincare(4.7) * Math.cos(Math.PI / 3),
      y: hyperbolicRadiusToPoincare(4.7) * Math.sin(Math.PI / 3),
    });
    expect(hyperbolicDistance(sampleEnemyRoute(route, 1.4), CENTER)).toBeCloseTo(
      3.3,
      9,
    );
    expectPointClose(sampleEnemyRoute(route, route.totalLength), CENTER);
  });

  it('creates deterministic flank and zigzag routes with distinct non-radial waypoints', () => {
    const flank = buildEnemyRoute({
      entryAngle: -0.36,
      startRadius: 4.7,
      behavior: 'flank',
      seed: 41,
    });
    const matchingFlank = buildEnemyRoute({
      entryAngle: -0.36,
      startRadius: 4.7,
      behavior: 'flank',
      seed: 41,
    });
    const zigzag = buildEnemyRoute({
      entryAngle: -0.36,
      startRadius: 4.7,
      behavior: 'zigzag',
      seed: 41,
    });

    expect(flank).toEqual(matchingFlank);
    expect(flank.points).toHaveLength(4);
    expect(zigzag.points).toHaveLength(4);
    expect(flank.totalLength).toBeGreaterThan(4.7);
    expect(zigzag.totalLength).toBeGreaterThan(4.7);

    const entryAngle = Math.atan2(flank.points[0].y, flank.points[0].x);
    const flankWaypointAngle = Math.atan2(flank.points[1].y, flank.points[1].x);
    const zigzagFirstAngle = Math.atan2(zigzag.points[1].y, zigzag.points[1].x);
    const zigzagSecondAngle = Math.atan2(zigzag.points[2].y, zigzag.points[2].x);
    expect(Math.abs(flankWaypointAngle - entryAngle)).toBeGreaterThan(0.1);
    expect(
      (zigzagFirstAngle - entryAngle) * (zigzagSecondAngle - entryAngle),
    ).toBeLessThan(0);

    const firstFlankLegMinimumRadius = Math.min(
      ...Array.from({ length: 41 }, (_, index) =>
        hyperbolicDistance(
          sampleEnemyRoute(
            flank,
            (flank.segments[0].endDistance * index) / 40,
          ),
          CENTER,
        ),
      ),
    );
    expect(firstFlankLegMinimumRadius).toBeLessThan(
      hyperbolicDistance(flank.points[1], CENTER) - 0.1,
    );
  });

  it('keeps every piecewise route continuous and each sampled leg geodesic', () => {
    for (const behavior of ['direct', 'flank', 'zigzag'] as const) {
      const route = buildEnemyRoute({
        entryAngle: 0.18,
        startRadius: 4.7,
        behavior,
        seed: 93,
      });
      expectRouteInsideDisk(route);

      for (let index = 0; index < route.segments.length; index += 1) {
        const segment = route.segments[index];
        expectPointClose(
          sampleEnemyRoute(route, segment.startDistance),
          segment.start,
        );
        expectPointClose(
          sampleEnemyRoute(route, segment.endDistance),
          segment.end,
        );

        const distanceThroughLeg = segment.length * 0.37;
        const start = sampleEnemyRoute(route, segment.startDistance);
        const middle = sampleEnemyRoute(
          route,
          segment.startDistance + distanceThroughLeg,
        );
        expect(hyperbolicDistance(start, middle)).toBeCloseTo(
          distanceThroughLeg,
          8,
        );

        const next = route.segments[index + 1];
        if (next) {
          expect(segment.end).toBe(next.start);
          expectPointClose(segment.end, next.start);
        }
      }
    }
  });

  it('clamps samples to the route ends and rejects invalid route inputs', () => {
    const route = buildEnemyRoute({
      entryAngle: 0,
      startRadius: 2,
      behavior: 'flank',
      seed: 2,
    });
    expectPointClose(sampleEnemyRoute(route, -4), route.points[0]);
    expectPointClose(sampleEnemyRoute(route, route.totalLength + 4), CENTER);

    expect(() =>
      buildEnemyRoute({
        entryAngle: 0,
        behavior: 'curve' as 'direct',
      }),
    ).toThrow(RangeError);
    expect(() =>
      buildEnemyRoute({ entryAngle: 0, destination: { x: 1, y: 0 } }),
    ).toThrow(RangeError);
    expect(() => sampleEnemyRoute(route, Number.NaN)).toThrow(RangeError);
  });

  it('continues from a reached point along the parent route without a snap', () => {
    const parent = buildEnemyRoute({
      entryAngle: 0.57,
      startRadius: 4.7,
      behavior: 'zigzag',
      seed: 52,
    });
    const travelledDistance = parent.totalLength * 0.43;
    const child = continueEnemyRoute(parent, travelledDistance);

    expect(child.totalLength).toBeCloseTo(
      parent.totalLength - travelledDistance,
      8,
    );
    expectPointClose(
      sampleEnemyRoute(child, 0),
      sampleEnemyRoute(parent, travelledDistance),
    );
    expectPointClose(
      sampleEnemyRoute(child, 0.2),
      sampleEnemyRoute(parent, travelledDistance + 0.2),
    );
    expectPointClose(sampleEnemyRoute(child, child.totalLength), CENTER);
    expectRouteInsideDisk(child);
  });
});
