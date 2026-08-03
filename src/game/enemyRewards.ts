/** Natural resource income, expressed in whole resource units per second. */
export const PASSIVE_RESOURCE_PER_SECOND = 5;

/** Enemy traits that determine its resource reward when defeated. */
export interface EnemyRewardProfile {
  maxHealth: number;
  speed: number;
}

/**
 * Gives tougher and faster enemies a larger whole-resource bounty.
 *
 * The basic enemy currently uses a fixed 0.1 speed: early enemies around
 * 100 health yield 6 resources, while later 208-health enemies yield 11.
 * Invalid or non-positive health and invalid/negative speed
 * deliberately yield no reward rather than introducing bad currency state.
 */
export function getEnemyDefeatReward({
  maxHealth,
  speed,
}: EnemyRewardProfile): number {
  if (
    !Number.isFinite(maxHealth) ||
    maxHealth <= 0 ||
    !Number.isFinite(speed) ||
    speed < 0
  ) {
    return 0;
  }

  return Math.max(0, Math.floor(maxHealth / 20 + speed * 10));
}
