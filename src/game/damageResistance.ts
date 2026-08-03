import type { EnemyKind } from './enemyTypes';
import type { TowerKind } from './towerEconomy';

export type DamageType = 'kinetic' | 'energy' | 'pure';

export type DamageTowerKind = TowerKind;

type ResistibleDamageType = Exclude<DamageType, 'pure'>;

const TOWER_DAMAGE_TYPES: Readonly<Record<DamageTowerKind, DamageType>> = {
  sector: 'kinetic',
  prism: 'energy',
  pulse: 'energy',
  anchor: 'energy',
  arc: 'energy',
  sniper: 'kinetic',
  support: 'energy',
  // The wall's pulse is intentionally weak, but it is still a physical
  // shockwave so its contact damage and knockback share the kinetic channel.
  bulwark: 'kinetic',
};

const ENEMY_DAMAGE_RESISTANCES: Readonly<
  Record<EnemyKind, Readonly<Record<ResistibleDamageType, number>>>
> = {
  basic: {
    kinetic: 0,
    energy: 0,
  },
  swarm: {
    kinetic: -0.15,
    energy: 0.2,
  },
  armored: {
    kinetic: 0.35,
    energy: -0.15,
  },
  splitter: {
    kinetic: 0,
    energy: 0.3,
  },
  raider: {
    kinetic: 0.25,
    energy: -0.1,
  },
  boss: {
    kinetic: 0.15,
    energy: 0.15,
  },
};

/** Returns the resistance channel used by a tower's attacks. */
export function getTowerDamageType(kind: DamageTowerKind): DamageType {
  return TOWER_DAMAGE_TYPES[kind];
}

/**
 * Returns a decimal damage reduction. Negative values represent weakness;
 * pure damage deliberately bypasses every resistance profile.
 */
export function getEnemyDamageResistance(
  kind: EnemyKind,
  damageType: DamageType,
): number {
  if (damageType === 'pure') {
    return 0;
  }

  return ENEMY_DAMAGE_RESISTANCES[kind][damageType];
}

/** Applies an enemy's resistance to one impact without accepting bad damage. */
export function applyEnemyDamageResistance(
  damage: number,
  kind: EnemyKind,
  damageType: DamageType,
): number {
  if (!Number.isFinite(damage) || damage <= 0) {
    return 0;
  }

  const resistance = getEnemyDamageResistance(kind, damageType);
  return Math.max(0, damage * (1 - resistance));
}
