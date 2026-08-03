import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import {
  IDENTITY_MOBIUS,
  applyMobius,
  hyperbolicRadiusToPoincare,
  type MobiusTransform,
  type Vec2,
} from '../math/hyperbolic';
import type { HyperbolicTile } from '../world/tiling';

interface WarpedOverlay {
  line: Line2;
  geometry: LineGeometry;
  material: LineMaterial;
  canonicalPoints: Vec2[];
  height: number;
}

export class BattlefieldOverlays {
  private readonly placement: WarpedOverlay;
  private readonly baseRange: WarpedOverlay;
  private viewTransform: MobiusTransform = IDENTITY_MOBIUS;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly worldRadius: number,
  ) {
    this.placement = this.createOverlay({
      color: 0xffc36b,
      linewidth: 3,
      opacity: 0.86,
      height: 0.085,
      renderOrder: 10,
    });
    this.baseRange = this.createOverlay({
      color: 0x6fe7d8,
      linewidth: 2,
      opacity: 0.48,
      height: 0.072,
      renderOrder: 9,
      dashed: true,
      dashSize: 0.08,
      gapSize: 0.055,
    });
  }

  setPlacement(
    tile: HyperbolicTile | null,
    occupied = false,
    selected = false,
  ): void {
    this.placement.line.visible = tile !== null;
    if (!tile) {
      this.placement.canonicalPoints = [];
      return;
    }

    this.placement.canonicalPoints = [...tile.boundary, tile.boundary[0]];
    this.placement.material.color.setHex(
      occupied ? (selected ? 0x78e2d4 : 0x5d8c88) : 0xffc36b,
    );
    this.placement.material.opacity = selected
      ? 0.96
      : occupied
        ? 0.42
        : 0.78;
    this.updateOverlayGeometry(this.placement);
  }

  setBaseRange(selected: boolean, hyperbolicRadius: number): void {
    const visible = selected && hyperbolicRadius > 0;
    this.baseRange.line.visible = visible;
    if (!visible) {
      this.baseRange.canonicalPoints = [];
      return;
    }

    const poincareRadius = hyperbolicRadiusToPoincare(hyperbolicRadius);
    const points: Vec2[] = [];
    for (let sample = 0; sample <= 96; sample += 1) {
      const angle = (sample / 96) * Math.PI * 2;
      points.push({
        x: Math.cos(angle) * poincareRadius,
        y: Math.sin(angle) * poincareRadius,
      });
    }
    this.baseRange.canonicalPoints = points;
    this.updateOverlayGeometry(this.baseRange);
  }

  setViewTransform(viewTransform: MobiusTransform): void {
    this.viewTransform = viewTransform;
    this.updateOverlayGeometry(this.placement);
    this.updateOverlayGeometry(this.baseRange);
  }

  setResolution(width: number, height: number): void {
    this.placement.material.resolution.set(width, height);
    this.baseRange.material.resolution.set(width, height);
  }

  animate(elapsed: number): void {
    if (this.baseRange.line.visible) {
      this.baseRange.material.opacity =
        0.42 + Math.sin(elapsed * 2.4) * 0.1;
    }
  }

  dispose(): void {
    this.disposeOverlay(this.placement);
    this.disposeOverlay(this.baseRange);
  }

  private createOverlay(options: {
    color: number;
    linewidth: number;
    opacity: number;
    height: number;
    renderOrder: number;
    dashed?: boolean;
    dashSize?: number;
    gapSize?: number;
  }): WarpedOverlay {
    const geometry = new LineGeometry();
    const material = new LineMaterial({
      color: options.color,
      linewidth: options.linewidth,
      transparent: true,
      opacity: options.opacity,
      dashed: options.dashed,
      dashSize: options.dashSize,
      gapSize: options.gapSize,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const line = new Line2(geometry, material);
    line.visible = false;
    line.frustumCulled = false;
    line.renderOrder = options.renderOrder;
    this.scene.add(line);

    return {
      line,
      geometry,
      material,
      canonicalPoints: [],
      height: options.height,
    };
  }

  private updateOverlayGeometry(overlay: WarpedOverlay): void {
    if (!overlay.line.visible || overlay.canonicalPoints.length === 0) {
      return;
    }

    const positions: number[] = [];
    for (const point of overlay.canonicalPoints) {
      const transformed = applyMobius(this.viewTransform, point);
      positions.push(
        transformed.x * this.worldRadius,
        overlay.height,
        -transformed.y * this.worldRadius,
      );
    }
    overlay.geometry.setPositions(positions);
    overlay.line.computeLineDistances();
  }

  private disposeOverlay(overlay: WarpedOverlay): void {
    this.scene.remove(overlay.line);
    overlay.geometry.dispose();
    overlay.material.dispose();
  }
}
