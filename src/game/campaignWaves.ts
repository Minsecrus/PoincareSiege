import type { EnemyKind } from './enemyTypes';
import type { EnemyRouteBehavior } from './enemyRoutes';
import type { CampaignLevelId } from './campaignProgress';

/** One authored enemy entry. Enemy speed is always owned by its family. */
export interface CampaignWaveSpawn {
  readonly kind: EnemyKind;
  /** Final per-enemy health scale, including authored elite modifiers. */
  readonly healthMultiplier: number;
  /** Optional L5+ contact-damage scale consumed by the runtime. */
  readonly contactMultiplier?: number;
  readonly routeBehavior: EnemyRouteBehavior;
  readonly routeSeed: number;
}

interface SpawnDraft {
  readonly kind: EnemyKind;
  readonly routeBehavior: EnemyRouteBehavior;
  /** Applied before the public final health multiplier is authored. */
  readonly healthScale?: number;
}

type CampaignWavePlan = readonly CampaignWaveSpawn[];

function draft(
  kind: EnemyKind,
  routeBehavior: EnemyRouteBehavior,
  healthScale?: number,
): SpawnDraft {
  return Object.freeze({
    kind,
    routeBehavior,
    ...(healthScale === undefined ? {} : { healthScale }),
  });
}

/** Bosses are a deliberate milestone: 1.5× their wave's normal health. */
function boss(): SpawnDraft {
  return draft('boss', 'direct', 1.5);
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
  contactMultiplier?: number,
): CampaignWavePlan {
  return Object.freeze(
    entries.map(({ kind, routeBehavior, healthScale = 1 }, index) =>
      Object.freeze({
        kind,
        healthMultiplier: healthMultiplier * healthScale,
        ...(contactMultiplier === undefined ? {} : { contactMultiplier }),
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
    wave(5, 1, 2, [
      ...repeat('basic', 'direct', 4),
      ...repeat('swarm', 'direct', 8),
      ...repeat('raider', 'flank', 2),
    ], 1),
    wave(5, 2, 2.3, [
      ...repeat('basic', 'direct', 4),
      ...repeat('swarm', 'flank', 8),
      ...repeat('raider', 'flank', 4),
    ], 1.02),
    wave(5, 3, 2.6, [
      ...repeat('swarm', 'zigzag', 8),
      ...repeat('armored', 'direct', 3),
      ...repeat('raider', 'flank', 5),
      ...repeat('splitter', 'zigzag', 3),
    ], 1.04),
    wave(5, 4, 3, [
      ...repeat('basic', 'direct', 3),
      ...repeat('swarm', 'zigzag', 9),
      ...repeat('raider', 'flank', 4),
      ...repeat('splitter', 'zigzag', 5),
    ], 1.06),
    wave(5, 5, 3.35, [
      ...repeat('swarm', 'direct', 9),
      ...repeat('armored', 'flank', 3),
      ...repeat('raider', 'flank', 6),
      ...repeat('splitter', 'zigzag', 5),
    ], 1.08),
    wave(5, 6, 3.65, [
      ...repeat('basic', 'direct', 3),
      ...repeat('swarm', 'zigzag', 10),
      ...repeat('armored', 'direct', 4),
      ...repeat('raider', 'flank', 5),
      ...repeat('splitter', 'zigzag', 4),
    ], 1.09),
    wave(5, 7, 4, [
      ...repeat('swarm', 'zigzag', 10),
      ...repeat('armored', 'direct', 5),
      ...repeat('raider', 'flank', 6),
      ...repeat('splitter', 'zigzag', 7),
    ], 1.11),
    wave(5, 8, 4.4, [
      ...repeat('basic', 'direct', 4),
      ...repeat('swarm', 'zigzag', 12),
      ...repeat('armored', 'direct', 5),
      ...repeat('raider', 'flank', 5),
      ...repeat('splitter', 'zigzag', 5),
    ], 1.12),
  ]),
  'level-6': Object.freeze([
    wave(6, 1, 3, [
      ...repeat('basic', 'direct', 5),
      ...repeat('swarm', 'direct', 8),
      ...repeat('armored', 'direct', 4),
    ], 1.08),
    wave(6, 2, 3.4, [
      ...repeat('swarm', 'flank', 8),
      ...repeat('armored', 'direct', 4),
      ...repeat('raider', 'flank', 4),
      ...repeat('splitter', 'zigzag', 3),
    ], 1.1),
    wave(6, 3, 3.9, [
      ...repeat('basic', 'direct', 3),
      ...repeat('swarm', 'zigzag', 9),
      ...repeat('armored', 'direct', 4),
      ...repeat('raider', 'flank', 5),
      ...repeat('splitter', 'zigzag', 4),
    ], 1.12),
    wave(6, 4, 4.4, [
      ...repeat('swarm', 'zigzag', 10),
      ...repeat('armored', 'direct', 5),
      ...repeat('raider', 'flank', 5),
      ...repeat('splitter', 'zigzag', 4),
    ], 1.14),
    wave(6, 5, 5, [
      ...repeat('basic', 'direct', 4),
      ...repeat('swarm', 'zigzag', 10),
      ...repeat('armored', 'direct', 5),
      ...repeat('raider', 'flank', 6),
      ...repeat('splitter', 'zigzag', 5),
    ], 1.16),
    wave(6, 6, 5.6, [
      ...repeat('swarm', 'zigzag', 11),
      ...repeat('armored', 'direct', 5),
      ...repeat('raider', 'flank', 6),
      ...repeat('splitter', 'zigzag', 5),
    ], 1.18),
    wave(6, 7, 6.3, [
      ...repeat('basic', 'direct', 4),
      ...repeat('swarm', 'zigzag', 11),
      ...repeat('armored', 'direct', 5),
      ...repeat('raider', 'flank', 7),
      ...repeat('splitter', 'zigzag', 5),
    ], 1.2),
    wave(6, 8, 7, [
      ...repeat('swarm', 'zigzag', 12),
      ...repeat('armored', 'direct', 6),
      ...repeat('raider', 'flank', 7),
      ...repeat('splitter', 'zigzag', 6),
    ], 1.22),
    wave(6, 9, 7.6, [
      ...repeat('basic', 'direct', 4),
      ...repeat('swarm', 'zigzag', 12),
      ...repeat('armored', 'direct', 6),
      ...repeat('raider', 'flank', 7),
      ...repeat('splitter', 'zigzag', 6),
    ], 1.23),
    wave(6, 10, 8.2, [
      ...repeat('swarm', 'zigzag', 13),
      ...repeat('armored', 'direct', 6),
      ...repeat('raider', 'flank', 7),
      ...repeat('splitter', 'zigzag', 6),
      boss(),
    ], 1.25),
  ]),
  'level-7': Object.freeze([
    wave(7, 1, 5, [
      ...repeat('basic', 'direct', 5),
      ...repeat('swarm', 'direct', 9),
      ...repeat('armored', 'direct', 4),
      ...repeat('raider', 'flank', 4),
    ], 1.16),
    wave(7, 2, 5.7, [
      ...repeat('swarm', 'flank', 11),
      ...repeat('armored', 'direct', 5),
      ...repeat('raider', 'flank', 5),
      ...repeat('splitter', 'zigzag', 4),
    ], 1.18),
    wave(7, 3, 6.5, [
      ...repeat('basic', 'direct', 4),
      ...repeat('swarm', 'zigzag', 12),
      ...repeat('armored', 'direct', 5),
      ...repeat('raider', 'flank', 6),
      ...repeat('splitter', 'zigzag', 5),
    ], 1.2),
    wave(7, 4, 7.4, [
      ...repeat('swarm', 'zigzag', 11),
      ...repeat('armored', 'direct', 5),
      ...repeat('raider', 'flank', 5),
      ...repeat('splitter', 'zigzag', 5),
      boss(),
    ], 1.22),
    wave(7, 5, 8.4, [
      ...repeat('basic', 'direct', 5),
      ...repeat('swarm', 'zigzag', 13),
      ...repeat('armored', 'direct', 6),
      ...repeat('raider', 'flank', 6),
      ...repeat('splitter', 'zigzag', 6),
    ], 1.24),
    wave(7, 6, 9.5, [
      ...repeat('swarm', 'zigzag', 14),
      ...repeat('armored', 'direct', 6),
      ...repeat('raider', 'flank', 7),
      ...repeat('splitter', 'zigzag', 6),
    ], 1.26),
    wave(7, 7, 10.7, [
      ...repeat('basic', 'direct', 5),
      ...repeat('swarm', 'zigzag', 14),
      ...repeat('armored', 'direct', 6),
      ...repeat('raider', 'flank', 7),
      ...repeat('splitter', 'zigzag', 6),
    ], 1.28),
    wave(7, 8, 12, [
      ...repeat('swarm', 'zigzag', 14),
      ...repeat('armored', 'direct', 7),
      ...repeat('raider', 'flank', 7),
      ...repeat('splitter', 'zigzag', 7),
      boss(),
    ], 1.3),
    wave(7, 9, 13.4, [
      ...repeat('basic', 'direct', 5),
      ...repeat('swarm', 'zigzag', 15),
      ...repeat('armored', 'direct', 7),
      ...repeat('raider', 'flank', 8),
      ...repeat('splitter', 'zigzag', 7),
    ], 1.32),
    wave(7, 10, 14.9, [
      ...repeat('swarm', 'zigzag', 16),
      ...repeat('armored', 'direct', 7),
      ...repeat('raider', 'flank', 8),
      ...repeat('splitter', 'zigzag', 7),
    ], 1.34),
    wave(7, 11, 16.5, [
      ...repeat('basic', 'direct', 5),
      ...repeat('swarm', 'zigzag', 16),
      ...repeat('armored', 'direct', 7),
      ...repeat('raider', 'flank', 8),
      ...repeat('splitter', 'zigzag', 7),
    ], 1.36),
    wave(7, 12, 18.2, [
      ...repeat('basic', 'direct', 4),
      ...repeat('swarm', 'zigzag', 16),
      ...repeat('armored', 'direct', 8),
      ...repeat('raider', 'flank', 8),
      ...repeat('splitter', 'zigzag', 8),
      boss(),
    ], 1.38),
  ]),
});
