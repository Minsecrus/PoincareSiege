import { describe, expect, it } from 'vitest';
import {
  createReinforcementEnemySpawn,
  createWaveEnemySpawn,
} from '../src/game/enemySpawnFactory';
import type { EnemySpawnDescriptor } from '../src/game/enemyBehaviors';
import { hyperbolicDistance } from '../src/math/hyperbolic';

describe('enemy spawn factory', () => {
  it('uses the wave plan for health and route shape, but not for speed', () => {
    const spawn = createWaveEnemySpawn(
      {
        kind: 'armored',
        healthMultiplier: 1.54,
        routeBehavior: 'flank',
        routeSeed: 701,
      },
      Math.PI / 3,
    );

    expect(spawn.kind).toBe('armored');
    expect(spawn.maxHealth).toBe(Math.round(260 * 1.54));
    expect(spawn.route.behavior).toBe('flank');
    expect('speed' in spawn).toBe(false);
  });

  it('keeps a reinforcement near its parent and scales only its health', () => {
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
    const spawn = createReinforcementEnemySpawn(descriptor, 1.2);
    const start = spawn.route.points[0];

    expect(spawn.kind).toBe('swarm');
    expect(spawn.maxHealth).toBe(Math.round(46 * 1.2 * 0.5));
    expect(spawn.route.behavior).toBe('direct');
    expect(hyperbolicDistance(start, descriptor.canonicalPosition)).toBeCloseTo(
      0.11,
      6,
    );
  });
});
