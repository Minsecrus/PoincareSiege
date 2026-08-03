import * as THREE from 'three';
import {
  applyMobius,
  mobiusDerivativeAngle,
  vec2LengthSquared,
  type MobiusTransform,
} from '../math/hyperbolic';
import { TOWER_MAX_LEVEL } from '../game/towerEconomy';
import {
  TOWER_ENCHANTMENT_MAX_LEVEL,
  createTowerEnchantmentLevels,
  getTowerEnchantmentEffects,
  type TowerEnchantmentKind,
  type TowerEnchantmentLevels,
} from '../game/towerEnchantments';
import { getTowerStats, type TowerKind } from '../game/towerStats';
import type { HyperbolicTile } from '../world/tiling';
import {
  createTowerMaterials,
  createTowerVisual,
  disposeTowerVisual,
  setTowerVisualLevel,
  type TowerVisual,
  type TowerVisualKind,
} from './sectorTower';

export interface PlacedTower extends TowerVisual {
  tile: HyperbolicTile;
  kind: TowerKind;
  level: number;
  /** Current effective maximum after tower rank and fortify are applied. */
  maxHealth: number;
  health: number;
  /**
   * Independent 0–5 upgrade tracks purchased after the tower is built.
   * Their combat effects are resolved by the gameplay layer; the collection
   * owns only the tower-local progression state.
   */
  enchantments: TowerEnchantmentLevels;
  builtAt: number;
}

export class TowerCollection {
  private readonly towers = new Map<string, PlacedTower>();
  private readonly towerByObject = new WeakMap<THREE.Object3D, PlacedTower>();
  private readonly materials = createTowerMaterials();
  private readonly scene: THREE.Scene;
  private readonly worldRadius: number;

  constructor(scene: THREE.Scene, worldRadius: number) {
    this.scene = scene;
    this.worldRadius = worldRadius;
  }

  has(tileId: string): boolean {
    return this.towers.has(tileId);
  }

  get(tileId: string): PlacedTower | undefined {
    return this.towers.get(tileId);
  }

  /** A snapshot of the towers currently participating in combat. */
  activeTowers(): readonly PlacedTower[] {
    return Array.from(this.towers.values());
  }

  /**
   * The two-argument form preserves the original sector-tower placement API.
   * New callers supply a tower kind explicitly before the construction time.
   */
  place(tile: HyperbolicTile, elapsed: number): PlacedTower | null;
  place(
    tile: HyperbolicTile,
    kind: TowerKind,
    elapsed: number,
  ): PlacedTower | null;
  place(
    tile: HyperbolicTile,
    kindOrElapsed: TowerKind | number,
    explicitElapsed?: number,
  ): PlacedTower | null {
    if (this.towers.has(tile.id)) {
      return null;
    }

    const kind: TowerKind =
      typeof kindOrElapsed === 'number' ? 'sector' : kindOrElapsed;
    const elapsed =
      typeof kindOrElapsed === 'number' ? kindOrElapsed : (explicitElapsed ?? 0);
    const enchantments = createTowerEnchantmentLevels();
    const maxHealth = this.getEffectiveMaxHealth(kind, 1, enchantments);

    const tower: PlacedTower = {
      ...createTowerVisual(kind as TowerVisualKind, this.materials),
      tile,
      kind,
      level: 1,
      maxHealth,
      health: maxHealth,
      enchantments,
      builtAt: elapsed,
    };
    this.towers.set(tile.id, tower);
    tower.group.traverse((object) => this.towerByObject.set(object, tower));
    this.scene.add(tower.group);
    return tower;
  }

  towerAtRay(raycaster: THREE.Raycaster): PlacedTower | null {
    const groups = Array.from(
      this.towers.values(),
      (tower) => tower.group,
    );
    for (const intersection of raycaster.intersectObjects(groups, true)) {
      const tower = this.towerByObject.get(intersection.object);
      if (tower) {
        return tower;
      }
    }
    return null;
  }

