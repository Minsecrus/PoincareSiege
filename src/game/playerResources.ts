import {
  SECTOR_TOWER_BUILD_COST,
  type TowerKind,
  getBaseSkillUpgradeCost,
  getTowerBuildCost,
  getTowerRefund,
  getTowerUpgradeCost,
} from './towerEconomy';

export const INITIAL_PLAYER_RESOURCES = SECTOR_TOWER_BUILD_COST * 5;

export interface PlayerResources {
  amount: number;
}

export interface ResourcePayment {
  resources: PlayerResources;
  paid: boolean;
}

function isCurrencyAmount(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && Number.isInteger(value);
}

/** Creates an isolated, UI-agnostic resource state. */
export function createPlayerResources(
  amount = INITIAL_PLAYER_RESOURCES,
): PlayerResources {
  return {
    amount: isCurrencyAmount(amount) ? amount : INITIAL_PLAYER_RESOURCES,
  };
}

export function canPayResources(
  resources: PlayerResources,
  cost: number,
): boolean {
  return isCurrencyAmount(cost) && resources.amount >= cost;
}

/**
 * Pays a whole-number cost without mutating the input state. On failure, the
 * original state object is returned so callers can cheaply skip UI updates.
 */
export function payResources(
  resources: PlayerResources,
  cost: number,
): ResourcePayment {
  if (!canPayResources(resources, cost)) {
    return { resources, paid: false };
  }

  return {
    resources: { amount: resources.amount - cost },
    paid: true,
  };
}

/** Adds a valid whole-number refund without mutating the input state. */
export function refundResources(
  resources: PlayerResources,
  refund: number,
): PlayerResources {
  if (!isCurrencyAmount(refund)) {
    return resources;
  }

  return { amount: resources.amount + refund };
}

/** Pays the construction cost for a specific tower family. */
export function payForTower(
  resources: PlayerResources,
  kind: TowerKind,
): ResourcePayment {
  return payResources(resources, getTowerBuildCost(kind));
}

/** Pays the next upgrade rank for a specific tower family. */
export function payForTowerUpgrade(
  resources: PlayerResources,
  kind: TowerKind,
  level: number,
): ResourcePayment {
  const cost = getTowerUpgradeCost(kind, level);
  return cost === null
    ? { resources, paid: false }
    : payResources(resources, cost);
}

/** Credits the sell refund for a specific tower family. */
export function refundTower(
  resources: PlayerResources,
  kind: TowerKind,
  level: number,
): PlayerResources {
  return refundResources(resources, getTowerRefund(kind, level));
}

export function payForSectorTower(
  resources: PlayerResources,
): ResourcePayment {
  return payForTower(resources, 'sector');
}

export function payForSectorTowerUpgrade(
  resources: PlayerResources,
  level: number,
): ResourcePayment {
  return payForTowerUpgrade(resources, 'sector', level);
}

export function refundSectorTower(
  resources: PlayerResources,
  level: number,
): PlayerResources {
  return refundTower(resources, 'sector', level);
}

export function payForBaseSkillUpgrade(
  resources: PlayerResources,
  level: number,
): ResourcePayment {
  const cost = getBaseSkillUpgradeCost(level);
  return cost === null
    ? { resources, paid: false }
    : payResources(resources, cost);
}
