import {
  resolveTowerAssault,
  type TowerAssaultEnemy,
  type TowerAssaultTower,
} from './towerAssault';

/** Persisted per-enemy attack timer owned by the scene simulation. */
export interface TowerAssaultClock {
  readonly targetTowerId: string;
  readonly nextAttackAt: number;
}

export interface TowerAssaultHit {
  readonly enemyId: string;
  readonly towerId: string;
  readonly damage: number;
}

export interface TowerAssaultFrame {
  readonly clocks: ReadonlyMap<string, TowerAssaultClock>;
  readonly pausedEnemyIds: readonly string[];
  readonly hits: readonly TowerAssaultHit[];
}

function normalizedTime(time: number): number {
  return Number.isFinite(time) ? Math.max(0, time) : 0;
}

/**
 * Advances the timer layer around the pure target resolver. Enemies with a
 * target always pause, while a target change starts a fresh attack immediately
 * so a destroyed tower cannot retain an obsolete cooldown.
 */
export function resolveTowerAssaultFrame(
  time: number,
  enemies: readonly TowerAssaultEnemy[],
  towers: readonly TowerAssaultTower[],
  previousClocks: ReadonlyMap<string, TowerAssaultClock>,
): TowerAssaultFrame {
  const now = normalizedTime(time);
  const clocks = new Map<string, TowerAssaultClock>();
  const pausedEnemyIds: string[] = [];
  const hits: TowerAssaultHit[] = [];

  for (const enemy of enemies) {
    const resolution = resolveTowerAssault(enemy, towers);
    const attack = resolution.attack;
    if (!attack || !resolution.shouldPauseMovement) {
      continue;
    }

    pausedEnemyIds.push(enemy.id);
    const previous = previousClocks.get(enemy.id);
    const nextAttackAt =
      previous?.targetTowerId === attack.targetTowerId &&
      Number.isFinite(previous.nextAttackAt)
        ? previous.nextAttackAt
        : now;

    if (now + 1e-9 >= nextAttackAt) {
      hits.push({
        enemyId: enemy.id,
        towerId: attack.targetTowerId,
        damage: attack.damage,
      });
      clocks.set(enemy.id, {
        targetTowerId: attack.targetTowerId,
        nextAttackAt: now + attack.intervalSeconds,
      });
    } else {
      clocks.set(enemy.id, {
        targetTowerId: attack.targetTowerId,
        nextAttackAt,
      });
    }
  }

  return { clocks, pausedEnemyIds, hits };
}
