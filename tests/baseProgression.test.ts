import { describe, expect, it } from 'vitest';
import {
  BASE_HEALTH_PER_SEGMENT,
  BASE_SKILL_IDS,
  MAX_BASE_SKILL_LEVEL,
  canUpgradeBaseSkill,
  createBaseProgression,
  getBaseHealthSegments,
  getBaseStats,
  isInsideBaseTargetRange,
  regenerateBase,
  selectBaseAttackTarget,
  upgradeBaseSkill,
} from '../src/game/baseProgression';
import { hyperbolicRadiusToPoincare } from '../src/math/hyperbolic';

describe('base progression', () => {
  it('starts full health with all three independent skills unlearned', () => {
    const progression = createBaseProgression();

    expect(progression.health).toBe(1_000);
    expect(progression.skills).toEqual({
      vitality: 0,
      regeneration: 0,
      areaPulse: 0,
    });
    expect(getBaseStats(progression)).toMatchObject({
      maxHealth: 1_000,
      regenerationPerSecond: 0,
      targetDamage: 0,
      targetRange: 0,
      targetAttackIntervalSeconds: 0,
    });
  });

  it('does not impose a shared skill-point budget across the three tracks', () => {
    const progression = createBaseProgression();

    for (const skill of BASE_SKILL_IDS) {
      for (let level = 0; level < MAX_BASE_SKILL_LEVEL; level += 1) {
        expect(canUpgradeBaseSkill(progression, skill)).toBe(true);
        expect(upgradeBaseSkill(progression, skill)).toBe(true);
      }
    }

    expect(progression.skills).toEqual({
      vitality: 5,
      regeneration: 5,
      areaPulse: 5,
    });
  });

  it('adds 250 maximum and current health for every vitality level', () => {
    const progression = createBaseProgression();
    progression.health = 500;

    for (let level = 1; level <= MAX_BASE_SKILL_LEVEL; level += 1) {
      expect(upgradeBaseSkill(progression, 'vitality')).toBe(true);
      expect(progression.skills.vitality).toBe(level);
      expect(getBaseStats(progression).maxHealth).toBe(1_000 + level * 250);
      expect(progression.health).toBe(500 + level * 250);
    }
  });

  it('represents health as 125-point segments without UI-specific math', () => {
    const progression = createBaseProgression();

    expect(BASE_HEALTH_PER_SEGMENT).toBe(125);
    expect(getBaseHealthSegments(progression)).toEqual({
      totalSegments: 8,
      filledSegments: 8,
    });

    progression.health = 126;
    expect(getBaseHealthSegments(progression)).toEqual({
      totalSegments: 8,
      filledSegments: 2,
    });

    progression.health = 1_000;
    for (let level = 0; level < MAX_BASE_SKILL_LEVEL; level += 1) {
      upgradeBaseSkill(progression, 'vitality');
    }
    expect(getBaseHealthSegments(progression)).toEqual({
      totalSegments: 18,
      filledSegments: 18,
    });
  });

  it.each([
    [1, 3],
    [3, 9],
    [5, 15],
  ])('regeneration level %i restores %i health per second', (level, rate) => {
    const progression = createBaseProgression();
    for (let upgrade = 0; upgrade < level; upgrade += 1) {
      upgradeBaseSkill(progression, 'regeneration');
    }
    progression.health = 900;

    expect(getBaseStats(progression).regenerationPerSecond).toBe(rate);
    expect(regenerateBase(progression, 0.5)).toBe(true);
    expect(progression.health).toBe(900 + rate * 0.5);
  });

  it('regenerates without exceeding maximum health', () => {
    const progression = createBaseProgression();
    upgradeBaseSkill(progression, 'regeneration');
    progression.health = 998;

    expect(regenerateBase(progression, 1)).toBe(true);
    expect(progression.health).toBe(1_000);
    expect(regenerateBase(progression, 1)).toBe(false);
  });

  it('ignores invalid or non-positive regeneration time', () => {
    const progression = createBaseProgression();
    upgradeBaseSkill(progression, 'regeneration');
    progression.health = 900;

    expect(regenerateBase(progression, 0)).toBe(false);
    expect(regenerateBase(progression, -1)).toBe(false);
    expect(regenerateBase(progression, Number.NaN)).toBe(false);
    expect(regenerateBase(progression, Number.POSITIVE_INFINITY)).toBe(false);
    expect(progression.health).toBe(900);
  });

  it('does not lock a target before the base attack skill is learned', () => {
    expect(isInsideBaseTargetRange(createBaseProgression(), { x: 0, y: 0 })).toBe(
      false,
    );
    expect(
      selectBaseAttackTarget(createBaseProgression(), [
        { id: 'enemy', position: { x: 0, y: 0 }, health: 100 },
      ]),
    ).toBeNull();
  });

  it('locks exactly one in-range target by health, then H² distance and ID', () => {
    const progression = createBaseProgression();
    upgradeBaseSkill(progression, 'areaPulse');

    const selected = selectBaseAttackTarget(progression, [
      {
        id: 'outside',
        position: { x: hyperbolicRadiusToPoincare(2.3), y: 0 },
        health: 1_000,
      },
      {
        id: 'nearer-tie',
        position: { x: hyperbolicRadiusToPoincare(0.75), y: 0 },
        health: 400,
      },
      {
        id: 'farther-tie',
        position: { x: hyperbolicRadiusToPoincare(1.1), y: 0 },
        health: 400,
      },
      {
        id: 'weaker',
        position: { x: hyperbolicRadiusToPoincare(0.2), y: 0 },
        health: 120,
      },
    ]);

    expect(selected?.id).toBe('nearer-tie');
  });

  it.each([
    [1, 220, 2.15, 1.2],
    [2, 330, 2.4, 1.05],
    [3, 480, 2.65, 0.9],
    [4, 650, 2.9, 0.78],
    [5, 850, 3.15, 0.68],
  ])(
    'raises the high-damage single-target attack at level %i',
    (level, targetDamage, targetRange, targetAttackIntervalSeconds) => {
      const progression = createBaseProgression();
      for (let upgrade = 0; upgrade < level; upgrade += 1) {
        upgradeBaseSkill(progression, 'areaPulse');
      }

      expect(getBaseStats(progression)).toMatchObject({
        targetDamage,
        targetRange,
        targetAttackIntervalSeconds,
      });
    },
  );

  it.each([1, 2, 3, 4, 5])(
    'uses the H² target radius, including its boundary, at attack level %i',
    (level) => {
      const progression = createBaseProgression();
      for (let upgrade = 0; upgrade < level; upgrade += 1) {
        upgradeBaseSkill(progression, 'areaPulse');
      }
      const targetRange = getBaseStats(progression).targetRange;
      const angle = Math.PI / 5;
      const boundaryRadius = hyperbolicRadiusToPoincare(targetRange);
      const outsideRadius = hyperbolicRadiusToPoincare(targetRange + 0.001);

      expect(
        isInsideBaseTargetRange(progression, {
          x: Math.cos(angle) * boundaryRadius,
          y: Math.sin(angle) * boundaryRadius,
        }),
      ).toBe(true);
      expect(
        isInsideBaseTargetRange(progression, {
          x: Math.cos(angle) * outsideRadius,
          y: Math.sin(angle) * outsideRadius,
        }),
      ).toBe(false);
    },
  );

  it('does not mistake Euclidean disk radius for hyperbolic target distance', () => {
    const progression = createBaseProgression();
    upgradeBaseSkill(progression, 'areaPulse');

    // 0.9 is below the numeric H² range 2.15, but its H² distance is about 2.944.
    expect(isInsideBaseTargetRange(progression, { x: 0.9, y: 0 })).toBe(false);
  });

  it.each(BASE_SKILL_IDS)('caps %s at level five', (skill) => {
    const progression = createBaseProgression();

    for (let level = 0; level < MAX_BASE_SKILL_LEVEL; level += 1) {
      expect(canUpgradeBaseSkill(progression, skill)).toBe(true);
      expect(upgradeBaseSkill(progression, skill)).toBe(true);
    }

    const beforeRefusedUpgrade = structuredClone(progression);
    expect(canUpgradeBaseSkill(progression, skill)).toBe(false);
    expect(upgradeBaseSkill(progression, skill)).toBe(false);
    expect(progression).toEqual(beforeRefusedUpgrade);
  });
});
