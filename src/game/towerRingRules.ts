/** Outermost visible {7,3} tiling ring that accepts defensive towers. */
export const OUTERMOST_BUILDABLE_TOWER_RING = 4;

/**
 * Positional damage rewards for building farther away from the base.
 * Ring zero belongs to the base and is deliberately not buildable.
 */
export const TOWER_RING_DAMAGE_MULTIPLIERS = Object.freeze({
  1: 1,
  2: 2,
  3: 5,
  4: 15,
} as const);

export function isBuildableTowerRing(ring: number): boolean {
  return (
    Number.isInteger(ring) &&
    ring >= 1 &&
    ring <= OUTERMOST_BUILDABLE_TOWER_RING
  );
}

/** Returns the primary-damage multiplier for a tower's tiling ring. */
export function getTowerRingDamageMultiplier(ring: number): number {
  if (!Number.isFinite(ring)) {
    return 1;
  }

  const normalizedRing = Math.floor(ring);
  if (normalizedRing <= 1) {
    return TOWER_RING_DAMAGE_MULTIPLIERS[1];
  }
  if (normalizedRing === 2) {
    return TOWER_RING_DAMAGE_MULTIPLIERS[2];
  }
  if (normalizedRing === 3) {
    return TOWER_RING_DAMAGE_MULTIPLIERS[3];
  }
  return TOWER_RING_DAMAGE_MULTIPLIERS[4];
}

export function applyTowerRingDamage(damage: number, ring: number): number {
  if (!Number.isFinite(damage) || damage <= 0) {
    return 0;
  }
  return damage * getTowerRingDamageMultiplier(ring);
}