  upgrade(tower: PlacedTower): boolean {
    if (tower.level >= TOWER_MAX_LEVEL) {
      return false;
    }
    const previousMaxHealth = tower.maxHealth;
    tower.level += 1;
    tower.maxHealth = this.getEffectiveMaxHealth(
      tower.kind,
      tower.level,
      tower.enchantments,
    );
    // Preserve the amount of damage already sustained while granting the
    // newly added maximum-health capacity, matching the existing rank-up
    // behavior. Healing systems can use `tower.maxHealth` as their cap.
    tower.health += tower.maxHealth - previousMaxHealth;
    setTowerVisualLevel(tower, tower.level);
    return true;
  }

  /**
   * Raises one tower-local enchantment by one rank. Resource payment and the
   * derived combat/health effects deliberately live outside this collection,
   * so the same state transition is usable by menus, simulation, and tests.
   */
  upgradeEnchantment(
    tower: PlacedTower,
    enchantment: TowerEnchantmentKind,
  ): boolean {
    const currentLevel = tower.enchantments[enchantment];
    if (currentLevel >= TOWER_ENCHANTMENT_MAX_LEVEL) {
      return false;
    }

    const previousMaxHealth = tower.maxHealth;
    tower.enchantments = {
      ...tower.enchantments,
      [enchantment]: currentLevel + 1,
    };
    tower.maxHealth = this.getEffectiveMaxHealth(
      tower.kind,
      tower.level,
      tower.enchantments,
    );
    // A fortify rank receives its extra capacity immediately. This preserves
    // the previous damage deficit instead of silently fully healing a tower.
    tower.health += tower.maxHealth - previousMaxHealth;
    return true;
  }

  private getEffectiveMaxHealth(
    kind: TowerKind,
    level: number,
    enchantments: TowerEnchantmentLevels,
  ): number {
    return (
      getTowerStats(kind, level).maxHealth *
      getTowerEnchantmentEffects(enchantments).maxHealthMultiplier
    );
  }

  remove(tower: PlacedTower): void {
    this.scene.remove(tower.group);
    this.towers.delete(tower.tile.id);
    tower.group.traverse((object) => this.towerByObject.delete(object));
    disposeTowerVisual(tower);
  }

  update(viewTransform: MobiusTransform, elapsed: number): void {
    for (const tower of this.towers.values()) {
      const viewPoint = applyMobius(viewTransform, tower.tile.center);
      const constructionTime = THREE.MathUtils.clamp(
        (elapsed - tower.builtAt) / 0.34,
        0,
        1,
      );
      const constructionScale = 1 - Math.pow(1 - constructionTime, 3);
      const intrinsicScale =
        1.14 * (1 - vec2LengthSquared(viewPoint)) * constructionScale;
      const facingAngle =
        Math.atan2(tower.tile.center.y, tower.tile.center.x) +
        mobiusDerivativeAngle(viewTransform, tower.tile.center);

      tower.group.position.set(
        viewPoint.x * this.worldRadius,
        0.035,
        -viewPoint.y * this.worldRadius,
      );
      tower.group.scale.setScalar(intrinsicScale);
      tower.group.rotation.y = Math.PI / 2 + facingAngle;
      tower.core.rotation.y = elapsed * 1.8;
      tower.core.rotation.x = elapsed * 0.72;
      const corePulse = 1 + Math.sin(elapsed * 4.2 + tower.builtAt) * 0.08;
      tower.core.scale.setScalar(corePulse);
    }
  }

  dispose(): void {
    for (const tower of this.towers.values()) {
      tower.group.traverse((object) => this.towerByObject.delete(object));
      disposeTowerVisual(tower);
    }
    this.towers.clear();
    this.materials.armor.dispose();
    this.materials.dark.dispose();
    this.materials.energy.dispose();
  }
}
