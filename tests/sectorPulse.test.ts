import { describe, expect, it } from 'vitest';
import {
  applyMobius,
  hyperbolicDistance,
  hyperbolicRadiusToPoincare,
  invertMobius,
  translationToOrigin,
  type Vec2,
} from '../src/math/hyperbolic';
import {
  SECTOR_PULSE_SPEED,
  advanceSectorPulse,
  createSectorPulse,
  getSectorPulseSnapshot,
  isInsideSectorPulseFan,
  type SectorPulseEnemy,
} from '../src/game/sectorPulse';

function pointAt(radius: number, angle = 0): Vec2 {
  const diskRadius = hyperbolicRadiusToPoincare(radius);
  return {
    x: diskRadius * Math.cos(angle),
    y: diskRadius * Math.sin(angle),
  };
}

/** Builds a point in a tower's strict Mobius tangent frame. */
function pointFromTower(
  tower: Vec2,
  distance: number,
  localAngle = 0,
): Vec2 {
  const radius = hyperbolicRadiusToPoincare(distance);
  return applyMobius(invertMobius(translationToOrigin(tower)), {
    x: radius * Math.cos(localAngle),
    y: radius * Math.sin(localAngle),
  });
}

function enemy(id: string, position: Vec2, active = true): SectorPulseEnemy {
  return { id, position, active };
}

describe('sector pulse', () => {
  it('sweeps outward in H² distance and damages each enemy only once', () => {
    const tower = pointAt(1);
    let pulse = createSectorPulse({
      origin: tower,
      range: 1.5,
      fullAngleRadians: Math.PI,
      damage: 18,
    });
    const enemies = [
      enemy('near', pointFromTower(tower, 0.5)),
      enemy('middle', pointFromTower(tower, 1)),
      enemy('edge', pointFromTower(tower, 1.5)),
    ];

    let step = advanceSectorPulse(pulse, 0.2, enemies);
    expect(step.hits).toEqual([{ enemyId: 'near', damage: 18 }]);
    pulse = step.pulse;

    step = advanceSectorPulse(pulse, 0.2, enemies);
    expect(step.hits).toEqual([{ enemyId: 'middle', damage: 18 }]);
    pulse = step.pulse;

    step = advanceSectorPulse(pulse, 0.3, enemies);
    expect(step.hits).toEqual([{ enemyId: 'edge', damage: 18 }]);
    expect(step.pulse.expired).toBe(true);
    expect(step.pulse.hitEnemyIds).toEqual(['near', 'middle', 'edge']);
  });

  it('uses the tower tangent frame for its outward fan, not disk-space angles', () => {
    const tower = pointAt(1.2, Math.PI / 5);
    const outward = pointFromTower(tower, 0.5, 0);
    const side = pointFromTower(tower, 0.5, (3 * Math.PI) / 4);
    const inward = pointFromTower(tower, 0.5, Math.PI);

    expect(isInsideSectorPulseFan(tower, outward, Math.PI)).toBe(true);
    expect(isInsideSectorPulseFan(tower, side, Math.PI)).toBe(false);
    expect(isInsideSectorPulseFan(tower, inward, Math.PI)).toBe(false);
    expect(hyperbolicDistance(tower, outward)).toBeCloseTo(0.5, 10);

    const pulse = createSectorPulse({
      origin: tower,
      range: 1.5,
      fullAngleRadians: Math.PI,
      damage: 18,
    });
    const result = advanceSectorPulse(pulse, 0.2, [
      enemy('outward', outward),
      enemy('side', side),
      enemy('inward', inward),
    ]);

    expect(result.hits).toEqual([{ enemyId: 'outward', damage: 18 }]);
  });

  it('ignores inactive, duplicate, and already-passed targets', () => {
    const tower = pointAt(1);
    let pulse = createSectorPulse({
      origin: tower,
      range: 1.5,
      fullAngleRadians: Math.PI,
      damage: 18,
    });

    let step = advanceSectorPulse(pulse, 0.2, [
      enemy('once', pointFromTower(tower, 0.5)),
      enemy('once', pointFromTower(tower, 0.5)),
      enemy('inactive', pointFromTower(tower, 0.5), false),
    ]);
    expect(step.hits).toEqual([{ enemyId: 'once', damage: 18 }]);
    pulse = step.pulse;

    step = advanceSectorPulse(pulse, 0.2, [
      enemy('once', pointFromTower(tower, 1)),
      enemy('late-behind-wave', pointFromTower(tower, 0.1)),
    ]);
    expect(step.hits).toEqual([]);
  });

  it('expires precisely at range and exposes a renderer snapshot', () => {
    const pulse = createSectorPulse({
      origin: pointAt(0.8),
      range: 2,
      fullAngleRadians: (10 * Math.PI) / 9,
      damage: 30,
    });
    const result = advanceSectorPulse(pulse, 10, []);
    const snapshot = getSectorPulseSnapshot(result.pulse);

    expect(SECTOR_PULSE_SPEED).toBe(2.5);
    expect(result.hits).toEqual([]);
    expect(snapshot.frontRadius).toBe(2);
    expect(snapshot.bandOuterRadius).toBe(2);
    expect(snapshot.progress).toBe(1);
    expect(snapshot.expired).toBe(true);
    expect(snapshot.outwardAngleRadians).toEqual(expect.any(Number));
  });
});
