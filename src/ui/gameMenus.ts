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
  SECTOR_TOWER_HEALTH_PER_SEGMENT,
  getTowerHealthSegments,
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

interface GameMenuActions {
  buildTower: (kind: TowerKind) => void;
  upgradeTower: () => void;
  removeTower: () => void;
  upgradeTowerEnchantment?: (kind: TowerEnchantmentKind) => void;
  upgradeBaseSkill: (skill: BaseSkillId) => void;
}

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing game menu element: ${selector}`);
  }
  return element;
}

const TOWER_NAMES: Record<TowerKind, string> = {
  sector: '扇形守卫',
  prism: '测地棱镜',
  pulse: '双曲脉冲',
  anchor: '滞流锚',
  arc: '链式电弧',
};

const ENCHANTMENT_NAMES: Record<TowerEnchantmentKind, string> = {
  selfRepair: '自我修复',
  allyHeal: '友军修复',
  attackSpeed: '攻击速度',
  fortify: '坚固',
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
  private readonly towerRange =
    requireElement<HTMLElement>('#tower-range');
  private readonly towerAngle =
    requireElement<HTMLElement>('#tower-angle');
  private readonly towerSpecialIcon =
    requireElement<SVGSVGElement>('#tower-special-icon');
  private readonly towerEnchantments =
    requireElement<HTMLDivElement>('#tower-enchantments');
  private readonly skillPoints =
    requireElement<HTMLSpanElement>('#base-skill-points');
  private readonly baseHealth =
    requireElement<HTMLElement>('#base-health');
  private readonly baseRegeneration =
    requireElement<HTMLElement>('#base-regen');
  private readonly baseArea = requireElement<HTMLElement>('#base-area');
  private readonly baseSkills =
    requireElement<HTMLDivElement>('#base-skills');
  private readonly actions: GameMenuActions;

  constructor(actions: GameMenuActions) {
    this.actions = actions;
    this.buildElement.addEventListener('click', this.onBuildTower);
    this.upgradeTowerButton.addEventListener('click', this.onUpgradeTower);
    this.removeTowerButton.addEventListener('click', this.onRemoveTower);
    this.towerEnchantments.addEventListener(
      'click',
      this.onTowerEnchantmentClick,
    );
    this.baseSkills.addEventListener('click', this.onBaseSkillClick);
  }

  showBuild(resourceAmount: number): void {
    this.hideAll();
    this.buildElement.hidden = false;
    this.updateBuildOptions(resourceAmount);
  }

  showTower(
    kind: TowerKind,
    level: number,
    health: number,
    resourceAmount: number,
    enchantments: TowerEnchantmentLevelsInput = {},
    maxHealth?: number,
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
    this.towerDamage.textContent = String(stats.damage);
    this.towerRange.textContent = stats.range.toFixed(1);
    const special = this.getAttackReadout(kind, level);
    this.towerAngle.textContent = special.value;
    this.setAttackIcon(stats.attackMode);
    this.towerAngle.parentElement?.setAttribute('aria-label', special.label);
    this.updateTowerEnchantments(enchantments, resourceAmount);
  }

  updateBase(progression: BaseProgression, resourceAmount: number): void {
    const stats = getBaseStats(progression);
    this.skillPoints.textContent = String(progression.skillPoints);
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
    this.baseArea.textContent =
      stats.areaDamage === 0
        ? '—'
        : `${stats.areaDamage} · ${stats.areaRadius.toFixed(2)}`;

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
      button.disabled =
        !canUpgradeBaseSkill(progression, skill) ||
        cost === null ||
        resourceAmount < cost;
    }
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
    if (isTowerKind(kind)) {
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
    if (!skill || !BASE_SKILL_IDS.includes(skill)) {
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
      const cost = getTowerBuildCost(kind);
      button.disabled = resourceAmount < cost;
      button.dataset.buildCost = String(cost);
      button.setAttribute('aria-label', `建造${TOWER_NAMES[kind]}，费用 ${cost}`);
      const costValue = button.querySelector<HTMLElement>(
        '[data-tower-build-cost]',
      );
      if (costValue) {
        costValue.textContent = String(cost);
      }
    }
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
      button.disabled =
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
      button.setAttribute(
        'aria-label',
        cost === null
          ? `${ENCHANTMENT_NAMES[kind]} ${level} / ${TOWER_ENCHANTMENT_MAX_LEVEL} 级，已满级`
          : `${ENCHANTMENT_NAMES[kind]} ${level} / ${TOWER_ENCHANTMENT_MAX_LEVEL} 级，升级费用 ${cost}`,
      );
    }
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

    const clampedHealth = Number.isFinite(health)
      ? Math.min(maxHealth, Math.max(0, health))
      : 0;
    return {
      totalSegments: Math.ceil(maxHealth / SECTOR_TOWER_HEALTH_PER_SEGMENT),
      filledSegments: Math.ceil(
        clampedHealth / SECTOR_TOWER_HEALTH_PER_SEGMENT,
      ),
    };
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
    }
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
    };
    this.towerSpecialIcon.replaceChildren(
      ...paths[attackMode].map((pathData) => {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathData);
        return path;
      }),
    );
  }
}
