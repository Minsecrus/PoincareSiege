import { describe, expect, it } from 'vitest';
import {
  BOSS_STAGES,
  SPLITTER_CHILD_COUNT,
  SPLITTER_CHILD_HEALTH_SCALE,
  SPLITTER_CHILD_KIND,
  resolveBossHealthStages,
  resolveEnemyDefeatBehavior,
  type EnemyDefeatContext,
} from '../src/game/enemyBehaviors';

const position = { x: 0.32, y: -0.18 };
const route = {
  routeAngle: Math.PI / 4,
  startRadius: 4.7,
  travelledDistance: 1.9,
  routeId: 'flank-a',
};

function defeated<Kind extends EnemyDefeatContext['kind']>(
  kind: Kind,
): EnemyDefeatContext & { kind: Kind } {
  return { kind, canonicalPosition: position, route };
}

describe('enemy behaviors', () => {
  it('splits a splitter into two reduced-health swarms at its defeat point', () => {
    const children = resolveEnemyDefeatBehavior(defeated('splitter'));

    expect(children).toHaveLength(SPLITTER_CHILD_COUNT);
    expect(children.map((child) => child.kind)).toEqual([
      SPLITTER_CHILD_KIND,
      SPLITTER_CHILD_KIND,
    ]);
    expect(children.map((child) => child.healthScale)).toEqual([
      SPLITTER_CHILD_HEALTH_SCALE,
      SPLITTER_CHILD_HEALTH_SCALE,
    ]);
    expect(children.map((child) => child.routeForkAngleRadians)).toEqual([
      -0.16,
      0.16,
    ]);
    expect(children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          canonicalPosition: position,
          route,
          reason: 'splitter-death',
        }),
      ]),
    );
    expect(children[0]).not.toHaveProperty('speed');
  });

  it('does not mutate its defeat context or share child position and route objects', () => {
    const context = defeated('splitter');
    const children = resolveEnemyDefeatBehavior(context);

    expect(context).toEqual(defeated('splitter'));
    expect(children[0].canonicalPosition).not.toBe(context.canonicalPosition);
    expect(children[0].route).not.toBe(context.route);
    expect(children[0].canonicalPosition).not.toBe(children[1].canonicalPosition);
    expect(children[0].route).not.toBe(children[1].route);
  });

  it('returns no child descriptors for enemy families without death behavior', () => {
    expect(resolveEnemyDefeatBehavior(defeated('basic'))).toEqual([]);
    expect(resolveEnemyDefeatBehavior(defeated('swarm'))).toEqual([]);
    expect(resolveEnemyDefeatBehavior(defeated('armored'))).toEqual([]);
    expect(resolveEnemyDefeatBehavior(defeated('raider'))).toEqual([]);
    expect(resolveEnemyDefeatBehavior(defeated('boss'))).toEqual([]);
  });

  it('emits the crossed boss stage with deterministic reinforcements', () => {
    const stages = resolveBossHealthStages({
      ...defeated('boss'),
      maxHealth: 900,
      previousHealth: 900,
      currentHealth: 600,
    });

    expect(stages).toHaveLength(1);
    expect(stages[0].stage).toEqual(BOSS_STAGES[0]);
    expect(stages[0].spawnedEnemies).toEqual([
      expect.objectContaining({
        kind: 'swarm',
        healthScale: 0.7,
        routeForkAngleRadians: -0.14,
        reason: 'boss-reinforcement',
      }),
      expect.objectContaining({
        kind: 'swarm',
        healthScale: 0.7,
        routeForkAngleRadians: 0.14,
        reason: 'boss-reinforcement',
      }),
    ]);
  });

  it('emits every crossed stage exactly once for a large damage event', () => {
    const stages = resolveBossHealthStages({
      ...defeated('boss'),
      maxHealth: 900,
      previousHealth: 900,
      currentHealth: 150,
    });

    expect(stages.map((event) => event.stage.id)).toEqual([
      'pressure',
      'last-stand',
    ]);
    expect(stages[1].spawnedEnemies.map((enemy) => enemy.kind)).toEqual([
      'raider',
      'raider',
    ]);
    expect(
      resolveBossHealthStages({
        ...defeated('boss'),
        maxHealth: 900,
        previousHealth: 600,
        currentHealth: 599,
      }),
    ).toEqual([]);
  });

  it('can expose boss stage transitions without their optional reinforcements', () => {
    const stages = resolveBossHealthStages({
      ...defeated('boss'),
      maxHealth: 300,
      previousHealth: 300,
      currentHealth: 190,
      reinforcementsEnabled: false,
    });

    expect(stages).toEqual([
      {
        stage: BOSS_STAGES[0],
        spawnedEnemies: [],
      },
    ]);
  });

  it('rejects malformed kinds, positions, routes, and boss health transitions', () => {
    expect(() =>
      resolveEnemyDefeatBehavior({
        ...defeated('basic'),
        kind: 'unknown' as EnemyDefeatContext['kind'],
      }),
    ).toThrow(RangeError);
    expect(() =>
      resolveEnemyDefeatBehavior({
        ...defeated('splitter'),
        canonicalPosition: { x: 1, y: 0 },
      }),
    ).toThrow(RangeError);
    expect(() =>
      resolveEnemyDefeatBehavior({
        ...defeated('splitter'),
        route: { ...route, travelledDistance: -1 },
      }),
    ).toThrow(RangeError);
    expect(() =>
      resolveBossHealthStages({
        ...defeated('boss'),
        maxHealth: 100,
        previousHealth: 50,
        currentHealth: 60,
      }),
    ).toThrow(RangeError);
  });
});
