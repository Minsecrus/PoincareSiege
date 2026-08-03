import { hyperbolicDistance, type Vec2 } from '../math/hyperbolic';
import {
  getTowerEnchantmentEffects,
  type TowerEnchantmentLevels,
} from './towerEnchantments';

const COMPARISON_EPSILON = 1e-9;

/** The base values an enchantment can modify without depending on a renderer. */
export interface TowerEnchantmentCombatBaseStats {
  maxHealth: number;
  attackIntervalSeconds: number;
}

/**
 * The combat-facing result of applying one tower's enchantments.
 *
 * `damageTakenMultiplier` is intended for future enemy attacks against
 * towers. It is deliberately separate from `maxHealth`: fortify provides
 * both a larger health pool and reduced incoming damage.
 */
export interface TowerEnchantmentCombatStats {
  maxHealth: number;
  attackIntervalSeconds: number;
  selfRepairPerSecond: number;
  allyHealPerSecond: number;
  allyHealRange: number;
  damageTakenMultiplier: number;
}

/** Canonical tower state sufficient to choose an allied heal recipient. */
export interface AllyHealTower {
  id: string;
  position: Vec2;
  health: number;
  maxHealth: number;
}

/** A chosen recipient; the caller applies the per-second healing over time. */
export interface AllyHealResolution {
  targetId: string;
  healingPerSecond: number;
  range: number;
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function clampHealth(health: number, maxHealth: number): number {
  const safeMaxHealth = finiteNonNegative(maxHealth);
  if (!Number.isFinite(health)) {
    return 0;
  }

  return Math.min(safeMaxHealth, Math.max(0, health));
}

function hasFinitePosition(position: Vec2): boolean {
  return Number.isFinite(position.x) && Number.isFinite(position.y);
}

/** Returns the fortify-adjusted health cap for a tower's catalog health. */
export function getTowerEnchantedMaxHealth(
  baseMaxHealth: number,
  levels: TowerEnchantmentLevels,
): number {
  return (
    finiteNonNegative(baseMaxHealth) *
    getTowerEnchantmentEffects(levels).maxHealthMultiplier
  );
}

/**
 * Returns the multiplier applied to a catalog attack interval. Values below
 * one make the tower attack more often.
 */
export function getTowerAttackIntervalMultiplier(
  levels: TowerEnchantmentLevels,
): number {
  return getTowerEnchantmentEffects(levels).attackIntervalMultiplier;
}

/** Returns a haste-adjusted attack interval in simulation seconds. */
export function getTowerAttackIntervalSeconds(
  baseIntervalSeconds: number,
  levels: TowerEnchantmentLevels,
): number {
  return (
    finiteNonNegative(baseIntervalSeconds) *
    getTowerAttackIntervalMultiplier(levels)
  );
}

/** Returns the fortify multiplier for incoming tower damage. */
export function getTowerIncomingDamageMultiplier(
  levels: TowerEnchantmentLevels,
): number {
  return getTowerEnchantmentEffects(levels).damageTakenMultiplier;
}

/** Returns the self-repair rate in health points per simulation second. */
export function getTowerSelfRepairPerSecond(
  levels: TowerEnchantmentLevels,
): number {
  return getTowerEnchantmentEffects(levels).selfRepairPerSecond;
}

/** Values needed to continuously heal a selected allied tower. */
export function getTowerAllyHealStats(
  levels: TowerEnchantmentLevels,
): Pick<AllyHealResolution, 'healingPerSecond' | 'range'> {
  const effects = getTowerEnchantmentEffects(levels);
  return {
    healingPerSecond: effects.allyHealPerSecond,
    range: effects.allyHealRange,
  };
}

/**
 * Derives only the values enchantments change. The base tower catalog remains
 * the authority for weapon damage, range, and attack mode.
 */
export function getTowerEnchantmentCombatStats(
  baseStats: TowerEnchantmentCombatBaseStats,
  levels: TowerEnchantmentLevels,
): TowerEnchantmentCombatStats {
  const effects = getTowerEnchantmentEffects(levels);

  return {
    maxHealth: getTowerEnchantedMaxHealth(baseStats.maxHealth, levels),
    attackIntervalSeconds: getTowerAttackIntervalSeconds(
      baseStats.attackIntervalSeconds,
      levels,
    ),
    selfRepairPerSecond: effects.selfRepairPerSecond,
    allyHealPerSecond: effects.allyHealPerSecond,
    allyHealRange: effects.allyHealRange,
    damageTakenMultiplier: effects.damageTakenMultiplier,
  };
}

/**
 * Applies fortify to an incoming tower-damage amount. Values are intentionally
 * not rounded: the game can keep combat calculations precise and only round
 * presentation when needed.
 */
export function getFortifiedTowerDamage(
  incomingDamage: number,
  levels: TowerEnchantmentLevels,
): number {
  return (
    finiteNonNegative(incomingDamage) *
    getTowerIncomingDamageMultiplier(levels)
  );
}

/** Restores health at a fixed rate, while always respecting the current cap. */
export function restoreTowerHealth(
  health: number,
  maxHealth: number,
  healingPerSecond: number,
  deltaSeconds: number,
): number {
  const currentHealth = clampHealth(health, maxHealth);
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
    return currentHealth;
  }

