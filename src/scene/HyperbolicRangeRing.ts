import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import {
  IDENTITY_MOBIUS,
  applyMobius,
  hyperbolicRadiusToPoincare,
  invertMobius,
  translationToOrigin,
  vec2LengthSquared,
  type MobiusTransform,
  type Vec2,
} from '../math/hyperbolic';

const DEFAULT_SEGMENTS = 96;

/** A circle specified in canonical, unwarped Poincare-disk coordinates. */
export interface HyperbolicRangeRingSpec {
  center: Vec2;
  hyperbolicRadius: number;
  segments?: number;
}

/** Canonical samples of a closed circle at a fixed H2 distance from `center`. */
export interface HyperbolicRangeRingGeometry {
  center: Vec2;
  perimeter: Vec2[];
}

export interface HyperbolicRangeRingStyle {
  color?: THREE.ColorRepresentation;
  opacity?: number;
  width?: number;
  height?: number;
  renderOrder?: number;
}

function validateSegmentCount(value: number | undefined): number {
  const segments = value ?? DEFAULT_SEGMENTS;
  if (!Number.isInteger(segments) || segments < 3) {
    throw new RangeError('Range-ring segments must be an integer of at least 3.');
  }
  return segments;
}

function validateSpec(spec: HyperbolicRangeRingSpec): void {
  if (
    !Number.isFinite(spec.center.x) ||
    !Number.isFinite(spec.center.y) ||
    vec2LengthSquared(spec.center) >= 1
  ) {
    throw new RangeError('Range-ring center must be a finite point inside the Poincare disk.');
  }
  if (!Number.isFinite(spec.hyperbolicRadius) || spec.hyperbolicRadius <= 0) {
    throw new RangeError('Range-ring hyperbolic radius must be positive and finite.');
  }
  validateSegmentCount(spec.segments);
}

/**
 * Samples a strict hyperbolic circle in canonical Poincare-disk coordinates.
 *
 * First move the circle center to the disk origin.  There, an H2 radius `d`
 * has Euclidean disk radius `tanh(d / 2)`.  Mapping the samples back with the
 * inverse disk isometry makes every perimeter point exactly `d` from the
 * original center in the hyperbolic metric.
 */
export function createHyperbolicRangeRingGeometry(
  spec: HyperbolicRangeRingSpec,
): HyperbolicRangeRingGeometry {
  validateSpec(spec);

  const segments = validateSegmentCount(spec.segments);
  const center = { x: spec.center.x, y: spec.center.y };
  const restoreCenter = invertMobius(translationToOrigin(center));
  const diskRadius = hyperbolicRadiusToPoincare(spec.hyperbolicRadius);
  const perimeter: Vec2[] = [];

  for (let index = 0; index <= segments; index += 1) {
    const angle = (Math.PI * 2 * index) / segments;
    perimeter.push(
      applyMobius(restoreCenter, {
        x: Math.cos(angle) * diskRadius,
        y: Math.sin(angle) * diskRadius,
      }),
    );
  }

  return { center, perimeter };
}

/**
 * A reusable Line2 range overlay for a circle in the hyperbolic plane.
 *
 * `setCircle` always accepts canonical gameplay data.  `setViewTransform`
 * applies the current disk isometry only to the already-correct samples, so
 * camera motion warps its screen-space shape without changing its H2 radius.
 */
export class HyperbolicRangeRing {
  readonly group = new THREE.Group();

  private readonly geometry = new LineGeometry();
  private readonly material: LineMaterial;
  private readonly line: Line2;
  private readonly worldRadius: number;
  private readonly height: number;
  private canonicalGeometry: HyperbolicRangeRingGeometry | null = null;
  private viewTransform: MobiusTransform = IDENTITY_MOBIUS;

  constructor(
    private readonly scene: THREE.Scene,
    worldRadius: number,
    style: HyperbolicRangeRingStyle = {},
  ) {
    if (!Number.isFinite(worldRadius) || worldRadius <= 0) {
      throw new RangeError('Range-ring world radius must be positive and finite.');
    }
    this.worldRadius = worldRadius;
    this.height = style.height ?? 0.096;
    if (!Number.isFinite(this.height)) {
      throw new RangeError('Range-ring height must be finite.');
    }

    const color = style.color ?? 0x8ce8d9;
    const opacity = style.opacity ?? 0.8;
    const width = style.width ?? 2;
    const renderOrder = style.renderOrder ?? 13;

    this.material = new LineMaterial({
      color,
      linewidth: width,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.line = new Line2(this.geometry, this.material);
    this.line.visible = false;
    this.line.frustumCulled = false;
    this.line.renderOrder = renderOrder;
    this.group.add(this.line);
    this.group.renderOrder = renderOrder;
    this.scene.add(this.group);
  }

  /** Returns the canonical circle currently driving the overlay, if visible. */
  get circle(): HyperbolicRangeRingGeometry | null {
    return this.canonicalGeometry;
  }

  /** Replaces the current range circle, or hides it when passed `null`. */
  setCircle(spec: HyperbolicRangeRingSpec | null): void {
    if (spec === null) {
      this.canonicalGeometry = null;
      this.line.visible = false;
      return;
    }

    this.canonicalGeometry = createHyperbolicRangeRingGeometry(spec);
    this.line.visible = true;
    this.updateVisualGeometry();
  }

  setViewTransform(viewTransform: MobiusTransform): void {
    this.viewTransform = viewTransform;
    this.updateVisualGeometry();
  }

  setResolution(width: number, height: number): void {
    this.material.resolution.set(width, height);
  }

  dispose(): void {
    this.scene.remove(this.group);
    this.geometry.dispose();
    this.material.dispose();
  }

  private updateVisualGeometry(): void {
    if (!this.canonicalGeometry) {
      return;
    }

    const positions: number[] = [];
    for (const point of this.canonicalGeometry.perimeter) {
      const transformed = applyMobius(this.viewTransform, point);
      positions.push(
        transformed.x * this.worldRadius,
        this.height,
        -transformed.y * this.worldRadius,
      );
    }
    this.geometry.setPositions(positions);
    this.line.computeLineDistances();
  }
}
