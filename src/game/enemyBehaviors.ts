import type { Vec2 } from '../math/hyperbolic';
import { isEnemyKind } from './enemyTypes';
import type { EnemyKind } from './enemyTypes';

/** Re-exported from the catalog so behavior consumers share one enemy union. */
export type { EnemyKind } from './enemyTypes';

/**
 * Route information which survives a spawn, death, and any follow-up spawn.
 * The route controller owns its detailed path data; these canonical values
 * make a child spawn usable by the scene without importing Three.js here.
 */
export interface EnemyRouteContext {
  /** Entry direction in canonical Poincare coordinates, in radians. */
  readonly routeAngle: number;
  /** Original H² entry distance of the route. */
  readonly startRadius: number;
  /** H² distance the source enemy has already travelled on its route. */
  readonly travelledDistance: number;
  /** Optional stable route identifier for route planners with waypoints. */
  readonly routeId?: string;
}

/** The minimal canonical state needed to resolve an enemy death effect. */
export interface EnemyDefeatContext {
  readonly kind: EnemyKind;
  readonly canonicalPosition: Vec2;
  readonly route: EnemyRouteContext;
}

/**
 * A child to be handed to the scene's normal enemy spawner.
 *
 * No speed lives here deliberately: movement speed is an intrinsic property
 * of `kind`, supplied by the enemy catalog. `healthScale` similarly lets the
 * catalog remain the one source of each enemy's health curve.
 */
export interface EnemySpawnDescriptor {
  readonly kind: EnemyKind;
  readonly healthScale: number;
  readonly canonicalPosition: Vec2;
  readonly route: EnemyRouteContext;
  /** A deterministic left/right fork hint for route controllers. */
  readonly routeForkAngleRadians: number;
  readonly reason: 'splitter-death' | 'boss-reinforcement';
}

/** The split-on-death family always produces two smaller swarm units. */
export const SPLITTER_CHILD_KIND = 'swarm' as const;
export const SPLITTER_CHILD_COUNT = 2;
export const SPLITTER_CHILD_HEALTH_SCALE = 0.5;
export const SPLITTER_CHILD_ROUTE_FORK_ANGLES = [-0.16, 0.16] as const;

export type BossStageId = 'pressure' | 'last-stand';

export interface BossStageDefinition {
  readonly id: BossStageId;
  /** Fraction of maximum health at or below which the stage is entered. */
  readonly healthThreshold: number;
  /** Reinforcements used when the stage's optional spawn is enabled. */
  readonly reinforcements: readonly {
    readonly kind: EnemyKind;
    readonly healthScale: number;
    readonly routeForkAngleRadians: number;
  }[];
}

/**
 * These are health thresholds, not speed thresholds. No later boss phase is
 * allowed to change the boss's own movement speed.
 */
export const BOSS_STAGES: readonly BossStageDefinition[] = [
  {
    id: 'pressure',
    healthThreshold: 2 / 3,
    reinforcements: [
      { kind: 'swarm', healthScale: 0.7, routeForkAngleRadians: -0.14 },
      { kind: 'swarm', healthScale: 0.7, routeForkAngleRadians: 0.14 },
    ],
  },
  {
    id: 'last-stand',
    healthThreshold: 1 / 3,
    reinforcements: [
      { kind: 'raider', healthScale: 0.8, routeForkAngleRadians: -0.22 },
      { kind: 'raider', healthScale: 0.8, routeForkAngleRadians: 0.22 },
    ],
  },
];

/** State transition supplied when a boss takes damage. */
export interface BossHealthChangeContext extends EnemyDefeatContext {
  readonly kind: 'boss';
  readonly maxHealth: number;
  readonly previousHealth: number;
  readonly currentHealth: number;
  /** Set false when a level wants phase feedback without spawned adds. */
  readonly reinforcementsEnabled?: boolean;
}

export interface BossStageEvent {
  readonly stage: BossStageDefinition;
  readonly spawnedEnemies: readonly EnemySpawnDescriptor[];
}

function assertEnemyKind(value: unknown): asserts value is EnemyKind {
  if (!isEnemyKind(value)) {
    throw new RangeError(`Unknown enemy kind "${String(value)}".`);
  }
}