  return Math.min(
    finiteNonNegative(maxHealth),
    currentHealth + finiteNonNegative(healingPerSecond) * deltaSeconds,
  );
}

/** Applies this tower's self-repair enchantment for one simulation step. */
export function applyTowerSelfRepair(
  health: number,
  maxHealth: number,
  levels: TowerEnchantmentLevels,
  deltaSeconds: number,
): number {
  return restoreTowerHealth(
    health,
    maxHealth,
    getTowerSelfRepairPerSecond(levels),
    deltaSeconds,
  );
}

/** Applies this tower's ally-healing enchantment for one simulation step. */
export function applyTowerAllyHeal(
  health: number,
  maxHealth: number,
  levels: TowerEnchantmentLevels,
  deltaSeconds: number,
): number {
  return restoreTowerHealth(
    health,
    maxHealth,
    getTowerAllyHealStats(levels).healingPerSecond,
    deltaSeconds,
  );
}

interface RankedAllyHealTarget {
  tower: AllyHealTower;
  healthFraction: number;
  distance: number;
}

function isHigherPriorityHealTarget(
  candidate: RankedAllyHealTarget,
  current: RankedAllyHealTarget,
): boolean {
  const healthFractionDifference =
    candidate.healthFraction - current.healthFraction;
  if (Math.abs(healthFractionDifference) > COMPARISON_EPSILON) {
    // Heal the most damaged ally first, relative to its own health cap.
    return healthFractionDifference < 0;
  }

  const distanceDifference = candidate.distance - current.distance;
  if (Math.abs(distanceDifference) > COMPARISON_EPSILON) {
    return distanceDifference < 0;
  }

  return candidate.tower.id < current.tower.id;
}

/**
 * Picks exactly one damaged allied tower in the enchantment's H² range.
 *
 * A healer never targets itself. Ties use H²-nearest distance, then stable ID
 * ordering, so the result is independent of rendering and deterministic for
 * the same canonical game state.
 */
export function resolveAllyHealTarget(
  source: Pick<AllyHealTower, 'id' | 'position'>,
  candidates: readonly AllyHealTower[],
  levels: TowerEnchantmentLevels,
): AllyHealResolution | null {
  const effects = getTowerEnchantmentEffects(levels);
  if (
    !hasFinitePosition(source.position) ||
    effects.allyHealPerSecond <= 0 ||
    effects.allyHealRange <= 0
  ) {
    return null;
  }

  let selected: RankedAllyHealTarget | null = null;
  for (const candidate of candidates) {
    if (
      candidate.id === source.id ||
      typeof candidate.id !== 'string' ||
      !hasFinitePosition(candidate.position) ||
      !Number.isFinite(candidate.health) ||
      !Number.isFinite(candidate.maxHealth) ||
      candidate.maxHealth <= 0
    ) {
      continue;
    }

    const health = clampHealth(candidate.health, candidate.maxHealth);
    if (health >= candidate.maxHealth - COMPARISON_EPSILON) {
      continue;
    }

    const distance = hyperbolicDistance(source.position, candidate.position);
    if (distance > effects.allyHealRange + COMPARISON_EPSILON) {
      continue;
    }

    const ranked: RankedAllyHealTarget = {
      tower: candidate,
      healthFraction: health / candidate.maxHealth,
      distance,
    };
    if (!selected || isHigherPriorityHealTarget(ranked, selected)) {
      selected = ranked;
    }
  }

  return selected
    ? {
        targetId: selected.tower.id,
        healingPerSecond: effects.allyHealPerSecond,
        range: effects.allyHealRange,
      }
    : null;
}
