import { hyperbolicDistance, type Vec2 } from '../math/hyperbolic';

/**
 * H² distance at which an advancing enemy can stop and attack a tower.
 * This is deliberately smaller than a typical tile radius, so an enemy must
 * actually reach a tower rather than merely pass through its broad vicinity.
 */
export const DEFAULT_TOWER_ASSAULT_RANGE = 0.32;

/** Fraction of a family's base-contact damage dealt to a tower on one hit. */
export const TOWER_ASSAULT_DAMAGE_FRACTION = 0.2;

const BASE_ASSAULT_INTERVAL_SECONDS = 1.15;
const MINIMUM_ASSAULT_INTERVAL_SECONDS = 0.45;
const ASSAULT_INTERVAL_LOG_SCALE = 0.12;
const CONTACT_DAMAGE_REFERENCE = 100;
const COMPARISON_EPSILON = 1e-9;

/** Canonical enemy state required to decide whether it attacks a tower. */
export interface TowerAssaultEnemy {
  readonly id: string;
  readonly position: Vec2;
  /** The family's authored base-contact damage. */
  readonly contactDamage: number;
}

/** Canonical tower state required to find an attackable target. */
export interface TowerAssaultTower {
  readonly id: string;
  readonly position: Vec2;
  /**
   * Omit this when the caller owns health elsewhere. A supplied non-positive
   * health value makes the tower ineligible, avoiding attacks on a tower that
   * has already been removed during the same simulation step.
   */
  readonly health?: number;
  /**
   * Optional H² radius for a defensive taunt. A living tower inside this
   * radius outranks ordinary engagement-range targets.
   */
  readonly tauntRadius?: number;
}

/** The single tuning input kept separate from the movement/combat resolver. */
export interface TowerAssaultOptions {
  readonly engagementRange?: number;
}

/** Per-hit cadence derived entirely from the enemy's contact threat. */
export interface TowerAssaultProfile {
  readonly damage: number;
  readonly intervalSeconds: number;
}

/** The nearest attackable tower, with its canonical H² separation. */
export interface TowerAssaultTarget {
  readonly towerId: string;
  readonly distance: number;
}

/**
 * A non-null attack means the caller should pause this enemy's route progress
 * and apply `damage` whenever its own per-enemy timer reaches `intervalSeconds`.
 */
export interface TowerAssaultAttack extends TowerAssaultProfile {
  readonly targetTowerId: string;
}

/** Pure movement/combat intent for one enemy's current simulation step. */
export interface TowerAssaultResolution {
  readonly target: TowerAssaultTarget | null;
  readonly shouldPauseMovement: boolean;
  readonly attack: TowerAssaultAttack | null;
}

function isFiniteDiskPoint(point: Vec2): boolean {
  return (
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    point.x * point.x + point.y * point.y < 1
  );
}

function isNonEmptyId(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0;
}

function isAttackableTower(tower: TowerAssaultTower): boolean {
  return (
    isNonEmptyId(tower.id) &&
    isFiniteDiskPoint(tower.position) &&
    (tower.health === undefined ||
      (Number.isFinite(tower.health) && tower.health > 0))
  );
}

function normalizeEngagementRange(options?: TowerAssaultOptions): number {
  const range = options?.engagementRange;
  return Number.isFinite(range) && range !== undefined && range >= 0
    ? range
    : DEFAULT_TOWER_ASSAULT_RANGE;
}

function compareTargets(
  left: TowerAssaultTarget,
  right: TowerAssaultTarget,
): number {
  const distanceDifference = left.distance - right.distance;
  if (Math.abs(distanceDifference) > COMPARISON_EPSILON) {
    return distanceDifference;
  }
  return left.towerId.localeCompare(right.towerId);
}

function getTauntRadius(tower: TowerAssaultTower): number | null {
  const radius = tower.tauntRadius;
  return Number.isFinite(radius) && radius !== undefined && radius >= 0
    ? radius
    : null;
}

/**
 * Converts a family contact threat into a tower-eating hit. Higher-contact
 * enemies hit proportionally harder and modestly more often; the cadence has
 * a floor so a late-game Boss remains observable and counterable.
 */
export function getTowerAssaultProfile(
  contactDamage: number,
): TowerAssaultProfile | null {
  if (!Number.isFinite(contactDamage) || contactDamage <= 0) {
    return null;
  }

  const damage = Math.max(
    1,
    Math.round(contactDamage * TOWER_ASSAULT_DAMAGE_FRACTION),
  );
  const intervalSeconds = Math.max(
    MINIMUM_ASSAULT_INTERVAL_SECONDS,
    BASE_ASSAULT_INTERVAL_SECONDS -
      Math.log2(1 + contactDamage / CONTACT_DAMAGE_REFERENCE) *
        ASSAULT_INTERVAL_LOG_SCALE,
  );

  return { damage, intervalSeconds };
}

/**
 * Resolves a living tower-assault target in H². A taunt-eligible defensive
 * tower wins first; otherwise this preserves the original closest living
 * target inside the engagement circle. It mutates neither collection and
 * intentionally owns no timer state, so the scene can preserve attack
 * progress while a target remains engaged.
 */
export function resolveTowerAssault(
  enemy: TowerAssaultEnemy,
  towers: readonly TowerAssaultTower[],
  options?: TowerAssaultOptions,
): TowerAssaultResolution {
  const profile = getTowerAssaultProfile(enemy.contactDamage);
  if (
    profile === null ||
    !isNonEmptyId(enemy.id) ||
    !isFiniteDiskPoint(enemy.position)
  ) {
    return {
      target: null,
      shouldPauseMovement: false,
      attack: null,
    };
  }

  const engagementRange = normalizeEngagementRange(options);
  const candidates = towers
    .filter(isAttackableTower)
    .map((tower) => ({
      target: {
        towerId: tower.id,
        distance: hyperbolicDistance(enemy.position, tower.position),
      } satisfies TowerAssaultTarget,
      tauntRadius: getTauntRadius(tower),
    }));
  const tauntTargets = candidates
    .filter(
      (candidate) =>
        candidate.tauntRadius !== null &&
        candidate.target.distance <=
          candidate.tauntRadius + COMPARISON_EPSILON,
    )
    .map((candidate) => candidate.target)
    .sort(compareTargets);
  const normalTargets = candidates
    .map((candidate) => candidate.target)
    .filter((target) => target.distance <= engagementRange + COMPARISON_EPSILON)
    .sort(compareTargets);
  const target = tauntTargets[0] ?? normalTargets[0] ?? null;

  if (target === null) {
    return {
      target: null,
      shouldPauseMovement: false,
      attack: null,
    };
  }

  return {
    target,
    shouldPauseMovement: true,
    attack: {
      targetTowerId: target.towerId,
      ...profile,
    },
  };
}
