import {
  isCampaignLevelUnlocked,
  type CampaignLevelId,
  type CampaignProgress,
} from '../game/campaignProgress';
import {
  ENEMY_KINDS,
  getEnemyType,
  type EnemyKind,
} from '../game/enemyTypes';
import {
  getEnemyDamageResistance,
  getTowerDamageType,
  type DamageType,
} from '../game/damageResistance';
import {
  TOWER_KINDS,
  getTowerBuildCost,
  type TowerKind,
} from '../game/towerEconomy';
import {
  TOWER_ENCHANTMENT_KINDS,
  TOWER_ENCHANTMENT_MAX_LEVEL,
  getTowerEnchantmentEffects,
  getTowerEnchantmentUpgradeCost,
  type TowerEnchantmentKind,
} from '../game/towerEnchantments';
import { getTowerStats } from '../game/towerStats';
import {
  getSpecialTileEffect,
  type SpecialTileKind,
} from '../game/specialTiles';
import './homeCodex.css';

type CodexTab = 'towers' | 'enemies' | 'enchantments' | 'terrain';
type CodexKind = TowerKind | EnemyKind | TowerEnchantmentKind | SpecialTileKind;

interface CodexEntry<Kind extends CodexKind> {
  readonly kind: Kind;
  readonly name: string;
  readonly description: string;
  readonly unlockLevel: CampaignLevelId;
  readonly accent: string;
}

const TOWER_ENTRIES: Readonly<Record<TowerKind, CodexEntry<TowerKind>>> = {
  sector: {
    kind: 'sector',
    name: '扇形守卫',
    description: '广角脉冲',
    unlockLevel: 'level-1',
    accent: '#8af3df',
  },
  prism: {
    kind: 'prism',
    name: '测地棱镜',
    description: '穿透光束',
    unlockLevel: 'level-2',
    accent: '#a5d8ff',
  },
  pulse: {
    kind: 'pulse',
    name: '双曲脉冲',
    description: '圆形震波',
    unlockLevel: 'level-3',
    accent: '#7deeff',
  },
  anchor: {
    kind: 'anchor',
    name: '滞流锚',
    description: '范围减速',
    unlockLevel: 'level-4',
    accent: '#9ff8b6',
  },
  arc: {
    kind: 'arc',
    name: '链式电弧',
    description: '连锁电击',
    unlockLevel: 'level-5',
    accent: '#d4b5ff',
  },
  sniper: {
    kind: 'sniper',
    name: '湮灭狙击塔',
    description: '高额单体',
    unlockLevel: 'level-6',
    accent: '#ffd18a',
  },
  support: {
    kind: 'support',
    name: '共振信标',
    description: '增幅 · 修复',
    unlockLevel: 'level-5',
    accent: '#76f4c5',
  },
  bulwark: {
    kind: 'bulwark',
    name: '壁垒塔',
    description: '承伤 · 诱敌',
    unlockLevel: 'level-5',
    accent: '#b4f6df',
  },
};

const ENEMY_ENTRIES: Readonly<Record<EnemyKind, CodexEntry<EnemyKind>>> = {
  basic: {
    kind: 'basic',
    name: '边界斥候',
    description: '标准单位',
    unlockLevel: 'level-1',
    accent: '#ff637d',
  },
  swarm: {
    kind: 'swarm',
    name: '蜂群无人机',
    description: '快速集群',
    unlockLevel: 'level-2',
    accent: '#ffc35c',
  },
  armored: {
    kind: 'armored',
    name: '重甲构造',
    description: '高生命核心',
    unlockLevel: 'level-3',
    accent: '#ae8cff',
  },
  splitter: {
    kind: 'splitter',
    name: '分裂核心',
    description: '击毁后分裂',
    unlockLevel: 'level-4',
    accent: '#ff79e6',
  },
  raider: {
    kind: 'raider',
    name: '侧翼突袭者',
    description: '高速绕行',
    unlockLevel: 'level-5',
    accent: '#65dcff',
  },
  boss: {
    kind: 'boss',
    name: '测地巨像',
    description: '阶段增援',
    unlockLevel: 'level-6',
    accent: '#ff9b5d',
  },
};

const ENCHANTMENT_ENTRIES: Readonly<
  Record<TowerEnchantmentKind, CodexEntry<TowerEnchantmentKind>>
