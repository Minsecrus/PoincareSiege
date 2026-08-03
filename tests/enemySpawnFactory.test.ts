import { describe, expect, it } from 'vitest';
import {
  createReinforcementEnemySpawn,
  createWaveEnemySpawn,
} from '../src/game/enemySpawnFactory';
import type { EnemySpawnDescriptor } from '../src/game/enemyBehaviors';
import { getWaveEnemyReward } from '../src/game/enemyRewards';
import { getEnemyType } from '../src/game/enemyTypes';
import { hyperbolicDistance } from '../src/math/hyperbolic';

describe('enemy spawn factory', () => {
  it('uses the wave plan for health, contact pressure, and route shape, but not speed', () => {
    const spawn = createWaveEnemySpawn(
      {
        kind: 'armored',
        healthMultiplier: 1.54,
        contactMultiplier: 1.31,
        routeBehavior: 'flank',
        routeSeed: 701,
      },
      Math.PI / 3,
    );

    expect(spawn.kind).toBe('armored');
    expect(spawn.maxHealth).toBe(Math.round(260 * 1.54));
    expect(spawn.reward).toBe(
      getWaveEnemyReward({
        baseReward: getEnemyType('armored').reward,
        baseHealth: getEnemyType('armored').baseHealth,
        actualHealth: spawn.maxHealth,
      }),
    );
    expect(spawn.contactDamage).toBe(Math.round(260 * 1.31));
    expect(spawn.route.behavior).toBe('flank');
    expect('speed' in spawn).toBe(false);
  });

  it('keeps a reinforcement near its parent and inherits wave health/contact pressure', () => {
    const descriptor: EnemySpawnDescriptor = {
      kind: 'swarm',
      healthScale: 0.5,
      canonicalPosition: { x: 0.28, y: -0.16 },
      route: {
        routeAngle: -0.5,
        startRadius: 4.7,
        travelledDistance: 2.1,
      },
      routeForkAngleRadians: 0.16,
      reason: 'splitter-death',
    };
    const spawn = createReinforcementEnemySpawn(descriptor, 1.2, 1.4);
    const start = spawn.route.points[0];

    expect(spawn.kind).toBe('swarm');
    expect(spawn.maxHealth).toBe(Math.round(46 * 1.2 * 0.5));
    expect(spawn.reward).toBe(
      getWaveEnemyReward({
        baseReward: getEnemyType('swarm').reward,
        baseHealth: getEnemyType('swarm').baseHealth,
        actualHealth: spawn.maxHealth,
      }),
    );
    expect(spawn.contactDamage).toBe(Math.round(48 * 1.4));
    expect(spawn.route.behavior).toBe('direct');
    expect(hyperbolicDistance(start, descriptor.canonicalPosition)).toBeCloseTo(
      0.11,
      6,
    );
  });

  it('falls back safely for omitted or malformed contact multipliers', () => {
    const waveSpawn = createWaveEnemySpawn(
      {
        kind: 'basic',
        healthMultiplier: 1,
        contactMultiplier: Number.NaN,
        routeBehavior: 'direct',
        routeSeed: 702,
      },
      0,
    );
    const reinforcement = createReinforcementEnemySpawn(
      {
        kind: 'basic',
        healthScale: 1,
        canonicalPosition: { x: 0.2, y: 0 },
        route: { routeAngle: 0, startRadius: 5, travelledDistance: 1 },
        routeForkAngleRadians: 0,
        reason: 'boss-reinforcement',
      },
      1,
      -2,
    );

    expect(waveSpawn.contactDamage).toBe(getEnemyType('basic').contactDamage);
    expect(reinforcement.contactDamage).toBe(0);
  });
});
