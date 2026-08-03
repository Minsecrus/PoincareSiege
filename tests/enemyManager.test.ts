import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ENEMY_START_RADIUS,
  EnemyManager,
} from '../src/entities/enemyManager';
import {
  IDENTITY_MOBIUS,
  applyMobius,
  hyperbolicDistance,
  hyperbolicRadiusToPoincare,
  translationToOrigin,
} from '../src/math/hyperbolic';
import {
  buildEnemyRoute,
  sampleEnemyRoute,
} from '../src/game/enemyRoutes';

describe('enemy manager', () => {
  it('spawns at the requested H2 radius and progresses along its route geodesic', () => {
    const scene = new THREE.Scene();
    const enemies = new EnemyManager(scene, 5, {
      startRadius: 4,
      speed: 0.5,
    });
    const enemy = enemies.spawn({ routeAngle: Math.PI / 3 });

    expect(enemies.activeCount).toBe(1);
    expect(scene.children).toContain(enemy.group);
    expect(hyperbolicDistance(enemy.canonicalPosition, { x: 0, y: 0 })).toBeCloseTo(
      4,
      9,
    );

    enemies.update(2, IDENTITY_MOBIUS);
    expect(enemy.travelledDistance).toBeCloseTo(1);
    expect(hyperbolicDistance(enemy.canonicalPosition, { x: 0, y: 0 })).toBeCloseTo(
      3,
      9,
    );
    expect(Math.atan2(enemy.canonicalPosition.y, enemy.canonicalPosition.x)).toBeCloseTo(
      Math.PI / 3,
      9,
    );
    enemies.dispose();
  });

  it('uses a Mobius transform only for visual placement', () => {
    const scene = new THREE.Scene();
    const enemies = new EnemyManager(scene, 5);
    const enemy = enemies.spawn({ routeAngle: 0 });
    const canonicalBefore = { ...enemy.canonicalPosition };
    const viewTransform = translationToOrigin({ x: 0.2, y: -0.1 });

    enemies.update(0, viewTransform);
    const projected = applyMobius(viewTransform, canonicalBefore);
    expect(enemy.canonicalPosition).toEqual(canonicalBefore);
    expect(enemy.group.position.x).toBeCloseTo(projected.x * 5, 9);
    expect(enemy.group.position.z).toBeCloseTo(-projected.y * 5, 9);
    enemies.dispose();
  });

  it('applies transient per-enemy speed multipliers without changing canonical speed', () => {
    const scene = new THREE.Scene();
    const enemies = new EnemyManager(scene, 5, {
      startRadius: 4,
      speed: 1,
    });
    const enemy = enemies.spawn({ id: 'slowed', routeAngle: 0 });

    enemies.update(1, IDENTITY_MOBIUS, new Map([[enemy.id, 0.4]]));

    expect(enemy.speed).toBe(1);
    expect(enemy.travelledDistance).toBeCloseTo(0.4, 9);
    expect(hyperbolicDistance(enemy.canonicalPosition, { x: 0, y: 0 })).toBeCloseTo(
      3.6,
      9,
    );
    enemies.dispose();
  });

  it('discards an enemy route and starts a newly generated route at its displaced position', () => {
    const scene = new THREE.Scene();
    const enemies = new EnemyManager(scene, 5, {
      startRadius: 4,
      speed: 1,
    });
    const originalRoute = buildEnemyRoute({
      entryAngle: 0.35,
      startRadius: 4,
      behavior: 'zigzag',
      seed: 71,
    });
    const enemy = enemies.spawn({
      id: 'rerouted',
      route: originalRoute,
    });
    enemies.update(0.8, IDENTITY_MOBIUS);

    const targetAngle = -0.92;
    const targetRadius = 3.2;
    const targetDiskRadius = hyperbolicRadiusToPoincare(targetRadius);
    const target = {
      x: targetDiskRadius * Math.cos(targetAngle),
      y: targetDiskRadius * Math.sin(targetAngle),
    };
    const originalSpeed = enemy.speed;
    const rerouted = enemies.rerouteFromPosition(
      enemy,
      target,
      IDENTITY_MOBIUS,
    );

    expect(rerouted).toBe(enemy);
    expect(enemy.route).not.toBe(originalRoute);
    expect(enemy.route.behavior).toBe('zigzag');
    expect(enemy.route.seed).toBe(71);
    expect(enemy.routeAngle).toBeCloseTo(targetAngle, 9);
    expect(enemy.startRadius).toBeCloseTo(targetRadius, 9);
    expect(enemy.travelledDistance).toBe(0);
    expect(enemy.canonicalPosition.x).toBeCloseTo(target.x, 9);
    expect(enemy.canonicalPosition.y).toBeCloseTo(target.y, 9);
    const routeStart = sampleEnemyRoute(enemy.route, 0);
    expect(routeStart.x).toBeCloseTo(target.x, 9);
    expect(routeStart.y).toBeCloseTo(target.y, 9);

    const newRoute = enemy.route;
    const expectedAfterMove = sampleEnemyRoute(newRoute, originalSpeed * 0.4);
    enemies.update(0.4, IDENTITY_MOBIUS);
    expect(enemy.speed).toBe(originalSpeed);
    expect(enemy.travelledDistance).toBeCloseTo(originalSpeed * 0.4, 9);
    expect(enemy.canonicalPosition.x).toBeCloseTo(expectedAfterMove.x, 9);
    expect(enemy.canonicalPosition.y).toBeCloseTo(expectedAfterMove.y, 9);

    expect(() =>
      enemies.rerouteFromPosition(enemy, { x: 0, y: 0 }, IDENTITY_MOBIUS),
    ).toThrow(RangeError);
    expect(() =>
      enemies.rerouteFromPosition(enemy, { x: 1, y: 0 }, IDENTITY_MOBIUS),
    ).toThrow(RangeError);
    expect(enemy.route).toBe(newRoute);
    enemies.dispose();
  });

  it('returns and removes enemies that arrive at the center', () => {
    const reachedIds: string[] = [];
    const scene = new THREE.Scene();
    const enemies = new EnemyManager(scene, 5, {
      startRadius: 1,
      speed: 0.75,
      onReachCenter: (enemy) => reachedIds.push(enemy.id),
    });
    const enemy = enemies.spawn({ id: 'arriving', routeAngle: -0.4 });

    expect(enemies.update(1, IDENTITY_MOBIUS)).toEqual([]);
    const reached = enemies.update(1, IDENTITY_MOBIUS);
    expect(reached).toEqual([enemy]);
    expect(reachedIds).toEqual(['arriving']);
    expect(enemies.activeCount).toBe(0);
    expect(scene.children).not.toContain(enemy.group);
    expect(hyperbolicDistance(enemy.canonicalPosition, { x: 0, y: 0 })).toBeLessThan(
      1e-7,
    );
    enemies.dispose();
  });

  it('supports defeat/removal and generated ids without affecting other enemies', () => {
    const scene = new THREE.Scene();
    const enemies = new EnemyManager(scene, 5);
    const first = enemies.spawn({ routeAngle: 0 });
    const second = enemies.spawn({ routeAngle: 1 });

    expect(first.id).not.toBe(second.id);
    expect(enemies.defeat(first)).toBe(first);
    expect(enemies.get(first.id)).toBeNull();
    expect(enemies.activeEnemies()).toEqual([second]);
    expect(enemies.remove('missing')).toBeNull();
    expect(enemies.getActiveCount()).toBe(1);
    enemies.dispose();
  });

  it('uses the battlefield default entry radius when no override is supplied', () => {
    const enemies = new EnemyManager(new THREE.Scene(), 5);
    const enemy = enemies.spawn({ routeAngle: 0 });

    expect(hyperbolicDistance(enemy.canonicalPosition, { x: 0, y: 0 })).toBeCloseTo(
      DEFAULT_ENEMY_START_RADIUS,
      9,
    );
    enemies.dispose();
  });
});
