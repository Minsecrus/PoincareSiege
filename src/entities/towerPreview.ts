import * as THREE from 'three';
import {
  applyMobius,
  mobiusDerivativeAngle,
  vec2LengthSquared,
  type MobiusTransform,
} from '../math/hyperbolic';
import type { TowerKind } from '../game/towerStats';
import type { HyperbolicTile } from '../world/tiling';
import {
  createTowerVisual,
  disposeTowerVisual,
  type TowerMaterials,
  type TowerVisual,
} from './sectorTower';

/** Lightweight translucent silhouette displayed before a tower is built. */
export class TowerPreview {
  private readonly materials: TowerMaterials = {
    armor: new THREE.MeshStandardMaterial({
      color: 0x7fd8ce,
      emissive: 0x246f68,
      emissiveIntensity: 1,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
    dark: new THREE.MeshStandardMaterial({
      color: 0x4bb9ad,
      emissive: 0x1d5b58,
      emissiveIntensity: 0.9,
      transparent: true,
      opacity: 0.17,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
    energy: new THREE.MeshStandardMaterial({
      color: 0xb7fff3,
      emissive: 0x4ed6c4,
      emissiveIntensity: 1.8,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  };
  private visual: TowerVisual;
  private kind: TowerKind = 'sector';
  private tile: HyperbolicTile | null = null;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly worldRadius: number,
  ) {
    this.visual = this.createVisual(this.kind);
    this.scene.add(this.visual.group);
  }

  setKind(kind: TowerKind): void {
    if (kind === this.kind) {
      return;
    }

    const wasVisible = this.visual.group.visible;
    this.scene.remove(this.visual.group);
    disposeTowerVisual(this.visual);
    this.kind = kind;
    this.visual = this.createVisual(kind);
    this.visual.group.visible = wasVisible;
    this.scene.add(this.visual.group);
  }

  setTile(tile: HyperbolicTile | null): void {
    this.tile = tile;
    this.visual.group.visible = tile !== null;
  }

  update(viewTransform: MobiusTransform): void {
    if (!this.tile) {
      return;
    }
    const viewPoint = applyMobius(viewTransform, this.tile.center);
    const intrinsicScale = 1.14 * (1 - vec2LengthSquared(viewPoint));
    const facingAngle =
      Math.atan2(this.tile.center.y, this.tile.center.x) +
      mobiusDerivativeAngle(viewTransform, this.tile.center);
    this.visual.group.position.set(
      viewPoint.x * this.worldRadius,
      0.04,
      -viewPoint.y * this.worldRadius,
    );
    this.visual.group.scale.setScalar(intrinsicScale);
    this.visual.group.rotation.y = Math.PI / 2 + facingAngle;
  }

  dispose(): void {
    this.scene.remove(this.visual.group);
    disposeTowerVisual(this.visual);
    this.materials.armor.dispose();
    this.materials.dark.dispose();
    this.materials.energy.dispose();
  }

  private createVisual(kind: TowerKind): TowerVisual {
    const visual = createTowerVisual(kind, this.materials);
    visual.group.visible = false;
    visual.group.renderOrder = 8;
    visual.group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = false;
        object.receiveShadow = false;
      }
    });
    return visual;
  }
}
