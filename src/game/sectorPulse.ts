import {
  applyMobius,
  hyperbolicDistance,
  translationToOrigin,
  type Vec2,
} from '../math/hyperbolic';

const ORIGIN: Vec2 = { x: 0, y: 0 };
const TAU = Math.PI * 2;
const COMPARISON_EPSILON = 1e-9;
const UNIT_VECTOR_EPSILON = 1e-12;

/**
 * H² units travelled by an expanding sector pulse per second.
 *
 * The base sector ranges from 1.5 to 2.1 H² units, so this makes a full
 * pulse visible for roughly 0.60 to 0.84 seconds. It is intentionally a
 * gameplay constant rather than a frame-rate-dependent visual duration.
 */
export const SECTOR_PULSE_SPEED = 2.5;

/** Width of the travelling hit ribbon, measured in H² radial distance. */
export const SECTOR_PULSE_BAND_WIDTH = 0.12;

/** Canonical, view-independent values captured when a sector tower fires. */
export interface SectorPulseSpawn {
  /** Tower position in the unwarped Poincare disk. */
  origin: Vec2;
  /** Maximum H² distance reached by the expanding pulse. */
  range: number;
  /** Full fan width in radians. Values wider than 2π are a full circle. */
  fullAngleRadians: number;
  /** Damage dealt to every enemy touched by this one pulse. */
  damage: number;
  /** Optional H² thickness for the travelling pulse band. */
  bandWidth?: number;
}

/** A canonical enemy sample used for one pulse-simulation step. */
export interface SectorPulseEnemy {
  id: string;
  position: Vec2;
  /** Omit or set true for active targets; inactive samples are ignored. */
  active?: boolean;
}

/** Immutable pulse gameplay state. It never contains a camera transform. */
export interface SectorPulseState {
  readonly origin: Vec2;
  readonly range: number;
  readonly fullAngleRadians: number;
  readonly damage: number;
  readonly bandWidth: number;
  /** H² distance of the centre line of the travelling pulse band. */
  readonly frontRadius: number;
  /** Simulation time for which the pulse has actually travelled. */
  readonly elapsedSeconds: number;
  /** Stable IDs already damaged by this pulse. */
  readonly hitEnemyIds: readonly string[];
  /** True as soon as the front reaches the requested H² range. */
  readonly expired: boolean;
}

/** One authoritative damage instruction emitted when the moving band touches. */
export interface SectorPulseHit {
  enemyId: string;
  damage: number;
}

/** Result of advancing one pulse by one simulation step. */
export interface SectorPulseAdvanceResult {
  pulse: SectorPulseState;
  hits: SectorPulseHit[];
}

/**
 * Presentation-friendly snapshot of one canonical pulse. A renderer can use
 * the origin, outward angle, full fan angle, and band radii to draw an H²
 * annular sector, then apply its current camera Mobius transform separately.
 */
export interface SectorPulseSnapshot {
  origin: Vec2;
  range: number;
  fullAngleRadians: number;
  damage: number;
  outwardAngleRadians: number;
  frontRadius: number;
  bandInnerRadius: number;
  bandOuterRadius: number;
  progress: number;
  expired: boolean;
}

function isFinitePoint(point: Vec2): boolean {
  return (
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    point.x * point.x + point.y * point.y < 1
  );
}

function assertFinitePoint(point: Vec2, label: string): void {
  if (!isFinitePoint(point)) {
    throw new RangeError(`${label} must be a finite point inside the Poincare disk.`);
  }
}

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive finite number.`);
  }
}

function assertNonNegativeFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative finite number.`);
  }
}

function normalizeFullAngle(fullAngleRadians: number): number {
  assertNonNegativeFinite(fullAngleRadians, 'Sector-pulse full angle');
  return Math.min(TAU, fullAngleRadians);
}

function compareTargets(
  origin: Vec2,
  left: SectorPulseEnemy,
  right: SectorPulseEnemy,
): number {
  const distanceDifference =
    hyperbolicDistance(origin, left.position) -
    hyperbolicDistance(origin, right.position);
  if (Math.abs(distanceDifference) > COMPARISON_EPSILON) {
    return distanceDifference;
  }
  return left.id.localeCompare(right.id);
}

function activeUniqueEnemies(
  enemies: readonly SectorPulseEnemy[],
): SectorPulseEnemy[] {
  const ids = new Set<string>();
  const targets: SectorPulseEnemy[] = [];
  for (const enemy of enemies) {
    if (
      enemy.active === false ||
      typeof enemy.id !== 'string' ||
      ids.has(enemy.id) ||
      !isFinitePoint(enemy.position)
    ) {
      continue;
    }
    ids.add(enemy.id);
    targets.push(enemy);
  }
  return targets;
}

/**
 * Unit vector facing away from the centre/base in the tower's tangent frame.
 * Translating the tower to the disk origin preserves local angles exactly.
 */
function outwardDirection(origin: Vec2): Vec2 {
  const localBase = applyMobius(translationToOrigin(origin), ORIGIN);
  const length = Math.hypot(localBase.x, localBase.y);
  if (length <= UNIT_VECTOR_EPSILON) {
    // The centre has no geometrically preferred outward direction.
    return { x: 1, y: 0 };
  }
  return { x: -localBase.x / length, y: -localBase.y / length };
}

/**
 * Checks the outward fan in the pulse origin's Mobius tangent frame.
 * This is invariant under a camera-only Mobius transformation.
 */
