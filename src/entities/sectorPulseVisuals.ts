import * as THREE from 'three';
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

const DEFAULT_ARC_SEGMENTS = 42;
const DEFAULT_HEIGHT = 0.49;
const DEFAULT_RENDER_ORDER = 24;

/**
 * Presentation-only state for one sector pulse.
 *
 * `outwardAngle` and `halfAngle` live in the tower's tangent frame: first
 * send `origin` to the disk origin, then interpret the angle there.  This is
 * the same H² polar frame used by the sector combat test, so the visible
 * pulse cannot drift into a screen-space wedge after the camera moves.
 */
export interface SectorPulseSnapshot {
  id: string;
  origin: Vec2;
  outwardAngle: number;
  halfAngle: number;
  /** Current H² distance of the leading edge from the tower. */
  currentRadius: number;
  /** H² thickness of the travelling annular band. */
  bandWidth: number;
}

export interface SectorPulseVisualsOptions {
  color?: THREE.ColorRepresentation;
  glowColor?: THREE.ColorRepresentation;
  fillOpacity?: number;
  glowOpacity?: number;
  height?: number;
  renderOrder?: number;
  arcSegments?: number;
}

interface PulseVisual {
  readonly group: THREE.Group;
  readonly fillGeometry: THREE.BufferGeometry;
  readonly fillMaterial: THREE.MeshBasicMaterial;
  readonly fill: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  readonly glowGeometry: THREE.BufferGeometry;
  readonly glowMaterial: THREE.MeshBasicMaterial;
  readonly glow: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  readonly rimGeometry: THREE.BufferGeometry;
  readonly rimMaterial: THREE.LineBasicMaterial;
  readonly rim: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  snapshot: SectorPulseSnapshot;
}

function isFinitePoint(point: Vec2): boolean {
  return (
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    vec2LengthSquared(point) < 1
  );
}

function isValidSnapshot(snapshot: SectorPulseSnapshot): boolean {
  return (
    typeof snapshot.id === 'string' &&
    snapshot.id.length > 0 &&
    isFinitePoint(snapshot.origin) &&
    Number.isFinite(snapshot.outwardAngle) &&
    Number.isFinite(snapshot.halfAngle) &&
    snapshot.halfAngle > 0 &&
    snapshot.halfAngle <= Math.PI &&
    Number.isFinite(snapshot.currentRadius) &&
    snapshot.currentRadius >= 0 &&
    Number.isFinite(snapshot.bandWidth) &&
    snapshot.bandWidth > 0
  );
}

function copySnapshot(snapshot: SectorPulseSnapshot): SectorPulseSnapshot {
  return {
    id: snapshot.id,
    origin: { x: snapshot.origin.x, y: snapshot.origin.y },
    outwardAngle: snapshot.outwardAngle,
    halfAngle: snapshot.halfAngle,
    currentRadius: snapshot.currentRadius,
    bandWidth: snapshot.bandWidth,
  };
}

function ensurePositionAttribute(
  geometry: THREE.BufferGeometry,
  vertexCount: number,
): THREE.BufferAttribute {
  const existing = geometry.getAttribute('position') as
    | THREE.BufferAttribute
    | undefined;
  if (existing && existing.count >= vertexCount) {
    return existing;
  }

  const attribute = new THREE.BufferAttribute(
    new Float32Array(Math.max(1, vertexCount) * 3),
    3,
  );
  attribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', attribute);
  return attribute;
}

function writeGeometryPositions(
  geometry: THREE.BufferGeometry,
  positions: readonly number[],
): void {
  const vertexCount = Math.floor(positions.length / 3);
  const attribute = ensurePositionAttribute(geometry, vertexCount);
  for (let index = 0; index < positions.length; index += 1) {
    attribute.array[index] = positions[index];
  }
  attribute.needsUpdate = true;
  geometry.setDrawRange(0, vertexCount);
  geometry.computeBoundingSphere();
}

