import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { animateBaseVisual, createBaseVisual } from '../entities/base';
import { EnemyManager } from '../entities/enemyManager';
import { SectorPulseVisuals } from '../entities/sectorPulseVisuals';
import { TowerAttackEffects } from '../entities/towerAttackEffects';
import { TowerPreview } from '../entities/towerPreview';
import {
  TowerCollection,
  type PlacedTower,
} from '../entities/towerCollection';
import {
  canUpgradeBaseSkill,
  createBaseProgression,
  getBaseStats,
  regenerateBase,
  selectBaseAttackTarget,
  upgradeBaseSkill,
  type BaseSkillId,
} from '../game/baseProgression';
import {
  createPlayerResources,
  payForBaseSkillUpgrade,
  payForTower,
  payForTowerUpgrade,
  payResources,
  refundResources,
  type PlayerResources,
} from '../game/playerResources';
import {
  getTowerBuildCost,
  getTowerRefund,
  type TowerKind,
} from '../game/towerEconomy';
import { getTowerStats } from '../game/towerStats';
import {
  resolveTowerCombat,
  type SlowEffect,
  type TowerCombatEffect,
} from '../game/towerCombat';
import {
  getTowerAttackImpactDelays,
  type TowerAttackTimingRequest,
} from '../game/towerAttackTiming';
import {
  getFortifiedTowerDamage,
  getTowerAttackIntervalSeconds,
} from '../game/towerEnchantmentCombat';
import {
  getTowerEnchantmentUpgradeCost,
  getTowerEnchantmentsRefund,
  getTowerEnchantmentEffects,
  type TowerEnchantmentKind,
} from '../game/towerEnchantments';
import { resolveTowerMaintenance } from '../game/towerMaintenance';
import {
  resolveTowerAssaultFrame,
  type TowerAssaultClock,
} from '../game/towerAssaultRuntime';
import { PASSIVE_RESOURCE_PER_SECOND } from '../game/enemyRewards';
import {
  resolveBossHealthStages,
  resolveEnemyDefeatBehavior,
  type EnemySpawnDescriptor,
} from '../game/enemyBehaviors';
import {
  createReinforcementEnemySpawn,
  createWaveEnemySpawn,
} from '../game/enemySpawnFactory';
import {
  getCampaignLevel,
  getCampaignWavePlan,
  type CampaignLevel,
} from '../game/campaignLevels';
import type { CampaignWaveSpawn } from '../game/campaignWaves';
import {
  getCampaignLevelId,
  getCampaignLevelNumber,
  type CampaignLevelId,
} from '../game/campaignProgress';
import { getEnemyEntryAngle } from '../game/enemyEntryAngles';
import {
  resolveEnemyKindKnockback,
  type EnemyKnockbackState,
} from '../game/enemyKnockback';
import {
  createGameSpeed,
  cycleGameSpeed,
  type GameSpeedState,
} from '../game/gameSpeed';
import {
  addActiveReinforcements,
  canStartNextWave,
  canSpawnEnemy,
  createWaveState,
  defeatEnemy,
  hasWon,
  spawnEnemy,
  startNextWave,
  togglePause,
  type WaveState,
} from '../game/waveState';
import {
  clearWaveTiming,
  createWaveTiming,
  getWaveCountdown,
  isWaveDue,
  scheduleNextWave,
  type WaveTiming,
} from '../game/waveTiming';
import {
  advanceSectorPulse,
  createSectorPulse,
  getSectorPulseSnapshot,
  type SectorPulseState,
} from '../game/sectorPulse';
import {
  IDENTITY_MOBIUS,
  applyMobius,
  composeMobius,
  invertMobius,
  mobiusDerivativeAngle,
  mobiusDerivativeScale,
  translationToOrigin,
  vec2Length,
  vec2LengthSquared,
  viewFocus,
  type MobiusTransform,
  type Vec2,
} from '../math/hyperbolic';
import type { HyperbolicTile } from '../world/tiling';
import { GameMenus } from '../ui/gameMenus';
import { GameHud } from '../ui/gameHud';
import {
  createBattlefieldVisuals,
  type WarpedMesh,
  type WarpedRoute,
  type WarpedSegments,
} from './createBattlefield';
import { BattlefieldOverlays } from './BattlefieldOverlays';
import { HyperbolicAttackSector } from './HyperbolicAttackSector';
import { HyperbolicRangeRing } from './HyperbolicRangeRing';

const WORLD_RADIUS = 5.15;
const MAX_FOCUS_RADIUS = 0.64;
const NAVIGATION_SPEED = 0.92;
const ENEMY_SPAWN_INTERVAL_SECONDS = 0.72;
const DEFAULT_TOWER_KIND: TowerKind = 'sector';

interface ActiveSlowEffect {
  multiplier: number;
  expiresAt: number;
}

/** One authoritative monster hit waiting for its visible effect to arrive. */
interface PendingMonsterImpact {
  readonly impactAt: number;
  readonly sequence: number;
  readonly enemyId: string;
  readonly damage: number;
  readonly slow?: SlowEffect;
  readonly knockbackDistance: number;
}

type BattleResult = 'victory' | 'defeat' | null;

export interface PoincareSceneOptions {
  readonly levelId: CampaignLevelId;
  readonly onReturnHome?: () => void;
  readonly onCompleteLevel?: (levelId: CampaignLevelId) => void;
  readonly onStartLevel?: (levelId: CampaignLevelId) => void;
}

