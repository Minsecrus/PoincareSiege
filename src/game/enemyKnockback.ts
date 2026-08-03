import {
  hyperbolicDistance,
  hyperbolicRadiusToPoincare,
  vec2LengthSquared,
  type Vec2,
} from '../math/hyperbolic';
import type { EnemyKind } from './enemyTypes';

const COMPARISON_EPSILON = 1e-9;
const ORIGIN: Readonly<Vec2> = Object.freeze({ x: 0, y: 0 });
const MAX_REPRESENTABLE_DISK_RADIUS = 1 - Number.EPSILON;

/**
 * Per-family resistance to radial knockback. These values apply to an enemy,
 * not a tower: simultaneous hits from several towers therefore share one
 * cooldown window.
 */
export interface EnemyKnockbackPolicy {
  /** Shared resistance time after a successful displacement, in seconds. */
  readonly cooldownSeconds: number;
  /** Fraction of the source effect's requested H² displacement that survives. */
  readonly distanceMultiplier: number;
  /** Hard maximum H² displacement from one successful hit. */
  readonly maxDistance: number;
}

/** Persist this per enemy id, never per tower or attack source. */
export interface EnemyKnockbackState {
  /** Simulation time at which another knockback may take effect. */
  readonly nextAvailableAt: number;
}

/** Input for a radial, route-independent knockback attempt. */
export interface EnemyKnockbackRequest {
  /** Current canonical Poincare-disk position of the enemy. */
  readonly position: Readonly<Vec2>;
  /** Source-requested H² displacement before family resistance and the hit cap. */
  readonly requestedDistance: number;
  /** Monotonic simulation time in seconds. */
  readonly now: number;
  readonly policy: EnemyKnockbackPolicy;
  /** Omit for an enemy which has never been knocked back. */
  readonly state?: EnemyKnockbackState;
}

export type EnemyKnockbackBlockReason =
  | 'cooldown'
  | 'zero-distance';

/**
 * A pure instruction for the movement owner. When applied, `position` lies on
 * the same center-to-enemy diameter as the input but farther from the base by
 * `appliedDistance` in H². It deliberately contains no route or progress
 * information: knockback is independent of an enemy's authored movement.
 */
export interface EnemyKnockbackResolution {
  readonly applied: boolean;
  readonly blockedReason: EnemyKnockbackBlockReason | null;
  /** Canonical target position for the enemy manager to apply. */
  readonly position: Vec2;
  /** H² distance actually added in the outward radial direction. */
  readonly appliedDistance: number;
  /** Requested distance after family resistance and the one-hit cap. */
  readonly cappedDistance: number;
  /** Updated shared resistance state for this one enemy. */
  readonly state: EnemyKnockbackState;
}

const NORMAL_POLICY: EnemyKnockbackPolicy = Object.freeze({
  cooldownSeconds: 2.4,
  distanceMultiplier: 1,
  maxDistance: 0.42,
});

/**
 * The armored shell and Boss cannot be chain-pushed by fast or AOE towers:
 * they both wait longer between pushes and convert less of each source request
 * into radial displacement. Bosses also have the strictest single-hit cap.
 */
export const ENEMY_KNOCKBACK_POLICIES: Readonly<
  Record<EnemyKind, EnemyKnockbackPolicy>
> = Object.freeze({
  basic: NORMAL_POLICY,
  swarm: NORMAL_POLICY,
  armored: Object.freeze({
    cooldownSeconds: 3.6,
    distanceMultiplier: 0.5,
    maxDistance: 0.21,
  }),
  splitter: NORMAL_POLICY,
  raider: NORMAL_POLICY,
  boss: Object.freeze({
    cooldownSeconds: 5.4,
    distanceMultiplier: 0.25,
    maxDistance: 0.105,
  }),
});

function assertNonNegativeFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative finite number.`);
  }
}

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive finite number.`);
  }
}

function assertCanonicalPosition(position: Readonly<Vec2>): void {
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) {
    throw new RangeError('Enemy knockback position must be finite.');
  }

  if (vec2LengthSquared(position) >= 1) {
    throw new RangeError(
      'Enemy knockback position must be strictly inside the Poincare disk.',
    );
  }
}

