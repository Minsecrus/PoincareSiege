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

  it('unlocks towers, enchantments, and base skills in deliberate teaching order', () => {
    expect(getCampaignLevel('level-2').loadout.towerKinds).toEqual([
      'sector',
      'prism',
    ]);
    expect(getCampaignLevel('level-3').loadout.baseSkills).toEqual([
      'vitality',
    ]);
    expect(getCampaignLevel('level-4').loadout.enchantments).toContain(
      'fortify',
    );
    expect(getCampaignLevel('level-5').loadout.towerKinds).toContain('arc');
    expect(getCampaignLevel('level-6').loadout.towerKinds).toContain(
      'sniper',
    );
    expect(getCampaignLevel('level-7').loadout.enchantments).toContain(
      'knockback',
    );
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

  it('keeps authored waves immutable, deterministic, and below the old 50x health ceiling', () => {
    const finalWave = getCampaignWavePlan('level-7', 12);
    expect(finalWave).toBe(getCampaignWavePlan('level-7', 12));
    expect(Math.max(...finalWave.map((spawn) => spawn.healthMultiplier))).toBe(
      3.88,
    );
    expect(new Set(finalWave.map((spawn) => spawn.routeSeed)).size).toBe(
      finalWave.length,
    );
    expect(finalWave.every((spawn) => !('speed' in spawn))).toBe(true);
    expect(() => getCampaignWavePlan('level-1', 4)).toThrow(RangeError);
  });
});
