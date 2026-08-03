import type { EnemyKind } from './enemyTypes';

export { ENEMY_KINDS } from './enemyTypes';
export type { EnemyKind } from './enemyTypes';

/**
 * The enemy roster and path intent for the twenty authored waves.
 *
 * A spawn plan deliberately carries no speed value or multiplier. Movement
 * speed is a property of the enemy kind, while waves become harder through
 * their composition and their health multiplier only.
 */

/** Intent for the route generator; every seed is stable across runs. */
export type EnemyRouteBehavior = 'direct' | 'flank' | 'zigzag';

export interface EnemyWaveSpawn {
  readonly kind: EnemyKind;
  /** Multiplies that kind's base health. It is the only wave-scaling value. */
  readonly healthMultiplier: number;
  readonly routeBehavior: EnemyRouteBehavior;
  /** Stable input for a route generator; it is not an RNG state. */
  readonly routeSeed: number;
}

export const ENEMY_WAVE_COUNT = 20;

type SpawnDraft = readonly [EnemyKind, EnemyRouteBehavior];

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

function createWave(
  wave: number,
  healthMultiplier: number,
  entries: readonly SpawnDraft[],
): readonly EnemyWaveSpawn[] {
  return Object.freeze(
    entries.map(([kind, routeBehavior], index) =>
      Object.freeze({
        kind,
        healthMultiplier,
        routeBehavior,
        routeSeed: wave * 100 + index,
      }),
    ),
  );
}

/**
 * Authored order is meaningful: it is also the preferred spawn ordering for
 * the runtime. Each later wave adds health but never a wave-based speed boost.
 *
 * The late curve deliberately tops out at 12×. Individual enemies only spend
 * a limited time inside a tower's H² range, so the late-game challenge must
 * not come from making a single armored unit or boss soak implausible damage.
 * The authored mixed roster and varied deterministic routes provide the
 * remaining late-wave pressure instead.
 */
