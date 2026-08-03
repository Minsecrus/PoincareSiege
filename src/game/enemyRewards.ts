/** Natural resource income, expressed in whole resource units per second. */
export const PASSIVE_RESOURCE_PER_SECOND = 5;

/** The gentle bounty curve used only for campaign-scaled enemy spawns. */
export const WAVE_ENEMY_REWARD_LOG_FACTOR = 0.45;
export const MAX_WAVE_ENEMY_REWARD_MULTIPLIER = 3.25;

/** Inputs for the bounded campaign bounty curve. */
export interface WaveEnemyRewardProfile {
  /** The family's normal, whole-resource bounty. */
  readonly baseReward: number;
  /** The family's unscaled maximum health. */
  readonly baseHealth: number;
  /** The maximum health resolved for this individual runtime spawn. */
  readonly actualHealth: number;
}

/**
 * Rewards wave-scaled health without turning high-health waves into an
 * unlimited resource fountain. Health below a family's baseline never lowers
 * its bounty; later multipliers grow logarithmically and stop at 3.25x.
 */
export function getWaveEnemyReward({
  baseReward,
  baseHealth,
  actualHealth,
}: WaveEnemyRewardProfile): number {
  if (
    !Number.isFinite(baseReward) ||
    baseReward <= 0 ||
    !Number.isFinite(baseHealth) ||
    baseHealth <= 0 ||
    !Number.isFinite(actualHealth) ||
    actualHealth <= 0
  ) {
    return 0;
  }

  const healthRatio = actualHealth / baseHealth;
  const logarithmicMultiplier =
    1 + WAVE_ENEMY_REWARD_LOG_FACTOR * Math.log2(healthRatio);
  const multiplier = Math.min(
    MAX_WAVE_ENEMY_REWARD_MULTIPLIER,
    Math.max(1, logarithmicMultiplier),
  );
  const roundedBaseReward = Math.round(baseReward);
  const cappedReward = Math.round(
    baseReward * MAX_WAVE_ENEMY_REWARD_MULTIPLIER,
  );

  return Math.max(
    roundedBaseReward,
    Math.min(cappedReward, Math.round(baseReward * multiplier)),
  );
}
