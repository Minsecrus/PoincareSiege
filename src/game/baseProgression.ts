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
  skillPoints: number;
  health: number;
  skills: BaseSkillLevels;
}

export interface BaseStats {
  maxHealth: number;
  regenerationPerSecond: number;
  areaDamage: number;
  areaRadius: number;
}

export const MAX_BASE_SKILL_LEVEL = 3;
export const BASE_HEALTH_PER_SEGMENT = 125;

export interface BaseHealthSegments {
  totalSegments: number;
  filledSegments: number;
}

const INITIAL_MAX_HEALTH = 1_000;
const HEALTH_PER_VITALITY_LEVEL = 250;
const REGENERATION_PER_LEVEL = 3;
const RANGE_COMPARISON_EPSILON = 1e-9;

export function getBaseStats(progression: BaseProgression): BaseStats {
  const pulseLevel = progression.skills.areaPulse;
  return {
    maxHealth:
      INITIAL_MAX_HEALTH +
      progression.skills.vitality * HEALTH_PER_VITALITY_LEVEL,
    regenerationPerSecond:
      progression.skills.regeneration * REGENERATION_PER_LEVEL,
    areaDamage: pulseLevel === 0 ? 0 : 40 + (pulseLevel - 1) * 25,
    areaRadius: pulseLevel === 0 ? 0 : 1.35 + (pulseLevel - 1) * 0.25,
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

export function createBaseProgression(skillPoints = 3): BaseProgression {
  const progression: BaseProgression = {
    skillPoints,
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
  return (
    progression.skillPoints > 0 &&
    progression.skills[skill] < MAX_BASE_SKILL_LEVEL
  );
}

export function upgradeBaseSkill(
  progression: BaseProgression,
  skill: BaseSkillId,
): boolean {
  if (!canUpgradeBaseSkill(progression, skill)) {
    return false;
  }

  const previousMaxHealth = getBaseStats(progression).maxHealth;
  progression.skills[skill] += 1;
  progression.skillPoints -= 1;

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

export function isInsideBaseAttackRange(
  progression: BaseProgression,
  point: Vec2,
): boolean {
  const stats = getBaseStats(progression);
  return (
    stats.areaDamage > 0 &&
    hyperbolicDistance({ x: 0, y: 0 }, point) <=
      stats.areaRadius + RANGE_COMPARISON_EPSILON
  );
}