export function isInsideSectorPulseFan(
  origin: Vec2,
  target: Vec2,
  fullAngleRadians: number,
): boolean {
  if (
    !isFinitePoint(origin) ||
    !isFinitePoint(target) ||
    !Number.isFinite(fullAngleRadians) ||
    fullAngleRadians < 0
  ) {
    return false;
  }
  if (fullAngleRadians >= TAU - COMPARISON_EPSILON) {
    return true;
  }

  const localTarget = applyMobius(translationToOrigin(origin), target);
  const targetLength = Math.hypot(localTarget.x, localTarget.y);
  if (targetLength <= UNIT_VECTOR_EPSILON) {
    return true;
  }

  const outward = outwardDirection(origin);
  const cosine =
    (localTarget.x * outward.x + localTarget.y * outward.y) / targetLength;
  return cosine >= Math.cos(fullAngleRadians / 2) - COMPARISON_EPSILON;
}

/** Creates a travelling H² sector pulse at its tower's canonical position. */
export function createSectorPulse(spawn: SectorPulseSpawn): SectorPulseState {
  assertFinitePoint(spawn.origin, 'Sector-pulse origin');
  assertPositiveFinite(spawn.range, 'Sector-pulse range');
  assertNonNegativeFinite(spawn.damage, 'Sector-pulse damage');
  const bandWidth = spawn.bandWidth ?? SECTOR_PULSE_BAND_WIDTH;
  assertPositiveFinite(bandWidth, 'Sector-pulse band width');

  return {
    origin: { x: spawn.origin.x, y: spawn.origin.y },
    range: spawn.range,
    fullAngleRadians: normalizeFullAngle(spawn.fullAngleRadians),
    damage: spawn.damage,
    bandWidth,
    frontRadius: 0,
    elapsedSeconds: 0,
    hitEnemyIds: [],
    expired: false,
  };
}

/** Compatibility spelling for callers that prefer an action-oriented API. */
export const spawnSectorPulse = createSectorPulse;

/** Returns a renderer-safe description of the moving H² annular sector. */
export function getSectorPulseSnapshot(
  pulse: SectorPulseState,
): SectorPulseSnapshot {
  const halfBand = pulse.bandWidth / 2;
  const outward = outwardDirection(pulse.origin);
  return {
    origin: { x: pulse.origin.x, y: pulse.origin.y },
    range: pulse.range,
    fullAngleRadians: pulse.fullAngleRadians,
    damage: pulse.damage,
    outwardAngleRadians: Math.atan2(outward.y, outward.x),
    frontRadius: pulse.frontRadius,
    bandInnerRadius: Math.max(0, pulse.frontRadius - halfBand),
    bandOuterRadius: Math.min(pulse.range, pulse.frontRadius + halfBand),
    progress: Math.min(1, Math.max(0, pulse.frontRadius / pulse.range)),
    expired: pulse.expired,
  };
}

/** True while the pulse has not yet reached its H² range limit. */
export function isSectorPulseActive(pulse: SectorPulseState): boolean {
  return !pulse.expired;
}

/**
 * Advances a pulse and emits damage only for targets swept by its radial band.
 *
 * The complete swept interval is tested rather than just the destination
 * radius, so a large simulation frame cannot make a pulse tunnel through an
 * enemy. IDs are persisted in the returned state, ensuring one damage event
 * per active enemy for this pulse even while it remains visually inside the
 * ribbon across multiple frames.
 */
export function advanceSectorPulse(
  pulse: SectorPulseState,
  deltaSeconds: number,
  enemies: readonly SectorPulseEnemy[],
): SectorPulseAdvanceResult {
  if (
    pulse.expired ||
    !Number.isFinite(deltaSeconds) ||
    deltaSeconds <= 0
  ) {
    return { pulse, hits: [] };
  }

  const previousFrontRadius = Math.min(
    pulse.range,
    Math.max(0, pulse.frontRadius),
  );
  const nextFrontRadius = Math.min(
    pulse.range,
    previousFrontRadius + deltaSeconds * SECTOR_PULSE_SPEED,
  );
  const halfBand = pulse.bandWidth / 2;
  const sweptInnerRadius = Math.max(0, previousFrontRadius - halfBand);
  const sweptOuterRadius = Math.min(
    pulse.range,
    nextFrontRadius + halfBand,
  );
  const alreadyHit = new Set(pulse.hitEnemyIds);
  const hits: SectorPulseHit[] = [];

  const targets = activeUniqueEnemies(enemies).sort((left, right) =>
    compareTargets(pulse.origin, left, right),
  );
  for (const target of targets) {
    if (alreadyHit.has(target.id)) {
      continue;
    }
    const distance = hyperbolicDistance(pulse.origin, target.position);
    if (
      distance < sweptInnerRadius - COMPARISON_EPSILON ||
      distance > sweptOuterRadius + COMPARISON_EPSILON ||
      distance > pulse.range + COMPARISON_EPSILON ||
      !isInsideSectorPulseFan(
        pulse.origin,
        target.position,
        pulse.fullAngleRadians,
      )
    ) {
      continue;
    }

    alreadyHit.add(target.id);
    hits.push({ enemyId: target.id, damage: pulse.damage });
  }

  const travelledDistance = nextFrontRadius - previousFrontRadius;
  const expired = nextFrontRadius >= pulse.range - COMPARISON_EPSILON;
  const nextPulse: SectorPulseState = {
    ...pulse,
    frontRadius: nextFrontRadius,
    elapsedSeconds:
      pulse.elapsedSeconds + travelledDistance / SECTOR_PULSE_SPEED,
    hitEnemyIds: [...pulse.hitEnemyIds, ...hits.map((hit) => hit.enemyId)],
    expired,
  };
  return { pulse: nextPulse, hits };
}
