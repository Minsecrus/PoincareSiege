import type { EnemyKind } from './enemyTypes';
import type { EnemyRouteBehavior } from './enemyRoutes';
import type { CampaignLevelId } from './campaignProgress';

/** One authored enemy entry. Enemy speed is always owned by its family. */
export interface CampaignWaveSpawn {
  readonly kind: EnemyKind;
  readonly healthMultiplier: number;
  readonly routeBehavior: EnemyRouteBehavior;
  readonly routeSeed: number;
}

type SpawnDraft = readonly [EnemyKind, EnemyRouteBehavior];
type CampaignWavePlan = readonly CampaignWaveSpawn[];

function draft(
  kind: EnemyKind,
  routeBehavior: EnemyRouteBehavior,
): SpawnDraft {
  return [kind, routeBehavior];
}

function repeat(
  kind: EnemyKind,
  routeBehavior: EnemyRouteBehavior,
  count: number,
): readonly SpawnDraft[] {
  return Array.from({ length: count }, () => draft(kind, routeBehavior));
}

function wave(
  level: number,
  waveNumber: number,
  healthMultiplier: number,
  entries: readonly SpawnDraft[],
): CampaignWavePlan {
  return Object.freeze(
    entries.map(([kind, routeBehavior], index) =>
      Object.freeze({
        kind,
        healthMultiplier,
        routeBehavior,
        routeSeed: level * 10_000 + waveNumber * 100 + index,
      }),
    ),
  );
}

/**
 * Full authored campaign pacing. The early levels teach one interaction at a
 * time, while the final level combines the complete roster without returning
 * to the old 50× health curve.
 */
export const CAMPAIGN_WAVE_PLANS: Readonly<
  Record<CampaignLevelId, readonly CampaignWavePlan[]>