const WAVES: readonly (readonly EnemyWaveSpawn[])[] = [
  createWave(1, 1, [...repeat('basic', 'direct', 7)]),
  createWave(2, 1, [
    ...repeat('basic', 'direct', 6),
    ...repeat('swarm', 'direct', 2),
  ]),
  createWave(3, 1, [
    ...repeat('basic', 'direct', 6),
    ...repeat('swarm', 'direct', 3),
    ...repeat('armored', 'direct', 1),
  ]),
  createWave(4, 1, [
    ...repeat('basic', 'direct', 5),
    ...repeat('swarm', 'direct', 4),
    ...repeat('armored', 'direct', 2),
    ...repeat('basic', 'flank', 1),
  ]),
  createWave(5, 1.3, [
    ...repeat('basic', 'flank', 4),
    ...repeat('swarm', 'flank', 3),
    ...repeat('armored', 'direct', 3),
    ...repeat('raider', 'flank', 2),
    ...repeat('splitter', 'zigzag', 1),
    draft('boss', 'zigzag'),
  ]),
  createWave(6, 2, [
    ...repeat('basic', 'flank', 3),
    ...repeat('swarm', 'zigzag', 4),
    ...repeat('armored', 'direct', 5),
    ...repeat('raider', 'flank', 2),
    ...repeat('splitter', 'zigzag', 2),
  ]),
  createWave(7, 2.8, [
    ...repeat('basic', 'flank', 4),
    ...repeat('swarm', 'zigzag', 6),
    ...repeat('armored', 'direct', 5),
    ...repeat('raider', 'flank', 4),
    ...repeat('splitter', 'zigzag', 3),
  ]),
  createWave(8, 3.3, [
    ...repeat('basic', 'flank', 4),
    ...repeat('swarm', 'zigzag', 7),
    ...repeat('armored', 'direct', 5),
    ...repeat('raider', 'flank', 5),
    ...repeat('splitter', 'zigzag', 4),
  ]),
  createWave(9, 3.9, [
    ...repeat('basic', 'flank', 4),
    ...repeat('swarm', 'zigzag', 8),
    ...repeat('armored', 'direct', 6),
    ...repeat('raider', 'flank', 6),
    ...repeat('splitter', 'zigzag', 5),
  ]),
  createWave(10, 4.5, [
    ...repeat('basic', 'flank', 4),
    ...repeat('swarm', 'zigzag', 9),
    ...repeat('armored', 'direct', 6),
    ...repeat('raider', 'flank', 7),
    ...repeat('splitter', 'zigzag', 6),
    draft('boss', 'zigzag'),
  ]),
  createWave(11, 5.1, [
    ...repeat('basic', 'flank', 4),
    ...repeat('swarm', 'zigzag', 10),
    ...repeat('armored', 'direct', 7),
    ...repeat('raider', 'flank', 8),
    ...repeat('splitter', 'zigzag', 8),
  ]),
  createWave(12, 5.7, [
    ...repeat('basic', 'flank', 4),
    ...repeat('swarm', 'zigzag', 12),
    ...repeat('armored', 'direct', 7),
    ...repeat('raider', 'flank', 9),
    ...repeat('splitter', 'zigzag', 9),
  ]),
  createWave(13, 6.4, [
    ...repeat('basic', 'flank', 4),
    ...repeat('swarm', 'zigzag', 13),
    ...repeat('armored', 'direct', 8),
    ...repeat('raider', 'flank', 10),
    ...repeat('splitter', 'zigzag', 10),
  ]),
  createWave(14, 7.1, [
    ...repeat('basic', 'flank', 4),
    ...repeat('swarm', 'zigzag', 15),
    ...repeat('armored', 'direct', 8),
    ...repeat('raider', 'flank', 11),
    ...repeat('splitter', 'zigzag', 11),
  ]),
  createWave(15, 8, [
    ...repeat('basic', 'flank', 4),
    ...repeat('swarm', 'zigzag', 16),
    ...repeat('armored', 'direct', 9),
    ...repeat('raider', 'flank', 12),
    ...repeat('splitter', 'zigzag', 12),
    draft('boss', 'zigzag'),
  ]),
  createWave(16, 8.8, [
    ...repeat('basic', 'flank', 4),
    ...repeat('swarm', 'zigzag', 18),
    ...repeat('armored', 'direct', 9),
    ...repeat('raider', 'flank', 13),
    ...repeat('splitter', 'zigzag', 14),
  ]),
  createWave(17, 9.6, [
    ...repeat('basic', 'flank', 4),
    ...repeat('swarm', 'zigzag', 20),
    ...repeat('armored', 'direct', 10),
    ...repeat('raider', 'flank', 14),
    ...repeat('splitter', 'zigzag', 14),
  ]),
  createWave(18, 10.4, [
    ...repeat('basic', 'flank', 4),
    ...repeat('swarm', 'zigzag', 22),
    ...repeat('armored', 'direct', 10),
    ...repeat('raider', 'flank', 15),
    ...repeat('splitter', 'zigzag', 15),
  ]),
  createWave(19, 11.2, [
    ...repeat('basic', 'flank', 4),
    ...repeat('swarm', 'zigzag', 24),
    ...repeat('armored', 'direct', 11),
    ...repeat('raider', 'flank', 16),
    ...repeat('splitter', 'zigzag', 15),
  ]),
  createWave(20, 12, [
    ...repeat('basic', 'flank', 4),
    ...repeat('swarm', 'zigzag', 25),
    ...repeat('armored', 'direct', 11),
    ...repeat('raider', 'flank', 18),
    ...repeat('splitter', 'zigzag', 15),
    draft('boss', 'zigzag'),
  ]),
];

function assertWaveNumber(wave: number): void {
  if (!Number.isInteger(wave) || wave < 1 || wave > ENEMY_WAVE_COUNT) {
    throw new RangeError(`Wave must be an integer from 1 to ${ENEMY_WAVE_COUNT}.`);
  }
}

/** Returns the immutable, deterministic spawn schedule for one authored wave. */
export function getEnemyWavePlan(wave: number): readonly EnemyWaveSpawn[] {
  assertWaveNumber(wave);
  return WAVES[wave - 1];
}

/** Returns the planned enemy count without exposing mutable schedule state. */
export function getEnemyCountForWave(wave: number): number {
  return getEnemyWavePlan(wave).length;
}

/** Returns the shared health scale for a wave. No speed is scaled per wave. */
export function getEnemyHealthMultiplierForWave(wave: number): number {
  return getEnemyWavePlan(wave)[0].healthMultiplier;
}
