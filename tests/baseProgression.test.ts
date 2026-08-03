import { describe, expect, it } from 'vitest';
import {
  BASE_HEALTH_PER_SEGMENT,
  BASE_SKILL_IDS,
  MAX_BASE_SKILL_LEVEL,
  canUpgradeBaseSkill,
  createBaseProgression,
  getBaseHealthSegments,
  getBaseStats,
  isInsideBaseAttackRange,
  regenerateBase,
  upgradeBaseSkill,
} from '../src/game/baseProgression';
import { hyperbolicRadiusToPoincare } from '../src/math/hyperbolic';

describe('base progression', () => {
  it('starts with three skill points, full health, and no learned skills', () => {
    const progression = createBaseProgression();

    expect(progression).toEqual({
      skillPoints: 3,
      health: 1_000,
      skills: {
        vitality: 0,
        regeneration: 0,
        areaPulse: 0,
      },
    });
    expect(getBaseStats(progression)).toEqual({
      maxHealth: 1_000,
      regenerationPerSecond: 0,
      areaDamage: 0,
      areaRadius: 0,
    });
  });

  it('adds 250 maximum and current health for every vitality level', () => {
    const progression = createBaseProgression();
    progression.health = 500;

    for (let level = 1; level <= MAX_BASE_SKILL_LEVEL; level += 1) {
      expect(upgradeBaseSkill(progression, 'vitality')).toBe(true);
      expect(progression.skills.vitality).toBe(level);
      expect(progression.skillPoints).toBe(3 - level);
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
    upgradeBaseSkill(progression, 'vitality');
    expect(getBaseHealthSegments(progression)).toEqual({
      totalSegments: 10,
      filledSegments: 10,
    });

    upgradeBaseSkill(progression, 'vitality');
    expect(getBaseHealthSegments(progression)).toEqual({
      totalSegments: 12,
      filledSegments: 12,
    });

    upgradeBaseSkill(progression, 'vitality');
    expect(getBaseHealthSegments(progression)).toEqual({
      totalSegments: 14,
      filledSegments: 14,
    });
  });

  it.each([
    [1, 3],
    [2, 6],
    [3, 9],
  ])('regeneration level %i restores %i health per second', (level, rate) => {
    const progression = createBaseProgression(level);
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

  it('does not attack before the area pulse skill is learned', () => {
    expect(isInsideBaseAttackRange(createBaseProgression(), { x: 0, y: 0 })).toBe(
      false,
    );
  });

  it.each([1, 2, 3])(
    'uses the H² radius, including its boundary, at pulse level %i',
    (level) => {
      const progression = createBaseProgression(level);
      for (let upgrade = 0; upgrade < level; upgrade += 1) {
        upgradeBaseSkill(progression, 'areaPulse');
      }
      const radius = getBaseStats(progression).areaRadius;
      const angle = Math.PI / 5;
      const boundaryRadius = hyperbolicRadiusToPoincare(radius);
      const outsideRadius = hyperbolicRadiusToPoincare(radius + 0.001);

      expect(
        isInsideBaseAttackRange(progression, {
          x: Math.cos(angle) * boundaryRadius,
          y: Math.sin(angle) * boundaryRadius,
        }),
      ).toBe(true);
      expect(
        isInsideBaseAttackRange(progression, {
          x: Math.cos(angle) * outsideRadius,
          y: Math.sin(angle) * outsideRadius,
        }),
      ).toBe(false);
    },
  );

  it('does not mistake Euclidean disk radius for hyperbolic distance', () => {
    const progression = createBaseProgression();
    upgradeBaseSkill(progression, 'areaPulse');

    // 0.7 is below the numeric H² radius 1.35, but its H² distance is about 1.735.
    expect(isInsideBaseAttackRange(progression, { x: 0.7, y: 0 })).toBe(false);
  });

  it.each(BASE_SKILL_IDS)('caps %s at level three', (skill) => {
    const progression = createBaseProgression(4);

    for (let level = 0; level < MAX_BASE_SKILL_LEVEL; level += 1) {
      expect(canUpgradeBaseSkill(progression, skill)).toBe(true);
      expect(upgradeBaseSkill(progression, skill)).toBe(true);
    }

    const beforeRefusedUpgrade = structuredClone(progression);
    expect(canUpgradeBaseSkill(progression, skill)).toBe(false);
    expect(upgradeBaseSkill(progression, skill)).toBe(false);
    expect(progression).toEqual(beforeRefusedUpgrade);
    expect(progression.skillPoints).toBe(1);
  });

  it.each(BASE_SKILL_IDS)('refuses %s without a skill point', (skill) => {
    const progression = createBaseProgression(0);

    expect(canUpgradeBaseSkill(progression, skill)).toBe(false);
    expect(upgradeBaseSkill(progression, skill)).toBe(false);
    expect(progression.skills[skill]).toBe(0);
  });
});