> = Object.freeze({
  'level-1': Object.freeze([
    wave(1, 1, 0.55, [...repeat('basic', 'direct', 4)]),
    wave(1, 2, 0.65, [...repeat('basic', 'direct', 6)]),
    wave(1, 3, 0.75, [...repeat('basic', 'direct', 8)]),
  ]),
  'level-2': Object.freeze([
    wave(2, 1, 0.75, [...repeat('basic', 'direct', 5)]),
    wave(2, 2, 0.82, [
      ...repeat('basic', 'direct', 4),
      ...repeat('swarm', 'direct', 3),
    ]),
    wave(2, 3, 0.9, [
      ...repeat('basic', 'direct', 4),
      ...repeat('swarm', 'direct', 5),
    ]),
    wave(2, 4, 1, [
      ...repeat('basic', 'flank', 3),
      ...repeat('swarm', 'flank', 6),
    ]),
    wave(2, 5, 1.12, [
      ...repeat('basic', 'flank', 4),
      ...repeat('swarm', 'flank', 7),
    ]),
  ]),
  'level-3': Object.freeze([
    wave(3, 1, 0.9, [
      ...repeat('basic', 'direct', 5),
      ...repeat('swarm', 'direct', 4),
    ]),
    wave(3, 2, 1, [
      ...repeat('basic', 'direct', 4),
      ...repeat('swarm', 'direct', 5),
      ...repeat('armored', 'direct', 1),
    ]),
    wave(3, 3, 1.1, [
      ...repeat('basic', 'direct', 4),
      ...repeat('swarm', 'direct', 6),
      ...repeat('armored', 'direct', 2),
    ]),
    wave(3, 4, 1.2, [
      ...repeat('basic', 'flank', 3),
      ...repeat('swarm', 'flank', 7),
      ...repeat('armored', 'direct', 2),
    ]),
    wave(3, 5, 1.32, [
      ...repeat('basic', 'flank', 3),
      ...repeat('swarm', 'flank', 7),
      ...repeat('armored', 'flank', 3),
    ]),
    wave(3, 6, 1.45, [
      ...repeat('basic', 'flank', 4),
      ...repeat('swarm', 'flank', 8),
      ...repeat('armored', 'flank', 3),
    ]),
  ]),
  'level-4': Object.freeze([
    wave(4, 1, 1.08, [
      ...repeat('basic', 'direct', 4),
      ...repeat('swarm', 'direct', 6),
      ...repeat('armored', 'direct', 2),
    ]),
    wave(4, 2, 1.18, [
      ...repeat('basic', 'direct', 4),
      ...repeat('swarm', 'direct', 6),
      draft('splitter', 'direct'),
    ]),
    wave(4, 3, 1.3, [
      ...repeat('basic', 'flank', 3),
      ...repeat('swarm', 'flank', 7),
      ...repeat('armored', 'direct', 2),
      ...repeat('splitter', 'zigzag', 2),
    ]),
    wave(4, 4, 1.45, [
      ...repeat('basic', 'flank', 3),
      ...repeat('swarm', 'zigzag', 8),
      ...repeat('splitter', 'zigzag', 3),
    ]),
    wave(4, 5, 1.6, [
      ...repeat('basic', 'flank', 3),
      ...repeat('swarm', 'zigzag', 8),
      ...repeat('armored', 'direct', 3),
      ...repeat('splitter', 'zigzag', 3),
    ]),
    wave(4, 6, 1.78, [
      ...repeat('basic', 'flank', 3),
      ...repeat('swarm', 'zigzag', 9),
      ...repeat('armored', 'direct', 3),
      ...repeat('splitter', 'zigzag', 4),
    ]),
    wave(4, 7, 1.98, [
      ...repeat('basic', 'flank', 4),
      ...repeat('swarm', 'zigzag', 10),
      ...repeat('armored', 'flank', 3),
      ...repeat('splitter', 'zigzag', 5),
    ]),
  ]),
  'level-5': Object.freeze([
    wave(5, 1, 1.28, [
      ...repeat('basic', 'direct', 4),
      ...repeat('swarm', 'direct', 6),
      ...repeat('raider', 'flank', 2),
    ]),
    wave(5, 2, 1.4, [
      ...repeat('basic', 'flank', 3),
      ...repeat('swarm', 'flank', 7),
      ...repeat('raider', 'flank', 3),
    ]),
    wave(5, 3, 1.54, [
      ...repeat('swarm', 'zigzag', 8),
      ...repeat('armored', 'direct', 2),
      ...repeat('raider', 'flank', 4),
      ...repeat('splitter', 'zigzag', 2),
    ]),
    wave(5, 4, 1.68, [
      ...repeat('basic', 'flank', 3),
      ...repeat('swarm', 'zigzag', 8),
      ...repeat('raider', 'flank', 5),
      ...repeat('splitter', 'zigzag', 3),
    ]),
    wave(5, 5, 1.82, [
      ...repeat('swarm', 'zigzag', 9),
      ...repeat('armored', 'flank', 3),
      ...repeat('raider', 'flank', 5),
      ...repeat('splitter', 'zigzag', 3),
    ]),
    wave(5, 6, 1.98, [
      ...repeat('basic', 'flank', 3),
      ...repeat('swarm', 'zigzag', 10),
      ...repeat('armored', 'flank', 3),
      ...repeat('raider', 'flank', 5),
      ...repeat('splitter', 'zigzag', 4),
    ]),
    wave(5, 7, 2.16, [
      ...repeat('swarm', 'zigzag', 11),
      ...repeat('armored', 'flank', 3),
      ...repeat('raider', 'flank', 6),
      ...repeat('splitter', 'zigzag', 4),
    ]),
    wave(5, 8, 2.34, [
      ...repeat('basic', 'flank', 4),
      ...repeat('swarm', 'zigzag', 11),
      ...repeat('armored', 'flank', 4),
      ...repeat('raider', 'flank', 6),
      ...repeat('splitter', 'zigzag', 5),
    ]),
  ]),
  'level-6': Object.freeze([
    wave(6, 1, 1.56, [
      ...repeat('basic', 'direct', 4),
      ...repeat('swarm', 'direct', 7),
      ...repeat('armored', 'direct', 3),
    ]),
    wave(6, 2, 1.7, [
      ...repeat('swarm', 'flank', 8),
      ...repeat('armored', 'direct', 3),
      ...repeat('raider', 'flank', 3),
      ...repeat('splitter', 'zigzag', 2),
    ]),
    wave(6, 3, 1.84, [
      ...repeat('basic', 'flank', 3),
      ...repeat('swarm', 'zigzag', 9),
      ...repeat('armored', 'direct', 3),
      ...repeat('raider', 'flank', 4),
      ...repeat('splitter', 'zigzag', 3),
    ]),
    wave(6, 4, 1.98, [
      ...repeat('swarm', 'zigzag', 10),
      ...repeat('armored', 'flank', 4),
      ...repeat('raider', 'flank', 4),
      ...repeat('splitter', 'zigzag', 3),
    ]),
    wave(6, 5, 2.12, [
      ...repeat('basic', 'flank', 3),
      ...repeat('swarm', 'zigzag', 10),
      ...repeat('armored', 'flank', 4),
      ...repeat('raider', 'flank', 5),
      ...repeat('splitter', 'zigzag', 4),
    ]),
    wave(6, 6, 2.28, [
      ...repeat('swarm', 'zigzag', 11),
      ...repeat('armored', 'flank', 4),
      ...repeat('raider', 'flank', 5),
      ...repeat('splitter', 'zigzag', 4),
    ]),
    wave(6, 7, 2.44, [
      ...repeat('basic', 'flank', 4),
      ...repeat('swarm', 'zigzag', 11),
      ...repeat('armored', 'flank', 4),
      ...repeat('raider', 'flank', 6),
      ...repeat('splitter', 'zigzag', 4),
    ]),
    wave(6, 8, 2.6, [
      ...repeat('swarm', 'zigzag', 12),
      ...repeat('armored', 'flank', 5),
      ...repeat('raider', 'flank', 6),
      ...repeat('splitter', 'zigzag', 5),
    ]),
    wave(6, 9, 2.76, [
      ...repeat('basic', 'flank', 4),
      ...repeat('swarm', 'zigzag', 12),
      ...repeat('armored', 'flank', 5),
      ...repeat('raider', 'flank', 6),
      ...repeat('splitter', 'zigzag', 5),
    ]),
    wave(6, 10, 2.92, [
      ...repeat('swarm', 'zigzag', 10),
      ...repeat('armored', 'flank', 4),
      ...repeat('raider', 'flank', 5),
      ...repeat('splitter', 'zigzag', 4),
      draft('boss', 'zigzag'),
    ]),
  ]),
  'level-7': Object.freeze([
    wave(7, 1, 1.82, [
      ...repeat('basic', 'direct', 4),
      ...repeat('swarm', 'direct', 8),
      ...repeat('armored', 'direct', 3),
      ...repeat('raider', 'flank', 3),
    ]),
    wave(7, 2, 2, [
      ...repeat('swarm', 'flank', 10),
      ...repeat('armored', 'direct', 4),
      ...repeat('raider', 'flank', 4),
      ...repeat('splitter', 'zigzag', 3),
    ]),
    wave(7, 3, 2.18, [
      ...repeat('basic', 'flank', 4),
      ...repeat('swarm', 'zigzag', 10),
      ...repeat('armored', 'flank', 4),
      ...repeat('raider', 'flank', 5),
      ...repeat('splitter', 'zigzag', 4),
    ]),
    wave(7, 4, 2.36, [
      ...repeat('swarm', 'zigzag', 9),
      ...repeat('armored', 'flank', 4),
      ...repeat('raider', 'flank', 4),
      ...repeat('splitter', 'zigzag', 3),
      draft('boss', 'zigzag'),
    ]),
    wave(7, 5, 2.54, [
      ...repeat('basic', 'flank', 4),
      ...repeat('swarm', 'zigzag', 11),
      ...repeat('armored', 'flank', 5),
      ...repeat('raider', 'flank', 5),
      ...repeat('splitter', 'zigzag', 5),
    ]),
    wave(7, 6, 2.74, [
      ...repeat('swarm', 'zigzag', 12),
      ...repeat('armored', 'flank', 5),
      ...repeat('raider', 'flank', 6),
      ...repeat('splitter', 'zigzag', 5),
    ]),
    wave(7, 7, 2.94, [
      ...repeat('basic', 'flank', 4),
      ...repeat('swarm', 'zigzag', 12),
      ...repeat('armored', 'flank', 5),
      ...repeat('raider', 'flank', 6),
      ...repeat('splitter', 'zigzag', 5),
    ]),
    wave(7, 8, 3.14, [
      ...repeat('swarm', 'zigzag', 11),
      ...repeat('armored', 'flank', 5),
      ...repeat('raider', 'flank', 6),
      ...repeat('splitter', 'zigzag', 5),
      draft('boss', 'zigzag'),
    ]),
    wave(7, 9, 3.34, [
      ...repeat('basic', 'flank', 5),
      ...repeat('swarm', 'zigzag', 13),
      ...repeat('armored', 'flank', 6),
      ...repeat('raider', 'flank', 6),
      ...repeat('splitter', 'zigzag', 6),
    ]),
    wave(7, 10, 3.54, [
      ...repeat('swarm', 'zigzag', 14),
      ...repeat('armored', 'flank', 6),
      ...repeat('raider', 'flank', 7),
      ...repeat('splitter', 'zigzag', 6),
    ]),
    wave(7, 11, 3.7, [
      ...repeat('basic', 'flank', 5),
      ...repeat('swarm', 'zigzag', 14),
      ...repeat('armored', 'flank', 6),
      ...repeat('raider', 'flank', 7),
      ...repeat('splitter', 'zigzag', 6),
    ]),
    wave(7, 12, 3.88, [
      ...repeat('swarm', 'zigzag', 13),
      ...repeat('armored', 'flank', 6),
      ...repeat('raider', 'flank', 7),
      ...repeat('splitter', 'zigzag', 6),
      draft('boss', 'zigzag'),
    ]),
  ]),
});
