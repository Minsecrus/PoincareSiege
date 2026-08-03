import {
  BASE_SKILL_IDS,
  canUpgradeBaseSkill,
  getBaseHealthSegments,
  getBaseStats,
  type BaseProgression,
  type BaseSkillId,
} from '../game/baseProgression';
import {
  TOWER_KINDS,
  getBaseSkillUpgradeCost,
  getTowerBuildCost,
  getTowerRefund,
  getTowerUpgradeCost,
  type TowerKind,
} from '../game/towerEconomy';
import {
  getTowerHealthSegments,
  getTowerHealthSegmentsForMaxHealth,
  getTowerStats,
  type TowerAttackMode,
} from '../game/towerStats';
import {
  TOWER_ENCHANTMENT_KINDS,
  TOWER_ENCHANTMENT_MAX_LEVEL,
  getTowerEnchantmentsRefund,
  getTowerEnchantmentUpgradeCost,
  normalizeTowerEnchantmentLevels,
  type TowerEnchantmentKind,
  type TowerEnchantmentLevelsInput,
} from '../game/towerEnchantments';
import { getTowerDamageType } from '../game/damageResistance';
import type { SpecialTileKind } from '../game/specialTiles';

interface GameMenuActions {
  buildTower: (kind: TowerKind) => void;
  upgradeTower: () => void;
  removeTower: () => void;
  upgradeTowerEnchantment?: (kind: TowerEnchantmentKind) => void;
  upgradeBaseSkill: (skill: BaseSkillId) => void;
}

/** The subset of the global combat kit usable in the current campaign level. */
export interface GameMenuAvailability {
  readonly towerKinds: readonly TowerKind[];
  readonly enchantments: readonly TowerEnchantmentKind[];
  readonly baseSkills: readonly BaseSkillId[];
}

