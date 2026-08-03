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

const DEFAULT_RADIAL_SEGMENTS = 12;
const DEFAULT_ARC_SEGMENTS = 48;

/**
 * The angular coordinates live in the tangent frame obtained by sending
 * `center` to the Poincare-disk origin.  This makes `centerAngle` an actual
 * H2 direction at the tower, rather than a Euclidean angle in the screen.
 */
export interface HyperbolicAttackSectorSpec {
  center: Vec2;
  hyperbolicRadius: number;
  centerAngle: number;
  halfAngle: number;
  radialSegments?: number;
  arcSegments?: number;
}

/**
 * Canonical Poincare-disk samples.  `leftRay` and `rightRay` both run from
 * the tower center to the perimeter; `outline` is closed and `fill` contains
 * the center followed by the perimeter arc for triangle-fan rendering.
 */
export interface HyperbolicAttackSectorGeometry {
  center: Vec2;
  leftRay: Vec2[];
  arc: Vec2[];
  rightRay: Vec2[];
  outline: Vec2[];
  fill: Vec2[];
}

export interface HyperbolicAttackSectorStyle {
  color?: THREE.ColorRepresentation;
  fillOpacity?: number;
  boundaryOpacity?: number;
  boundaryWidth?: number;
  height?: number;
  renderOrder?: number;
}

function validateSampleCount(value: number | undefined, fallback: number): number {
  const count = value ?? fallback;
  if (!Number.isInteger(count) || count < 1) {
    throw new RangeError('Attack-sector sample counts must be positive integers.');
  }
  return count;
}

function validateSpec(spec: HyperbolicAttackSectorSpec): void {
  if (
    !Number.isFinite(spec.center.x) ||
    !Number.isFinite(spec.center.y) ||
    vec2LengthSquared(spec.center) >= 1
  ) {
    throw new RangeError('Attack-sector center must be a finite point inside the Poincare disk.');
  }
  if (!Number.isFinite(spec.hyperbolicRadius) || spec.hyperbolicRadius <= 0) {
    throw new RangeError('Attack-sector hyperbolic radius must be positive and finite.');
  }
  if (!Number.isFinite(spec.centerAngle)) {
    throw new RangeError('Attack-sector center angle must be finite.');
  }
  if (
    !Number.isFinite(spec.halfAngle) ||
    spec.halfAngle <= 0 ||
    spec.halfAngle > Math.PI
  ) {
    throw new RangeError('Attack-sector half angle must be in (0, PI].');
  }
  validateSampleCount(spec.radialSegments, DEFAULT_RADIAL_SEGMENTS);
  validateSampleCount(spec.arcSegments, DEFAULT_ARC_SEGMENTS);
}

/**
 * Samples a hyperbolic sector in canonical disk coordinates.
 *
 * The center is first moved to the origin by a disk isometry.  At the origin,
 * metric polar coordinates are simple: a point at H2 distance `d` has disk
 * radius tanh(d / 2).  Mapping those points back guarantees that the arc is a
 * hyperbolic circle and each radial boundary is a hyperbolic geodesic.
 */
export function createHyperbolicAttackSectorGeometry(
  spec: HyperbolicAttackSectorSpec,
): HyperbolicAttackSectorGeometry {
  validateSpec(spec);

  const radialSegments = validateSampleCount(
    spec.radialSegments,
    DEFAULT_RADIAL_SEGMENTS,
  );
  const arcSegments = validateSampleCount(spec.arcSegments, DEFAULT_ARC_SEGMENTS);
  const center = { x: spec.center.x, y: spec.center.y };
  const restoreCenter = invertMobius(translationToOrigin(center));

  const fromTangentFrame = (distance: number, angle: number): Vec2 => {
    const diskRadius = hyperbolicRadiusToPoincare(distance);
    return applyMobius(restoreCenter, {
      x: Math.cos(angle) * diskRadius,
      y: Math.sin(angle) * diskRadius,
    });
  };

  const sampleRay = (angle: number): Vec2[] => {
    const ray = [center];
    for (let index = 1; index <= radialSegments; index += 1) {
      const distance = (spec.hyperbolicRadius * index) / radialSegments;
      ray.push(fromTangentFrame(distance, angle));
    }
    return ray;
  };

  const leftAngle = spec.centerAngle - spec.halfAngle;
  const rightAngle = spec.centerAngle + spec.halfAngle;
  const leftRay = sampleRay(leftAngle);
  const rightRay = sampleRay(rightAngle);
  const arc: Vec2[] = [];
  for (let index = 0; index <= arcSegments; index += 1) {
    const amount = index / arcSegments;
    const angle = leftAngle + (rightAngle - leftAngle) * amount;
    arc.push(fromTangentFrame(spec.hyperbolicRadius, angle));
  }

  return {
    center,
    leftRay,
    arc,
    rightRay,
    outline: [
      ...leftRay,
      ...arc.slice(1),
      ...rightRay.slice(0, -1).reverse(),
    ],
    fill: [center, ...arc],
  };
}