> = {
  selfRepair: {
    kind: 'selfRepair',
    name: '自我修复',
    description: '自身回血',
    unlockLevel: 'level-2',
    accent: '#92f5bd',
  },
  allyHeal: {
    kind: 'allyHeal',
    name: '友军修复',
    description: '治疗邻塔',
    unlockLevel: 'level-5',
    accent: '#8ceff1',
  },
  attackSpeed: {
    kind: 'attackSpeed',
    name: '攻击速度',
    description: '缩短攻击间隔',
    unlockLevel: 'level-3',
    accent: '#ffe38b',
  },
  fortify: {
    kind: 'fortify',
    name: '坚固',
    description: '强化结构',
    unlockLevel: 'level-4',
    accent: '#b7c6ff',
  },
  knockback: {
    kind: 'knockback',
    name: '击退',
    description: '向外击退',
    unlockLevel: 'level-7',
    accent: '#ffb38f',
  },
};

const SPECIAL_TILE_KINDS = [
  'repair',
  'haste',
  'power',
] as const satisfies readonly SpecialTileKind[];

const TERRAIN_ENTRIES: Readonly<
  Record<SpecialTileKind, CodexEntry<SpecialTileKind>>
> = {
  repair: {
    kind: 'repair',
    name: '修复格',
    description: '持续修复',
    unlockLevel: 'level-3',
    accent: '#7ef0bd',
  },
  haste: {
    kind: 'haste',
    name: '急速格',
    description: '缩短间隔',
    unlockLevel: 'level-4',
    accent: '#ffe177',
  },
  power: {
    kind: 'power',
    name: '增幅格',
    description: '强化火力',
    unlockLevel: 'level-5',
    accent: '#ff9e72',
  },
};

type StatIconKind =
  | 'damage'
  | 'range'
  | 'cost'
  | 'health'
  | 'speed'
  | 'reward'
  | 'kinetic'
  | 'energy'
  | 'shield'
  | 'taunt';