const ALL_MENU_AVAILABILITY: GameMenuAvailability = {
  towerKinds: TOWER_KINDS,
  enchantments: TOWER_ENCHANTMENT_KINDS,
  baseSkills: BASE_SKILL_IDS,
};

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing game menu element: ${selector}`);
  }
  return element;
}

function formatReadoutNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return '0';
  }
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

const TOWER_NAMES: Record<TowerKind, string> = {
  sector: '扇形守卫',
  prism: '测地棱镜',
  pulse: '双曲脉冲',
  anchor: '滞流锚',
  arc: '链式电弧',
  sniper: '湮灭狙击塔',
  support: '共振信标',
  bulwark: '壁垒塔',
};

const ENCHANTMENT_NAMES: Record<TowerEnchantmentKind, string> = {
  selfRepair: '自我修复',
  allyHeal: '友军修复',
  attackSpeed: '攻击速度',
  fortify: '坚固',
  knockback: '击退',
};

function isTowerKind(value: string | undefined): value is TowerKind {
  return value !== undefined && TOWER_KINDS.includes(value as TowerKind);
}

function isTowerEnchantmentKind(
  value: string | undefined,
): value is TowerEnchantmentKind {
  return (
    value !== undefined &&
    TOWER_ENCHANTMENT_KINDS.includes(value as TowerEnchantmentKind)
  );
}

export class GameMenus {
  readonly buildElement = requireElement<HTMLDivElement>('#build-menu');
  readonly towerElement = requireElement<HTMLDivElement>('#tower-menu');
  readonly baseElement = requireElement<HTMLDivElement>('#base-menu');

  private readonly buildTowerButtons = TOWER_KINDS.map((kind) =>
    requireElement<HTMLButtonElement>(`[data-tower-kind="${kind}"]`),
  );
  private readonly towerTitle =
    requireElement<HTMLDivElement>('#tower-menu-title');
  private readonly upgradeTowerButton =
    requireElement<HTMLButtonElement>('#upgrade-tower');
  private readonly upgradeTowerCost =
    requireElement<HTMLSpanElement>('#tower-upgrade-cost-value');
  private readonly removeTowerButton =
    requireElement<HTMLButtonElement>('#remove-tower');
  private readonly towerRefund =
    requireElement<HTMLSpanElement>('#tower-refund-value');
  private readonly towerHealth =
    requireElement<HTMLElement>('#tower-health');
  private readonly towerDamage =
    requireElement<HTMLElement>('#tower-damage');
  private readonly towerDamageIcon =
    requireElement<SVGSVGElement>('#tower-damage-icon');
  private readonly towerRange =
    requireElement<HTMLElement>('#tower-range');
  private readonly towerAngle =
    requireElement<HTMLElement>('#tower-angle');
  private readonly towerSpecialIcon =
    requireElement<SVGSVGElement>('#tower-special-icon');
  private readonly towerEnchantments =
    requireElement<HTMLDivElement>('#tower-enchantments');
  private readonly baseHealth =
    requireElement<HTMLElement>('#base-health');
  private readonly baseRegeneration =
    requireElement<HTMLElement>('#base-regen');
  private readonly baseArea = requireElement<HTMLElement>('#base-area');
  private readonly baseSkills =
    requireElement<HTMLDivElement>('#base-skills');
  private readonly actions: GameMenuActions;
  private readonly availableTowerKinds: ReadonlySet<TowerKind>;
  private readonly availableEnchantments: ReadonlySet<TowerEnchantmentKind>;
  private readonly availableBaseSkills: ReadonlySet<BaseSkillId>;

  constructor(
    actions: GameMenuActions,
    availability: GameMenuAvailability = ALL_MENU_AVAILABILITY,
  ) {
    this.actions = actions;
    this.availableTowerKinds = new Set(availability.towerKinds);
    this.availableEnchantments = new Set(availability.enchantments);
    this.availableBaseSkills = new Set(availability.baseSkills);
    this.buildElement.addEventListener('click', this.onBuildTower);
    this.upgradeTowerButton.addEventListener('click', this.onUpgradeTower);
    this.removeTowerButton.addEventListener('click', this.onRemoveTower);
    this.towerEnchantments.addEventListener(
      'click',
      this.onTowerEnchantmentClick,
    );
    this.baseSkills.addEventListener('click', this.onBaseSkillClick);
  }

  showBuild(
    resourceAmount: number,
    specialTileKind?: SpecialTileKind | null,
  ): void {
    this.hideAll();
    this.buildElement.hidden = false;
    this.updateBuild(resourceAmount, specialTileKind);
  }

  updateBuild(
    resourceAmount: number,
    specialTileKind?: SpecialTileKind | null,
  ): void {
    this.setSpecialTileIndicator(specialTileKind);
    this.updateBuildOptions(resourceAmount);
  }

  showTower(
    kind: TowerKind,
    level: number,
    health: number,
    resourceAmount: number,
    enchantments: TowerEnchantmentLevelsInput = {},
    maxHealth?: number,
    damageMultiplier = 1,
  ): void {
    this.hideAll();
    this.towerElement.hidden = false;
    this.updateTower(
      kind,
      level,
      health,
      resourceAmount,
      enchantments,
      maxHealth,
      damageMultiplier,
    );
  }

  showBase(progression: BaseProgression, resourceAmount: number): void {
    this.hideAll();
    this.baseElement.hidden = false;
    this.updateBase(progression, resourceAmount);
  }

  hideAll(): void {
    this.buildElement.hidden = true;
    this.towerElement.hidden = true;
    this.baseElement.hidden = true;
  }

  updateTower(
    kind: TowerKind,
    level: number,
    health: number,
    resourceAmount: number,
    enchantments: TowerEnchantmentLevelsInput = {},
    maxHealth?: number,
    damageMultiplier = 1,
  ): void {
    const stats = getTowerStats(kind, level);
    const healthSegments = this.getTowerHealthSegments(
      kind,
      level,
      health,
      maxHealth,
    );
    this.towerTitle.setAttribute('aria-label', `${TOWER_NAMES[kind]} ${level} 级`);
    this.towerTitle.querySelectorAll('i').forEach((pip, index) => {
      pip.classList.toggle('is-active', index < level);
    });
    const upgradeCost = getTowerUpgradeCost(kind, level);
    const refund =
      getTowerRefund(kind, level) + getTowerEnchantmentsRefund(enchantments);
    this.upgradeTowerButton.disabled =
      upgradeCost === null || resourceAmount < upgradeCost;
    this.upgradeTowerCost.textContent =
      upgradeCost === null ? '—' : String(upgradeCost);
    this.towerRefund.textContent = String(refund);
    this.removeTowerButton.setAttribute(
      'aria-label',
      `拆除防御塔，返还 ${refund}`,
    );
    if (this.towerHealth.childElementCount !== healthSegments.totalSegments) {
      this.towerHealth.replaceChildren(
        ...Array.from({ length: healthSegments.totalSegments }, () =>
          document.createElement('i'),
        ),
      );
    }
    this.towerHealth.querySelectorAll('i').forEach((pip, index) => {
      pip.classList.toggle('is-active', index < healthSegments.filledSegments);
    });
    this.setPrimaryStatIcon(stats.attackMode);
    if (stats.attackMode === 'support') {
      delete this.towerDamage.parentElement?.dataset.damageType;
      const damageBoost = Math.round((stats.auraDamageMultiplier - 1) * 100);
      this.towerDamage.textContent = `+${damageBoost}%`;
      this.towerDamage.parentElement?.setAttribute(
        'aria-label',
        `邻塔伤害增幅 ${damageBoost}%`,
      );
    } else if (stats.attackMode === 'bulwark') {
      delete this.towerDamage.parentElement?.dataset.damageType;
      const damageReduction = Math.round(
        (1 - stats.incomingDamageMultiplier) * 100,
      );
      this.towerDamage.textContent = `−${damageReduction}%`;
      this.towerDamage.parentElement?.setAttribute(
        'aria-label',
        `固有伤害减免 ${damageReduction}%`,
      );
    } else {
      const effectiveDamage = stats.damage * damageMultiplier;
      const damageType = getTowerDamageType(kind);
      const damageTypeLabel = damageType === 'kinetic' ? '动能' : '能量';
      const damageReadout = formatReadoutNumber(effectiveDamage);
      if (this.towerDamage.parentElement) {
        this.towerDamage.parentElement.dataset.damageType = damageType;
      }
      this.towerDamage.textContent = damageReadout;
      this.towerDamage.parentElement?.setAttribute(
        'aria-label',
        damageMultiplier > 1
          ? `${damageTypeLabel}伤害 ${damageReadout}，总伤害倍率 ${formatReadoutNumber(damageMultiplier)} 倍`
          : `${damageTypeLabel}伤害 ${damageReadout}`,
      );
    }
    const displayedRange =
      stats.attackMode === 'bulwark' ? stats.tauntRadius : stats.range;
    this.towerRange.textContent = displayedRange.toFixed(1);
    this.towerRange.parentElement?.setAttribute(
      'aria-label',
      stats.attackMode === 'bulwark'
        ? `诱敌范围 ${displayedRange.toFixed(1)}`
        : `双曲射程 ${stats.range.toFixed(1)}`,
    );
    const special = this.getAttackReadout(kind, level);
    this.towerAngle.textContent = special.value;
    this.setAttackIcon(stats.attackMode);
    this.towerAngle.parentElement?.setAttribute('aria-label', special.label);
    this.updateTowerEnchantments(enchantments, resourceAmount);
  }

  updateBase(progression: BaseProgression, resourceAmount: number): void {
    const stats = getBaseStats(progression);
    const healthSegments = getBaseHealthSegments(progression);
    if (this.baseHealth.childElementCount !== healthSegments.totalSegments) {
      this.baseHealth.replaceChildren(
        ...Array.from({ length: healthSegments.totalSegments }, () =>
          document.createElement('i'),
        ),
      );
    }
    this.baseHealth.querySelectorAll('i').forEach((segment, index) => {
      segment.classList.toggle(
        'is-active',
        index < healthSegments.filledSegments,
      );
    });
    this.baseHealth.setAttribute(
      'aria-label',
      `基地生命 ${Math.ceil(progression.health)} / ${stats.maxHealth}`,
    );
    this.baseRegeneration.textContent = `+${stats.regenerationPerSecond}`;
    const attackDamage = stats.targetDamage;
    const attackRange = stats.targetRange;
    this.baseArea.textContent =
      attackDamage === 0 ? '—' : `1×${attackDamage}`;

    for (const skill of BASE_SKILL_IDS) {
      const button = this.baseSkills.querySelector<HTMLButtonElement>(
        `[data-base-skill="${skill}"]`,
      );
      const level = button?.querySelector<HTMLElement>(
        '[data-base-skill-level]',
      );
      if (!button || !level) {
        continue;
      }
      if (skill === 'areaPulse') {
        button.setAttribute(
          'aria-label',
          attackDamage === 0
            ? '学习基地单体锁定攻击'
            : `升级基地单体锁定攻击，伤害 ${attackDamage}，双曲射程 ${attackRange.toFixed(2)}`,
        );
      }
      level.querySelectorAll('i').forEach((pip, index) => {
        pip.classList.toggle(
          'is-active',
          index < progression.skills[skill],
        );
      });
      const cost = getBaseSkillUpgradeCost(progression.skills[skill]);
      const costElement = button.querySelector<HTMLElement>(
        '[data-base-skill-cost]',
      );
      if (costElement) {
        costElement.textContent = cost === null ? '—' : String(cost);
      }
      const isAvailable = this.availableBaseSkills.has(skill);
      button.hidden = !isAvailable;
      button.disabled =
        !isAvailable ||
        !canUpgradeBaseSkill(progression, skill) ||
        cost === null ||
        resourceAmount < cost;
    }
    this.baseSkills.hidden = this.availableBaseSkills.size === 0;
    this.baseSkills.style.setProperty(
      '--base-skill-count',
      String(Math.max(1, this.availableBaseSkills.size)),
    );
  }

  dispose(): void {
    this.buildElement.removeEventListener('click', this.onBuildTower);
    this.upgradeTowerButton.removeEventListener('click', this.onUpgradeTower);
    this.removeTowerButton.removeEventListener('click', this.onRemoveTower);
    this.towerEnchantments.removeEventListener(
      'click',
      this.onTowerEnchantmentClick,
    );
    this.baseSkills.removeEventListener('click', this.onBaseSkillClick);
  }

  private readonly onBuildTower = (event: MouseEvent): void => {
    event.stopPropagation();
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const button = target.closest<HTMLButtonElement>('[data-tower-kind]');
    const kind = button?.dataset.towerKind;
    if (isTowerKind(kind) && this.availableTowerKinds.has(kind)) {
      this.actions.buildTower(kind);
    }
  };

  private readonly onUpgradeTower = (event: MouseEvent): void => {
    event.stopPropagation();
    this.actions.upgradeTower();
  };

  private readonly onRemoveTower = (event: MouseEvent): void => {
    event.stopPropagation();
    this.actions.removeTower();
  };

  private readonly onTowerEnchantmentClick = (event: MouseEvent): void => {
    event.stopPropagation();
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const button = target.closest<HTMLButtonElement>(
      '[data-tower-enchantment]',
    );
    const kind = button?.dataset.towerEnchantment;
    if (
      !button?.disabled &&
      isTowerEnchantmentKind(kind) &&
      this.availableEnchantments.has(kind) &&
      this.actions.upgradeTowerEnchantment
    ) {
      this.actions.upgradeTowerEnchantment(kind);
    }
  };

  private readonly onBaseSkillClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const button = target.closest<HTMLButtonElement>('[data-base-skill]');
    const skill = button?.dataset.baseSkill as BaseSkillId | undefined;
    if (
      !skill ||
      !BASE_SKILL_IDS.includes(skill) ||
      !this.availableBaseSkills.has(skill)
    ) {
      return;
    }
    this.actions.upgradeBaseSkill(skill);
  };

  private updateBuildOptions(resourceAmount: number): void {
    for (const button of this.buildTowerButtons) {
      const kind = button.dataset.towerKind;
      if (!isTowerKind(kind)) {
        continue;
      }
      const isAvailable = this.availableTowerKinds.has(kind);
      const cost = getTowerBuildCost(kind);
      button.hidden = !isAvailable;
      button.disabled = !isAvailable || resourceAmount < cost;
      button.dataset.buildCost = String(cost);
      button.setAttribute('aria-label', `建造${TOWER_NAMES[kind]}，费用 ${cost}`);
      const costValue = button.querySelector<HTMLElement>(
        '[data-tower-build-cost]',
      );
      if (costValue) {
        costValue.textContent = String(cost);
      }
    }
    this.buildElement.style.setProperty(
      '--build-option-count',
      String(Math.max(1, this.availableTowerKinds.size)),
    );
  }

  private updateTowerEnchantments(
    enchantments: TowerEnchantmentLevelsInput,
    resourceAmount: number,
  ): void {
    const levels = normalizeTowerEnchantmentLevels(enchantments);
    for (const kind of TOWER_ENCHANTMENT_KINDS) {
      const button = this.towerEnchantments.querySelector<HTMLButtonElement>(
        `[data-tower-enchantment="${kind}"]`,
      );
      if (!button) {
        continue;
      }

      const level = levels[kind];
      const cost = getTowerEnchantmentUpgradeCost(kind, level);
      const isAvailable = this.availableEnchantments.has(kind);
      button.hidden = !isAvailable;
      button.disabled =
        !isAvailable ||
        !this.actions.upgradeTowerEnchantment ||
        cost === null ||
        resourceAmount < cost;
      button.querySelectorAll<HTMLElement>(
        '[data-tower-enchantment-level] i',
      ).forEach((pip, index) => {
        pip.classList.toggle('is-active', index < level);
      });
      const costElement = button.querySelector<HTMLElement>(
        '[data-tower-enchantment-cost]',
      );
      if (costElement) {
        costElement.textContent = cost === null ? '—' : String(cost);
      }
      const knockbackResistanceNote =
        kind === 'knockback' ? '，击退抗性期间无效' : '';
      const ariaStatus =
        cost === null
          ? `${ENCHANTMENT_NAMES[kind]} ${level} / ${TOWER_ENCHANTMENT_MAX_LEVEL} 级，已满级`
          : `${ENCHANTMENT_NAMES[kind]} ${level} / ${TOWER_ENCHANTMENT_MAX_LEVEL} 级，升级费用 ${cost}`;
      button.setAttribute(
        'aria-label',
        `${ariaStatus}${knockbackResistanceNote}`,
      );
    }
    this.towerEnchantments.hidden = this.availableEnchantments.size === 0;
    this.towerEnchantments.style.setProperty(
      '--enchantment-option-count',
      String(Math.max(1, this.availableEnchantments.size)),
    );
  }

  private getTowerHealthSegments(
    kind: TowerKind,
    level: number,
    health: number,
    maxHealth: number | undefined,
  ): { totalSegments: number; filledSegments: number } {
    if (maxHealth === undefined || !Number.isFinite(maxHealth) || maxHealth <= 0) {
      return getTowerHealthSegments(kind, level, health);
    }

    return getTowerHealthSegmentsForMaxHealth(kind, maxHealth, health);
  }

  private getAttackReadout(
    kind: TowerKind,
    level: number,
  ): { value: string; label: string } {
    const stats = getTowerStats(kind, level);
    switch (stats.attackMode) {
      case 'sector':
        return {
          value: `${Math.round((stats.attackAngleRadians * 180) / Math.PI)}°`,
          label: `攻击扇角 ${Math.round((stats.attackAngleRadians * 180) / Math.PI)} 度`,
        };
      case 'geodesic-beam':
        return { value: `×${stats.pierceCount}`, label: `测地穿透 ${stats.pierceCount}` };
      case 'pulse':
        return { value: '360°', label: '全向脉冲' };
      case 'slow-field':
        return {
          value: `${Math.round((1 - stats.slowMultiplier) * 100)}%`,
          label: `减速 ${Math.round((1 - stats.slowMultiplier) * 100)}%`,
        };
      case 'chain-arc':
        return { value: `×${stats.chainCount}`, label: `链式跳跃 ${stats.chainCount}` };
      case 'single-target':
        return { value: '1×', label: '单体锁定' };
      case 'support':
        return {
          value: `+${stats.allyHealPerSecond}/s`,
          label: `每秒修复邻塔 ${stats.allyHealPerSecond}`,
        };
      case 'bulwark':
        return {
          value: '↯',
          label: '进入范围的敌人优先锁定壁垒',
        };
    }
  }

  private setSpecialTileIndicator(
    specialTileKind?: SpecialTileKind | null,
  ): void {
    if (specialTileKind) {
      this.buildElement.dataset.specialTile = specialTileKind;
    } else {
      delete this.buildElement.dataset.specialTile;
    }
    const labels: Record<SpecialTileKind, string> = {
      power: '增幅格',
      haste: '急速格',
      repair: '修复格',
    };
    this.buildElement.setAttribute(
      'aria-label',
      specialTileKind
        ? `选择防御塔，当前为${labels[specialTileKind]}`
        : '选择防御塔',
    );
  }

  private setAttackIcon(attackMode: TowerAttackMode): void {
    const paths: Record<TowerAttackMode, string[]> = {
      sector: [
        'M24 5v19L7.6 33.5A20 20 0 0 0 44 24H24V5Z',
        'M22 3h4v23h-4z',
      ],
      'geodesic-beam': [
        'M6 21h27l-7-7 4-4 14 14-14 14-4-4 7-7H6v-6Z',
        'M12 12h5v24h-5z',
      ],
      pulse: [
        'M24 4a20 20 0 1 1 0 40 20 20 0 0 1 0-40Zm0 6a14 14 0 1 0 0 28 14 14 0 0 0 0-28Zm0 7a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z',
      ],
      'slow-field': [
        'M21 4h6v17h-6V4Zm-5 2a8 8 0 0 0 16 0h-5a3 3 0 0 1-6 0h-5Z',
        'M10 24h8v5h-3a10 10 0 0 0 18 0h-3v-5h8v5h-3a15 15 0 0 1-30 0H7v-5Z',
        'M13 39h22v5H13z',
      ],
      'chain-arc': [
        'M26 3 11 26h11l-2 19 17-25H26V3Z',
        'M7 19H3v-5h7v4H7v1Zm34 11h4v5h-7v-4h3v-1Z',
      ],
      'single-target': [
        'M24 4a20 20 0 1 1 0 40 20 20 0 0 1 0-40Zm0 5a15 15 0 1 0 0 30 15 15 0 0 0 0-30Zm0 7a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z',
        'M22 0h4v10h-4zM22 38h4v10h-4zM0 22h10v4H0zM38 22h10v4H38z',
      ],
      support: [
        'M24 5 37 13v15l-13 8-13-8V13l13-8Zm0 7-7 4v9l7 4 7-4v-9l-7-4Z',
        'M21 17h6v5h5v6h-5v5h-6v-5h-5v-6h5v-5Z',
      ],
      bulwark: [
        'm24 3 16 7v12c0 11-6.7 18-16 23C14.7 40 8 33 8 22V10l16-7Zm0 8-9 4v7c0 6.8 3.6 12 9 15.6 5.4-3.6 9-8.8 9-15.6v-7l-9-4Z',
        'M4 20h8v8H4zM36 20h8v8h-8zM19 21h10v6H19z',
      ],
    };
    this.towerSpecialIcon.replaceChildren(
      ...paths[attackMode].map((pathData) => {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathData);
        return path;
      }),
    );
  }

  private setPrimaryStatIcon(attackMode: TowerAttackMode): void {
    const paths =
      attackMode === 'bulwark'
        ? [
            'm24 3 16 7v12c0 11-6.7 18-16 23C14.7 40 8 33 8 22V10l16-7Zm0 8-9 4v7c0 6.8 3.6 12 9 15.6 5.4-3.6 9-8.8 9-15.6v-7l-9-4Z',
            'M21 16h6v16h-6zM16 21h16v6H16z',
          ]
        : ['m24 3 5 13 14 3-10 10 2 16-11-7-11 7 2-16L5 19l14-3 5-13Z'];
    this.towerDamageIcon.replaceChildren(
      ...paths.map((pathData) => {
        const path = document.createElementNS(
          'http://www.w3.org/2000/svg',
          'path',
        );
        path.setAttribute('d', pathData);
        return path;
      }),
    );
  }
}
