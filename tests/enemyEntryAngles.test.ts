import { describe, expect, it } from 'vitest';
import {
  ENEMY_ENTRY_GUIDE_COUNT,
  MAX_LATE_ENTRY_GUIDE_DEVIATION_RADIANS,
  STRICT_GUIDE_ENTRY_WAVES,
  getEnemyEntryAngle,
  getEnemyEntryAngles,
} from '../src/game/enemyEntryAngles';

const TAU = Math.PI * 2;
const GUIDE_SECTOR = TAU / ENEMY_ENTRY_GUIDE_COUNT;

function circularDistance(left: number, right: number): number {
  const direct = Math.abs(left - right);
  return Math.min(direct, TAU - direct);
}

function nearestGuideDistance(angle: number): number {
  return Math.min(
    ...Array.from({ length: ENEMY_ENTRY_GUIDE_COUNT }, (_, index) =>
      circularDistance(angle, index * GUIDE_SECTOR),
    ),
  );
}

function maximumCircularGap(angles: readonly number[]): number {
  const sorted = [...angles].sort((left, right) => left - right);
  return Math.max(
    ...sorted.map((angle, index) => {
      const next = sorted[(index + 1) % sorted.length];
      return index + 1 === sorted.length ? next + TAU - angle : next - angle;
    }),
  );
}

describe('enemy entry angles', () => {
  it('keeps the first three waves exactly on the seven visible guide geodesics', () => {
    for (let wave = 1; wave <= STRICT_GUIDE_ENTRY_WAVES; wave += 1) {
      const angles = getEnemyEntryAngles(wave, 15);
      expect(angles).toHaveLength(15);
      for (const [index, angle] of angles.entries()) {
        expect(angle).toBeCloseTo(
          ((index % ENEMY_ENTRY_GUIDE_COUNT) * TAU) /
            ENEMY_ENTRY_GUIDE_COUNT,
          12,
        );
      }
    }
  });

  it('creates reproducible post-tutorial entries from the whole-wave plan', () => {
    const first = getEnemyEntryAngles(8, 20);
    const second = getEnemyEntryAngles(8, 20);

    expect(first).toEqual(second);
    expect(first).toEqual(
      Array.from({ length: 20 }, (_, index) =>
        getEnemyEntryAngle(8, index, 20),
      ),
    );
    expect(Object.isFrozen(first)).toBe(true);
  });

  it('disperses later waves around the full perimeter while keeping a finite guide bias', () => {
    for (const plannedCount of [12, 20, 44]) {
      const angles = getEnemyEntryAngles(10, plannedCount);

      expect(new Set(angles.map((angle) => angle.toPrecision(14))).size).toBe(
        plannedCount,
      );
      expect(angles.every((angle) => angle >= 0 && angle < TAU)).toBe(true);
      expect(
        angles.every(
          (angle) =>
            nearestGuideDistance(angle) <=
            MAX_LATE_ENTRY_GUIDE_DEVIATION_RADIANS + 1e-12,
        ),
      ).toBe(true);

      // A strictly uniform plan has a gap of TAU / plannedCount. The guide
      // pull is intentionally allowed to widen that gap, but never enough to
      // turn a whole wave into one arbitrary entry-side cluster.
      expect(maximumCircularGap(angles)).toBeLessThanOrEqual(
        (TAU / plannedCount) * 2.5,
      );
    }
  });

  it('spawns the first late-wave entries far apart instead of walking adjacent angles', () => {
    const earlySpawnBurst = getEnemyEntryAngles(15, 34).slice(0, 7);
    const smallestGap = Math.min(
      ...earlySpawnBurst.flatMap((angle, index) =>
        earlySpawnBurst
          .slice(index + 1)
          .map((otherAngle) => circularDistance(angle, otherAngle)),
      ),
    );

    expect(smallestGap).toBeGreaterThan((TAU / 34) * 1.4);
  });

  it('rejects invalid wave and whole-wave spawn coordinates', () => {
    expect(() => getEnemyEntryAngles(0, 7)).toThrow(RangeError);
    expect(() => getEnemyEntryAngles(4, 0)).toThrow(RangeError);
    expect(() => getEnemyEntryAngle(4, -1, 7)).toThrow(RangeError);
    expect(() => getEnemyEntryAngle(4, 7, 7)).toThrow(RangeError);
    expect(() => getEnemyEntryAngle(4, 1.5, 7)).toThrow(RangeError);
  });
});
