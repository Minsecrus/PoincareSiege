/**
 * Permanent per-tower augmentations.  Their levels deliberately start at
 * zero: a newly placed tower is unenchanted, while each enchantment can be
 * purchased independently through rank five.
 */
export const TOWER_ENCHANTMENT_KINDS = [
  'selfRepair',
  'allyHeal',
  'attackSpeed',
  'fortify',
] as const;

export type TowerEnchantmentKind = (typeof TOWER_ENCHANTMENT_KINDS)[number];

export const TOWER_ENCHANTMENT_MAX_LEVEL = 5;
export const TOWER_ENCHANTMENT_REFUND_RATE = 0.5;

/** Mutable state stored on a placed tower. Every value is normalized to 0–5. */
export interface TowerEnchantmentLevels {
  selfRepair: number;
  allyHeal: number;
  attackSpeed: number;
  fortify: number;
}

/** Allows pure callers to calculate effects from a partial level snapshot. */
export type TowerEnchantmentLevelsInput = Readonly<
  Partial<TowerEnchantmentLevels>
>;

/** Combat-facing aggregate supplied by the four independent enchantments. */
export interface TowerEnchantmentEffects {
  selfRepairPerSecond: number;
  allyHealPerSecond: number;
  /** H² radius around the healing tower. Zero means ally healing is inactive. */
  allyHealRange: number;
  /** Multiplies the base attack interval; lower is faster. */
  attackIntervalMultiplier: number;
  /** Multiplies the tower's base maximum health. */
  maxHealthMultiplier: number;
  /** Multiplies incoming damage; lower is more durable. */
  damageTakenMultiplier: number;
}

type EnchantmentCosts = readonly [number, number, number, number, number];

/** Index zero is the purchase price for rank one. */
const UPGRADE_COSTS: Record<TowerEnchantmentKind, EnchantmentCosts> = {
  selfRepair: [50, 80, 120, 180, 260],
  allyHeal: [70, 110, 160, 240, 340],
  attackSpeed: [80, 140, 200, 280, 380],
  fortify: [60, 100, 160, 220, 300],
};

const SELF_REPAIR_PER_SECOND = [0, 2, 4, 6, 8, 10] as const;
const ALLY_HEAL_PER_SECOND = [0, 4, 8, 12, 16, 20] as const;
const ALLY_HEAL_RANGE = [0, 1.2, 1.35, 1.5, 1.65, 1.8] as const;

/** Creates fresh mutable state so no two towers ever share enchantment state. */
export function createTowerEnchantmentLevels(): TowerEnchantmentLevels {
  return {
    selfRepair: 0,
    allyHeal: 0,
    attackSpeed: 0,
    fortify: 0,
  };
}

/** Clamps a malformed level into the valid, whole-rank 0–5 range. */
export function normalizeTowerEnchantmentLevel(level: number): number {
  const finiteLevel = Number.isFinite(level) ? level : 0;
  return Math.min(
    TOWER_ENCHANTMENT_MAX_LEVEL,
    Math.max(0, Math.floor(finiteLevel)),
  );
}

/** Returns a normalized independent copy suitable for persistent tower state. */
export function normalizeTowerEnchantmentLevels(
  levels: TowerEnchantmentLevelsInput,
): TowerEnchantmentLevels {
  return {
    selfRepair: normalizeTowerEnchantmentLevel(levels.selfRepair ?? 0),
    allyHeal: normalizeTowerEnchantmentLevel(levels.allyHeal ?? 0),
    attackSpeed: normalizeTowerEnchantmentLevel(levels.attackSpeed ?? 0),
    fortify: normalizeTowerEnchantmentLevel(levels.fortify ?? 0),
  };
}

/**
 * Cost of purchasing the next rank. `currentLevel` is normalized first;
 * returns null after rank five.
 */
export function getTowerEnchantmentUpgradeCost(
  kind: TowerEnchantmentKind,
  currentLevel: number,
): number | null {
  const level = normalizeTowerEnchantmentLevel(currentLevel);
  return level >= TOWER_ENCHANTMENT_MAX_LEVEL
    ? null
    : UPGRADE_COSTS[kind][level];
}

/** Total gold spent on one enchantment at its normalized current rank. */
export function getTowerEnchantmentInvestedCost(
  kind: TowerEnchantmentKind,
  level: number,
): number {
  const normalizedLevel = normalizeTowerEnchantmentLevel(level);
  let invested = 0;
  for (let rank = 0; rank < normalizedLevel; rank += 1) {
    invested += UPGRADE_COSTS[kind][rank];
  }
  return invested;
}

/** Total enchantment investment on a tower, excluding build and tower ranks. */
export function getTowerEnchantmentsInvestedCost(
  levels: TowerEnchantmentLevelsInput,
): number {
  return TOWER_ENCHANTMENT_KINDS.reduce(
    (total, kind) => total + getTowerEnchantmentInvestedCost(kind, levels[kind] ?? 0),
    0,
  );
}

/** Sell credit for one enchantment; it uses the same 50% recovery rule as towers. */
export function getTowerEnchantmentRefund(
  kind: TowerEnchantmentKind,
  level: number,
): number {
  return Math.floor(
    getTowerEnchantmentInvestedCost(kind, level) *
      TOWER_ENCHANTMENT_REFUND_RATE,
  );
}

/**
 * Sell credit contributed by all enchantments. Callers add this to the
 * tower's ordinary resale credit, so every paid enchantment proportionally
 * raises the money returned on sale.
 */
export function getTowerEnchantmentsRefund(
  levels: TowerEnchantmentLevelsInput,
): number {
  return Math.floor(
    getTowerEnchantmentsInvestedCost(levels) *
      TOWER_ENCHANTMENT_REFUND_RATE,
  );
}

/**
 * Resolves all level-derived combat effects in one immutable snapshot.  A
 * zero-level enchantment returns its neutral effect, so consumers can apply
 * every field without a special unenchanted code path.
 */
export function getTowerEnchantmentEffects(
  levels: TowerEnchantmentLevelsInput,
): TowerEnchantmentEffects {
  const normalized = normalizeTowerEnchantmentLevels(levels);
  return {
    selfRepairPerSecond: SELF_REPAIR_PER_SECOND[normalized.selfRepair],
    allyHealPerSecond: ALLY_HEAL_PER_SECOND[normalized.allyHeal],
    allyHealRange: ALLY_HEAL_RANGE[normalized.allyHeal],
    attackIntervalMultiplier: 1 / (1 + normalized.attackSpeed * 0.14),
    maxHealthMultiplier: 1 + normalized.fortify * 0.12,
    damageTakenMultiplier: 1 - normalized.fortify * 0.06,
  };
}
