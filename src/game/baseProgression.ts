import { hyperbolicDistance, type Vec2 } from '../math/hyperbolic';

export const BASE_SKILL_IDS = [
  'vitality',
  'regeneration',
  'areaPulse',
] as const;

export type BaseSkillId = (typeof BASE_SKILL_IDS)[number];

export interface BaseSkillLevels {
  vitality: number;
  regeneration: number;
  areaPulse: number;
}

export interface BaseProgression {
  health: number;
  skills: BaseSkillLevels;
}

export interface BaseStats {
  maxHealth: number;
  regenerationPerSecond: number;
  /** Damage dealt to exactly one target for one base attack. */
  targetDamage: number;
  /** Targeting radius in H² distance units. */
  targetRange: number;
  /** Seconds between single-target attacks. Zero means the skill is unlearned. */
  targetAttackIntervalSeconds: number;
}

/** Canonical enemy data eligible for the base's single-target lock. */
export interface BaseAttackTarget {
  readonly id: string;
  readonly position: Vec2;
  readonly health: number;
}

export const MAX_BASE_SKILL_LEVEL = 5;
export const BASE_HEALTH_PER_SEGMENT = 125;

export interface BaseHealthSegments {
  totalSegments: number;
  filledSegments: number;
}

const INITIAL_MAX_HEALTH = 1_000;
const HEALTH_PER_VITALITY_LEVEL = 250;
const REGENERATION_PER_LEVEL = 3;
const RANGE_COMPARISON_EPSILON = 1e-9;
const TARGET_DAMAGE_BY_LEVEL = [0, 220, 330, 480, 650, 850] as const;
const TARGET_RANGE_BY_LEVEL = [0, 2.15, 2.4, 2.65, 2.9, 3.15] as const;
const TARGET_ATTACK_INTERVAL_BY_LEVEL = [0, 1.2, 1.05, 0.9, 0.78, 0.68] as const;
const BASE_ORIGIN: Vec2 = { x: 0, y: 0 };

function normalizeBaseSkillLevel(level: number): number {
  const finiteLevel = Number.isFinite(level) ? Math.floor(level) : 0;
  return Math.min(MAX_BASE_SKILL_LEVEL, Math.max(0, finiteLevel));
}

export function getBaseStats(progression: BaseProgression): BaseStats {
  const vitalityLevel = normalizeBaseSkillLevel(progression.skills.vitality);
  const regenerationLevel = normalizeBaseSkillLevel(
    progression.skills.regeneration,
  );
  // The legacy `areaPulse` id now buys a high-damage, single-target attack.
  const targetLevel = normalizeBaseSkillLevel(progression.skills.areaPulse);
  return {
    maxHealth: INITIAL_MAX_HEALTH + vitalityLevel * HEALTH_PER_VITALITY_LEVEL,
    regenerationPerSecond: regenerationLevel * REGENERATION_PER_LEVEL,
    targetDamage: TARGET_DAMAGE_BY_LEVEL[targetLevel],
    targetRange: TARGET_RANGE_BY_LEVEL[targetLevel],
    targetAttackIntervalSeconds: TARGET_ATTACK_INTERVAL_BY_LEVEL[targetLevel],
  };
}

export function getBaseHealthSegments(
  progression: BaseProgression,
): BaseHealthSegments {
  const maxHealth = getBaseStats(progression).maxHealth;
  const clampedHealth = Math.min(maxHealth, Math.max(0, progression.health));

  return {
    totalSegments: Math.ceil(maxHealth / BASE_HEALTH_PER_SEGMENT),
    filledSegments: Math.ceil(clampedHealth / BASE_HEALTH_PER_SEGMENT),
  };
}

export function createBaseProgression(): BaseProgression {
  const progression: BaseProgression = {
    health: 0,
    skills: {
      vitality: 0,
      regeneration: 0,
      areaPulse: 0,
    },
  };
  progression.health = getBaseStats(progression).maxHealth;
  return progression;
}

export function canUpgradeBaseSkill(
  progression: BaseProgression,
  skill: BaseSkillId,
): boolean {
  return normalizeBaseSkillLevel(progression.skills[skill]) < MAX_BASE_SKILL_LEVEL;
}

export function upgradeBaseSkill(
  progression: BaseProgression,
  skill: BaseSkillId,
): boolean {
  if (!canUpgradeBaseSkill(progression, skill)) {
    return false;
  }

  const previousMaxHealth = getBaseStats(progression).maxHealth;
  progression.skills[skill] =
    normalizeBaseSkillLevel(progression.skills[skill]) + 1;

  if (skill === 'vitality') {
    progression.health +=
      getBaseStats(progression).maxHealth - previousMaxHealth;
  }
  return true;
}

export function regenerateBase(
  progression: BaseProgression,
  deltaTime: number,
): boolean {
  if (deltaTime <= 0 || !Number.isFinite(deltaTime)) {
    return false;
  }

  const stats = getBaseStats(progression);
  const nextHealth = Math.min(
    stats.maxHealth,
    progression.health + stats.regenerationPerSecond * deltaTime,
  );
  if (nextHealth === progression.health) {
    return false;
  }

  progression.health = nextHealth;
  return true;
}

/** Whether a point can be selected by the base's single-target attack. */
export function isInsideBaseTargetRange(
  progression: BaseProgression,
  point: Vec2,
): boolean {
  const stats = getBaseStats(progression);
  return (
    stats.targetDamage > 0 &&
    hyperbolicDistance(BASE_ORIGIN, point) <=
      stats.targetRange + RANGE_COMPARISON_EPSILON
  );
}

function isValidTarget(target: BaseAttackTarget): boolean {
  return (
    typeof target.id === 'string' &&
    Number.isFinite(target.health) &&
    target.health > 0 &&
    Number.isFinite(target.position.x) &&
    Number.isFinite(target.position.y)
  );
}

/**
 * Locks the single most durable valid enemy in range. Exact health ties use
 * H² distance, then ID, so targeting is stable no matter how the runtime
 * orders the active-enemy list.
 */
export function selectBaseAttackTarget(
  progression: BaseProgression,
  targets: readonly BaseAttackTarget[],
): BaseAttackTarget | null {
  const inRange = targets.filter(
    (target) =>
      isValidTarget(target) &&
      isInsideBaseTargetRange(progression, target.position),
  );
  if (inRange.length === 0) {
    return null;
  }

  inRange.sort((left, right) => {
    const healthDifference = right.health - left.health;
    if (Math.abs(healthDifference) > RANGE_COMPARISON_EPSILON) {
      return healthDifference;
    }

    const distanceDifference =
      hyperbolicDistance(BASE_ORIGIN, left.position) -
      hyperbolicDistance(BASE_ORIGIN, right.position);
    if (Math.abs(distanceDifference) > RANGE_COMPARISON_EPSILON) {
      return distanceDifference;
    }
    return left.id.localeCompare(right.id);
  });
  return inRange[0];
}
