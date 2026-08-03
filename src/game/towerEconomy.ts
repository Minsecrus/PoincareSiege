import { MAX_BASE_SKILL_LEVEL } from './baseProgression';

/** Every buildable tower family in the first combat roster. */
export const TOWER_KINDS = [
  'sector',
  'prism',
  'pulse',
  'anchor',
  'arc',
] as const;

export type TowerKind = (typeof TOWER_KINDS)[number];

export const TOWER_MAX_LEVEL = 3;

/** Compatibility name for the original tower family. */
export const SECTOR_TOWER_MAX_LEVEL = TOWER_MAX_LEVEL;

interface TowerEconomy {
  buildCost: number;
  /** Indexed by the level being left: level 1 -> index 0. */
  upgradeCosts: readonly [number, number];
}

const TOWER_ECONOMY_BY_KIND: Record<TowerKind, TowerEconomy> = {
  sector: {
    buildCost: 100,
    upgradeCosts: [80, 140],
  },
  prism: {
    buildCost: 130,
    upgradeCosts: [110, 170],
  },
  pulse: {
    buildCost: 150,
    upgradeCosts: [120, 180],
  },
  anchor: {
    buildCost: 120,
    upgradeCosts: [90, 140],
  },
  arc: {
    buildCost: 170,
    upgradeCosts: [140, 210],
  },
};

const BASE_SKILL_UPGRADE_COST_BY_LEVEL = [80, 140, 220] as const;
const SELL_REFUND_RATE = 0.5;

/** Compatibility constant for callers that only know the sector tower. */
export const SECTOR_TOWER_BUILD_COST = TOWER_ECONOMY_BY_KIND.sector.buildCost;

function normalizeTowerLevel(level: number): number {
  const finiteLevel = Number.isFinite(level) ? level : 1;
  return Math.min(TOWER_MAX_LEVEL, Math.max(1, Math.floor(finiteLevel)));
}

/** Returns the cost to construct the specified tower at level one. */
export function getTowerBuildCost(kind: TowerKind): number {
  return TOWER_ECONOMY_BY_KIND[kind].buildCost;
}

/**
 * Returns the price of the next tower rank, or null once a tower is maxed.
 * Invalid levels are normalized to level one for consistency with stats.
 */
export function getTowerUpgradeCost(
  kind: TowerKind,
  level: number,
): number | null {
  const normalizedLevel = normalizeTowerLevel(level);
  if (normalizedLevel >= TOWER_MAX_LEVEL) {
    return null;
  }

  return TOWER_ECONOMY_BY_KIND[kind].upgradeCosts[normalizedLevel - 1];
}

/** Total resources invested in a tower at its normalized current level. */
export function getTowerInvestedCost(kind: TowerKind, level: number): number {
  const normalizedLevel = normalizeTowerLevel(level);
  const economy = TOWER_ECONOMY_BY_KIND[kind];
  let investedCost = economy.buildCost;

  for (let currentLevel = 1; currentLevel < normalizedLevel; currentLevel += 1) {
    investedCost += economy.upgradeCosts[currentLevel - 1];
  }

  return investedCost;
}

/** Half of all invested resources, rounded down to a whole resource unit. */
export function getTowerRefund(kind: TowerKind, level: number): number {
  return Math.floor(getTowerInvestedCost(kind, level) * SELL_REFUND_RATE);
}

/** Original sector-only upgrade API retained for existing callers. */
export function getSectorTowerUpgradeCost(level: number): number | null {
  return getTowerUpgradeCost('sector', level);
}

/** Original sector-only invested-cost API retained for existing callers. */
export function getSectorTowerInvestedCost(level: number): number {
  return getTowerInvestedCost('sector', level);
}

/** Original sector-only sell API retained for existing callers. */
export function getSectorTowerRefund(level: number): number {
  return getTowerRefund('sector', level);
}

/** Cost to raise one base skill from its current level by one rank. */
export function getBaseSkillUpgradeCost(level: number): number | null {
  const normalizedLevel = Math.max(
    0,
    Math.floor(Number.isFinite(level) ? level : 0),
  );
  return normalizedLevel >= MAX_BASE_SKILL_LEVEL
    ? null
    : BASE_SKILL_UPGRADE_COST_BY_LEVEL[normalizedLevel];
}
