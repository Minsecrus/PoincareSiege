import {
  geodesicInterpolate,
  hyperbolicDistance,
  hyperbolicRadiusToPoincare,
  hyperboloidToPoincare,
  poincareToHyperboloid,
  vec2LengthSquared,
  type Vec2,
} from '../math/hyperbolic';

const DEFAULT_START_RADIUS = 4.7;
const DISK_RADIUS_SQUARED_LIMIT = 1;
const SEGMENT_EPSILON = 1e-9;

/** The authored route shapes available to the wave planner. */
export const ENEMY_ROUTE_BEHAVIORS = ['direct', 'flank', 'zigzag'] as const;

export type EnemyRouteBehavior = (typeof ENEMY_ROUTE_BEHAVIORS)[number];

export interface EnemyRouteOptions {
  /** Boundary-facing entry direction in canonical Poincare coordinates. */
  readonly entryAngle: number;
  /** A stable integer used only to select a reproducible route variation. */
  readonly seed?: number;
  /** Direct routes have no authored turns; the others are waypoint routes. */
  readonly behavior?: EnemyRouteBehavior;
  /** H² radius of the boundary-side spawn point. */
  readonly startRadius?: number;
  /** Defaults to the central base. It must remain strictly inside the disk. */
  readonly destination?: Vec2;
}

/** One exact H²-geodesic leg within a longer movement route. */
export interface EnemyRouteSegment {
  readonly start: Readonly<Vec2>;
  readonly end: Readonly<Vec2>;
  /** H² length of this leg. */
  readonly length: number;
  /** H² distance from route start to the beginning of this leg. */
  readonly startDistance: number;
  /** H² distance from route start to the end of this leg. */
  readonly endDistance: number;
}

/**
 * An immutable canonical route. Its `segments` share endpoints with `points`,
 * so a sampled traveller cannot jump when crossing from one leg to the next.
 */
