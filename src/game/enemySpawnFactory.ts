import type { EnemySpawnDescriptor } from './enemyBehaviors';
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

/** Resolves one authored wave entry without introducing a wave-based speed. */
export function createWaveEnemySpawn(
  spawn: CampaignWaveSpawn,
  entryAngle: number,
): EnemyRuntimeSpawn {
  return {
    kind: spawn.kind,
    maxHealth: scaledHealth(spawn.kind, spawn.healthMultiplier),
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
): EnemyRuntimeSpawn {
  const position = forkPosition(descriptor);
  const startRadius = Math.max(
    MINIMUM_ROUTE_RADIUS,
    hyperbolicDistance(position, CENTER),
  );

  return {
    kind: descriptor.kind,
    maxHealth: scaledHealth(
      descriptor.kind,
      waveHealthMultiplier,
      descriptor.healthScale,
    ),
    route: buildEnemyRoute({
      entryAngle: Math.atan2(position.y, position.x),
      startRadius,
      behavior: 'direct',
    }),
  };
}
