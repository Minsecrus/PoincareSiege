import { describe, expect, it } from 'vitest';
import {
  CAMPAIGN_LEVELS,
  getCampaignLevel,
  getCampaignWavePlan,
} from '../src/game/campaignLevels';
import { CAMPAIGN_LEVEL_IDS } from '../src/game/campaignProgress';

describe('campaign levels', () => {
  it('authors seven non-uniform levels instead of a global twenty-wave mode', () => {
    expect(CAMPAIGN_LEVELS.map((level) => level.id)).toEqual(
      CAMPAIGN_LEVEL_IDS,
    );
    expect(CAMPAIGN_LEVELS.map((level) => level.waveCount)).toEqual([
      3, 5, 6, 7, 8, 10, 12,
    ]);
    expect(CAMPAIGN_LEVELS.reduce((sum, level) => sum + level.waveCount, 0)).toBe(
      51,
    );
  });

  it('makes level one a three-wave sector-only lesson with no upgrades systems', () => {
    const level = getCampaignLevel('level-1');
    expect(level.initialResources).toBe(500);
    expect(level.loadout).toEqual({
      towerKinds: ['sector'],
      enchantments: [],
      baseSkills: [],
      specialTiles: [],
    });
    expect(level.waves.map((wave) => wave.length)).toEqual([4, 6, 8]);
    expect(level.waves.flat().every((spawn) => spawn.kind === 'basic')).toBe(
      true,
    );
    expect(
      level.waves.flat().every((spawn) => spawn.routeBehavior === 'direct'),
    ).toBe(true);
  });

  it('starts each of the first four teaching levels with the same reserve', () => {
    expect(CAMPAIGN_LEVELS.slice(0, 4).map((level) => level.initialResources)).toEqual([
      500, 500, 500, 500,
    ]);
  });

  it('unlocks special tiles, support, and bulwark tools in deliberate teaching order', () => {
    expect(CAMPAIGN_LEVELS.map((level) => level.loadout.specialTiles)).toEqual([
      [],
      [],
      ['repair'],
      ['repair', 'haste'],
      ['repair', 'haste', 'power'],
      ['repair', 'haste', 'power'],
      ['repair', 'haste', 'power'],
    ]);
    expect(CAMPAIGN_LEVELS.map((level) => level.loadout.towerKinds)).toEqual([
      ['sector'],
      ['sector', 'prism'],
      ['sector', 'prism', 'pulse'],
      ['sector', 'prism', 'pulse', 'anchor'],
      ['sector', 'prism', 'pulse', 'anchor', 'arc', 'support', 'bulwark'],
      [
        'sector',
        'prism',
        'pulse',
        'anchor',
        'arc',
        'sniper',
        'support',
        'bulwark',
      ],
      [
        'sector',
        'prism',
        'pulse',
        'anchor',
        'arc',
        'sniper',
        'support',
        'bulwark',
      ],
    ]);
  });

  it('preserves the authored enchantment and base-skill teaching order', () => {
    expect(CAMPAIGN_LEVELS.map((level) => level.loadout.enchantments)).toEqual([
      [],
      ['selfRepair'],
      ['selfRepair', 'attackSpeed'],
      ['selfRepair', 'attackSpeed', 'fortify'],
      ['selfRepair', 'allyHeal', 'attackSpeed', 'fortify'],
      ['selfRepair', 'allyHeal', 'attackSpeed', 'fortify'],
      ['selfRepair', 'allyHeal', 'attackSpeed', 'fortify', 'knockback'],
    ]);
    expect(CAMPAIGN_LEVELS.map((level) => level.loadout.baseSkills)).toEqual([
      [],
      [],
      ['vitality'],
      ['vitality', 'regeneration'],
      ['vitality', 'regeneration', 'areaPulse'],
      ['vitality', 'regeneration', 'areaPulse'],
      ['vitality', 'regeneration', 'areaPulse'],
    ]);
  });

  it('reserves bosses for the level-six finale and the level-seven milestones', () => {
    const bossWaves = (levelId: 'level-6' | 'level-7') =>
      getCampaignLevel(levelId).waves
        .map((wave, index) => ({ wave, waveNumber: index + 1 }))
        .filter(({ wave }) => wave.some((spawn) => spawn.kind === 'boss'))
        .map(({ waveNumber }) => waveNumber);

    expect(bossWaves('level-6')).toEqual([10]);
    expect(bossWaves('level-7')).toEqual([4, 8, 12]);
  });

  it('raises only the post-unlock enemy pressure to meet outer-ring firepower', () => {
    const earlyLevels = CAMPAIGN_LEVELS.slice(0, 4);
    expect(earlyLevels.flatMap((level) => level.waves).flat().every(
      (spawn) => spawn.contactMultiplier === undefined,
    )).toBe(true);

    const levelFive = getCampaignLevel('level-5');
    const levelSix = getCampaignLevel('level-6');
    const levelSeven = getCampaignLevel('level-7');
    expect(levelFive.waves[0][0]).toMatchObject({
      healthMultiplier: 2,
      contactMultiplier: 1,
    });
    expect(levelFive.waves[7][0]).toMatchObject({
      healthMultiplier: 4.4,
      contactMultiplier: 1.12,
    });
    expect(levelSix.waves[0][0]).toMatchObject({
      healthMultiplier: 3,
      contactMultiplier: 1.08,
    });
    expect(levelSix.waves[9][0]).toMatchObject({
      healthMultiplier: 8.2,
      contactMultiplier: 1.25,
    });
    expect(levelSeven.waves[0][0]).toMatchObject({
      healthMultiplier: 5,
      contactMultiplier: 1.16,
    });
    expect(levelSeven.waves[11][0]).toMatchObject({
      healthMultiplier: 18.2,
      contactMultiplier: 1.38,
    });
  });

  it('keeps authored waves immutable, deterministic, and below the old 50x health ceiling', () => {
    const finalWave = getCampaignWavePlan('level-7', 12);
    expect(finalWave).toBe(getCampaignWavePlan('level-7', 12));
    expect(
      Math.max(...finalWave.map((spawn) => spawn.healthMultiplier)),
    ).toBeCloseTo(27.3);
    expect(finalWave).toHaveLength(45);
    const boss = finalWave.find((spawn) => spawn.kind === 'boss');
    expect(boss).toMatchObject({
      contactMultiplier: 1.38,
      routeBehavior: 'direct',
    });
    expect(boss?.healthMultiplier).toBeCloseTo(27.3);
    const directRouteShare =
      finalWave.filter((spawn) => spawn.routeBehavior === 'direct').length /
      finalWave.length;
    expect(directRouteShare).toBeGreaterThanOrEqual(0.25);
    expect(new Set(finalWave.map((spawn) => spawn.routeSeed)).size).toBe(
      finalWave.length,
    );
    expect(finalWave.every((spawn) => !('speed' in spawn))).toBe(true);
    expect(() => getCampaignWavePlan('level-1', 4)).toThrow(RangeError);
  });
});
