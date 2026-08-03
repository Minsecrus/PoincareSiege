import { hyperbolicDistance, type Vec2 } from '../math/hyperbolic';
import type { TowerKind } from './towerStats';

const COMPARISON_EPSILON = 1e-9;

/** Visual channel used by precision attacks. */
export type PrecisionProjectileStyle =
  | 'sniper-projectile'
  | 'base-projectile';

/**
 * Canonical input shared by the renderer and combat runtime. Target order is
 * meaningful: chained effects use it as their visual propagation order.
 */
export interface TowerAttackTimingRequest {
  readonly kind: TowerKind;
  readonly origin: Readonly<Vec2>;
  readonly targets: readonly Readonly<Vec2>[];
  readonly range?: number;
  readonly style?: PrecisionProjectileStyle;
}

/**
 * One source of truth for animated attack travel. Values measured in progress
 * are fractions of `durationSeconds`; the runtime converts them to simulation
 * seconds before scheduling damage.
 */
export const TOWER_ATTACK_EFFECT_TIMING = Object.freeze({
  sector: Object.freeze({
    durationSeconds: 0.28,
    tracerRevealSpeed: 3.2,
  }),
  prism: Object.freeze({
    durationSeconds: 0.54,
    beamStartProgress: 0.08,
    beamTravelProgress: 0.22,
  }),
  pulse: Object.freeze({
    durationSeconds: 0.78,
    primaryRingSpeed: 1.18,
    rangeFallback: 0.8,
  }),
  anchor: Object.freeze({
    durationSeconds: 1.12,
    initialRadiusFraction: 0.76,
    expansionProgress: 0.17,
    rangeFallback: 0.85,
  }),
  arc: Object.freeze({
    durationSeconds: 0.48,
    propagationProgress: 0.42,
  }),
  sniperProjectile: Object.freeze({
    durationSeconds: 0.46,
    flightEndProgress: 0.8,
  }),
  baseProjectile: Object.freeze({
    durationSeconds: 0.74,
    flightEndProgress: 0.72,
  }),
});

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/** Inverse of the clamped `easeOutCubic` used by the visual leading edges. */
function inverseEaseOutCubic(value: number): number {
  return 1 - Math.cbrt(1 - clamp(value, 0, 1));
}

function isPositiveFinite(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value > 0;
}

/** Returns the timing profile for one ordinary or base precision projectile. */
export function getPrecisionProjectileTiming(
  style: PrecisionProjectileStyle = 'sniper-projectile',
): (typeof TOWER_ATTACK_EFFECT_TIMING)['sniperProjectile'] | (typeof TOWER_ATTACK_EFFECT_TIMING)['baseProjectile'] {
  return style === 'base-projectile'
    ? TOWER_ATTACK_EFFECT_TIMING.baseProjectile
    : TOWER_ATTACK_EFFECT_TIMING.sniperProjectile;
}

/**
 * Uses the authored gameplay range when present; fallback radii keep renderer
 * previews usable for callers that only provide captured target positions.
 */
export function resolveTowerAttackEffectRange(
  origin: Readonly<Vec2>,
  targets: readonly Readonly<Vec2>[],
  requestedRange: number | undefined,
  fallback: number,
): number {
  if (isPositiveFinite(requestedRange)) {
    return requestedRange;
  }

  const farthest = targets.reduce(
    (range, target) => Math.max(range, hyperbolicDistance(origin, target)),
    0,
  );
  return Math.max(fallback, farthest + 0.1);
}

function prismImpactDelay(
  origin: Readonly<Vec2>,
  target: Readonly<Vec2>,
  terminalDistance: number,
): number {
  const timing = TOWER_ATTACK_EFFECT_TIMING.prism;
  const covered =
    terminalDistance <= COMPARISON_EPSILON
      ? 1
      : hyperbolicDistance(origin, target) / terminalDistance;
  const progress =
    timing.beamStartProgress +
    timing.beamTravelProgress * inverseEaseOutCubic(covered);
  return timing.durationSeconds * progress;
}

function pulseImpactDelay(
  origin: Readonly<Vec2>,
  target: Readonly<Vec2>,
  range: number,
): number {
  const timing = TOWER_ATTACK_EFFECT_TIMING.pulse;
  const progress =
    clamp(hyperbolicDistance(origin, target) / Math.max(range, 0.001), 0, 1) /
    timing.primaryRingSpeed;
  return timing.durationSeconds * progress;
}

function anchorImpactDelay(
  origin: Readonly<Vec2>,
  target: Readonly<Vec2>,
  range: number,
): number {
  const timing = TOWER_ATTACK_EFFECT_TIMING.anchor;
  const fraction = clamp(
    hyperbolicDistance(origin, target) / Math.max(range, 0.001),
    0,
    1,
  );
  if (fraction <= timing.initialRadiusFraction + COMPARISON_EPSILON) {
    return 0;
  }

  const expansionAmount =
    (fraction - timing.initialRadiusFraction) /
    (1 - timing.initialRadiusFraction);
  const progress =
    timing.expansionProgress * inverseEaseOutCubic(expansionAmount);
  return timing.durationSeconds * progress;
}

/**
 * Returns the instant each captured target is first reached by its matching
 * effect. These delays are simulation-time values and therefore remain in
 * lockstep with pause and the selected game-speed multiplier.
 */
export function getTowerAttackImpactDelays(
  request: TowerAttackTimingRequest,
): readonly number[] {
  if (request.targets.length === 0) {
    return [];
  }

  switch (request.kind) {
    case 'sector': {
      const timing = TOWER_ATTACK_EFFECT_TIMING.sector;
      return request.targets.map(
        () => timing.durationSeconds / timing.tracerRevealSpeed,
      );
    }
    case 'prism': {
      const terminalDistance = request.targets.reduce(
        (longest, target) =>
          Math.max(longest, hyperbolicDistance(request.origin, target)),
        0,
      );
      return request.targets.map((target) =>
        prismImpactDelay(request.origin, target, terminalDistance),
      );
    }
    case 'pulse': {
      const range = resolveTowerAttackEffectRange(
        request.origin,
        request.targets,
        request.range,
        TOWER_ATTACK_EFFECT_TIMING.pulse.rangeFallback,
      );
      return request.targets.map((target) =>
        pulseImpactDelay(request.origin, target, range),
      );
    }
    case 'anchor': {
      const range = resolveTowerAttackEffectRange(
        request.origin,
        request.targets,
        request.range,
        TOWER_ATTACK_EFFECT_TIMING.anchor.rangeFallback,
      );
      return request.targets.map((target) =>
        anchorImpactDelay(request.origin, target, range),
      );
    }
    case 'arc': {
      const timing = TOWER_ATTACK_EFFECT_TIMING.arc;
      const targetCount = Math.max(1, request.targets.length);
      return request.targets.map((_, index) =>
        timing.durationSeconds *
        timing.propagationProgress *
        inverseEaseOutCubic((index + 1) / targetCount),
      );
    }
    case 'sniper': {
      const timing = getPrecisionProjectileTiming(request.style);
      const delay = timing.durationSeconds * timing.flightEndProgress;
      return request.targets.map(() => delay);
    }
  }
}
