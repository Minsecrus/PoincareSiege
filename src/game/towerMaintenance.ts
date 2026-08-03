import {
  applyTowerAllyHeal,
  applyTowerSelfRepair,
  resolveAllyHealTarget,
  type AllyHealTower,
} from './towerEnchantmentCombat';
import type { TowerEnchantmentLevels } from './towerEnchantments';

/** Mutable tower data needed by the continuous enchantment maintenance pass. */
export interface TowerMaintenanceTower extends AllyHealTower {
  readonly enchantments: TowerEnchantmentLevels;
}

/** One health value produced by the view-independent maintenance simulation. */
export interface TowerMaintenanceUpdate {
  readonly towerId: string;
  readonly health: number;
}

function isUsableTower(tower: TowerMaintenanceTower): boolean {
  return (
    typeof tower.id === 'string' &&
    tower.id.length > 0 &&
    Number.isFinite(tower.health) &&
    Number.isFinite(tower.maxHealth) &&
    tower.maxHealth > 0
  );
}

/**
 * Resolves self-repair followed by ally healing for a single simulation step.
 * Each healer selects one damaged ally in strict H² range. Updates are applied
 * in stable input order, making same-frame multi-healer support deterministic.
 */
export function resolveTowerMaintenance(
  towers: readonly TowerMaintenanceTower[],
  deltaSeconds: number,
): readonly TowerMaintenanceUpdate[] {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
    return [];
  }

  const working = new Map<string, TowerMaintenanceTower>();
  for (const tower of towers) {
    if (!isUsableTower(tower) || working.has(tower.id)) {
      continue;
    }
    working.set(tower.id, { ...tower });
  }

  for (const tower of working.values()) {
    tower.health = applyTowerSelfRepair(
      tower.health,
      tower.maxHealth,
      tower.enchantments,
      deltaSeconds,
    );
  }

  for (const healer of working.values()) {
    const target = resolveAllyHealTarget(
      healer,
      Array.from(working.values()),
      healer.enchantments,
    );
    if (!target) {
      continue;
    }

    const recipient = working.get(target.targetId);
    if (!recipient) {
      continue;
    }
    recipient.health = applyTowerAllyHeal(
      recipient.health,
      recipient.maxHealth,
      healer.enchantments,
      deltaSeconds,
    );
  }

  return Array.from(working.values(), (tower) => ({
    towerId: tower.id,
    health: tower.health,
  }));
}