function formatValue(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function statIcon(kind: StatIconKind): string {
  const paths = {
    damage: '<path d="m24 4 4.7 13.8L43 18l-11.2 9 3.8 14-11.6-7.5L12.4 41l3.8-14L5 18l14.3-.2L24 4Z" />',
    range: '<path fill-rule="evenodd" d="M24 4a20 20 0 1 1 0 40 20 20 0 0 1 0-40Zm0 5a15 15 0 1 0 0 30 15 15 0 0 0 0-30Zm0 7a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z" />',
    cost: '<path d="m24 4 14 8v24l-14 8-14-8V12l14-8Zm0 8-7 4v16l7 4 7-4V16l-7-4Z" /><path d="M22 17h4v14h-4z" />',
    health: '<path d="M24 42S7 31 7 18a9 9 0 0 1 17-4 9 9 0 0 1 17 4c0 13-17 24-17 24Z" />',
    speed: '<path d="m26 5 16 19-16 19V31H6v-14h20V5Zm-14 17v4h19v4l5-6-5-6v4H12Z" />',
    reward: '<path d="M24 5 40 14v20l-16 9-16-9V14l16-9Zm0 7-9 5v14l9 5 9-5V17l-9-5Zm-3 6h6v12h-6z" />',
    kinetic: '<path d="M5 21h25v-7l13 10-13 10v-7H5v-6Z" /><path d="M8 10h5v8H8zM17 10h5v8h-5z" />',
    energy: '<path d="M27 3 10 27h12l-2 18 18-25H27V3Z" />',
    shield: '<path d="m24 3 16 7v12c0 11-6.7 18-16 23C14.7 40 8 33 8 22V10l16-7Zm0 8-9 4v7c0 6.8 3.6 12 9 15.6 5.4-3.6 9-8.8 9-15.6v-7l-9-4Z" /><path d="M21 16h6v16h-6zM16 21h16v6H16z" />',
    taunt: '<path d="m24 3 16 7v12c0 11-6.7 18-16 23C14.7 40 8 33 8 22V10l16-7Zm0 8-9 4v7c0 6.8 3.6 12 9 15.6 5.4-3.6 9-8.8 9-15.6v-7l-9-4Z" /><path d="M4 20h8v8H4zM36 20h8v8h-8zM19 21h10v6H19z" />',
  } as const;
  return `<svg viewBox="0 0 48 48" aria-hidden="true">${paths[kind]}</svg>`;
}

function towerIcon(kind: TowerKind): string {
  const paths: Record<TowerKind, string> = {
    sector: '<path d="M13 35h22l-3 7H16l-3-7Z" /><path d="M17 19h14v17H17z" /><path d="m24 5 8 15H16L24 5Z" />',
    prism: '<path d="m24 5 14 10v18L24 43 10 33V15L24 5Zm0 7-8 6v12l8 6 8-6V18l-8-6Z" /><path d="m24 12 8 18-8 6-8-6 8-18Z" />',
    pulse: '<path fill-rule="evenodd" d="M24 4a20 20 0 1 1 0 40 20 20 0 0 1 0-40Zm0 5a15 15 0 1 0 0 30 15 15 0 0 0 0-30Zm0 7a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z" /><path d="M21 21h6v6h-6z" class="home-codex__icon-cut" />',
    anchor: '<path d="M21 5h6v17h-6V5Zm-5 2a8 8 0 0 0 16 0h-5a3 3 0 0 1-6 0h-5Z" /><path d="M10 25h8v5h-3a10 10 0 0 0 18 0h-3v-5h8v5h-3a15 15 0 0 1-30 0h-3v-5Z" />',
    arc: '<path d="M26 3 11 26h11l-2 19 17-25H26l0-17Z" /><path d="M7 19H3v-5h7v4H7v1Zm34 11h4v5h-7v-4h3v-1ZM8 37l-4-3 4-3 3 3-3 3Zm32-23-3-3 3-3 4 3-4 3Z" />',
    sniper: '<path d="M5 21h25v-5h6v5h7v6h-7v5h-6v-5H5v-6Z" /><path d="M10 27h8v12h-5v-7h-3v-5Zm19 0h5l4 12h-5l-2-6-2 6h-5l5-12Z" />',
    support: '<path d="m24 4 13 8v15l-13 8-13-8V12l13-8Zm0 7-7 4v9l7 4 7-4v-9l-7-4Z" /><path d="M21 31h6v13h-6zM14 40h20v5H14z" /><path d="M5 18h7v5H5zM36 18h7v5h-7z" />',
    bulwark: '<path d="m24 3 16 7v12c0 11-6.7 18-16 23C14.7 40 8 33 8 22V10l16-7Zm0 8-9 4v7c0 6.8 3.6 12 9 15.6 5.4-3.6 9-8.8 9-15.6v-7l-9-4Z" /><path d="M18 17h12v14H18z" class="home-codex__icon-cut" /><path d="M5 20h9v8H5zM34 20h9v8h-9z" />',
  };
  return `<svg viewBox="0 0 48 48" aria-hidden="true">${paths[kind]}</svg>`;
}

function enemyIcon(kind: EnemyKind): string {
  const paths: Record<EnemyKind, string> = {
    basic: '<path d="m24 4 14 8v16l-14 16L10 28V12l14-8Zm0 9-6 4v8l6 7 6-7v-8l-6-4Z" /><path d="M20 21h8v5h-8z" />',
    swarm: '<path d="m24 5 8 8-4 12h-8l-4-12 8-8Zm-14 16 7 3-2 10-8-4 3-9Zm28 0 3 9-8 4-2-10 7-3ZM24 29l7 7-7 7-7-7 7-7Z" />',
    armored: '<path d="m24 3 16 9v24l-16 9L8 36V12l16-9Zm0 8-9 5v16l9 5 9-5V16l-9-5Z" /><path d="M18 20h12v8H18z" />',
    splitter: '<path d="M24 4 41 20 30 44H18L7 20 24 4Zm0 11-7 7 4 13h6l4-13-7-7Z" /><path d="m24 15 5 10-5 8-5-8 5-10Z" />',
    raider: '<path d="m24 5 7 13 12-4-8 12 5 12-16-6-16 6 5-12-8-12 12 4 7-13Z" /><path d="M21 19h6v10h-6z" />',
    boss: '<path d="m24 2 17 10v24L24 46 7 36V12L24 2Zm0 8-10 6v16l10 6 10-6V16L24 10Z" /><path d="m24 16 6 5v7l-6 5-6-5v-7l6-5Z" />',
  };
  return `<svg viewBox="0 0 48 48" aria-hidden="true">${paths[kind]}</svg>`;
}

function createStatMarkup(
  icon: StatIconKind,
  value: string,
  label: string,
): string {
  return `<span class="home-codex__stat" aria-label="${label}" title="${label}">${statIcon(icon)}<b>${value}</b></span>`;
}

function createRankPips(): string {
  return `<span class="home-codex__rank" aria-label="最高 ${TOWER_ENCHANTMENT_MAX_LEVEL} 级" title="最高 ${TOWER_ENCHANTMENT_MAX_LEVEL} 级">${'<i></i>'.repeat(TOWER_ENCHANTMENT_MAX_LEVEL)}</span>`;
}

function createLockedEntryMarkup(entry: CodexEntry<CodexKind>): string {
  return `
    <article class="home-codex__entry is-locked" aria-label="尚未解锁">
      <div class="home-codex__entry-icon" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="m24 4 15 9v22l-15 9-15-9V13l15-9Zm0 8-8 5v14l8 5 8-5V17l-8-5Z" /><path d="M21 21h6v14h-6z" /></svg></div>
      <strong>未解析</strong>
      <p>第 ${entry.unlockLevel.slice(-1)} 关解锁</p>
    </article>`;
}

function createTowerEntryMarkup(
  entry: CodexEntry<TowerKind>,
  progress: CampaignProgress,
): string {
  if (!isCampaignLevelUnlocked(progress, entry.unlockLevel)) {
    return createLockedEntryMarkup(entry);
  }
  const stats = getTowerStats(entry.kind, 1);
  const isBulwark = stats.attackMode === 'bulwark';
  const primaryStat =
    stats.attackMode === 'support'
      ? createStatMarkup(
          'health',
          `+${formatValue(stats.allyHealPerSecond)}/s`,
          '一级每秒修复邻塔',
        )
      : isBulwark
        ? createStatMarkup(
            'shield',
            `−${Math.round((1 - stats.incomingDamageMultiplier) * 100)}%`,
            '固有伤害减免',
          )
        : createStatMarkup('damage', formatValue(stats.damage), '一级伤害');
  const rangeLabel = isBulwark ? '一级诱敌范围' : '一级射程';
  const displayedRange = isBulwark ? stats.tauntRadius : stats.range;
  const damageTypeMarkup = isBulwark
    ? createStatMarkup('taunt', '↯', '进入范围的敌人优先锁定壁垒')
    : (() => {
        const damageType = getTowerDamageType(entry.kind);
        return damageType === 'pure'
          ? ''
          : createStatMarkup(
              damageType,
              damageType === 'kinetic' ? 'K' : 'E',
              damageType === 'kinetic' ? '动能伤害' : '能量伤害',
            );
      })();
  return `
    <article class="home-codex__entry" style="--codex-accent: ${entry.accent}">
      <div class="home-codex__entry-icon" aria-hidden="true">${towerIcon(entry.kind)}</div>
      <strong>${entry.name}</strong>
      <p>${entry.description}</p>
      <div class="home-codex__stats">
        ${primaryStat}
        ${createStatMarkup('range', formatValue(displayedRange), rangeLabel)}
        ${createStatMarkup('cost', String(getTowerBuildCost(entry.kind)), '建造费用')}
        ${damageTypeMarkup}
      </div>
    </article>`;
}

function createResistanceStatMarkup(
  enemyKind: EnemyKind,
  damageType: Exclude<DamageType, 'pure'>,
): string {
  const resistance = getEnemyDamageResistance(enemyKind, damageType);
  if (resistance === 0) {
    return '';
  }
  const percentage = Math.round(Math.abs(resistance) * 100);
  const channel = damageType === 'kinetic' ? '动能' : '能量';
  return createStatMarkup(
    damageType,
    resistance > 0 ? `−${percentage}%` : `+${percentage}%`,
    resistance > 0
      ? `${channel}伤害减免 ${percentage}%`
      : `${channel}易伤 ${percentage}%`,
  );
}

function createEnemyEntryMarkup(
  entry: CodexEntry<EnemyKind>,
  progress: CampaignProgress,
): string {
  if (!isCampaignLevelUnlocked(progress, entry.unlockLevel)) {
    return createLockedEntryMarkup(entry);
  }
  const enemy = getEnemyType(entry.kind);
  return `
    <article class="home-codex__entry" style="--codex-accent: ${entry.accent}">
      <div class="home-codex__entry-icon" aria-hidden="true">${enemyIcon(entry.kind)}</div>
      <strong>${entry.name}</strong>
      <p>${entry.description}</p>
      <div class="home-codex__stats">
        ${createStatMarkup('health', String(enemy.baseHealth), '基础生命')}
        ${createStatMarkup('speed', formatValue(enemy.speed), '移动速度')}
        ${createStatMarkup('reward', String(enemy.reward), '击败奖励')}
        ${createResistanceStatMarkup(entry.kind, 'kinetic')}
        ${createResistanceStatMarkup(entry.kind, 'energy')}
      </div>
    </article>`;
}

function getEnchantmentEffectReadout(kind: TowerEnchantmentKind): {
  readonly icon: 'health' | 'speed' | 'range';
  readonly value: string;
  readonly label: string;
} {
  switch (kind) {
    case 'selfRepair': {
      const effects = getTowerEnchantmentEffects({
        selfRepair: TOWER_ENCHANTMENT_MAX_LEVEL,
      });
      return {
        icon: 'health',
        value: formatValue(effects.selfRepairPerSecond),
        label: '满级每秒自我修复',
      };
    }
    case 'allyHeal': {
      const effects = getTowerEnchantmentEffects({
        allyHeal: TOWER_ENCHANTMENT_MAX_LEVEL,
      });
      return {
        icon: 'health',
        value: formatValue(effects.allyHealPerSecond),
        label: '满级每秒友军修复',
      };
    }
    case 'attackSpeed': {
      const effects = getTowerEnchantmentEffects({
        attackSpeed: TOWER_ENCHANTMENT_MAX_LEVEL,
      });
      return {
        icon: 'speed',
        value: `${formatValue(1 / effects.attackIntervalMultiplier)}×`,
        label: '满级攻击速度倍率',
      };
    }
    case 'fortify': {
      const effects = getTowerEnchantmentEffects({
        fortify: TOWER_ENCHANTMENT_MAX_LEVEL,
      });
      return {
        icon: 'health',
        value: `+${formatValue((effects.maxHealthMultiplier - 1) * 100)}%`,
        label: '满级生命提升',
      };
    }
    case 'knockback': {
      const effects = getTowerEnchantmentEffects({
        knockback: TOWER_ENCHANTMENT_MAX_LEVEL,
      });
      return {
        icon: 'range',
        value: formatValue(effects.knockbackDistance),
        label: '满级向外击退距离',
      };
    }
  }
}

function enchantmentIcon(kind: TowerEnchantmentKind): string {
  const paths: Record<TowerEnchantmentKind, string> = {
    selfRepair: '<path d="M24 5a16 16 0 1 0 15 21h-6a10 10 0 1 1-2-12l4-4A16 16 0 0 0 24 5Z" /><path d="M21 19h6v5h5v6h-5v5h-6v-5h-5v-6h5v-5Z" />',
    allyHeal: '<path d="M23 6a12 12 0 1 0 12 12H29a6 6 0 1 1-6-6V6Z" /><path d="M24 21a11 11 0 1 0 11 11H29a5 5 0 1 1-5-5v-6Z" /><path d="M7 37h8v5H7zM4 34h5v11H4z" />',
    attackSpeed: '<path d="m29 4 13 20H29l-6 20L7 22h12l10-18Z" /><path d="M7 14h13v5H7zM3 23h13v5H3zM8 32h10v5H8z" />',
    fortify: '<path d="m24 4 15 7v10c0 11-6 18-15 23C15 39 9 32 9 21V11l15-7Zm0 8-8 4v5c0 6 3 11 8 15 5-4 8-9 8-15v-5l-8-4Z" /><path d="M21 16h6v5h5v6h-5v5h-6v-5h-5v-6h5v-5Z" />',
    knockback: '<path d="m8 24 14-12v8h14v8H22v8L8 24Z" /><path d="M42 10h3v28h-3zM34 15h3v18h-3z" />',
  };
  return `<svg viewBox="0 0 48 48" aria-hidden="true">${paths[kind]}</svg>`;
}

function createEnchantmentEntryMarkup(
  entry: CodexEntry<TowerEnchantmentKind>,
  progress: CampaignProgress,
): string {
  if (!isCampaignLevelUnlocked(progress, entry.unlockLevel)) {
    return createLockedEntryMarkup(entry);
  }
  const effect = getEnchantmentEffectReadout(entry.kind);
  const firstRankCost = getTowerEnchantmentUpgradeCost(entry.kind, 0);
  return `
    <article class="home-codex__entry" style="--codex-accent: ${entry.accent}">
      <div class="home-codex__entry-icon" aria-hidden="true">${enchantmentIcon(entry.kind)}</div>
      <strong>${entry.name}</strong>
      <p>${entry.description}</p>
      <div class="home-codex__stats">
        ${createStatMarkup(effect.icon, effect.value, effect.label)}
        ${createStatMarkup('cost', String(firstRankCost ?? 0), '一级费用')}
      </div>
      ${createRankPips()}
    </article>`;
}

function terrainIcon(kind: SpecialTileKind): string {
  const paths: Record<SpecialTileKind, string> = {
    power: '<path d="m24 4 18 20-18 20L6 24 24 4Zm0 10-9 10 9 10 9-10-9-10Z" />',
    haste: '<path d="m6 9 17 15L6 39V28l5-4-5-4V9Zm19 0 17 15-17 15V28l5-4-5-4V9Z" />',
    repair: '<path d="M20 5h8v15h15v8H28v15h-8V28H5v-8h15V5Z" />',
  };
  return `<svg viewBox="0 0 48 48" aria-hidden="true">${paths[kind]}</svg>`;
}

function createTerrainEntryMarkup(
  entry: CodexEntry<SpecialTileKind>,
  progress: CampaignProgress,
): string {
  if (!isCampaignLevelUnlocked(progress, entry.unlockLevel)) {
    return createLockedEntryMarkup(entry);
  }
  const effect = getSpecialTileEffect(entry.kind);
  let effectMarkup: string;
  switch (entry.kind) {
    case 'power':
      effectMarkup = createStatMarkup(
        'damage',
        `+${Math.round((effect.damageMultiplier - 1) * 100)}%`,
        '伤害提升',
      );
      break;
    case 'haste':
      effectMarkup = createStatMarkup(
        'speed',
        `−${Math.round((1 - effect.attackIntervalMultiplier) * 100)}%`,
        '攻击间隔缩短',
      );
      break;
    case 'repair':
      effectMarkup = createStatMarkup(
        'health',
        `+${formatValue(effect.healingPerSecond)}/s`,
        '每秒修复',
      );
      break;
  }
  return `
    <article class="home-codex__entry home-codex__entry--terrain" style="--codex-accent: ${entry.accent}">
      <div class="home-codex__entry-icon" aria-hidden="true">${terrainIcon(entry.kind)}</div>
      <strong>${entry.name}</strong>
      <p>${entry.description}</p>
      <div class="home-codex__stats">${effectMarkup}</div>
    </article>`;
}

function createCodexEntries(tab: CodexTab, progress: CampaignProgress): string {
  switch (tab) {
    case 'towers':
      return TOWER_KINDS.map((kind) =>
        createTowerEntryMarkup(TOWER_ENTRIES[kind], progress),
      ).join('');
    case 'enemies':
      return ENEMY_KINDS.map((kind) =>
        createEnemyEntryMarkup(ENEMY_ENTRIES[kind], progress),
      ).join('');
    case 'enchantments':
      return TOWER_ENCHANTMENT_KINDS.map((kind) =>
        createEnchantmentEntryMarkup(ENCHANTMENT_ENTRIES[kind], progress),
      ).join('');
    case 'terrain':
      return SPECIAL_TILE_KINDS.map((kind) =>
        createTerrainEntryMarkup(TERRAIN_ENTRIES[kind], progress),
      ).join('');
  }
}

/** Modal catalog for the static player-facing combat roster. */
export class HomeCodex {
  private readonly dialog: HTMLDialogElement;
  private readonly tabs: HTMLElement;
  private readonly entries: HTMLElement;
  private readonly closeButton: HTMLButtonElement;
  private progress: CampaignProgress;
  private activeTab: CodexTab = 'towers';
  private returnFocus: HTMLElement | null = null;

  constructor(parent: HTMLElement, progress: CampaignProgress) {
    this.progress = progress;
    this.dialog = document.createElement('dialog');
    this.dialog.className = 'home-codex';
    this.dialog.setAttribute('aria-labelledby', 'home-codex-title');
    this.dialog.innerHTML = `
      <div class="home-codex__panel">
        <header class="home-codex__header">
          <div class="home-codex__identity">
            <svg viewBox="0 0 48 48" aria-hidden="true"><path d="m24 3 17 10v22L24 45 7 35V13L24 3Zm0 8-10 6v14l10 6 10-6V17l-10-6Z" /><path d="M17 20h14v4H17zm0 8h14v4H17z" /></svg>
            <div><span>CATALOG</span><h2 id="home-codex-title">图鉴</h2></div>
          </div>
          <button class="home-codex__close" type="button" data-home-codex-close aria-label="关闭图鉴">
            <svg viewBox="0 0 48 48" aria-hidden="true"><path d="m13 10 25 25-3 3L10 13l3-3Zm22 0 3 3-25 25-3-3 25-25Z" /></svg>
          </button>
        </header>
        <div class="home-codex__tabs" role="tablist" aria-label="图鉴类别">
          <button type="button" role="tab" aria-selected="true" data-home-codex-tab="towers">防御</button>
          <button type="button" role="tab" aria-selected="false" data-home-codex-tab="enemies">敌方</button>
          <button type="button" role="tab" aria-selected="false" data-home-codex-tab="enchantments">附魔</button>
          <button type="button" role="tab" aria-selected="false" data-home-codex-tab="terrain">地形</button>
        </div>
        <div class="home-codex__entries" role="tabpanel"></div>
      </div>`;
    parent.append(this.dialog);
    this.tabs = this.dialog.querySelector<HTMLElement>('.home-codex__tabs')
      ?? (() => {
        throw new Error('Missing home codex tabs.');
      })();
    this.entries = this.dialog.querySelector<HTMLElement>('.home-codex__entries')
      ?? (() => {
        throw new Error('Missing home codex entries.');
      })();
    this.closeButton = this.dialog.querySelector<HTMLButtonElement>(
      '[data-home-codex-close]',
    ) ?? (() => {
      throw new Error('Missing home codex close button.');
    })();
    this.tabs.addEventListener('click', this.onTabClick);
    this.closeButton.addEventListener('click', this.close);
    this.dialog.addEventListener('close', this.onClose);
    this.render();
  }

  open(trigger: HTMLElement): void {
    this.returnFocus = trigger;
    if (!this.dialog.open) {
      this.dialog.showModal();
    }
    this.closeButton.focus({ preventScroll: true });
  }

  close = (): void => {
    if (this.dialog.open) {
      this.dialog.close();
    }
  };

  setProgress(progress: CampaignProgress): void {
    this.progress = progress;
    this.render();
  }

  dispose(): void {
    this.close();
    this.tabs.removeEventListener('click', this.onTabClick);
    this.closeButton.removeEventListener('click', this.close);
    this.dialog.removeEventListener('close', this.onClose);
    this.dialog.remove();
  }

  private readonly onTabClick = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const tab = target.closest<HTMLButtonElement>('[data-home-codex-tab]');
    if (!tab || !this.tabs.contains(tab)) {
      return;
    }
    const nextTab = tab.dataset.homeCodexTab;
    if (
      nextTab !== 'towers' &&
      nextTab !== 'enemies' &&
      nextTab !== 'enchantments' &&
      nextTab !== 'terrain'
    ) {
      return;
    }
    this.activeTab = nextTab;
    this.render();
  };

  private readonly onClose = (): void => {
    const trigger = this.returnFocus;
    this.returnFocus = null;
    trigger?.focus({ preventScroll: true });
  };

  private render(): void {
    this.tabs.querySelectorAll<HTMLButtonElement>('[data-home-codex-tab]').forEach(
      (tab) => {
        tab.setAttribute(
          'aria-selected',
          String(tab.dataset.homeCodexTab === this.activeTab),
        );
      },
    );
    this.entries.innerHTML = createCodexEntries(this.activeTab, this.progress);
  }
}