export interface EnemyRoute {
  readonly behavior: EnemyRouteBehavior;
  readonly entryAngle: number;
  readonly seed: number;
  readonly startRadius: number;
  readonly destination: Readonly<Vec2>;
  readonly points: readonly Readonly<Vec2>[];
  readonly segments: readonly EnemyRouteSegment[];
  /** Total traversable length in H² units. */
  readonly totalLength: number;
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be finite.`);
  }
}

function assertPositive(value: number, label: string): void {
  assertFinite(value, label);
  if (value <= 0) {
    throw new RangeError(`${label} must be positive.`);
  }
}

function assertInsideDisk(point: Vec2, label: string): void {
  assertFinite(point.x, `${label}.x`);
  assertFinite(point.y, `${label}.y`);
  if (vec2LengthSquared(point) >= DISK_RADIUS_SQUARED_LIMIT) {
    throw new RangeError(`${label} must be strictly inside the Poincare disk.`);
  }
}

function assertRouteBehavior(value: string): asserts value is EnemyRouteBehavior {
  if (!(ENEMY_ROUTE_BEHAVIORS as readonly string[]).includes(value)) {
    throw new RangeError(`Unknown enemy route behavior "${value}".`);
  }
}

function assertSeed(value: number): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError('seed must be a safe integer.');
  }
}

function freezePoint(point: Vec2): Readonly<Vec2> {
  return Object.freeze({ x: point.x, y: point.y });
}

function copyPoint(point: Readonly<Vec2>): Vec2 {
  return { x: point.x, y: point.y };
}

/** A stable, platform-independent [0, 1) hash rather than mutable RNG state. */
function seededUnit(seed: number, salt: number): number {
  let value = (seed ^ Math.imul(salt, 0x9e3779b9)) | 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x85ebca6b);
  value ^= value >>> 13;
  value = Math.imul(value, 0xc2b2ae35);
  value ^= value >>> 16;
  return (value >>> 0) / 0x1_0000_0000;
}

function polarPoint(radius: number, angle: number): Readonly<Vec2> {
  const diskRadius = hyperbolicRadiusToPoincare(radius);
  const point = freezePoint({
    x: diskRadius * Math.cos(angle),
    y: diskRadius * Math.sin(angle),
  });
  assertInsideDisk(point, 'route point');
  return point;
}

function createWaypoints(
  behavior: EnemyRouteBehavior,
  entryAngle: number,
  startRadius: number,
  seed: number,
): readonly Readonly<Vec2>[] {
  if (behavior === 'direct') {
    return [];
  }

  const side = seededUnit(seed, 1) < 0.5 ? -1 : 1;
  if (behavior === 'flank') {
    // The first high-radius turn gives a sideways approach; the next point
    // turns back towards the base. The H² legs can therefore dip outward and
    // inward without ever ceasing to be geodesic individually.
    const flankAngle =
      entryAngle + side * (0.12 + seededUnit(seed, 2) * 0.05);
    const flankRadius = startRadius * (0.9 + seededUnit(seed, 3) * 0.03);
    const approachRadius = startRadius * (0.3 + seededUnit(seed, 4) * 0.06);
    return [
      polarPoint(flankRadius, flankAngle),
      polarPoint(approachRadius, entryAngle + side * (flankAngle - entryAngle) * 0.3),
    ];
  }

  const firstAngle =
    entryAngle + side * (0.18 + seededUnit(seed, 2) * 0.08);
  const secondAngle =
    entryAngle - side * (0.2 + seededUnit(seed, 3) * 0.1);
  return [
    polarPoint(startRadius * (0.59 + seededUnit(seed, 4) * 0.06), firstAngle),
    polarPoint(startRadius * (0.29 + seededUnit(seed, 5) * 0.07), secondAngle),
  ];
}

function createRouteFromPoints(
  behavior: EnemyRouteBehavior,
  entryAngle: number,
  seed: number,
  startRadius: number,
  points: readonly Readonly<Vec2>[],
): EnemyRoute {
  const routePoints = Object.freeze([...points]);
  const destination = routePoints[routePoints.length - 1];
  const segments: EnemyRouteSegment[] = [];
  let accumulatedLength = 0;

  for (let index = 0; index < routePoints.length - 1; index += 1) {
    const segmentStart = routePoints[index];
    const segmentEnd = routePoints[index + 1];
    const length = hyperbolicDistance(segmentStart, segmentEnd);
    if (length <= SEGMENT_EPSILON) {
      continue;
    }
    segments.push(
      Object.freeze({
        start: segmentStart,
        end: segmentEnd,
        length,
        startDistance: accumulatedLength,
        endDistance: accumulatedLength + length,
      }),
    );
    accumulatedLength += length;
  }

  return Object.freeze({
    behavior,
    entryAngle,
    seed,
    startRadius,
    destination,
    points: routePoints,
    segments: Object.freeze(segments),
    totalLength: accumulatedLength,
  });
}

/**
 * Builds a deterministic route from an entry point to the base. Every leg is
 * sampled by hyperbolic arc length, not Euclidean screen distance.
 */
export function buildEnemyRoute(options: EnemyRouteOptions): EnemyRoute {
  const behavior = options.behavior ?? 'direct';
  const seed = options.seed ?? 0;
  const startRadius = options.startRadius ?? DEFAULT_START_RADIUS;
  const destination = options.destination ?? { x: 0, y: 0 };

  assertFinite(options.entryAngle, 'entryAngle');
  assertRouteBehavior(behavior);
  assertSeed(seed);
  assertPositive(startRadius, 'startRadius');
  assertInsideDisk(destination, 'destination');

  const start = polarPoint(startRadius, options.entryAngle);
  const waypoints = createWaypoints(
    behavior,
    options.entryAngle,
    startRadius,
    seed,
  );
  return createRouteFromPoints(
    behavior,
    options.entryAngle,
    seed,
    startRadius,
    [start, ...waypoints, freezePoint(destination)],
  );
}

/**
 * Returns a canonical disk position at a cumulative H² travel distance.
 * Values outside the route are clamped to its start/end rather than causing
 * a route to extrapolate beyond the base.
 */
export function sampleEnemyRoute(
  route: EnemyRoute,
  travelledDistance: number,
): Vec2 {
  assertFinite(travelledDistance, 'travelledDistance');
  const clampedDistance = Math.min(
    route.totalLength,
    Math.max(0, travelledDistance),
  );

  if (route.segments.length === 0) {
    return copyPoint(route.destination);
  }
  if (clampedDistance <= SEGMENT_EPSILON) {
    return copyPoint(route.segments[0].start);
  }
  if (route.totalLength - clampedDistance <= SEGMENT_EPSILON) {
    return copyPoint(route.destination);
  }

  for (const segment of route.segments) {
    if (clampedDistance > segment.endDistance + SEGMENT_EPSILON) {
      continue;
    }
    const localDistance = Math.min(
      segment.length,
      Math.max(0, clampedDistance - segment.startDistance),
    );
    if (localDistance <= SEGMENT_EPSILON) {
      return copyPoint(segment.start);
    }
    if (segment.length - localDistance <= SEGMENT_EPSILON) {
      return copyPoint(segment.end);
    }

    return hyperboloidToPoincare(
      geodesicInterpolate(
        poincareToHyperboloid(segment.start),
        poincareToHyperboloid(segment.end),
        localDistance / segment.length,
      ),
    );
  }

  return copyPoint(route.destination);
}

/**
 * Creates a fresh route whose start is a position already reached on another
 * route, then follows the exact remaining H² legs. This is useful for spawned
 * children such as splitters: they can inherit their parent's route without
 * snapping back to the boundary or to an inferred Euclidean line.
 */
export function continueEnemyRoute(
  route: EnemyRoute,
  travelledDistance: number,
): EnemyRoute {
  assertFinite(travelledDistance, 'travelledDistance');
  const clampedDistance = Math.min(
    route.totalLength,
    Math.max(0, travelledDistance),
  );
  const start = freezePoint(sampleEnemyRoute(route, clampedDistance));
  const remainingPoints: Readonly<Vec2>[] = [start];

  for (const segment of route.segments) {
    if (segment.endDistance > clampedDistance + SEGMENT_EPSILON) {
      remainingPoints.push(segment.end);
    }
  }
  if (
    remainingPoints[remainingPoints.length - 1] !== route.destination &&
    (remainingPoints[remainingPoints.length - 1].x !== route.destination.x ||
      remainingPoints[remainingPoints.length - 1].y !== route.destination.y)
  ) {
    remainingPoints.push(route.destination);
  }

  return createRouteFromPoints(
    route.behavior,
    route.entryAngle,
    route.seed,
    route.startRadius,
    remainingPoints,
  );
}