function assertFiniteNumber(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be finite.`);
  }
}

function assertCanonicalPosition(position: Vec2): void {
  assertFiniteNumber(position.x, 'canonicalPosition.x');
  assertFiniteNumber(position.y, 'canonicalPosition.y');

  if (position.x * position.x + position.y * position.y >= 1) {
    throw new RangeError('canonicalPosition must be inside the Poincare disk.');
  }
}

function assertRouteContext(route: EnemyRouteContext): void {
  assertFiniteNumber(route.routeAngle, 'route.routeAngle');
  assertFiniteNumber(route.startRadius, 'route.startRadius');
  assertFiniteNumber(route.travelledDistance, 'route.travelledDistance');

  if (route.startRadius <= 0) {
    throw new RangeError('route.startRadius must be positive.');
  }
  if (route.travelledDistance < 0) {
    throw new RangeError('route.travelledDistance must be non-negative.');
  }
  if (
    route.routeId !== undefined &&
    (typeof route.routeId !== 'string' || route.routeId.length === 0)
  ) {
    throw new RangeError('route.routeId must be a non-empty string when supplied.');
  }
}

function assertDefeatContext(context: EnemyDefeatContext): void {
  assertEnemyKind(context.kind);
  assertCanonicalPosition(context.canonicalPosition);
  assertRouteContext(context.route);
}

function clonePosition(position: Vec2): Vec2 {
  return { x: position.x, y: position.y };
}

function cloneRoute(route: EnemyRouteContext): EnemyRouteContext {
  return {
    routeAngle: route.routeAngle,
    startRadius: route.startRadius,
    travelledDistance: route.travelledDistance,
    ...(route.routeId === undefined ? {} : { routeId: route.routeId }),
  };
}

function createSpawnDescriptor(
  context: EnemyDefeatContext,
  kind: EnemyKind,
  healthScale: number,
  routeForkAngleRadians: number,
  reason: EnemySpawnDescriptor['reason'],
): EnemySpawnDescriptor {
  return {
    kind,
    healthScale,
    canonicalPosition: clonePosition(context.canonicalPosition),
    route: cloneRoute(context.route),
    routeForkAngleRadians,
    reason,
  };
}

/**
 * Resolves only death-triggered behavior. At present that means a splitter
 * produces two reduced-health swarms at the exact point it was defeated.
 * Non-splitter deaths intentionally return no descriptors.
 */
export function resolveEnemyDefeatBehavior(
  context: EnemyDefeatContext,
): readonly EnemySpawnDescriptor[] {
  assertDefeatContext(context);

  if (context.kind !== 'splitter') {
    return [];
  }

  return SPLITTER_CHILD_ROUTE_FORK_ANGLES.map((routeForkAngleRadians) =>
    createSpawnDescriptor(
      context,
      SPLITTER_CHILD_KIND,
      SPLITTER_CHILD_HEALTH_SCALE,
      routeForkAngleRadians,
      'splitter-death',
    ),
  );
}

function assertBossHealthChange(context: BossHealthChangeContext): void {
  assertDefeatContext(context);
  if (context.kind !== 'boss') {
    throw new RangeError('Boss stage behavior only accepts the boss enemy kind.');
  }
  assertFiniteNumber(context.maxHealth, 'maxHealth');
  assertFiniteNumber(context.previousHealth, 'previousHealth');
  assertFiniteNumber(context.currentHealth, 'currentHealth');

  if (context.maxHealth <= 0) {
    throw new RangeError('maxHealth must be positive.');
  }
  if (
    context.previousHealth < 0 ||
    context.previousHealth > context.maxHealth ||
    context.currentHealth < 0 ||
    context.currentHealth > context.maxHealth
  ) {
    throw new RangeError('Boss health must be within zero and maxHealth.');
  }
  if (context.currentHealth > context.previousHealth) {
    throw new RangeError('Boss health changes must not increase currentHealth.');
  }
}

/**
 * Returns every boss health stage crossed by one damage event, in threshold
 * order. Passing `reinforcementsEnabled: false` preserves stage events while
 * suppressing their optional spawned enemies.
 */
export function resolveBossHealthStages(
  context: BossHealthChangeContext,
): readonly BossStageEvent[] {
  assertBossHealthChange(context);

  return BOSS_STAGES.flatMap((stage) => {
    const thresholdHealth = context.maxHealth * stage.healthThreshold;
    const crossed =
      context.previousHealth > thresholdHealth &&
      context.currentHealth <= thresholdHealth;

    if (!crossed) {
      return [];
    }

    const spawnedEnemies =
      context.reinforcementsEnabled === false
        ? []
        : stage.reinforcements.map((reinforcement) =>
            createSpawnDescriptor(
              context,
              reinforcement.kind,
              reinforcement.healthScale,
              reinforcement.routeForkAngleRadians,
              'boss-reinforcement',
            ),
          );

    return [{ stage, spawnedEnemies }];
  });
}
