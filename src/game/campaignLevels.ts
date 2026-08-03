import {
  CAMPAIGN_LEVEL_IDS,
  type CampaignLevelId,
} from './campaignProgress';
import {
  CAMPAIGN_WAVE_PLANS,
  type CampaignWaveSpawn,
} from './campaignWaves';
import type { BaseSkillId } from './baseProgression';
import type { TowerKind } from './towerEconomy';
import type { TowerEnchantmentKind } from './towerEnchantments';
import type { SpecialTileKind } from './specialTiles';

/** The combat systems exposed by one authored campaign level. */
export interface CampaignLevelLoadout {
  readonly towerKinds: readonly TowerKind[];
  readonly enchantments: readonly TowerEnchantmentKind[];
  readonly baseSkills: readonly BaseSkillId[];
  readonly specialTiles: readonly SpecialTileKind[];
}

export interface CampaignLevel {
  readonly id: CampaignLevelId;
  readonly waveCount: number;
  readonly initialResources: number;
  readonly loadout: CampaignLevelLoadout;
  readonly waves: readonly (readonly CampaignWaveSpawn[])[];
}

function defineLevel(
  id: CampaignLevelId,
  initialResources: number,
  loadout: CampaignLevelLoadout,
): CampaignLevel {
  const waves = CAMPAIGN_WAVE_PLANS[id];
  if (waves.length === 0) {
    throw new Error(`Campaign level ${id} must contain at least one wave.`);
  }
  return Object.freeze({
    id,
    waveCount: waves.length,
    initialResources,
    loadout: Object.freeze({
      towerKinds: Object.freeze([...loadout.towerKinds]),
      enchantments: Object.freeze([...loadout.enchantments]),
      baseSkills: Object.freeze([...loadout.baseSkills]),
      specialTiles: Object.freeze([...loadout.specialTiles]),
    }),
    waves,
  });
}

/**
 * The progression is deliberately about introducing decisions, not just
 * raising HP. Level one is a three-wave placement lesson; each subsequent
 * level adds at most one primary combat system before the final synthesis.
 */
export const CAMPAIGN_LEVELS: readonly CampaignLevel[] = Object.freeze([
  defineLevel('level-1', 500, {
    towerKinds: ['sector'],
    enchantments: [],
    baseSkills: [],
    specialTiles: [],
  }),
  defineLevel('level-2', 500, {
    towerKinds: ['sector', 'prism'],
    enchantments: ['selfRepair'],
    baseSkills: [],
    specialTiles: [],
  }),
  defineLevel('level-3', 500, {
    towerKinds: ['sector', 'prism', 'pulse'],
    enchantments: ['selfRepair', 'attackSpeed'],
    baseSkills: ['vitality'],
    specialTiles: ['repair'],
  }),
  defineLevel('level-4', 500, {
    towerKinds: ['sector', 'prism', 'pulse', 'anchor'],
    enchantments: ['selfRepair', 'attackSpeed', 'fortify'],
    baseSkills: ['vitality', 'regeneration'],
    specialTiles: ['repair', 'haste'],
  }),
  defineLevel('level-5', 540, {
    towerKinds: [
      'sector',
      'prism',
      'pulse',
      'anchor',
      'arc',
      'support',
      'bulwark',
    ],
    enchantments: ['selfRepair', 'allyHeal', 'attackSpeed', 'fortify'],
    baseSkills: ['vitality', 'regeneration', 'areaPulse'],
    specialTiles: ['repair', 'haste', 'power'],
  }),
  defineLevel('level-6', 620, {
    towerKinds: [
      'sector',
      'prism',
      'pulse',
      'anchor',
      'arc',
      'sniper',
      'support',
      'bulwark',
    ],
    enchantments: ['selfRepair', 'allyHeal', 'attackSpeed', 'fortify'],
    baseSkills: ['vitality', 'regeneration', 'areaPulse'],
    specialTiles: ['repair', 'haste', 'power'],
  }),
  defineLevel('level-7', 750, {
    towerKinds: [
      'sector',
      'prism',
      'pulse',
      'anchor',
      'arc',
      'sniper',
      'support',
      'bulwark',
    ],
    enchantments: [
      'selfRepair',
      'allyHeal',
      'attackSpeed',
      'fortify',
      'knockback',
    ],
    baseSkills: ['vitality', 'regeneration', 'areaPulse'],
    specialTiles: ['repair', 'haste', 'power'],
  }),
]);

const LEVEL_BY_ID: Readonly<Record<CampaignLevelId, CampaignLevel>> =
  Object.freeze(
    Object.fromEntries(
      CAMPAIGN_LEVELS.map((level) => [level.id, level]),
    ) as Record<CampaignLevelId, CampaignLevel>,
  );

if (
  CAMPAIGN_LEVELS.length !== CAMPAIGN_LEVEL_IDS.length ||
  CAMPAIGN_LEVELS.some((level, index) => level.id !== CAMPAIGN_LEVEL_IDS[index])
) {
  throw new Error('Campaign level definitions must match the progress order.');
}

export function getCampaignLevel(levelId: CampaignLevelId): CampaignLevel {
  return LEVEL_BY_ID[levelId];
}

/** Returns a stable authored wave for the requested campaign level. */
export function getCampaignWavePlan(
  levelId: CampaignLevelId,
  wave: number,
): readonly CampaignWaveSpawn[] {
  const level = getCampaignLevel(levelId);
  if (!Number.isSafeInteger(wave) || wave < 1 || wave > level.waveCount) {
    throw new RangeError(
      `${levelId} wave must be an integer from 1 to ${level.waveCount}.`,
    );
  }
  return level.waves[wave - 1];
}
