import type { EnemySpawnDescriptor } from './enemyBehaviors';
import { getWaveEnemyReward } from './enemyRewards';
import { getEnemyType, type EnemyKind } from './enemyTypes';
import {
  buildEnemyRoute,
  type EnemyRoute,
} from './enemyRoutes';
import type { CampaignWaveSpawn } from './campaignWaves';
import {
  applyMobius,
  hyperbolicDistance,
  invertMobius,
  translationToOrigin,
  type Vec2,
} from '../math/hyperbolic';

const CENTER: Vec2 = { x: 0, y: 0 };
const REINFORCEMENT_FORK_DISTANCE = 0.11;
const MINIMUM_ROUTE_RADIUS = 0.001;

/** The gameplay data EnemyManager needs after an authored spawn is resolved. */
export interface EnemyRuntimeSpawn {
  readonly kind: EnemyKind;
  readonly route: EnemyRoute;
  readonly maxHealth: number;
  /** Contact damage after this wave's safe pressure multiplier is applied. */
  readonly contactDamage: number;
  /** Bounty derived from this spawn's resolved health. */
  readonly reward: number;
}

function scaledHealth(
  kind: EnemyKind,
  waveHealthMultiplier: number,
  individualHealthScale = 1,
): number {
  const multiplier = Number.isFinite(waveHealthMultiplier)
    ? Math.max(0, waveHealthMultiplier)
    : 1;
  const individualScale = Number.isFinite(individualHealthScale)
    ? Math.max(0, individualHealthScale)
    : 1;
  return Math.max(
    1,
    Math.round(getEnemyType(kind).baseHealth * multiplier * individualScale),
  );
}

function safeMultiplier(multiplier: number | undefined): number {
  return multiplier !== undefined && Number.isFinite(multiplier)
    ? Math.max(0, multiplier)
    : 1;
}

function scaledReward(kind: EnemyKind, maxHealth: number): number {
  const type = getEnemyType(kind);
  return getWaveEnemyReward({
    baseReward: type.reward,
    baseHealth: type.baseHealth,
    actualHealth: maxHealth,
  });
}

function scaledContactDamage(
  kind: EnemyKind,
  waveContactMultiplier: number | undefined,
): number {
  const contactDamage =
    getEnemyType(kind).contactDamage * safeMultiplier(waveContactMultiplier);
  return Math.min(Number.MAX_SAFE_INTEGER, Math.round(contactDamage));
}

/** Resolves one authored wave entry without introducing a wave-based speed. */
export function createWaveEnemySpawn(
  spawn: CampaignWaveSpawn,
  entryAngle: number,
): EnemyRuntimeSpawn {
  const maxHealth = scaledHealth(spawn.kind, spawn.healthMultiplier);
  const contactMultiplier = spawn.contactMultiplier;
  return {
    kind: spawn.kind,
    maxHealth,
    contactDamage: scaledContactDamage(spawn.kind, contactMultiplier),
    reward: scaledReward(spawn.kind, maxHealth),
    route: buildEnemyRoute({
      entryAngle,
      behavior: spawn.routeBehavior,
      seed: spawn.routeSeed,
    }),
  };
}

function forkPosition(descriptor: EnemySpawnDescriptor): Vec2 {
  const radialAngle = Math.atan2(
    descriptor.canonicalPosition.y,
    descriptor.canonicalPosition.x,
  );
  const forkAngle =
    radialAngle + Math.PI / 2 + descriptor.routeForkAngleRadians;
  const localRadius = Math.tanh(REINFORCEMENT_FORK_DISTANCE / 2);

  return applyMobius(
    invertMobius(translationToOrigin(descriptor.canonicalPosition)),
    {
      x: Math.cos(forkAngle) * localRadius,
      y: Math.sin(forkAngle) * localRadius,
    },
  );
}

/**
 * Resolves a child or Boss reinforcement at the exact defeated-enemy region.
 * Its new direct leg starts there and heads inward, so it never returns to the
 * boundary or receives a speed bonus from the current wave.
 */
export function createReinforcementEnemySpawn(
  descriptor: EnemySpawnDescriptor,
  waveHealthMultiplier: number,
  waveContactMultiplier?: number,
): EnemyRuntimeSpawn {
  const position = forkPosition(descriptor);
  const startRadius = Math.max(
    MINIMUM_ROUTE_RADIUS,
    hyperbolicDistance(position, CENTER),
  );
  const maxHealth = scaledHealth(
    descriptor.kind,
    waveHealthMultiplier,
    descriptor.healthScale,
  );

  return {
    kind: descriptor.kind,
    maxHealth,
    contactDamage: scaledContactDamage(
      descriptor.kind,
      waveContactMultiplier,
    ),
    reward: scaledReward(descriptor.kind, maxHealth),
    route: buildEnemyRoute({
      entryAngle: Math.atan2(position.y, position.x),
      startRadius,
      behavior: 'direct',
    }),
  };
}