export class PoincareScene {
  private readonly container: HTMLElement;
  private readonly level: CampaignLevel;
  private readonly returnHome: () => void;
  private readonly completeLevel: (levelId: CampaignLevelId) => void;
  private readonly startLevel: (levelId: CampaignLevelId) => void;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 80);
  private readonly renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
  });
  private readonly composer: EffectComposer;
  private readonly clock = new THREE.Clock();
  private readonly lineMaterials: LineMaterial[] = [];
  private readonly warpedMeshes: WarpedMesh[] = [];
  private readonly warpedSegments: WarpedSegments[] = [];
  private readonly warpedRoutes: WarpedRoute[] = [];
  private readonly buildableTiles: HyperbolicTile[] = [];
  private readonly towers = new TowerCollection(this.scene, WORLD_RADIUS);
  private readonly enemies = new EnemyManager(this.scene, WORLD_RADIUS);
  private readonly towerAttackEffects = new TowerAttackEffects(
    this.scene,
    WORLD_RADIUS,
  );
  private readonly sectorPulseVisuals = new SectorPulseVisuals(
    this.scene,
    WORLD_RADIUS,
  );
  private readonly pressedKeys = new Set<string>();
  private readonly raycaster = new THREE.Raycaster();
  private readonly groundPlane = new THREE.Plane(
    new THREE.Vector3(0, 1, 0),
    0,
  );
  private readonly pointerNdc = new THREE.Vector2();
  private readonly base = createBaseVisual();
  private readonly baseProgression = createBaseProgression();
  private readonly towerPreview = new TowerPreview(this.scene, WORLD_RADIUS);
  private readonly menus: GameMenus;
  private readonly hud: GameHud;
  private readonly overlays: BattlefieldOverlays;
  private readonly attackSector: HyperbolicAttackSector;
  private readonly towerRangeRing: HyperbolicRangeRing;
  private playerResources: PlayerResources;
  private waveState: WaveState;
  private waveTiming: WaveTiming = createWaveTiming();
  private activeWavePlan: readonly CampaignWaveSpawn[] = [];
  private gameSpeed: GameSpeedState = createGameSpeed();
  private readonly nextAttackAtByTower = new Map<string, number>();
  private towerAssaultClocks = new Map<string, TowerAssaultClock>();
  private readonly sectorPulses = new Map<string, SectorPulseState>();
  private readonly sectorPulseKnockbackDistanceById = new Map<string, number>();
  private readonly slowEffects = new Map<string, ActiveSlowEffect>();
  /** Shared enemy-side immunity, not a per-tower cooldown. */
  private readonly knockbackStateByEnemy = new Map<string, EnemyKnockbackState>();
  private pendingMonsterImpacts: PendingMonsterImpact[] = [];
  private simulationElapsed = 0;
  private passiveResourceRemainder = 0;
  private nextEnemySpawnAt = 0;
  private nextInitialEnemyIndex = 0;
  private nextBaseAttackAt = 0;
  private nextSectorPulseId = 1;
  private nextMonsterImpactSequence = 1;
  private battleResult: BattleResult = null;
  private hoveredTile: HyperbolicTile | null = null;
  private selectedBuildTile: HyperbolicTile | null = null;
  private selectedTower: PlacedTower | null = null;
  private selectedBase = false;
  private viewTransform: MobiusTransform = IDENTITY_MOBIUS;
  private cameraScale = 1;
  private targetCameraScale = 1;
  private animationFrame = 0;
  private disposed = false;
  private pauseMenuOpen = false;

  constructor(container: HTMLElement, options: PoincareSceneOptions) {
    this.container = container;
    this.level = getCampaignLevel(options.levelId);
    this.returnHome = options.onReturnHome ?? (() => {});
    this.completeLevel = options.onCompleteLevel ?? (() => {});
    this.startLevel = options.onStartLevel ?? (() => {});
    this.playerResources = createPlayerResources(this.level.initialResources);
    this.waveState = createWaveState(this.level.waveCount);
    this.menus = new GameMenus({
      buildTower: this.onBuildTower,
      upgradeTower: this.onUpgradeTower,
      removeTower: this.onRemoveTower,
      upgradeTowerEnchantment: this.onUpgradeTowerEnchantment,
      upgradeBaseSkill: this.onUpgradeBaseSkill,
    }, this.level.loadout);
    this.hud = new GameHud({
      startWave: this.onStartWave,
      cycleSpeed: this.onCycleGameSpeed,
      togglePause: this.onTogglePause,
      resumeFromPauseMenu: this.onResumeFromPauseMenu,
      restart: this.onRestartGame,
      nextLevel: this.onNextLevel,
      returnHome: this.onReturnHome,
    });
    this.renderer.setClearColor(0x030711, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.tabIndex = 0;
    this.renderer.domElement.setAttribute(
      'aria-label',
      '双曲战场。使用 WASD 移动视点，滚轮调整高度，R 键复位，空格暂停，Esc 打开菜单。',
    );
    this.container.append(this.renderer.domElement);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(
      new UnrealBloomPass(new THREE.Vector2(1, 1), 0.34, 0.34, 0.78),
    );
    this.composer.addPass(new OutputPass());

    const battlefield = createBattlefieldVisuals(this.scene, WORLD_RADIUS);
    this.lineMaterials.push(...battlefield.lineMaterials);
    this.warpedMeshes.push(...battlefield.warpedMeshes);
    this.warpedSegments.push(...battlefield.warpedSegments);
    this.warpedRoutes.push(...battlefield.warpedRoutes);
    this.buildableTiles.push(...battlefield.buildableTiles);
    this.scene.add(this.base.group);
    this.overlays = new BattlefieldOverlays(this.scene, WORLD_RADIUS);
    this.attackSector = new HyperbolicAttackSector(this.scene, WORLD_RADIUS);
    this.towerRangeRing = new HyperbolicRangeRing(this.scene, WORLD_RADIUS);
    this.createObserverMarker();
    this.bindEvents();
    this.resize();
    this.applyViewTransform();
    this.hud.updateBase(this.baseProgression);
    this.hud.updateResources(this.playerResources);
    this.updateWaveHud();
    this.hud.updateSpeed(this.gameSpeed);
    this.hud.setPauseMenu(false);
    this.hud.setResult(null);
    this.animate();
  }

  private setHoveredTile(tile: HyperbolicTile | null): void {
    if (tile?.id === this.hoveredTile?.id) {
      return;
    }

    this.hoveredTile = tile;
    this.renderer.domElement.style.cursor = tile ? 'pointer' : 'default';
    this.refreshPlacementHighlight();
    this.refreshTowerPreview();
  }

  private refreshPlacementHighlight(): void {
    const tile =
      this.selectedBuildTile ?? this.selectedTower?.tile ?? this.hoveredTile;
    if (!tile) {
      this.overlays.setPlacement(null);
      return;
    }

    const occupied = this.towers.has(tile.id);
    const selected =
      tile.id === this.selectedBuildTile?.id ||
      tile.id === this.selectedTower?.tile.id;
    this.overlays.setPlacement(tile, occupied, selected);
  }

  private refreshBaseRangeIndicator(): void {
    const radius = getBaseStats(this.baseProgression).targetRange;
    this.overlays.setBaseRange(this.selectedBase, radius);
  }

  private refreshAttackSector(): void {
    const tower = this.selectedTower;
    if (!tower) {
      this.attackSector.setSector(null);
      this.towerRangeRing.setCircle(null);
      return;
    }

    const stats = getTowerStats(tower.kind, tower.level);
    if (
      stats.attackMode !== 'sector' &&
      stats.attackMode !== 'geodesic-beam'
    ) {
      this.attackSector.setSector(null);
      this.towerRangeRing.setCircle({
        center: tower.tile.center,
        hyperbolicRadius: stats.range,
      });
      return;
    }

    this.towerRangeRing.setCircle(null);
    // In the tower's tangent frame this points toward the origin/base.
    // Enemies enter from the ideal boundary, so the attack fan must use the
    // opposite ray and cover the incoming approach rather than the base.
    const towardBase = applyMobius(
      translationToOrigin(tower.tile.center),
      { x: 0, y: 0 },
    );
    this.attackSector.setSector({
      center: tower.tile.center,
      hyperbolicRadius: stats.range,
      centerAngle: Math.atan2(-towardBase.y, -towardBase.x),
      halfAngle:
        stats.attackMode === 'sector'
          ? stats.attackAngleRadians / 2
          : THREE.MathUtils.clamp(stats.beamWidth * 0.35, 0.045, 0.11),
    });
  }

  private refreshTowerPreview(): void {
    const tile =
      !this.selectedTower && !this.selectedBase
        ? this.selectedBuildTile ?? this.hoveredTile
        : null;
    if (!tile || this.towers.has(tile.id)) {
      this.towerPreview.setTile(null);
      this.hud.setHoverBuildCost(null);
      return;
    }

    this.towerPreview.setTile(tile);
    this.towerPreview.update(this.viewTransform);
    const screenPoint = this.projectCanonicalPoint(tile.center, 0.66);
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.hud.setHoverBuildCost(
      getTowerBuildCost(DEFAULT_TOWER_KIND),
      THREE.MathUtils.clamp(screenPoint.x, 24, width - 24),
      THREE.MathUtils.clamp(screenPoint.y, 24, height - 24),
    );
  }

  private openBuildMenu(tile: HyperbolicTile): void {
    this.selectedTower = null;
    this.selectedBuildTile = tile;
    this.selectedBase = false;
    this.menus.showBuild(this.playerResources.amount);
    this.refreshPlacementHighlight();
    this.refreshBaseRangeIndicator();
    this.refreshAttackSector();
    this.refreshTowerPreview();
    this.updateContextMenuPositions();
  }

  private openTowerMenu(tower: PlacedTower): void {
    this.selectedBuildTile = null;
    this.selectedTower = tower;
    this.selectedBase = false;
    this.menus.showTower(
      tower.kind,
      tower.level,
      tower.health,
      this.playerResources.amount,
      tower.enchantments,
      tower.maxHealth,
    );
    this.refreshPlacementHighlight();
    this.refreshBaseRangeIndicator();
    this.refreshAttackSector();
    this.refreshTowerPreview();
    this.updateContextMenuPositions();
  }

  private openBaseMenu(): void {
    this.selectedBuildTile = null;
    this.selectedTower = null;
    this.selectedBase = true;
    this.menus.showBase(this.baseProgression, this.playerResources.amount);
    this.refreshPlacementHighlight();
    this.refreshBaseRangeIndicator();
    this.refreshAttackSector();
    this.refreshTowerPreview();
    this.updateContextMenuPositions();
  }

  private closeContextMenus(): void {
    this.selectedBuildTile = null;
    this.selectedTower = null;
    this.selectedBase = false;
    this.menus.hideAll();
    this.refreshPlacementHighlight();
    this.refreshBaseRangeIndicator();
    this.refreshAttackSector();
    this.refreshTowerPreview();
  }

  private refreshOpenMenu(): void {
    if (this.selectedBuildTile) {
      this.menus.showBuild(this.playerResources.amount);
    } else if (this.selectedTower) {
      this.menus.updateTower(
        this.selectedTower.kind,
        this.selectedTower.level,
        this.selectedTower.health,
        this.playerResources.amount,
        this.selectedTower.enchantments,
        this.selectedTower.maxHealth,
      );
    } else if (this.selectedBase) {
      this.menus.updateBase(this.baseProgression, this.playerResources.amount);
    }
  }

  private projectCanonicalPoint(
    canonicalPoint: Vec2,
    anchorHeight: number,
  ): { x: number; y: number } {
    const viewPoint = applyMobius(this.viewTransform, canonicalPoint);
    const worldPoint = new THREE.Vector3(
      viewPoint.x * WORLD_RADIUS,
      anchorHeight * (1 - vec2LengthSquared(viewPoint)),
      -viewPoint.y * WORLD_RADIUS,
    );
    worldPoint.project(this.camera);
    return {
      x: (worldPoint.x * 0.5 + 0.5) * this.container.clientWidth,
      y: (-worldPoint.y * 0.5 + 0.5) * this.container.clientHeight,
    };
  }

  private positionContextMenu(
    menu: HTMLElement,
    canonicalPoint: Vec2,
    anchorHeight: number,
  ): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    const screenPoint = this.projectCanonicalPoint(canonicalPoint, anchorHeight);
    const halfWidth = Math.max(92, menu.offsetWidth / 2 + 12);
    const minimumTop = Math.max(116, menu.offsetHeight + 18);
    const safeHalfWidth = Math.min(halfWidth, width / 2);
    const maximumTop = Math.max(0, height - 12);
    const safeMinimumTop = Math.min(minimumTop, maximumTop);
    menu.style.left = `${THREE.MathUtils.clamp(screenPoint.x, safeHalfWidth, width - safeHalfWidth)}px`;
    menu.style.top = `${THREE.MathUtils.clamp(screenPoint.y, safeMinimumTop, maximumTop)}px`;
  }

  private updateContextMenuPositions(): void {
    if (this.selectedBuildTile && !this.menus.buildElement.hidden) {
      this.positionContextMenu(
        this.menus.buildElement,
        this.selectedBuildTile.center,
        0.28,
      );
    }
    if (this.selectedTower && !this.menus.towerElement.hidden) {
      this.positionContextMenu(
        this.menus.towerElement,
        this.selectedTower.tile.center,
        0.82,
      );
    }
    if (this.selectedBase && !this.menus.baseElement.hidden) {
      this.positionContextMenu(
        this.menus.baseElement,
        { x: 0, y: 0 },
        1.45,
      );
    }
  }

  private setPointerRay(clientX: number, clientY: number): void {
    const bounds = this.renderer.domElement.getBoundingClientRect();
    this.pointerNdc.set(
      ((clientX - bounds.left) / bounds.width) * 2 - 1,
      -((clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
  }

  private screenToWorldPoint(clientX: number, clientY: number): Vec2 | null {
    this.setPointerRay(clientX, clientY);

    const intersection = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, intersection)) {
      return null;
    }

    const viewPoint = {
      x: intersection.x / WORLD_RADIUS,
      y: -intersection.z / WORLD_RADIUS,
    };
    if (vec2LengthSquared(viewPoint) >= 0.998 * 0.998) {
      return null;
    }

    return applyMobius(invertMobius(this.viewTransform), viewPoint);
  }

  private isBaseAt(clientX: number, clientY: number): boolean {
    this.setPointerRay(clientX, clientY);
    return this.raycaster.intersectObject(this.base.group, true).length > 0;
  }

  private towerAt(clientX: number, clientY: number): PlacedTower | null {
    this.setPointerRay(clientX, clientY);
    return this.towers.towerAtRay(this.raycaster);
  }

  private pointInsideTile(point: Vec2, tile: HyperbolicTile): boolean {
    let inside = false;
    for (
      let current = 0, previous = tile.boundary.length - 1;
      current < tile.boundary.length;
      previous = current, current += 1
    ) {
      const currentPoint = tile.boundary[current];
      const previousPoint = tile.boundary[previous];
      const crossesHorizontalRay =
        currentPoint.y > point.y !== previousPoint.y > point.y;
      if (crossesHorizontalRay) {
        const edgeX =
          ((previousPoint.x - currentPoint.x) *
            (point.y - currentPoint.y)) /
            (previousPoint.y - currentPoint.y) +
          currentPoint.x;
        if (point.x < edgeX) {
          inside = !inside;
        }
      }
    }
    return inside;
  }

  private buildableTileAt(clientX: number, clientY: number): HyperbolicTile | null {
    const point = this.screenToWorldPoint(clientX, clientY);
    if (!point) {
      return null;
    }

    return (
      this.buildableTiles.find((tile) => this.pointInsideTile(point, tile)) ??
      null
    );
  }

  private readonly onBuildTower = (kind: TowerKind): void => {
    const tile = this.selectedBuildTile;
    if (
      !tile ||
      this.towers.has(tile.id) ||
      !this.level.loadout.towerKinds.includes(kind)
    ) {
      return;
    }
    const payment = payForTower(this.playerResources, kind);
    if (!payment.paid) {
      this.refreshOpenMenu();
      return;
    }
    const tower = this.towers.place(tile, kind, this.clock.elapsedTime);
    if (!tower) {
      return;
    }
    this.playerResources = payment.resources;
    this.towerPreview.setKind(kind);
    this.hud.updateResources(this.playerResources);
    this.towers.update(this.viewTransform, this.clock.elapsedTime);
    this.closeContextMenus();
    this.setHoveredTile(tile);
  };

  private readonly onUpgradeTower = (): void => {
    const tower = this.selectedTower;
    if (!tower) {
      return;
    }
    const payment = payForTowerUpgrade(
      this.playerResources,
      tower.kind,
      tower.level,
    );
    if (!payment.paid || !this.towers.upgrade(tower)) {
      this.refreshOpenMenu();
      return;
    }
    this.playerResources = payment.resources;
    this.hud.updateResources(this.playerResources);
    this.refreshOpenMenu();
    this.refreshAttackSector();
  };

  private readonly onUpgradeTowerEnchantment = (
    enchantment: TowerEnchantmentKind,
  ): void => {
    const tower = this.selectedTower;
    if (!tower || !this.level.loadout.enchantments.includes(enchantment)) {
      return;
    }

    const cost = getTowerEnchantmentUpgradeCost(
      enchantment,
      tower.enchantments[enchantment],
    );
    if (cost === null) {
      this.refreshOpenMenu();
      return;
    }

    const payment = payResources(this.playerResources, cost);
    if (!payment.paid || !this.towers.upgradeEnchantment(tower, enchantment)) {
      this.refreshOpenMenu();
      return;
    }

    this.playerResources = payment.resources;
    this.hud.updateResources(this.playerResources);
    this.refreshOpenMenu();
  };

  private readonly onRemoveTower = (): void => {
    if (this.selectedTower) {
      const tower = this.selectedTower;
      const refund =
        getTowerRefund(tower.kind, tower.level) +
        getTowerEnchantmentsRefund(tower.enchantments);
      this.playerResources = refundResources(
        this.playerResources,
        refund,
      );
      this.removeTowerFromBattlefield(tower);
      this.hud.updateResources(this.playerResources);
    }
  };

  /** Removes all simulation state that refers to an erased tower. */
  private removeTowerFromBattlefield(tower: PlacedTower): void {
    this.nextAttackAtByTower.delete(tower.tile.id);
    for (const [enemyId, clock] of this.towerAssaultClocks) {
      if (clock.targetTowerId === tower.tile.id) {
        this.towerAssaultClocks.delete(enemyId);
      }
    }
    this.towers.remove(tower);
    if (this.selectedTower === tower) {
      this.closeContextMenus();
    }
  }

  private readonly onUpgradeBaseSkill = (skill: BaseSkillId): void => {
    if (
      !this.level.loadout.baseSkills.includes(skill) ||
      !canUpgradeBaseSkill(this.baseProgression, skill)
    ) {
      return;
    }
    const payment = payForBaseSkillUpgrade(
      this.playerResources,
      this.baseProgression.skills[skill],
    );
    if (!payment.paid || !upgradeBaseSkill(this.baseProgression, skill)) {
      this.refreshOpenMenu();
      return;
    }
    this.playerResources = payment.resources;
    this.hud.updateResources(this.playerResources);
    this.hud.updateBase(this.baseProgression);
    this.refreshOpenMenu();
    this.refreshBaseRangeIndicator();
  };

  private updateWaveHud(): void {
    this.hud.updateWave(
      this.waveState,
      getWaveCountdown(this.waveTiming, this.simulationElapsed),
    );
  }

  private beginNextWave(): boolean {
    if (
      this.battleResult !== null ||
      !canStartNextWave(this.waveState)
    ) {
      return false;
    }
    const nextWave = this.waveState.currentWave + 1;
    const plan = getCampaignWavePlan(this.level.id, nextWave);
    const nextState = startNextWave(
      this.waveState,
      plan.length,
    );
    if (nextState === this.waveState) {
      return false;
    }
    this.waveState = nextState;
    this.activeWavePlan = plan;
    this.nextInitialEnemyIndex = 0;
    this.waveTiming = clearWaveTiming(this.waveTiming);
    this.nextEnemySpawnAt = this.simulationElapsed;
    this.updateWaveHud();
    return true;
  }

  private readonly onStartWave = (): void => {
    this.beginNextWave();
  };

  private readonly onCycleGameSpeed = (): void => {
    this.gameSpeed = cycleGameSpeed(this.gameSpeed);
    this.hud.updateSpeed(this.gameSpeed);
  };

  private readonly onTogglePause = (): void => {
    if (this.battleResult !== null || this.pauseMenuOpen) {
      return;
    }
    this.waveState = togglePause(this.waveState);
    this.pressedKeys.clear();
    this.updateWaveHud();
  };

  private openPauseMenu(): void {
    if (this.battleResult !== null || this.pauseMenuOpen) {
      return;
    }
    this.closeContextMenus();
    if (!this.waveState.paused) {
      this.waveState = togglePause(this.waveState);
      this.updateWaveHud();
    }
    this.pressedKeys.clear();
    this.pauseMenuOpen = true;
    this.hud.setPauseMenu(true);
  }

  private readonly onResumeFromPauseMenu = (): void => {
    if (!this.pauseMenuOpen) {
      return;
    }
    this.pauseMenuOpen = false;
    this.hud.setPauseMenu(false);
    if (this.battleResult === null && this.waveState.paused) {
      this.waveState = togglePause(this.waveState);
      this.updateWaveHud();
    }
    this.pressedKeys.clear();
  };

  private readonly onRestartGame = (): void => {
    this.startLevel(this.level.id);
  };

  private readonly onNextLevel = (): void => {
    const nextLevel = getCampaignLevelId(
      getCampaignLevelNumber(this.level.id) + 1,
    );
    if (nextLevel !== null) {
      this.startLevel(nextLevel);
    }
  };

  private readonly onReturnHome = (): void => {
    this.returnHome();
  };

  /**
   * Emits the authored entries for the active wave. Dynamic reinforcements do
   * not move this index: they already join the battlefield immediately.
   */
  private spawnWaveEnemies(): void {
    while (
      canSpawnEnemy(this.waveState) &&
      this.simulationElapsed + 1e-9 >= this.nextEnemySpawnAt
    ) {
      const wave = this.waveState.currentWave;
      const spawn = this.activeWavePlan[this.nextInitialEnemyIndex];
      if (!spawn) {
        return;
      }
      const routeAngle = getEnemyEntryAngle(
        wave,
        this.nextInitialEnemyIndex,
        this.activeWavePlan.length,
      );
      this.enemies.spawn(
        createWaveEnemySpawn(spawn, routeAngle),
        this.viewTransform,
      );
      this.waveState = spawnEnemy(this.waveState);
      this.nextInitialEnemyIndex += 1;
      this.nextEnemySpawnAt += ENEMY_SPAWN_INTERVAL_SECONDS;
    }
  }

  /** Applies one resolved attack for every ready tower in canonical H² space. */
  private resolveTowerAttacks(): void {
    for (const tower of this.towers.activeTowers()) {
      if (this.battleResult !== null) {
        return;
      }
      const nextAttackAt = this.nextAttackAtByTower.get(tower.tile.id) ?? 0;
      if (this.simulationElapsed + 1e-9 < nextAttackAt) {
        continue;
      }

      const activeEnemies = this.enemies.activeEnemies();
      if (activeEnemies.length === 0) {
        return;
      }
      const stats = getTowerStats(tower.kind, tower.level);
      const enchantmentEffects = getTowerEnchantmentEffects(
        tower.enchantments,
      );
      const attackIntervalSeconds = getTowerAttackIntervalSeconds(
        stats.attackIntervalSeconds,
        tower.enchantments,
      );
      if (stats.attackMode === 'sector') {
        // Unlike the other four tower families, the sector guard fires a
        // physical travelling H² pulse. It may damage only when its front
        // catches an enemy later in the simulation, not at this moment.
        this.emitSectorPulse(tower);
        this.nextAttackAtByTower.set(
          tower.tile.id,
          this.simulationElapsed + attackIntervalSeconds,
        );
        continue;
      }

      const enemyPositions = new Map(
        activeEnemies.map((enemy) => [
          enemy.id,
          { x: enemy.canonicalPosition.x, y: enemy.canonicalPosition.y },
        ]),
      );
      const resolution = resolveTowerCombat(
        {
          kind: tower.kind,
          level: tower.level,
          position: tower.tile.center,
        },
        activeEnemies.map((enemy) => ({
          id: enemy.id,
          position: enemy.canonicalPosition,
          health: enemy.health,
        })),
      );
      if (resolution.effects.length === 0) {
        continue;
      }

      const attackRequest: TowerAttackTimingRequest = {
        kind: tower.kind,
        origin: { x: tower.tile.center.x, y: tower.tile.center.y },
        targets: resolution.effects.flatMap((effect) => {
          const target = enemyPositions.get(effect.enemyId);
          return target ? [target] : [];
        }),
        range: stats.range,
      };
      this.towerAttackEffects.emit(attackRequest, this.viewTransform);

      this.nextAttackAtByTower.set(
        tower.tile.id,
        this.simulationElapsed + attackIntervalSeconds,
      );
      this.queueMonsterImpacts(
        attackRequest,
        resolution.effects,
        enchantmentEffects.knockbackDistance,
      );
    }
  }

  /**
   * Captures one attack's payload at fire time, but delays all state changes
   * until the shared visual-contact clock reaches its target. A later upgrade,
   * sale, or enchantment change cannot alter an effect already in flight.
   */
  private queueMonsterImpacts(
    request: TowerAttackTimingRequest,
    effects: readonly TowerCombatEffect[],
    knockbackDistance: number,
  ): void {
    const impactDelays = getTowerAttackImpactDelays(request);
    for (const [index, effect] of effects.entries()) {
      const requestedDelay = impactDelays[index] ?? 0;
      const delay = Number.isFinite(requestedDelay)
        ? Math.max(0, requestedDelay)
        : 0;
      this.pendingMonsterImpacts.push({
        impactAt: this.simulationElapsed + delay,
        sequence: this.nextMonsterImpactSequence,
        enemyId: effect.enemyId,
        damage: effect.damage,
        ...(effect.slow ? { slow: effect.slow } : {}),
        knockbackDistance,
      });
      this.nextMonsterImpactSequence += 1;
    }
  }

  /** Applies all effects whose visible contact time has been reached. */
  private resolveDueMonsterImpacts(): void {
    if (this.pendingMonsterImpacts.length === 0) {
      return;
    }

    const ready: PendingMonsterImpact[] = [];
    const remaining: PendingMonsterImpact[] = [];
    for (const impact of this.pendingMonsterImpacts) {
      if (impact.impactAt <= this.simulationElapsed + 1e-9) {
        ready.push(impact);
      } else {
        remaining.push(impact);
      }
    }
    this.pendingMonsterImpacts = remaining;
    ready.sort(
      (left, right) =>
        left.impactAt - right.impactAt || left.sequence - right.sequence,
    );

    for (const impact of ready) {
      if (this.battleResult !== null) {
        break;
      }
      if (impact.slow) {
        this.applySlowEffect(impact.enemyId, impact.slow);
      }
      this.damageEnemy(impact.enemyId, impact.damage);
      this.applyEnemyKnockback(
        impact.enemyId,
        impact.knockbackDistance,
      );
    }
  }

  private emitSectorPulse(tower: PlacedTower): void {
    const stats = getTowerStats('sector', tower.level);
    const knockbackDistance = getTowerEnchantmentEffects(
      tower.enchantments,
    ).knockbackDistance;
    const pulseId = `sector-pulse-${this.nextSectorPulseId}`;
    this.nextSectorPulseId += 1;
    this.sectorPulses.set(
      pulseId,
      createSectorPulse({
        origin: { x: tower.tile.center.x, y: tower.tile.center.y },
        range: stats.range,
        fullAngleRadians: stats.attackAngleRadians,
        damage: stats.damage,
      }),
    );
    if (knockbackDistance > 0) {
      this.sectorPulseKnockbackDistanceById.set(
        pulseId,
        knockbackDistance,
      );
    }
    this.syncSectorPulseVisuals();
  }

  /** Advances all physical sector waves before applying their hit results. */
  private advanceSectorPulses(simulationDelta: number): void {
    if (this.sectorPulses.size === 0) {
      return;
    }

    const enemies = this.enemies.activeEnemies().map((enemy) => ({
      id: enemy.id,
      position: {
        x: enemy.canonicalPosition.x,
        y: enemy.canonicalPosition.y,
      },
    }));
    const nextPulses = new Map<string, SectorPulseState>();
    const nextPulseKnockbackDistances = new Map<string, number>();
    const hits: {
      enemyId: string;
      damage: number;
      knockbackDistance: number;
    }[] = [];
    for (const [pulseId, pulse] of this.sectorPulses) {
      const result = advanceSectorPulse(pulse, simulationDelta, enemies);
      const knockbackDistance =
        this.sectorPulseKnockbackDistanceById.get(pulseId) ?? 0;
      hits.push(
        ...result.hits.map((hit) => ({ ...hit, knockbackDistance })),
      );
      if (!result.pulse.expired) {
        nextPulses.set(pulseId, result.pulse);
        if (knockbackDistance > 0) {
          nextPulseKnockbackDistances.set(pulseId, knockbackDistance);
        }
      }
    }

    this.sectorPulses.clear();
    this.sectorPulseKnockbackDistanceById.clear();
    for (const [pulseId, pulse] of nextPulses) {
      this.sectorPulses.set(pulseId, pulse);
    }
    for (const [pulseId, knockbackDistance] of nextPulseKnockbackDistances) {
      this.sectorPulseKnockbackDistanceById.set(pulseId, knockbackDistance);
    }
    this.syncSectorPulseVisuals();

    // Apply only after every pulse has sampled the same enemy snapshot, so a
    // kill/removal cannot alter another pulse's collision step.
    for (const hit of hits) {
      this.damageEnemy(hit.enemyId, hit.damage);
      this.applyEnemyKnockback(hit.enemyId, hit.knockbackDistance);
    }
  }

  private syncSectorPulseVisuals(): void {
    this.sectorPulseVisuals.sync(
      Array.from(this.sectorPulses, ([id, pulse]) => {
        const snapshot = getSectorPulseSnapshot(pulse);
        return {
          id,
          origin: snapshot.origin,
          outwardAngle: snapshot.outwardAngleRadians,
          halfAngle: snapshot.fullAngleRadians / 2,
          currentRadius: snapshot.bandOuterRadius,
          bandWidth: snapshot.bandOuterRadius - snapshot.bandInnerRadius,
        };
      }),
      this.viewTransform,
    );
  }

  /** Resolves the base's high-damage single-target lock in canonical H² space. */
  private resolveBaseAttack(): void {
    const stats = getBaseStats(this.baseProgression);
    if (
      stats.targetDamage <= 0 ||
      this.simulationElapsed + 1e-9 < this.nextBaseAttackAt
    ) {
      return;
    }

    const target = selectBaseAttackTarget(
      this.baseProgression,
      this.enemies.activeEnemies().map((enemy) => ({
        id: enemy.id,
        position: {
          x: enemy.canonicalPosition.x,
          y: enemy.canonicalPosition.y,
        },
        health: enemy.health,
      })),
    );
    if (!target) {
      return;
    }

    this.nextBaseAttackAt =
      this.simulationElapsed + stats.targetAttackIntervalSeconds;
    const attackRequest: TowerAttackTimingRequest = {
      kind: 'sniper',
      origin: { x: 0, y: 0 },
      targets: [target.position],
      range: stats.targetRange,
      style: 'base-projectile',
    };
    this.towerAttackEffects.emit(attackRequest, this.viewTransform);
    this.queueMonsterImpacts(
      attackRequest,
      [{ enemyId: target.id, damage: stats.targetDamage }],
      0,
    );
  }

  /**
   * Applies a base-centered radial knockback after a surviving target is hit.
   * It never rewinds or reuses the current route: the movement owner discards
   * that route and starts a fresh behavior-compatible route at the displaced
   * canonical point. The shared enemy cooldown still makes the first
   * same-frame hit win.
   */
  private applyEnemyKnockback(
    enemyId: string,
    requestedDistance: number,
  ): void {
    if (!Number.isFinite(requestedDistance) || requestedDistance <= 0) {
      return;
    }
    const enemy = this.enemies.get(enemyId);
    if (!enemy) {
      return;
    }

    const resolution = resolveEnemyKindKnockback(enemy.kind, {
      position: enemy.canonicalPosition,
      requestedDistance,
      now: this.simulationElapsed,
      state: this.knockbackStateByEnemy.get(enemy.id),
    });
    if (!resolution.applied) {
      return;
    }

    const moved = this.enemies.rerouteFromPosition(
      enemy,
      resolution.position,
      this.viewTransform,
    );
    if (!moved) {
      return;
    }
    this.knockbackStateByEnemy.set(enemy.id, resolution.state);
  }

  private applySlowEffect(
    enemyId: string,
    slow: { multiplier: number; durationSeconds: number },
  ): void {
    if (!this.enemies.get(enemyId)) {
      return;
    }
    const multiplier = Number.isFinite(slow.multiplier)
      ? THREE.MathUtils.clamp(slow.multiplier, 0, 1)
      : 1;
    const duration = Number.isFinite(slow.durationSeconds)
      ? Math.max(0, slow.durationSeconds)
      : 0;
    if (duration === 0 || multiplier >= 1) {
      return;
    }

    const current = this.slowEffects.get(enemyId);
    this.slowEffects.set(enemyId, {
      multiplier: Math.min(current?.multiplier ?? 1, multiplier),
      expiresAt: Math.max(
        current?.expiresAt ?? 0,
        this.simulationElapsed + duration,
      ),
    });
  }

  private getActiveSpeedMultipliers(): Map<string, number> {
    const multipliers = new Map<string, number>();
    for (const [enemyId, effect] of this.slowEffects) {
      if (
        effect.expiresAt <= this.simulationElapsed ||
        this.enemies.get(enemyId) === null
      ) {
        this.slowEffects.delete(enemyId);
        continue;
      }
      multipliers.set(enemyId, effect.multiplier);
    }
    return multipliers;
  }

  /**
   * Enemies which reach an H²-nearby tower stop to attack it. The resolver
   * deliberately yields pure intent; the scene owns enemy clocks, health,
   * menu invalidation, and disposal of a destroyed tower.
   */
  private resolveTowerAssaults(speedMultipliers: Map<string, number>): void {
    const frame = resolveTowerAssaultFrame(
      this.simulationElapsed,
      this.enemies.activeEnemies().map((enemy) => ({
        id: enemy.id,
        position: enemy.canonicalPosition,
        contactDamage: enemy.contactDamage,
      })),
      this.towers.activeTowers().map((tower) => ({
        id: tower.tile.id,
        position: tower.tile.center,
        health: tower.health,
      })),
      this.towerAssaultClocks,
    );

    this.towerAssaultClocks = new Map(frame.clocks);
    for (const enemyId of frame.pausedEnemyIds) {
      // The enemy manager clamps modifiers to [0, 1], so a zero multiplier
      // naturally holds a tower-eating enemy in place for this frame.
      speedMultipliers.set(enemyId, 0);
    }

    let selectedTowerChanged = false;
    for (const hit of frame.hits) {
      const tower = this.towers.get(hit.towerId);
      if (!tower) {
        continue;
      }

      const damage = getFortifiedTowerDamage(hit.damage, tower.enchantments);
      if (damage <= 0) {
        continue;
      }
      tower.health = Math.max(0, tower.health - damage);
      if (this.selectedTower === tower) {
        selectedTowerChanged = true;
      }
      if (tower.health <= 0) {
        this.removeTowerFromBattlefield(tower);
      }
    }

    if (selectedTowerChanged && this.selectedTower !== null) {
      this.refreshOpenMenu();
    }
  }

  /** Resolves tower-local passive repair and one deterministic ally target. */
  private resolveTowerMaintenance(simulationDelta: number): void {
    const updates = resolveTowerMaintenance(
      this.towers.activeTowers().map((tower) => ({
        id: tower.tile.id,
        position: tower.tile.center,
        health: tower.health,
        maxHealth: tower.maxHealth,
        enchantments: tower.enchantments,
      })),
      simulationDelta,
    );

    let selectedTowerChanged = false;
    for (const update of updates) {
      const tower = this.towers.get(update.towerId);
      if (!tower || Math.abs(tower.health - update.health) <= 1e-9) {
        continue;
      }
      tower.health = update.health;
      selectedTowerChanged ||= this.selectedTower === tower;
    }

    if (selectedTowerChanged) {
      this.refreshOpenMenu();
    }
  }

  private damageEnemy(enemyId: string, damage: number): void {
    const enemy = this.enemies.get(enemyId);
    const appliedDamage = Number.isFinite(damage)
      ? Math.max(0, Math.round(damage))
      : 0;
    if (!enemy || appliedDamage === 0) {
      return;
    }

    const previousHealth = enemy.health;
    enemy.health = Math.max(0, enemy.health - appliedDamage);
    if (enemy.kind === 'boss') {
      const stageEvents = resolveBossHealthStages({
        kind: 'boss',
        canonicalPosition: enemy.canonicalPosition,
        route: {
          routeAngle: enemy.routeAngle,
          startRadius: enemy.startRadius,
          travelledDistance: enemy.travelledDistance,
        },
        maxHealth: enemy.maxHealth,
        previousHealth,
        currentHealth: enemy.health,
      });
      this.spawnReinforcements(
        stageEvents.flatMap((event) => event.spawnedEnemies),
      );
    }

    if (enemy.health > 0) {
      return;
    }

    // Count children before removing their parent. A last splitter or Boss
    // therefore cannot cause a premature wave-complete transition.
    this.spawnReinforcements(
      resolveEnemyDefeatBehavior({
        kind: enemy.kind,
        canonicalPosition: enemy.canonicalPosition,
        route: {
          routeAngle: enemy.routeAngle,
          startRadius: enemy.startRadius,
          travelledDistance: enemy.travelledDistance,
        },
      }),
    );
    if (!this.enemies.defeat(enemy)) {
      return;
    }
    this.slowEffects.delete(enemy.id);
    this.knockbackStateByEnemy.delete(enemy.id);
    this.towerAssaultClocks.delete(enemy.id);
    this.grantResources(enemy.reward);
    this.resolveWaveEnemy();
  }

  private spawnReinforcements(
    descriptors: readonly EnemySpawnDescriptor[],
  ): void {
    if (
      descriptors.length === 0 ||
      this.waveState.phase !== 'active' ||
      this.waveState.paused
    ) {
      return;
    }

    const nextWaveState = addActiveReinforcements(
      this.waveState,
      descriptors.length,
    );
    if (nextWaveState === this.waveState) {
      return;
    }

    this.waveState = nextWaveState;
    const healthMultiplier = this.activeWavePlan[0]?.healthMultiplier ?? 1;
    for (const descriptor of descriptors) {
      this.enemies.spawn(
        createReinforcementEnemySpawn(descriptor, healthMultiplier),
        this.viewTransform,
      );
    }
  }

  private grantResources(amount: number): void {
    if (!Number.isInteger(amount) || amount <= 0) {
      return;
    }
    const nextResources = refundResources(this.playerResources, amount);
    if (nextResources === this.playerResources) {
      return;
    }

    this.playerResources = nextResources;
    this.hud.updateResources(this.playerResources);
    this.refreshOpenMenu();
  }

  private accruePassiveResources(simulationDelta: number): void {
    if (!Number.isFinite(simulationDelta) || simulationDelta <= 0) {
      return;
    }

    this.passiveResourceRemainder +=
      simulationDelta * PASSIVE_RESOURCE_PER_SECOND;
    const wholeResources = Math.floor(this.passiveResourceRemainder + 1e-9);
    if (wholeResources <= 0) {
      return;
    }

    this.passiveResourceRemainder -= wholeResources;
    this.grantResources(wholeResources);
  }

  private applyBaseDamage(damage: number): void {
    const appliedDamage = Number.isFinite(damage)
      ? Math.max(0, Math.round(damage))
      : 0;
    if (appliedDamage === 0 || this.battleResult === 'defeat') {
      return;
    }

    this.baseProgression.health = Math.max(
      0,
      this.baseProgression.health - appliedDamage,
    );
    this.hud.updateBase(this.baseProgression);
    if (this.selectedBase) {
      this.menus.updateBase(this.baseProgression, this.playerResources.amount);
    }
    if (this.baseProgression.health <= 0) {
      this.finishBattle('defeat');
    }
  }

  private resolveWaveEnemy(): void {
    const previousPhase = this.waveState.phase;
    this.waveState = defeatEnemy(this.waveState);
    if (hasWon(this.waveState) && this.battleResult === null) {
      this.finishBattle('victory');
    } else if (
      previousPhase !== 'complete' &&
      this.waveState.phase === 'complete'
    ) {
      this.waveTiming = scheduleNextWave(
        this.waveTiming,
        this.simulationElapsed,
      );
    }
  }

  private finishBattle(result: Exclude<BattleResult, null>): void {
    if (this.battleResult !== null) {
      return;
    }
    this.battleResult = result;
    if (result === 'victory') {
      this.completeLevel(this.level.id);
    }
    this.pauseMenuOpen = false;
    this.hud.setPauseMenu(false);
    this.pressedKeys.clear();
    this.waveTiming = clearWaveTiming(this.waveTiming);
    this.sectorPulses.clear();
    this.sectorPulseKnockbackDistanceById.clear();
    this.sectorPulseVisuals.clear();
    this.knockbackStateByEnemy.clear();
    this.pendingMonsterImpacts = [];
    this.towerAssaultClocks.clear();
    if (result === 'defeat') {
      this.waveState = { ...this.waveState, paused: true };
    }
    this.updateWaveHud();
    this.hud.setResult(
      result,
      result === 'victory' &&
        getCampaignLevelId(getCampaignLevelNumber(this.level.id) + 1) !==
          null,
    );
  }

  private simulateBattle(simulationDelta: number): void {
    if (simulationDelta <= 0 || this.battleResult !== null) {
      return;
    }

    this.simulationElapsed += simulationDelta;
    // A wave always begins after a short simulation-time countdown. The
    // player may use the wave control to begin sooner, but cannot stall here.
    if (
      canStartNextWave(this.waveState) &&
      isWaveDue(this.waveTiming, this.simulationElapsed)
    ) {
      this.beginNextWave();
    }
    // Income applies throughout an unpaused, unfinished game, including the
    // fixed countdown before the first wave and between later waves.
    this.accruePassiveResources(simulationDelta);
    this.resolveDueMonsterImpacts();
    if (this.battleResult !== null) {
      return;
    }
    this.spawnWaveEnemies();
    this.resolveTowerAttacks();
    this.advanceSectorPulses(simulationDelta);
    this.resolveBaseAttack();
    // Field effects can have an immediate contact at their source radius; the
    // second pass resolves those without waiting for another simulation frame.
    this.resolveDueMonsterImpacts();
    if (this.battleResult !== null) {
      return;
    }

    const speedMultipliers = this.getActiveSpeedMultipliers();
    this.resolveTowerAssaults(speedMultipliers);

    const reachedEnemies = this.enemies.update(
      simulationDelta,
      this.viewTransform,
      speedMultipliers,
    );
    for (const enemy of reachedEnemies) {
      this.slowEffects.delete(enemy.id);
      this.knockbackStateByEnemy.delete(enemy.id);
      this.towerAssaultClocks.delete(enemy.id);
      this.applyBaseDamage(enemy.contactDamage);
      this.resolveWaveEnemy();
    }
    if (this.battleResult === null) {
      this.resolveTowerMaintenance(simulationDelta);
    }
    this.updateWaveHud();
  }

  private createObserverMarker(): void {
    const markerMaterial = new THREE.MeshBasicMaterial({
      color: 0x9affec,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const marker = new THREE.Mesh(
      new THREE.RingGeometry(0.075, 0.095, 48),
      markerMaterial,
    );
    marker.rotation.x = -Math.PI / 2;
    marker.position.y = 0.09;
    marker.renderOrder = 9;
    this.scene.add(marker);
  }

  private bindEvents(): void {
    window.addEventListener('resize', this.resize);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onWindowBlur);
    this.renderer.domElement.addEventListener('wheel', this.onWheel, {
      passive: false,
    });
    this.renderer.domElement.addEventListener(
      'pointermove',
      this.onPointerMove,
    );
    this.renderer.domElement.addEventListener(
      'pointerleave',
      this.onPointerLeave,
    );
    this.renderer.domElement.addEventListener('click', this.onCanvasClick);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'Space') {
      event.preventDefault();
      if (!event.repeat) {
        if (this.pauseMenuOpen) {
          this.onResumeFromPauseMenu();
        } else {
          this.onTogglePause();
        }
      }
      return;
    }

    const key = event.key.toLowerCase();
    if (key === 'escape') {
      event.preventDefault();
      if (!event.repeat) {
        if (this.pauseMenuOpen) {
          this.onResumeFromPauseMenu();
        } else {
          this.openPauseMenu();
        }
      }
      return;
    }
    if (this.pauseMenuOpen) {
      return;
    }
    if (['w', 'a', 's', 'd'].includes(key)) {
      this.pressedKeys.add(key);
    }
    if (key === 'r' && !event.repeat) {
      this.resetView();
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.pressedKeys.delete(event.key.toLowerCase());
  };

  private readonly onWindowBlur = (): void => {
    this.pressedKeys.clear();
  };

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    this.targetCameraScale = THREE.MathUtils.clamp(
      this.targetCameraScale + event.deltaY * 0.00045,
      0.78,
      1.32,
    );
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const tower = this.towerAt(event.clientX, event.clientY);
    const tile =
      tower?.tile ?? this.buildableTileAt(event.clientX, event.clientY);
    this.setHoveredTile(tile);
    if (!tile) {
      this.renderer.domElement.style.cursor = this.isBaseAt(
        event.clientX,
        event.clientY,
      )
        ? 'pointer'
        : 'default';
    }
  };

  private readonly onPointerLeave = (): void => {
    this.setHoveredTile(null);
  };

  private readonly onCanvasClick = (event: MouseEvent): void => {
    this.renderer.domElement.focus();
    if (this.isBaseAt(event.clientX, event.clientY)) {
      this.openBaseMenu();
      return;
    }

    const hitTower = this.towerAt(event.clientX, event.clientY);
    if (hitTower) {
      this.openTowerMenu(hitTower);
      return;
    }

    const tile = this.buildableTileAt(event.clientX, event.clientY);
    if (!tile) {
      this.closeContextMenus();
      return;
    }

    const tower = this.towers.get(tile.id);
    if (tower) {
      this.openTowerMenu(tower);
    } else {
      this.openBuildMenu(tile);
    }
  };

  private readonly resetView = (): void => {
    this.viewTransform = IDENTITY_MOBIUS;
    this.targetCameraScale = 1;
    this.applyViewTransform();
  };

  private readonly resize = (): void => {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    const pixelRatio = Math.min(window.devicePixelRatio, 2);

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
    for (const material of this.lineMaterials) {
      material.resolution.set(width, height);
    }
    this.overlays.setResolution(width, height);
    this.attackSector.setResolution(width, height);
    this.towerRangeRing.setResolution(width, height);
    this.updateContextMenuPositions();
    this.refreshTowerPreview();
  };

  private updateNavigation(deltaTime: number): void {
    let horizontal = 0;
    let vertical = 0;
    if (this.pressedKeys.has('a')) horizontal -= 1;
    if (this.pressedKeys.has('d')) horizontal += 1;
    if (this.pressedKeys.has('s')) vertical -= 1;
    if (this.pressedKeys.has('w')) vertical += 1;

    const directionLength = Math.hypot(horizontal, vertical);
    if (directionLength === 0) {
      return;
    }

    horizontal /= directionLength;
    vertical /= directionLength;
    const exactStep = Math.tanh((NAVIGATION_SPEED * deltaTime) / 2);

    let low = 0;
    let high = 1;
    let accepted = this.viewTransform;
    for (let iteration = 0; iteration < 8; iteration += 1) {
      const fraction = iteration === 0 ? 1 : (low + high) / 2;
      const movement = {
        x: horizontal * exactStep * fraction,
        y: vertical * exactStep * fraction,
      };
      const candidate = composeMobius(
        translationToOrigin(movement),
        this.viewTransform,
      );
      if (vec2Length(viewFocus(candidate)) <= MAX_FOCUS_RADIUS) {
        accepted = candidate;
        low = fraction;
        if (iteration === 0) {
          break;
        }
      } else {
        high = fraction;
      }
    }

    if (accepted !== this.viewTransform) {
      this.viewTransform = accepted;
      this.applyViewTransform();
    }
  }

  private applyViewTransform(): void {
    for (let meshIndex = 0; meshIndex < this.warpedMeshes.length; meshIndex += 1) {
      const warpedMesh = this.warpedMeshes[meshIndex];
      const positions = warpedMesh.geometry.getAttribute(
        'position',
      ) as THREE.BufferAttribute;
      for (let index = 0; index < positions.count; index += 1) {
        const transformed = applyMobius(this.viewTransform, {
          x: warpedMesh.canonicalPoints[index * 2],
          y: warpedMesh.canonicalPoints[index * 2 + 1],
        });
        positions.setXYZ(
          index,
          transformed.x * WORLD_RADIUS,
          0,
          -transformed.y * WORLD_RADIUS,
        );
      }
      positions.needsUpdate = true;
    }

    for (const segments of this.warpedSegments) {
      const positions: number[] = [];
      for (const point of segments.canonicalPoints) {
        const transformed = applyMobius(this.viewTransform, point);
        positions.push(
          transformed.x * WORLD_RADIUS,
          segments.height,
          -transformed.y * WORLD_RADIUS,
        );
      }
      segments.geometry.setPositions(positions);
    }

    for (const route of this.warpedRoutes) {
      const positions: number[] = [];
      for (const point of route.canonicalPoints) {
        const transformed = applyMobius(this.viewTransform, point);
        positions.push(
          transformed.x * WORLD_RADIUS,
          route.height,
          -transformed.y * WORLD_RADIUS,
        );
      }
      route.geometry.setPositions(positions);
      route.line.computeLineDistances();
    }

    const basePoint = applyMobius(this.viewTransform, { x: 0, y: 0 });
    const baseScale = mobiusDerivativeScale(this.viewTransform, {
      x: 0,
      y: 0,
    });
    this.base.group.position.set(
      basePoint.x * WORLD_RADIUS,
      0.02,
      -basePoint.y * WORLD_RADIUS,
    );
    this.base.group.scale.setScalar(baseScale);
    this.base.group.rotation.y = mobiusDerivativeAngle(this.viewTransform, {
      x: 0,
      y: 0,
    });

    this.towers.update(this.viewTransform, this.clock.elapsedTime);
    this.enemies.update(0, this.viewTransform);
    this.towerAttackEffects.update(0, this.viewTransform);
    this.sectorPulseVisuals.update(this.viewTransform);
    this.overlays.setViewTransform(this.viewTransform);
    this.attackSector.setViewTransform(this.viewTransform);
    this.towerRangeRing.setViewTransform(this.viewTransform);
    this.towerPreview.update(this.viewTransform);
    this.updateContextMenuPositions();
    this.refreshTowerPreview();
  }

  private readonly animate = (): void => {
    if (this.disposed) {
      return;
    }

    const deltaTime = Math.min(this.clock.getDelta(), 0.05);
    const elapsed = this.clock.elapsedTime;
    const simulationDelta = deltaTime * this.gameSpeed.multiplier;
    const isSimulating =
      !this.waveState.paused && this.battleResult === null;
    if (this.battleResult === null && !this.pauseMenuOpen) {
      this.updateNavigation(deltaTime);
    }

    this.cameraScale = THREE.MathUtils.damp(
      this.cameraScale,
      this.targetCameraScale,
      6,
      deltaTime,
    );
    this.camera.position.set(
      0,
      12.6 * this.cameraScale,
      4.1 * this.cameraScale,
    );
    this.camera.lookAt(0, -0.08, 0.28);
    this.camera.updateMatrixWorld();

    animateBaseVisual(this.base, elapsed);
    if (
      isSimulating &&
      regenerateBase(this.baseProgression, simulationDelta)
    ) {
      this.hud.updateBase(this.baseProgression);
      if (this.selectedBase) {
        this.menus.updateBase(this.baseProgression, this.playerResources.amount);
      }
    }
    if (isSimulating) {
      this.simulateBattle(simulationDelta);
    }
    this.overlays.animate(elapsed);
    this.towers.update(this.viewTransform, elapsed);
    this.towerAttackEffects.update(
      isSimulating ? simulationDelta : 0,
      this.viewTransform,
    );
    this.sectorPulseVisuals.update(this.viewTransform);
    this.updateContextMenuPositions();
    this.refreshTowerPreview();

    this.composer.render();
    this.animationFrame = window.requestAnimationFrame(this.animate);
  };

  dispose(): void {
    this.disposed = true;
    window.cancelAnimationFrame(this.animationFrame);
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onWindowBlur);
    this.renderer.domElement.removeEventListener('wheel', this.onWheel);
    this.renderer.domElement.removeEventListener(
      'pointermove',
      this.onPointerMove,
    );
    this.renderer.domElement.removeEventListener(
      'pointerleave',
      this.onPointerLeave,
    );
    this.renderer.domElement.removeEventListener('click', this.onCanvasClick);
    this.menus.dispose();
    this.menus.hideAll();
    this.hud.dispose();
    this.towers.dispose();
    this.enemies.dispose();
    this.towerAttackEffects.dispose();
    this.sectorPulseVisuals.dispose();
    this.overlays.dispose();
    this.attackSector.dispose();
    this.towerRangeRing.dispose();
    this.towerPreview.dispose();
    this.renderer.dispose();
    this.composer.dispose();
    this.container.replaceChildren();
  }
}
