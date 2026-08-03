import { hyperbolicDistance, type Vec2 } from '../math/hyperbolic';
import { getTowerStats, type TowerKind } from './towerStats';

const COMPARISON_EPSILON = 1e-9;

/** Canonical tower data used by the renderer-independent support rules. */
export interface SupportAuraTower {
  id: string;
  kind: TowerKind;
  level: number;
  position: Vec2;
}

/** Strongest-only support effects currently applied to one allied tower. */
export interface TowerSupportAuraResolution {
  damageMultiplier: number;
  healingPerSecond: number;
  /** Unique support towers supplying either of the resolved strongest effects. */
  sourceTowerIds: string[];
}

function hasFinitePosition(position: Vec2): boolean {
  return Number.isFinite(position.x) && Number.isFinite(position.y);
}

function compareTowerIds(
  left: Pick<SupportAuraTower, 'id'>,
  right: Pick<SupportAuraTower, 'id'>,
): number {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

/**
 * Returns every other valid tower inside one support tower's H² aura.
 * Results are ordered by H² distance and then stable ID for deterministic
 * effect rendering.
 */
export function getSupportAuraTargets(
  source: SupportAuraTower,
  towers: readonly SupportAuraTower[],
): SupportAuraTower[] {
  if (
    source.kind !== 'support' ||
    typeof source.id !== 'string' ||
    !hasFinitePosition(source.position)
  ) {
    return [];
  }

  const range = getTowerStats('support', source.level).range;
  const seenIds = new Set<string>([source.id]);
  const targets: Array<{ tower: SupportAuraTower; distance: number }> = [];

  for (const tower of towers) {
    if (
      typeof tower.id !== 'string' ||
      seenIds.has(tower.id) ||
      !hasFinitePosition(tower.position)
    ) {
      continue;
    }

    seenIds.add(tower.id);
    const distance = hyperbolicDistance(source.position, tower.position);
    if (distance <= range + COMPARISON_EPSILON) {
      targets.push({ tower, distance });
    }
  }

  return targets
    .sort((left, right) => {
      const distanceDifference = left.distance - right.distance;
      return Math.abs(distanceDifference) > COMPARISON_EPSILON
        ? distanceDifference
        : compareTowerIds(left.tower, right.tower);
    })
    .map(({ tower }) => tower);
}

function isStrongerEffect(
  candidateValue: number,
  candidateId: string,
  currentValue: number,
  currentId: string | null,
): boolean {
  const difference = candidateValue - currentValue;
  if (Math.abs(difference) > COMPARISON_EPSILON) {
    return difference > 0;
  }
  return currentId === null || candidateId < currentId;
}

/**
 * Resolves the strongest support aura affecting one target tower.
 *
 * Multiple support towers never stack: damage amplification and passive
 * healing each take only their strongest in-range value. A support tower
 * cannot affect itself, and every range check uses canonical H² distance.
 */
export function resolveTowerSupportAura(
  target: SupportAuraTower,
  towers: readonly SupportAuraTower[],
): TowerSupportAuraResolution {
  if (
    typeof target.id !== 'string' ||
    !hasFinitePosition(target.position)
  ) {
    return {
      damageMultiplier: 1,
      healingPerSecond: 0,
      sourceTowerIds: [],
    };
  }

  let damageMultiplier = 1;
  let healingPerSecond = 0;
  let damageSourceId: string | null = null;
  let healingSourceId: string | null = null;
  const seenIds = new Set<string>([target.id]);

  for (const tower of towers) {
    if (
      tower.kind !== 'support' ||
      typeof tower.id !== 'string' ||
      seenIds.has(tower.id) ||
      !hasFinitePosition(tower.position)
    ) {
      continue;
    }
    seenIds.add(tower.id);

    const stats = getTowerStats('support', tower.level);
    if (
      hyperbolicDistance(tower.position, target.position) >
      stats.range + COMPARISON_EPSILON
    ) {
      continue;
    }

    if (
      isStrongerEffect(
        stats.auraDamageMultiplier,
        tower.id,
        damageMultiplier,
        damageSourceId,
      )
    ) {
      damageMultiplier = stats.auraDamageMultiplier;
      damageSourceId = tower.id;
    }
    if (
      isStrongerEffect(
        stats.allyHealPerSecond,
        tower.id,
        healingPerSecond,
        healingSourceId,
      )
    ) {
      healingPerSecond = stats.allyHealPerSecond;
      healingSourceId = tower.id;
    }
  }

  return {
    damageMultiplier,
    healingPerSecond,
    sourceTowerIds: Array.from(
      new Set(
        [damageSourceId, healingSourceId].filter(
          (id): id is string => id !== null,
        ),
      ),
    ).sort(),
  };
}