function createPulseVisual(
  snapshot: SectorPulseSnapshot,
  options: Required<
    Pick<
      SectorPulseVisualsOptions,
      'color' | 'glowColor' | 'fillOpacity' | 'glowOpacity' | 'renderOrder'
    >
  >,
): PulseVisual {
  const group = new THREE.Group();
  group.name = `sector-pulse-${snapshot.id}`;
  group.userData.sectorPulseId = snapshot.id;
  group.renderOrder = options.renderOrder;

  const fillGeometry = new THREE.BufferGeometry();
  const fillMaterial = new THREE.MeshBasicMaterial({
    color: options.color,
    transparent: true,
    opacity: options.fillOpacity,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const fill = new THREE.Mesh(fillGeometry, fillMaterial);
  fill.frustumCulled = false;
  fill.renderOrder = options.renderOrder;

  // A narrow additive front band makes the expanding boundary read as a
  // pulse rather than as a static attack-range overlay.
  const glowGeometry = new THREE.BufferGeometry();
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: options.glowColor,
    transparent: true,
    opacity: options.glowOpacity,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const glow = new THREE.Mesh(glowGeometry, glowMaterial);
  glow.frustumCulled = false;
  glow.renderOrder = options.renderOrder + 1;

  const rimGeometry = new THREE.BufferGeometry();
  const rimMaterial = new THREE.LineBasicMaterial({
    color: options.glowColor,
    transparent: true,
    opacity: Math.min(1, options.glowOpacity + 0.16),
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const rim = new THREE.Line(rimGeometry, rimMaterial);
  rim.frustumCulled = false;
  rim.renderOrder = options.renderOrder + 2;

  group.add(fill, glow, rim);
  return {
    group,
    fillGeometry,
    fillMaterial,
    fill,
    glowGeometry,
    glowMaterial,
    glow,
    rimGeometry,
    rimMaterial,
    rim,
    snapshot: copySnapshot(snapshot),
  };
}

/**
 * Renders current sector-pulse snapshots without participating in combat.
 *
 * Combat owns when a pulse is emitted, its H² radius, and who it damages.
 * This class only mirrors those snapshots into a glowing, filled annular
 * wedge, rebuilding its world vertices after every Mobius camera movement.
 */
export class SectorPulseVisuals {
  private readonly pulses = new Map<string, PulseVisual>();
  private readonly height: number;
  private readonly arcSegments: number;
  private readonly style: Required<
    Pick<
      SectorPulseVisualsOptions,
      'color' | 'glowColor' | 'fillOpacity' | 'glowOpacity' | 'renderOrder'
    >
  >;
  private viewTransform: MobiusTransform = IDENTITY_MOBIUS;
  private disposed = false;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly worldRadius: number,
    options: SectorPulseVisualsOptions = {},
  ) {
    if (!Number.isFinite(worldRadius) || worldRadius <= 0) {
      throw new RangeError('Sector-pulse world radius must be positive and finite.');
    }

    const height = options.height ?? DEFAULT_HEIGHT;
    const arcSegments = options.arcSegments ?? DEFAULT_ARC_SEGMENTS;
    if (!Number.isFinite(height)) {
      throw new RangeError('Sector-pulse height must be finite.');
    }
    if (!Number.isInteger(arcSegments) || arcSegments < 3) {
      throw new RangeError('Sector-pulse arcSegments must be an integer of at least 3.');
    }

    this.height = height;
    this.arcSegments = arcSegments;
    this.style = {
      color: options.color ?? 0xffa43d,
      glowColor: options.glowColor ?? 0xfff0a4,
      fillOpacity: options.fillOpacity ?? 0.3,
      glowOpacity: options.glowOpacity ?? 0.58,
      renderOrder: options.renderOrder ?? DEFAULT_RENDER_ORDER,
    };
  }

  get activeCount(): number {
    return this.pulses.size;
  }

  /**
   * Reconciles the presentation layer with the latest simulation snapshots.
   * Matching ids retain their Three.js objects; absent ids are disposed.
   */
  sync(
    snapshots: readonly SectorPulseSnapshot[],
    viewTransform: MobiusTransform = this.viewTransform,
  ): void {
    if (this.disposed) {
      return;
    }

    this.viewTransform = viewTransform;
    const seen = new Set<string>();
    for (const snapshot of snapshots) {
      if (!isValidSnapshot(snapshot)) {
        continue;
      }

      seen.add(snapshot.id);
      let visual = this.pulses.get(snapshot.id);
      if (!visual) {
        visual = createPulseVisual(snapshot, this.style);
        this.pulses.set(snapshot.id, visual);
        this.scene.add(visual.group);
      } else {
        visual.snapshot = copySnapshot(snapshot);
      }
      this.updateVisual(visual);
    }

    for (const [id, visual] of this.pulses) {
      if (!seen.has(id)) {
        this.removeVisual(id, visual);
      }
    }
  }

  /** Reprojects existing canonical snapshots after a camera-only movement. */
  update(viewTransform: MobiusTransform = this.viewTransform): void {
    if (this.disposed) {
      return;
    }
    this.viewTransform = viewTransform;
    for (const visual of this.pulses.values()) {
      this.updateVisual(visual);
    }
  }

  setViewTransform(viewTransform: MobiusTransform): void {
    this.update(viewTransform);
  }

  remove(id: string): void {
    const visual = this.pulses.get(id);
    if (visual) {
      this.removeVisual(id, visual);
    }
  }

  clear(): void {
    for (const [id, visual] of this.pulses) {
      this.removeVisual(id, visual);
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.clear();
    this.disposed = true;
  }

  private updateVisual(visual: PulseVisual): void {
    const snapshot = visual.snapshot;
    const outerRadius = snapshot.currentRadius;
    const innerRadius = Math.max(0, outerRadius - snapshot.bandWidth);
    const glowWidth = Math.max(snapshot.bandWidth * 0.24, 0.045);
    const glowInnerRadius = Math.max(innerRadius, outerRadius - glowWidth);

    this.writeAnnularFan(
      visual.fillGeometry,
      snapshot,
      innerRadius,
      outerRadius,
    );
    this.writeAnnularFan(
      visual.glowGeometry,
      snapshot,
      glowInnerRadius,
      outerRadius,
    );
    this.writeLeadingRim(visual.rimGeometry, snapshot, innerRadius, outerRadius);

    // A pulse that has just left its tower is still a solid wedge.  Once its
    // leading edge outruns the width, it becomes the visibly hollow band.
    visual.fill.visible = outerRadius > 0;
    visual.glow.visible = outerRadius > 0;
    visual.rim.visible = outerRadius > 0;
  }

  private writeAnnularFan(
    geometry: THREE.BufferGeometry,
    snapshot: SectorPulseSnapshot,
    innerRadius: number,
    outerRadius: number,
  ): void {
    const restoreOrigin = invertMobius(translationToOrigin(snapshot.origin));
    const positions: number[] = [];
    const pointAt = (radius: number, angle: number): [number, number, number] => {
      const localRadius = hyperbolicRadiusToPoincare(radius);
      const canonical = applyMobius(restoreOrigin, {
        x: localRadius * Math.cos(angle),
        y: localRadius * Math.sin(angle),
      });
      const viewPoint = applyMobius(this.viewTransform, canonical);
      return [
        viewPoint.x * this.worldRadius,
        this.height,
        -viewPoint.y * this.worldRadius,
      ];
    };

    const leftAngle = snapshot.outwardAngle - snapshot.halfAngle;
    const fullAngle = snapshot.halfAngle * 2;
    for (let index = 0; index < this.arcSegments; index += 1) {
      const fromAngle = leftAngle + (fullAngle * index) / this.arcSegments;
      const toAngle =
        leftAngle + (fullAngle * (index + 1)) / this.arcSegments;
      const innerFrom = pointAt(innerRadius, fromAngle);
      const outerFrom = pointAt(outerRadius, fromAngle);
      const outerTo = pointAt(outerRadius, toAngle);
      const innerTo = pointAt(innerRadius, toAngle);
      positions.push(
        ...innerFrom,
        ...outerFrom,
        ...outerTo,
        ...innerFrom,
        ...outerTo,
        ...innerTo,
      );
    }
    writeGeometryPositions(geometry, positions);
  }

  private writeLeadingRim(
    geometry: THREE.BufferGeometry,
    snapshot: SectorPulseSnapshot,
    innerRadius: number,
    outerRadius: number,
  ): void {
    const restoreOrigin = invertMobius(translationToOrigin(snapshot.origin));
    const positions: number[] = [];
    const pointAt = (radius: number, angle: number): [number, number, number] => {
      const localRadius = hyperbolicRadiusToPoincare(radius);
      const canonical = applyMobius(restoreOrigin, {
        x: localRadius * Math.cos(angle),
        y: localRadius * Math.sin(angle),
      });
      const viewPoint = applyMobius(this.viewTransform, canonical);
      return [
        viewPoint.x * this.worldRadius,
        this.height + 0.004,
        -viewPoint.y * this.worldRadius,
      ];
    };

    const leftAngle = snapshot.outwardAngle - snapshot.halfAngle;
    const rightAngle = snapshot.outwardAngle + snapshot.halfAngle;
    positions.push(...pointAt(innerRadius, leftAngle));
    for (let index = 0; index <= this.arcSegments; index += 1) {
      const angle =
        leftAngle + ((rightAngle - leftAngle) * index) / this.arcSegments;
      positions.push(...pointAt(outerRadius, angle));
    }
    positions.push(...pointAt(innerRadius, rightAngle));
    writeGeometryPositions(geometry, positions);
  }

  private removeVisual(id: string, visual: PulseVisual): void {
    this.pulses.delete(id);
    this.scene.remove(visual.group);
    visual.fillGeometry.dispose();
    visual.fillMaterial.dispose();
    visual.glowGeometry.dispose();
    visual.glowMaterial.dispose();
    visual.rimGeometry.dispose();
    visual.rimMaterial.dispose();
  }
}