function clonePosition(position: Readonly<Vec2>): Vec2 {
  return { x: position.x, y: position.y };
}

function normalizeState(
  state: EnemyKnockbackState | undefined,
): EnemyKnockbackState {
  if (state === undefined) {
    return { nextAvailableAt: 0 };
  }

  assertNonNegativeFinite(state.nextAvailableAt, 'Knockback next available time');
  return { nextAvailableAt: state.nextAvailableAt };
}

function assertPolicy(policy: EnemyKnockbackPolicy): void {
  assertPositiveFinite(policy.cooldownSeconds, 'Knockback cooldown');
  assertNonNegativeFinite(
    policy.distanceMultiplier,
    'Knockback distance multiplier',
  );
  assertNonNegativeFinite(policy.maxDistance, 'Knockback maximum distance');
}

function radialPoint(radius: number, angle: number): Vec2 {
  const diskRadius = Math.min(
    MAX_REPRESENTABLE_DISK_RADIUS,
    hyperbolicRadiusToPoincare(radius),
  );
  return {
    x: diskRadius * Math.cos(angle),
    y: diskRadius * Math.sin(angle),
  };
}

/** Returns an isolated policy snapshot for a known enemy family. */
export function getEnemyKnockbackPolicy(
  kind: EnemyKind,
): EnemyKnockbackPolicy {
  const policy = ENEMY_KNOCKBACK_POLICIES[kind];
  if (!policy) {
    throw new RangeError(`Unknown enemy knockback policy "${String(kind)}".`);
  }
  return { ...policy };
}

/** State for a newly spawned enemy; its first eligible hit can take effect. */
export function createEnemyKnockbackState(): EnemyKnockbackState {
  return { nextAvailableAt: 0 };
}

/**
 * Resolves one base-centered radial knockback without mutating an enemy or a
 * cooldown map. Callers store the returned `state` by enemy id and replace an
 * enemy's canonical position with `position` only when `applied` is true.
 * Sequential calls at the same time naturally give the first hit priority,
 * because it advances that enemy's shared `nextAvailableAt`.
 */
export function resolveEnemyKnockback(
  request: EnemyKnockbackRequest,
): EnemyKnockbackResolution {
  assertCanonicalPosition(request.position);
  assertNonNegativeFinite(request.requestedDistance, 'Knockback distance');
  assertNonNegativeFinite(request.now, 'Knockback time');
  assertPolicy(request.policy);

  const state = normalizeState(request.state);
  const position = clonePosition(request.position);
  const cappedDistance = Math.min(
    request.policy.maxDistance,
    request.requestedDistance * request.policy.distanceMultiplier,
  );

  if (request.now + COMPARISON_EPSILON < state.nextAvailableAt) {
    return {
      applied: false,
      blockedReason: 'cooldown',
      position,
      appliedDistance: 0,
      cappedDistance,
      state,
    };
  }

  if (cappedDistance <= COMPARISON_EPSILON) {
    return {
      applied: false,
      blockedReason: 'zero-distance',
      position,
      appliedDistance: 0,
      cappedDistance,
      state,
    };
  }

  const currentRadius = hyperbolicDistance(ORIGIN, position);
  const target = radialPoint(
    currentRadius + cappedDistance,
    Math.atan2(position.y, position.x),
  );
  const appliedDistance = hyperbolicDistance(position, target);

  if (appliedDistance <= COMPARISON_EPSILON) {
    return {
      applied: false,
      blockedReason: 'zero-distance',
      position,
      appliedDistance: 0,
      cappedDistance,
      state,
    };
  }

  return {
    applied: true,
    blockedReason: null,
    position: target,
    appliedDistance,
    cappedDistance,
    state: {
      nextAvailableAt: request.now + request.policy.cooldownSeconds,
    },
  };
}

/**
 * Convenience wrapper for the game's catalog policies. It retains the same
 * pure state input/output as `resolveEnemyKnockback` while avoiding callers
 * having to duplicate the family resistance lookup.
 */
export function resolveEnemyKindKnockback(
  kind: EnemyKind,
  request: Omit<EnemyKnockbackRequest, 'policy'>,
): EnemyKnockbackResolution {
  return resolveEnemyKnockback({
    ...request,
    policy: getEnemyKnockbackPolicy(kind),
  });
}