/**
 * A reusable scene overlay for a tower's H2 sector attack range.
 *
 * Pass canonical (unwarped) tower data to `setSector`, and pass the current
 * camera's disk isometry to `setViewTransform`.  The class reapplies that
 * isometry to every sample rather than approximating the sector in screen
 * space, so panning never turns its geodesics into straight Euclidean rays.
 */
export class HyperbolicAttackSector {
  readonly group = new THREE.Group();

  private readonly fillGeometry = new THREE.BufferGeometry();
  private readonly fillMaterial: THREE.MeshBasicMaterial;
  private readonly fill: THREE.Mesh<
    THREE.BufferGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly boundaryGeometry = new LineGeometry();
  private readonly boundaryMaterial: LineMaterial;
  private readonly boundary: Line2;
  private readonly worldRadius: number;
  private readonly height: number;
  private canonicalGeometry: HyperbolicAttackSectorGeometry | null = null;
  private viewTransform: MobiusTransform = IDENTITY_MOBIUS;

  constructor(
    private readonly scene: THREE.Scene,
    worldRadius: number,
    style: HyperbolicAttackSectorStyle = {},
  ) {
    if (!Number.isFinite(worldRadius) || worldRadius <= 0) {
      throw new RangeError('Attack-sector world radius must be positive and finite.');
    }
    this.worldRadius = worldRadius;
    this.height = style.height ?? 0.092;
    if (!Number.isFinite(this.height)) {
      throw new RangeError('Attack-sector height must be finite.');
    }

    const color = style.color ?? 0x8ce8d9;
    const fillOpacity = style.fillOpacity ?? 0.11;
    const boundaryOpacity = style.boundaryOpacity ?? 0.72;
    const boundaryWidth = style.boundaryWidth ?? 2;
    const renderOrder = style.renderOrder ?? 12;

    this.fillMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: fillOpacity,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    this.fill = new THREE.Mesh(this.fillGeometry, this.fillMaterial);
    this.fill.visible = false;
    this.fill.frustumCulled = false;
    this.fill.renderOrder = renderOrder;

    this.boundaryMaterial = new LineMaterial({
      color,
      linewidth: boundaryWidth,
      transparent: true,
      opacity: boundaryOpacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.boundary = new Line2(this.boundaryGeometry, this.boundaryMaterial);
    this.boundary.visible = false;
    this.boundary.frustumCulled = false;
    this.boundary.renderOrder = renderOrder + 1;

    this.group.add(this.fill, this.boundary);
    this.group.renderOrder = renderOrder;
    this.scene.add(this.group);
  }

  /** Returns the canonical samples currently driving the overlay, if visible. */
  get geometry(): HyperbolicAttackSectorGeometry | null {
    return this.canonicalGeometry;
  }

  /**
   * Replaces the current canonical sector.  `null` hides the overlay, which
   * is convenient for a tower with zero range or a deselected tower.
   */
  setSector(spec: HyperbolicAttackSectorSpec | null): void {
    if (spec === null) {
      this.canonicalGeometry = null;
      this.fill.visible = false;
      this.boundary.visible = false;
      return;
    }

    this.canonicalGeometry = createHyperbolicAttackSectorGeometry(spec);
    this.fill.visible = true;
    this.boundary.visible = true;
    this.updateVisualGeometry();
  }

  setViewTransform(viewTransform: MobiusTransform): void {
    this.viewTransform = viewTransform;
    this.updateVisualGeometry();
  }

  setResolution(width: number, height: number): void {
    this.boundaryMaterial.resolution.set(width, height);
  }

  dispose(): void {
    this.scene.remove(this.group);
    this.fillGeometry.dispose();
    this.fillMaterial.dispose();
    this.boundaryGeometry.dispose();
    this.boundaryMaterial.dispose();
  }

  private updateVisualGeometry(): void {
    const geometry = this.canonicalGeometry;
    if (!geometry) {
      return;
    }

    const toWorld = (point: Vec2): [number, number, number] => {
      const transformed = applyMobius(this.viewTransform, point);
      return [
        transformed.x * this.worldRadius,
        this.height,
        -transformed.y * this.worldRadius,
      ];
    };

    const fillWorld = geometry.fill.map(toWorld);
    const fillPositions: number[] = [];
    for (let index = 1; index < fillWorld.length - 1; index += 1) {
      fillPositions.push(
        ...fillWorld[0],
        ...fillWorld[index],
        ...fillWorld[index + 1],
      );
    }
    this.fillGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(fillPositions, 3),
    );
    this.fillGeometry.computeBoundingSphere();

    const boundaryPositions: number[] = [];
    for (const point of geometry.outline) {
      boundaryPositions.push(...toWorld(point));
    }
    this.boundaryGeometry.setPositions(boundaryPositions);
    this.boundary.computeLineDistances();
  }
}
