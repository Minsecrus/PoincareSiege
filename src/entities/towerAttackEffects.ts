import * as THREE from 'three';
import {
  getPrecisionProjectileTiming,
  getTowerAttackImpactDelays,
  resolveTowerAttackEffectRange,
  TOWER_ATTACK_EFFECT_TIMING,
  type PrecisionProjectileStyle,
} from '../game/towerAttackTiming';
import type { TowerKind } from '../game/towerStats';
import {
  IDENTITY_MOBIUS,
  applyMobius,
  clampToDisk,
  geodesicInterpolate,
  hyperbolicDistance,
  hyperbolicRadiusToPoincare,
  hyperboloidToPoincare,
  invertMobius,
  poincareToHyperboloid,
  translationToOrigin,
  vec2LengthSquared,
  type MobiusTransform,
  type Vec2,
} from '../math/hyperbolic';

const EFFECT_HEIGHT = 0.46;
const EFFECT_RENDER_ORDER = 18;
const MAX_EFFECT_TARGETS = 6;
const DISK_MARGIN = 1 - 1e-6;

/**
 * A view-independent attack event. Points are captured in canonical
 * Poincare-disk coordinates at the instant combat resolves.
 *
 * `range` is optional because ordinary tracer effects only need target
 * positions. Circular pulse and slow-field effects use it when supplied so
 * their visible H² radius matches the tower's gameplay radius exactly.
 */
export interface TowerAttackEffectRequest {
  kind: TowerKind;
  origin: Vec2;
  targets: readonly Vec2[];
  range?: number;
  /**
   * Precision attacks always resolve against one target. The base reuses the
   * sniper channel with the larger `base-projectile` presentation, while
   * ordinary sniper towers default to the compact projectile.
   */
  style?: PrecisionProjectileStyle;
}

export type { PrecisionProjectileStyle } from '../game/towerAttackTiming';

export interface TowerAttackEffectsOptions {
  /** Safety cap for short-lived visuals during high-speed combat. */
  maxActiveEffects?: number;
}

interface ActiveAttackEffect {
  readonly group: THREE.Group;
  readonly duration: number;
  age: number;
  update(viewTransform: MobiusTransform): void;
  dispose(): void;
}

interface FlashVisual {
  readonly mesh: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  readonly geometry: THREE.CircleGeometry;
  readonly material: THREE.MeshBasicMaterial;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function smoothStep(edge0: number, edge1: number, value: number): number {
  const amount = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return amount * amount * (3 - 2 * amount);
}

function easeOutCubic(value: number): number {
  return 1 - Math.pow(1 - clamp(value, 0, 1), 3);
}

function isUsablePoint(point: Vec2): boolean {
  return (
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    vec2LengthSquared(point) < 1
  );
}

function normalizePoint(point: Vec2): Vec2 {
  return clampToDisk({ x: point.x, y: point.y }, DISK_MARGIN);
}

function createEffectGroup(name: string): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  group.renderOrder = EFFECT_RENDER_ORDER;
  return group;
}

function createLineMaterial(color: number): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}

function createFlash(color: number): FlashVisual {
  const geometry = new THREE.CircleGeometry(1, 20);
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 1,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = EFFECT_RENDER_ORDER + 1;
  return { mesh, geometry, material };
}

function updateFlash(
  flash: FlashVisual,
  canonicalPoint: Vec2,
  viewTransform: MobiusTransform,
  worldRadius: number,
  opacity: number,
  radius: number,
): void {
  const viewPoint = applyMobius(viewTransform, canonicalPoint);
  flash.mesh.position.set(
    viewPoint.x * worldRadius,
    EFFECT_HEIGHT + 0.018,
    -viewPoint.y * worldRadius,
  );
  // Objects near the ideal boundary should taper just like tower models.
  const intrinsicScale = Math.max(0.08, 1 - vec2LengthSquared(viewPoint));
  flash.mesh.scale.setScalar(radius * intrinsicScale);
  flash.material.opacity = clamp(opacity, 0, 1);
}

function ensurePositionAttribute(
  geometry: THREE.BufferGeometry,
  pointCount: number,
): THREE.BufferAttribute {
  const current = geometry.getAttribute('position') as
    | THREE.BufferAttribute
    | undefined;
  if (current && current.count >= pointCount) {
    return current;
  }

  const attribute = new THREE.BufferAttribute(
    new Float32Array(Math.max(1, pointCount) * 3),
    3,
  );
  attribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', attribute);
  return attribute;
}

function writeCanonicalPath(
  geometry: THREE.BufferGeometry,
  canonicalPoints: readonly Vec2[],
  viewTransform: MobiusTransform,
  worldRadius: number,
  height = EFFECT_HEIGHT,
): void {
  const positions = ensurePositionAttribute(geometry, canonicalPoints.length);
  for (let index = 0; index < canonicalPoints.length; index += 1) {
    const point = applyMobius(viewTransform, canonicalPoints[index]);
    positions.setXYZ(index, point.x * worldRadius, height, -point.y * worldRadius);
  }
  positions.needsUpdate = true;
  geometry.setDrawRange(0, canonicalPoints.length);
  geometry.computeBoundingSphere();
}

function geodesicPoint(start: Vec2, end: Vec2, amount: number): Vec2 {
  const startHyperboloid = poincareToHyperboloid(start);
  const endHyperboloid = poincareToHyperboloid(end);
  return hyperboloidToPoincare(
    geodesicInterpolate(
      startHyperboloid,
      endHyperboloid,
      clamp(amount, 0, 1),
    ),
  );
}

function sampleGeodesic(
  start: Vec2,
  end: Vec2,
  segments: number,
  amount = 1,
): Vec2[] {
  const safeSegments = Math.max(1, Math.floor(segments));
  const safeAmount = clamp(amount, 0, 1);
  const points: Vec2[] = [];
  for (let index = 0; index <= safeSegments; index += 1) {
    points.push(geodesicPoint(start, end, (index / safeSegments) * safeAmount));
  }
  return points;
}

function sampleGeodesicSpan(
  start: Vec2,
  end: Vec2,
  segments: number,
  startAmount: number,
  endAmount: number,
): Vec2[] {
  const safeSegments = Math.max(1, Math.floor(segments));
  const from = clamp(startAmount, 0, 1);
  const to = clamp(endAmount, from, 1);
  const points: Vec2[] = [];
  for (let index = 0; index <= safeSegments; index += 1) {
    points.push(
      geodesicPoint(start, end, from + ((to - from) * index) / safeSegments),
    );
  }
  return points;
}

function appendLineSegments(
  destination: Vec2[],
  line: readonly Vec2[],
): void {
  for (let index = 0; index < line.length - 1; index += 1) {
    destination.push(line[index], line[index + 1]);
  }
}

function circleAtHyperbolicRadius(
  origin: Vec2,
  radius: number,
  segments: number,
): Vec2[] {
  const inverseTranslation = invertMobius(translationToOrigin(origin));
  const localRadius = hyperbolicRadiusToPoincare(Math.max(0, radius));
  const points: Vec2[] = [];
  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    points.push(
      applyMobius(inverseTranslation, {
        x: localRadius * Math.cos(angle),
        y: localRadius * Math.sin(angle),
      }),
    );
  }
  return points;
}

/**
 * Produces short radial marks in a tower's local H² frame.  Transforming the
 * local spokes through the inverse Mobius translation keeps every mark locked
 * to the same canonical battlefield position while the player moves the view.
 */
function radialSigilSegments(
  origin: Vec2,
  innerRadius: number,
  outerRadius: number,
  arms: number,
  rotation = 0,
): Vec2[] {
  const inverseTranslation = invertMobius(translationToOrigin(origin));
  const safeArms = Math.max(1, Math.floor(arms));
  const inner = hyperbolicRadiusToPoincare(Math.max(0, innerRadius));
  const outer = hyperbolicRadiusToPoincare(Math.max(0, outerRadius));
  const segments: Vec2[] = [];

  for (let index = 0; index < safeArms; index += 1) {
    const angle = rotation + (index / safeArms) * Math.PI * 2;
    const direction = { x: Math.cos(angle), y: Math.sin(angle) };
    segments.push(
      applyMobius(inverseTranslation, {
        x: direction.x * inner,
        y: direction.y * inner,
      }),
      applyMobius(inverseTranslation, {
        x: direction.x * outer,
        y: direction.y * outer,
      }),
    );
  }

  return segments;
}

function createSectorEffect(
  origin: Vec2,
  targets: readonly Vec2[],
  worldRadius: number,
): ActiveAttackEffect {
  const duration = TOWER_ATTACK_EFFECT_TIMING.sector.durationSeconds;
  const group = createEffectGroup('tower-attack-sector');
  const geometry = new THREE.BufferGeometry();
  const material = createLineMaterial(0xffbf59);
  const tracers = new THREE.LineSegments(geometry, material);
  tracers.renderOrder = EFFECT_RENDER_ORDER;
  const flash = createFlash(0xffd98a);
  group.add(tracers, flash.mesh);

  const visibleTargets = targets.slice(0, 4);
  const effect: ActiveAttackEffect = {
    group,
    duration,
    age: 0,
    update(viewTransform): void {
      const progress = effect.age / duration;
      const revealed = easeOutCubic(
        progress * TOWER_ATTACK_EFFECT_TIMING.sector.tracerRevealSpeed,
      );
      const segments: Vec2[] = [];
      for (const target of visibleTargets) {
        appendLineSegments(segments, sampleGeodesic(origin, target, 4, revealed));
      }
      writeCanonicalPath(geometry, segments, viewTransform, worldRadius);
      const opacity = 0.96 * (1 - smoothStep(0.42, 1, progress));
      material.opacity = opacity;
      updateFlash(flash, origin, viewTransform, worldRadius, opacity, 0.105 + revealed * 0.07);
    },
    dispose(): void {
      geometry.dispose();
      material.dispose();
      flash.geometry.dispose();
      flash.material.dispose();
    },
  };
  return effect;
}

function createPrismEffect(
  origin: Vec2,
  targets: readonly Vec2[],
  worldRadius: number,
): ActiveAttackEffect {
  const prismTiming = TOWER_ATTACK_EFFECT_TIMING.prism;
  const duration = prismTiming.durationSeconds;
  const impactDelays = getTowerAttackImpactDelays({
    kind: 'prism',
    origin,
    targets,
  });
  const group = createEffectGroup('tower-attack-prism');
  const terminalTarget = targets.reduce((farthest, target) =>
    hyperbolicDistance(origin, target) > hyperbolicDistance(origin, farthest)
      ? target
      : farthest,
  );
  const beamLayers = [
    {
      geometry: new THREE.BufferGeometry(),
      material: createLineMaterial(0x8057ff),
      height: EFFECT_HEIGHT + 0.014,
      opacity: 0.38,
      delay: 0,
    },
    {
      geometry: new THREE.BufferGeometry(),
      material: createLineMaterial(0xd5a7ff),
      height: EFFECT_HEIGHT + 0.032,
      opacity: 0.82,
      delay: 0.035,
    },
    {
      geometry: new THREE.BufferGeometry(),
      material: createLineMaterial(0xfff0ff),
      height: EFFECT_HEIGHT + 0.052,
      opacity: 1,
      delay: 0.075,
    },
  ].map((layer) => {
    const beam = new THREE.Line(layer.geometry, layer.material);
    beam.renderOrder = EFFECT_RENDER_ORDER + 1;
    group.add(beam);
    return { ...layer, beam };
  });

  const chargeOuterGeometry = new THREE.BufferGeometry();
  const chargeOuterMaterial = createLineMaterial(0xad85ff);
  const chargeOuter = new THREE.LineLoop(chargeOuterGeometry, chargeOuterMaterial);
  chargeOuter.renderOrder = EFFECT_RENDER_ORDER;
  const chargeInnerGeometry = new THREE.BufferGeometry();
  const chargeInnerMaterial = createLineMaterial(0xf1c5ff);
  const chargeInner = new THREE.LineLoop(chargeInnerGeometry, chargeInnerMaterial);
  chargeInner.renderOrder = EFFECT_RENDER_ORDER + 1;
  const sourceFlash = createFlash(0xe8c5ff);
  group.add(chargeOuter, chargeInner, sourceFlash.mesh);

  const impacts = targets.slice(0, 4).map((target, index) => {
    const ringGeometry = new THREE.BufferGeometry();
    const ringMaterial = createLineMaterial(0xf4caff);
    const ring = new THREE.LineLoop(ringGeometry, ringMaterial);
    ring.renderOrder = EFFECT_RENDER_ORDER + 2;
    const sigilGeometry = new THREE.BufferGeometry();
    const sigilMaterial = createLineMaterial(0x9d7cff);
    const sigil = new THREE.LineSegments(sigilGeometry, sigilMaterial);
    sigil.renderOrder = EFFECT_RENDER_ORDER + 2;
    const flash = createFlash(0xffd9ff);
    group.add(ring, sigil, flash.mesh);
    return {
      target,
      index,
      arrivalSeconds: impactDelays[index] ?? 0,
      ringGeometry,
      ringMaterial,
      sigilGeometry,
      sigilMaterial,
      flash,
    };
  });
  const effect: ActiveAttackEffect = {
    group,
    duration,
    age: 0,
    update(viewTransform): void {
      const progress = effect.age / duration;
      const beamFade = 1 - smoothStep(0.57, 1, progress);
      for (const layer of beamLayers) {
        const release = easeOutCubic(
          clamp(
            (progress - prismTiming.beamStartProgress - layer.delay) /
              prismTiming.beamTravelProgress,
            0,
            1,
          ),
        );
        writeCanonicalPath(
          layer.geometry,
          sampleGeodesic(origin, terminalTarget, 28, release),
          viewTransform,
          worldRadius,
          layer.height,
        );
        layer.material.opacity = layer.opacity * beamFade * release;
      }

      const charge = 1 - smoothStep(0.12, 0.42, progress);
      writeCanonicalPath(
        chargeOuterGeometry,
        circleAtHyperbolicRadius(
          origin,
          0.055 + 0.22 * easeOutCubic(progress * 4.4),
          18,
        ),
        viewTransform,
        worldRadius,
        EFFECT_HEIGHT + 0.016,
      );
      writeCanonicalPath(
        chargeInnerGeometry,
        circleAtHyperbolicRadius(
          origin,
          0.04 + 0.085 * (1 - progress),
          12,
        ),
        viewTransform,
        worldRadius,
        EFFECT_HEIGHT + 0.04,
      );
      chargeOuterMaterial.opacity = 0.82 * charge;
      chargeInnerMaterial.opacity = 0.9 * charge;
      updateFlash(
        sourceFlash,
        origin,
        viewTransform,
        worldRadius,
        0.88 * Math.max(charge, beamFade * 0.28),
        0.075 + 0.1 * charge,
      );

      for (const impact of impacts) {
        const hitProgress = clamp(
          (effect.age - impact.arrivalSeconds) / (duration * 0.48),
          0,
          1,
        );
        const hitOpacity =
          smoothStep(0, 0.1, hitProgress) *
          (1 - smoothStep(0.48, 1, hitProgress)) *
          beamFade;
        writeCanonicalPath(
          impact.ringGeometry,
          circleAtHyperbolicRadius(
            impact.target,
            0.045 + 0.15 * easeOutCubic(hitProgress),
            16,
          ),
          viewTransform,
          worldRadius,
          EFFECT_HEIGHT + 0.028,
        );
        writeCanonicalPath(
          impact.sigilGeometry,
          radialSigilSegments(
            impact.target,
            0.045 + 0.025 * hitProgress,
            0.12 + 0.11 * hitProgress,
            6,
            progress * Math.PI * 2 + impact.index * 0.4,
          ),
          viewTransform,
          worldRadius,
          EFFECT_HEIGHT + 0.046,
        );
        impact.ringMaterial.opacity = 0.92 * hitOpacity;
        impact.sigilMaterial.opacity = 0.68 * hitOpacity;
        updateFlash(
          impact.flash,
          impact.target,
          viewTransform,
          worldRadius,
          0.9 * hitOpacity,
          0.065 + 0.1 * easeOutCubic(hitProgress),
        );
      }
    },
    dispose(): void {
      for (const layer of beamLayers) {
        layer.geometry.dispose();
        layer.material.dispose();
      }
      chargeOuterGeometry.dispose();
      chargeOuterMaterial.dispose();
      chargeInnerGeometry.dispose();
      chargeInnerMaterial.dispose();
      sourceFlash.geometry.dispose();
      sourceFlash.material.dispose();
      for (const impact of impacts) {
        impact.ringGeometry.dispose();
        impact.ringMaterial.dispose();
        impact.sigilGeometry.dispose();
        impact.sigilMaterial.dispose();
        impact.flash.geometry.dispose();
        impact.flash.material.dispose();
      }
    },
  };
  return effect;
}

function createPulseEffect(
  origin: Vec2,
  targets: readonly Vec2[],
  requestedRange: number | undefined,
  worldRadius: number,
): ActiveAttackEffect {
  const pulseTiming = TOWER_ATTACK_EFFECT_TIMING.pulse;
  const duration = pulseTiming.durationSeconds;
  const range = resolveTowerAttackEffectRange(
    origin,
    targets,
    requestedRange,
    pulseTiming.rangeFallback,
  );
  const impactDelays = getTowerAttackImpactDelays({
    kind: 'pulse',
    origin,
    targets,
    range,
  });
  const group = createEffectGroup('tower-attack-pulse');
  const rings = [
    {
      color: 0x57eaff,
      delay: 0,
      speed: pulseTiming.primaryRingSpeed,
      opacity: 0.42,
      height: 0.012,
    },
    { color: 0xa4f9ff, delay: 0.105, speed: 1.32, opacity: 0.3, height: 0.03 },
    { color: 0x2f9fff, delay: 0.205, speed: 1.48, opacity: 0.18, height: 0.002 },
  ].map((definition) => {
    const geometry = new THREE.BufferGeometry();
    const material = createLineMaterial(definition.color);
    const ring = new THREE.LineLoop(geometry, material);
    ring.renderOrder = EFFECT_RENDER_ORDER + 1;
    group.add(ring);
    return { ...definition, geometry, material };
  });
  const sourceFlash = createFlash(0x86f5ff);
  group.add(sourceFlash.mesh);

  const impacts = targets.slice(0, 6).map((target, index) => {
    const ringGeometry = new THREE.BufferGeometry();
    const ringMaterial = createLineMaterial(0xc4fbff);
    const ring = new THREE.LineLoop(ringGeometry, ringMaterial);
    ring.renderOrder = EFFECT_RENDER_ORDER + 2;
    const shockGeometry = new THREE.BufferGeometry();
    const shockMaterial = createLineMaterial(0x58dfff);
    const shock = new THREE.LineSegments(shockGeometry, shockMaterial);
    shock.renderOrder = EFFECT_RENDER_ORDER + 2;
    const flash = createFlash(0xb8faff);
    group.add(ring, shock, flash.mesh);
    return {
      target,
      index,
      arrivalSeconds: impactDelays[index] ?? 0,
      ringGeometry,
      ringMaterial,
      shockGeometry,
      shockMaterial,
      flash,
    };
  });

  const effect: ActiveAttackEffect = {
    group,
    duration,
    age: 0,
    update(viewTransform): void {
      const progress = effect.age / duration;
      for (const ring of rings) {
        const waveProgress = clamp(
          (progress - ring.delay) * ring.speed,
          0,
          1,
        );
        const trailingFade = 1 - smoothStep(0.72, 1, waveProgress);
        writeCanonicalPath(
          ring.geometry,
          circleAtHyperbolicRadius(
            origin,
            Math.max(0.012, range * waveProgress),
            60,
          ),
          viewTransform,
          worldRadius,
          EFFECT_HEIGHT + ring.height,
        );
        ring.material.opacity =
          ring.opacity * trailingFade * smoothStep(0, 0.06, waveProgress);
      }

      const sourceIntensity = 1 - smoothStep(0.16, 0.48, progress);
      updateFlash(
        sourceFlash,
        origin,
        viewTransform,
        worldRadius,
        0.3 * sourceIntensity,
        0.09 + 0.16 * easeOutCubic(progress * 3.2),
      );

      for (const impact of impacts) {
        const hitProgress = clamp(
          (effect.age - impact.arrivalSeconds) / (duration * 0.3),
          0,
          1,
        );
        const hitOpacity =
          smoothStep(0, 0.08, hitProgress) *
          (1 - smoothStep(0.38, 1, hitProgress));
        writeCanonicalPath(
          impact.ringGeometry,
          circleAtHyperbolicRadius(
            impact.target,
            0.038 + 0.14 * easeOutCubic(hitProgress),
            18,
          ),
          viewTransform,
          worldRadius,
          EFFECT_HEIGHT + 0.036,
        );
        writeCanonicalPath(
          impact.shockGeometry,
          radialSigilSegments(
            impact.target,
            0.055 + 0.02 * hitProgress,
            0.12 + 0.13 * hitProgress,
            8,
            impact.index * 0.7 + progress * Math.PI * 4,
          ),
          viewTransform,
          worldRadius,
          EFFECT_HEIGHT + 0.044,
        );
        impact.ringMaterial.opacity = 0.34 * hitOpacity;
        impact.shockMaterial.opacity = 0.2 * hitOpacity;
        updateFlash(
          impact.flash,
          impact.target,
          viewTransform,
          worldRadius,
          0.3 * hitOpacity,
          0.06 + 0.095 * easeOutCubic(hitProgress),
        );
      }
    },
    dispose(): void {
      for (const ring of rings) {
        ring.geometry.dispose();
        ring.material.dispose();
      }
      sourceFlash.geometry.dispose();
      sourceFlash.material.dispose();
      for (const impact of impacts) {
        impact.ringGeometry.dispose();
        impact.ringMaterial.dispose();
        impact.shockGeometry.dispose();
        impact.shockMaterial.dispose();
        impact.flash.geometry.dispose();
        impact.flash.material.dispose();
      }
    },
  };
  return effect;
}

function createAnchorEffect(
  origin: Vec2,
  targets: readonly Vec2[],
  requestedRange: number | undefined,
  worldRadius: number,
): ActiveAttackEffect {
  const anchorTiming = TOWER_ATTACK_EFFECT_TIMING.anchor;
  const duration = anchorTiming.durationSeconds;
  const range = resolveTowerAttackEffectRange(
    origin,
    targets,
    requestedRange,
    anchorTiming.rangeFallback,
  );
  const impactDelays = getTowerAttackImpactDelays({
    kind: 'anchor',
    origin,
    targets,
    range,
  });
  const group = createEffectGroup('tower-attack-anchor');
  const fieldOuterGeometry = new THREE.BufferGeometry();
  const fieldOuterMaterial = createLineMaterial(0x65f1b2);
  const fieldOuter = new THREE.LineLoop(fieldOuterGeometry, fieldOuterMaterial);
  fieldOuter.renderOrder = EFFECT_RENDER_ORDER;
  const fieldInnerGeometry = new THREE.BufferGeometry();
  const fieldInnerMaterial = createLineMaterial(0xb2ffe1);
  const fieldInner = new THREE.LineLoop(fieldInnerGeometry, fieldInnerMaterial);
  fieldInner.renderOrder = EFFECT_RENDER_ORDER + 1;
  const fieldLatticeGeometry = new THREE.BufferGeometry();
  const fieldLatticeMaterial = createLineMaterial(0x58c993);
  const fieldLattice = new THREE.LineSegments(
    fieldLatticeGeometry,
    fieldLatticeMaterial,
  );
  fieldLattice.renderOrder = EFFECT_RENDER_ORDER;
  const sourceFlash = createFlash(0x8affca);
  group.add(fieldOuter, fieldInner, fieldLattice, sourceFlash.mesh);

  const restraints = targets.slice(0, 5).map((target, index) => {
    const ringGeometry = new THREE.BufferGeometry();
    const ringMaterial = createLineMaterial(0xc5ffe7);
    const ring = new THREE.LineLoop(ringGeometry, ringMaterial);
    ring.renderOrder = EFFECT_RENDER_ORDER + 2;
    const sigilGeometry = new THREE.BufferGeometry();
    const sigilMaterial = createLineMaterial(0x59dfaa);
    const sigil = new THREE.LineSegments(sigilGeometry, sigilMaterial);
    sigil.renderOrder = EFFECT_RENDER_ORDER + 2;
    const flash = createFlash(0x83ffc7);
    group.add(ring, sigil, flash.mesh);
    return {
      target,
      index,
      arrivalSeconds: impactDelays[index] ?? 0,
      ringGeometry,
      ringMaterial,
      sigilGeometry,
      sigilMaterial,
      flash,
    };
  });

  const effect: ActiveAttackEffect = {
    group,
    duration,
    age: 0,
    update(viewTransform): void {
      const progress = effect.age / duration;
      const settle = easeOutCubic(clamp(progress / 0.17, 0, 1));
      const fieldPulse = 0.965 + Math.sin(progress * Math.PI * 8) * 0.025;
      const radius =
        range *
        (anchorTiming.initialRadiusFraction +
          (1 - anchorTiming.initialRadiusFraction) * settle);
      const outerPoints = circleAtHyperbolicRadius(origin, radius, 8);
      const innerPoints = circleAtHyperbolicRadius(origin, radius * 0.55, 8);
      const latticeSegments: Vec2[] = [];
      for (let index = 0; index < outerPoints.length; index += 1) {
        const next = (index + 1) % outerPoints.length;
        latticeSegments.push(
          outerPoints[index],
          innerPoints[index],
          innerPoints[index],
          innerPoints[next],
        );
        if (index % 2 === 0) {
          latticeSegments.push(origin, innerPoints[index]);
        }
      }
      writeCanonicalPath(
        fieldOuterGeometry,
        outerPoints,
        viewTransform,
        worldRadius,
        EFFECT_HEIGHT + 0.006,
      );
      writeCanonicalPath(
        fieldInnerGeometry,
        innerPoints,
        viewTransform,
        worldRadius,
        EFFECT_HEIGHT + 0.026,
      );
      writeCanonicalPath(
        fieldLatticeGeometry,
        latticeSegments,
        viewTransform,
        worldRadius,
        EFFECT_HEIGHT - 0.006,
      );
      const fieldOpacity = 1 - smoothStep(0.72, 1, progress);
      fieldOuterMaterial.opacity = 0.78 * fieldOpacity * fieldPulse;
      fieldInnerMaterial.opacity = 0.66 * fieldOpacity * fieldPulse;
      fieldLatticeMaterial.opacity = 0.48 * fieldOpacity * fieldPulse;
      updateFlash(
        sourceFlash,
        origin,
        viewTransform,
        worldRadius,
        0.62 * fieldOpacity,
        0.08 + 0.085 * settle,
      );

      for (const restraint of restraints) {
        const pulseOffset = restraint.index * 0.11;
        const restraintPulse =
          0.78 +
          Math.sin(progress * Math.PI * 7 + pulseOffset) * 0.18;
        const contactProgress = clamp(
          (effect.age - restraint.arrivalSeconds) / (duration * 0.13),
          0,
          1,
        );
        const restraintOpacity =
          fieldOpacity * smoothStep(0, 1, contactProgress) * restraintPulse;
        const sigilRadius = 0.075 + 0.022 * Math.sin(progress * Math.PI * 6 + pulseOffset);
        writeCanonicalPath(
          restraint.ringGeometry,
          circleAtHyperbolicRadius(restraint.target, sigilRadius, 6),
          viewTransform,
          worldRadius,
          EFFECT_HEIGHT + 0.034,
        );
        writeCanonicalPath(
          restraint.sigilGeometry,
          radialSigilSegments(
            restraint.target,
            0.04,
            0.15 + 0.03 * settle,
            6,
            progress * Math.PI * 2 - restraint.index * 0.5,
          ),
          viewTransform,
          worldRadius,
          EFFECT_HEIGHT + 0.052,
        );
        restraint.ringMaterial.opacity = 0.9 * restraintOpacity;
        restraint.sigilMaterial.opacity = 0.62 * restraintOpacity;
        updateFlash(
          restraint.flash,
          restraint.target,
          viewTransform,
          worldRadius,
          0.58 * restraintOpacity,
          0.058 + 0.038 * settle,
        );
      }
    },
    dispose(): void {
      fieldOuterGeometry.dispose();
      fieldOuterMaterial.dispose();
      fieldInnerGeometry.dispose();
      fieldInnerMaterial.dispose();
      fieldLatticeGeometry.dispose();
      fieldLatticeMaterial.dispose();
      sourceFlash.geometry.dispose();
      sourceFlash.material.dispose();
      for (const restraint of restraints) {
        restraint.ringGeometry.dispose();
        restraint.ringMaterial.dispose();
        restraint.sigilGeometry.dispose();
        restraint.sigilMaterial.dispose();
        restraint.flash.geometry.dispose();
        restraint.flash.material.dispose();
      }
    },
  };
  return effect;
}

function arcNoise(seed: number): number {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function createArcPath(
  origin: Vec2,
  targets: readonly Vec2[],
  time: number,
  jitterMultiplier = 1,
): Vec2[] {
  const path: Vec2[] = [origin];
  const chain = [origin, ...targets];
  for (let segmentIndex = 0; segmentIndex < chain.length - 1; segmentIndex += 1) {
    const start = chain[segmentIndex];
    const end = chain[segmentIndex + 1];
    const samples = sampleGeodesic(start, end, 5);
    for (let index = 1; index < samples.length; index += 1) {
      const point = samples[index];
      if (index === samples.length - 1) {
        path.push(point);
        continue;
      }
      const previous = samples[index - 1];
      const following = samples[index + 1];
      const dx = following.x - previous.x;
      const dy = following.y - previous.y;
      const length = Math.hypot(dx, dy) || 1;
      const sign = arcNoise(
        segmentIndex * 17 + index * 7 + time * 37,
      ) > 0.5
        ? 1
        : -1;
      const amount =
        (0.007 + arcNoise(index * 11 + segmentIndex * 3) * 0.018) *
        sign *
        jitterMultiplier;
      path.push(
        clampToDisk(
          {
            x: point.x - (dy / length) * amount,
            y: point.y + (dx / length) * amount,
          },
          DISK_MARGIN,
        ),
      );
    }
  }
  return path;
}

function createArcEffect(
  origin: Vec2,
  targets: readonly Vec2[],
  worldRadius: number,
): ActiveAttackEffect {
  const arcTiming = TOWER_ATTACK_EFFECT_TIMING.arc;
  const duration = arcTiming.durationSeconds;
  const impactDelays = getTowerAttackImpactDelays({
    kind: 'arc',
    origin,
    targets,
  });
  const group = createEffectGroup('tower-attack-arc');
  const arcs = [
    {
      color: 0x5d57ff,
      height: EFFECT_HEIGHT + 0.026,
      opacity: 0.48,
      delay: 0,
      jitter: 1.45,
      seed: 11,
    },
    {
      color: 0xb0a4ff,
      height: EFFECT_HEIGHT + 0.046,
      opacity: 0.82,
      delay: 0.045,
      jitter: 0.9,
      seed: 29,
    },
    {
      color: 0xf2f2ff,
      height: EFFECT_HEIGHT + 0.066,
      opacity: 1,
      delay: 0.09,
      jitter: 0.46,
      seed: 53,
    },
  ].map((definition) => {
    const geometry = new THREE.BufferGeometry();
    const material = createLineMaterial(definition.color);
    const arc = new THREE.Line(geometry, material);
    arc.renderOrder = EFFECT_RENDER_ORDER + 1;
    group.add(arc);
    return { ...definition, geometry, material };
  });
  const sourceFlash = createFlash(0xc3bdff);
  group.add(sourceFlash.mesh);

  const impacts = targets.slice(0, 6).map((target, index) => {
    const ringGeometry = new THREE.BufferGeometry();
    const ringMaterial = createLineMaterial(0xdad6ff);
    const ring = new THREE.LineLoop(ringGeometry, ringMaterial);
    ring.renderOrder = EFFECT_RENDER_ORDER + 2;
    const sparkGeometry = new THREE.BufferGeometry();
    const sparkMaterial = createLineMaterial(0x7e7dff);
    const sparks = new THREE.LineSegments(sparkGeometry, sparkMaterial);
    sparks.renderOrder = EFFECT_RENDER_ORDER + 2;
    const flash = createFlash(0xe6e6ff);
    group.add(ring, sparks, flash.mesh);
    return {
      target,
      index,
      arrivalSeconds: impactDelays[index] ?? 0,
      ringGeometry,
      ringMaterial,
      sparkGeometry,
      sparkMaterial,
      flash,
    };
  });

  const effect: ActiveAttackEffect = {
    group,
    duration,
    age: 0,
    update(viewTransform): void {
      const progress = effect.age / duration;
      const globalFade = 1 - smoothStep(0.57, 1, progress);
      for (const arc of arcs) {
        const arcProgress = clamp(
          (progress - arc.delay) / arcTiming.propagationProgress,
          0,
          1,
        );
        const path = createArcPath(
          origin,
          targets,
          effect.age * 32 + arc.seed,
          arc.jitter,
        );
        const visiblePointCount = Math.max(
          2,
          Math.ceil(1 + (path.length - 1) * easeOutCubic(arcProgress)),
        );
        writeCanonicalPath(
          arc.geometry,
          path.slice(0, visiblePointCount),
          viewTransform,
          worldRadius,
          arc.height,
        );
        const flicker = 0.76 + Math.sin(effect.age * 118 + arc.seed) * 0.2;
        arc.material.opacity =
          arc.opacity * globalFade * flicker * smoothStep(0, 0.06, arcProgress);
      }

      updateFlash(
        sourceFlash,
        origin,
        viewTransform,
        worldRadius,
        0.9 * globalFade * (0.78 + Math.sin(effect.age * 96) * 0.15),
        0.085 + 0.06 * easeOutCubic(progress * 3.8),
      );

      for (const impact of impacts) {
        const hitProgress = clamp(
          (effect.age - impact.arrivalSeconds) / (duration * 0.28),
          0,
          1,
        );
        const hitOpacity =
          smoothStep(0, 0.075, hitProgress) *
          (1 - smoothStep(0.38, 1, hitProgress)) *
          globalFade;
        writeCanonicalPath(
          impact.ringGeometry,
          circleAtHyperbolicRadius(
            impact.target,
            0.035 + 0.115 * easeOutCubic(hitProgress),
            14,
          ),
          viewTransform,
          worldRadius,
          EFFECT_HEIGHT + 0.042,
        );
        writeCanonicalPath(
          impact.sparkGeometry,
          radialSigilSegments(
            impact.target,
            0.025 + 0.02 * hitProgress,
            0.1 + 0.13 * hitProgress,
            7,
            impact.index * 0.6 + progress * Math.PI * 7,
          ),
          viewTransform,
          worldRadius,
          EFFECT_HEIGHT + 0.06,
        );
        impact.ringMaterial.opacity = 0.86 * hitOpacity;
        impact.sparkMaterial.opacity = 0.74 * hitOpacity;
        updateFlash(
          impact.flash,
          impact.target,
          viewTransform,
          worldRadius,
          0.95 * hitOpacity,
          0.06 + 0.1 * easeOutCubic(hitProgress),
        );
      }
    },
    dispose(): void {
      for (const arc of arcs) {
        arc.geometry.dispose();
        arc.material.dispose();
      }
      sourceFlash.geometry.dispose();
      sourceFlash.material.dispose();
      for (const impact of impacts) {
        impact.ringGeometry.dispose();
        impact.ringMaterial.dispose();
        impact.sparkGeometry.dispose();
        impact.sparkMaterial.dispose();
        impact.flash.geometry.dispose();
        impact.flash.material.dispose();
      }
    },
  };
  return effect;
}

/**
 * A single visible projectile travelling along the resolved H² geodesic. The
 * standard sniper round is compact and quick; the base uses the same physical
 * rule with a much brighter core, two moving halo rings, and a larger local
 * impact burst. Neither version leaves a continuous beam on the battlefield.
 */
function createPrecisionProjectileEffect(
  origin: Vec2,
  target: Vec2,
  worldRadius: number,
  style: PrecisionProjectileStyle,
): ActiveAttackEffect {
  const isBaseProjectile = style === 'base-projectile';
  const projectileTiming = getPrecisionProjectileTiming(style);
  const duration = projectileTiming.durationSeconds;
  const flightEnd = projectileTiming.flightEndProgress;
  const tailLength = isBaseProjectile ? 0.31 : 0.17;
  const group = createEffectGroup(
    isBaseProjectile
      ? 'base-attack-core-projectile'
      : 'tower-attack-sniper-projectile',
  );

  const createOrb = (color: number, renderOrder: number) => {
    const geometry = new THREE.IcosahedronGeometry(1, 1);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = renderOrder;
    group.add(mesh);
    return { mesh, geometry, material };
  };
  const updateOrb = (
    orb: ReturnType<typeof createOrb>,
    point: Vec2,
    opacity: number,
    radius: number,
    height: number,
  ) => {
    const viewPoint = applyMobius(viewTransform, point);
    orb.mesh.position.set(
      viewPoint.x * worldRadius,
      height,
      -viewPoint.y * worldRadius,
    );
    const intrinsicScale = Math.max(0.08, 1 - vec2LengthSquared(viewPoint));
    orb.mesh.scale.setScalar(radius * intrinsicScale);
    orb.material.opacity = clamp(opacity, 0, 1);
  };

  let viewTransform = IDENTITY_MOBIUS;
  const tailOuterGeometry = new THREE.BufferGeometry();
  const tailOuterMaterial = createLineMaterial(
    isBaseProjectile ? 0x62ffe1 : 0x46d9ff,
  );
  const tailOuter = new THREE.Line(tailOuterGeometry, tailOuterMaterial);
  tailOuter.renderOrder = EFFECT_RENDER_ORDER;
  const tailCoreGeometry = new THREE.BufferGeometry();
  const tailCoreMaterial = createLineMaterial(
    isBaseProjectile ? 0xe2fff7 : 0xdfffff,
  );
  const tailCore = new THREE.Line(tailCoreGeometry, tailCoreMaterial);
  tailCore.renderOrder = EFFECT_RENDER_ORDER + 1;
  const core = createOrb(isBaseProjectile ? 0xd6fff4 : 0xc8fbff, EFFECT_RENDER_ORDER + 3);
  const halo = createOrb(isBaseProjectile ? 0x3ef0bf : 0x4ccdf2, EFFECT_RENDER_ORDER + 2);
  const sourceFlash = createFlash(isBaseProjectile ? 0x8ffff0 : 0x8fdff7);
  const impactFlash = createFlash(isBaseProjectile ? 0xf0ffb0 : 0xe2ffff);
  const impactRingGeometry = new THREE.BufferGeometry();
  const impactRingMaterial = createLineMaterial(
    isBaseProjectile ? 0x9affd1 : 0x83eefa,
  );
  const impactRing = new THREE.LineLoop(impactRingGeometry, impactRingMaterial);
  impactRing.renderOrder = EFFECT_RENDER_ORDER + 3;
  const impactSparkGeometry = new THREE.BufferGeometry();
  const impactSparkMaterial = createLineMaterial(
    isBaseProjectile ? 0xffe47b : 0xa7ffff,
  );
  const impactSparks = new THREE.LineSegments(
    impactSparkGeometry,
    impactSparkMaterial,
  );
  impactSparks.renderOrder = EFFECT_RENDER_ORDER + 4;

  const baseHaloRingGeometry = isBaseProjectile
    ? new THREE.BufferGeometry()
    : null;
  const baseHaloRingMaterial = isBaseProjectile
    ? createLineMaterial(0x78ffdb)
    : null;
  const baseHaloRing =
    baseHaloRingGeometry && baseHaloRingMaterial
      ? new THREE.LineLoop(baseHaloRingGeometry, baseHaloRingMaterial)
      : null;
  if (baseHaloRing) {
    baseHaloRing.renderOrder = EFFECT_RENDER_ORDER + 2;
  }
  const baseSigilGeometry = isBaseProjectile
    ? new THREE.BufferGeometry()
    : null;
  const baseSigilMaterial = isBaseProjectile
    ? createLineMaterial(0xd9ff9e)
    : null;
  const baseSigil =
    baseSigilGeometry && baseSigilMaterial
      ? new THREE.LineSegments(baseSigilGeometry, baseSigilMaterial)
      : null;
  if (baseSigil) {
    baseSigil.renderOrder = EFFECT_RENDER_ORDER + 4;
  }
  const baseImpactRingGeometry = isBaseProjectile
    ? new THREE.BufferGeometry()
    : null;
  const baseImpactRingMaterial = isBaseProjectile
    ? createLineMaterial(0xffdf83)
    : null;
  const baseImpactRing =
    baseImpactRingGeometry && baseImpactRingMaterial
      ? new THREE.LineLoop(baseImpactRingGeometry, baseImpactRingMaterial)
      : null;
  if (baseImpactRing) {
    baseImpactRing.renderOrder = EFFECT_RENDER_ORDER + 2;
  }

  group.add(
    tailOuter,
    tailCore,
    sourceFlash.mesh,
    impactFlash.mesh,
    impactRing,
    impactSparks,
  );
  if (baseHaloRing && baseSigil && baseImpactRing) {
    group.add(baseHaloRing, baseSigil, baseImpactRing);
  }

  const effect: ActiveAttackEffect = {
    group,
    duration,
    age: 0,
    update(nextViewTransform): void {
      viewTransform = nextViewTransform;
      const progress = effect.age / duration;
      const flightProgress = clamp(progress / flightEnd, 0, 1);
      const projectilePoint = geodesicPoint(origin, target, flightProgress);
      const flightOpacity =
        progress < flightEnd
          ? 1 - smoothStep(0.9, 1, flightProgress)
          : 0;
      const tailStart = Math.max(0, flightProgress - tailLength);
      const tailPath = sampleGeodesicSpan(
        origin,
        target,
        isBaseProjectile ? 18 : 10,
        tailStart,
        flightProgress,
      );
      writeCanonicalPath(
        tailOuterGeometry,
        tailPath,
        nextViewTransform,
        worldRadius,
        EFFECT_HEIGHT + 0.026,
      );
      writeCanonicalPath(
        tailCoreGeometry,
        tailPath,
        nextViewTransform,
        worldRadius,
        EFFECT_HEIGHT + 0.058,
      );
      tailOuterMaterial.opacity =
        (isBaseProjectile ? 0.92 : 0.72) * flightOpacity;
      tailCoreMaterial.opacity = flightOpacity;
      updateOrb(
        halo,
        projectilePoint,
        (isBaseProjectile ? 0.54 : 0.42) * flightOpacity,
        isBaseProjectile ? 0.19 : 0.11,
        EFFECT_HEIGHT + 0.065,
      );
      updateOrb(
        core,
        projectilePoint,
        flightOpacity,
        isBaseProjectile ? 0.115 : 0.064,
        EFFECT_HEIGHT + 0.095,
      );

      const sourceCharge = 1 - smoothStep(0.07, 0.34, progress);
      updateFlash(
        sourceFlash,
        origin,
        nextViewTransform,
        worldRadius,
        (isBaseProjectile ? 1 : 0.78) * sourceCharge,
        (isBaseProjectile ? 0.18 : 0.09) * (0.8 + sourceCharge * 0.35),
      );

      if (
        baseHaloRing &&
        baseHaloRingGeometry &&
        baseHaloRingMaterial &&
        baseSigil &&
        baseSigilGeometry &&
        baseSigilMaterial
      ) {
        writeCanonicalPath(
          baseHaloRingGeometry,
          circleAtHyperbolicRadius(
            projectilePoint,
            0.075 + 0.035 * Math.sin(progress * Math.PI * 10),
            20,
          ),
          nextViewTransform,
          worldRadius,
          EFFECT_HEIGHT + 0.112,
        );
        writeCanonicalPath(
          baseSigilGeometry,
          radialSigilSegments(
            projectilePoint,
            0.03,
            0.13 + 0.035 * Math.sin(progress * Math.PI * 8),
            6,
            progress * Math.PI * 8,
          ),
          nextViewTransform,
          worldRadius,
          EFFECT_HEIGHT + 0.125,
        );
        baseHaloRingMaterial.opacity = 0.82 * flightOpacity;
        baseSigilMaterial.opacity = 0.68 * flightOpacity;
      }

      const impactProgress = clamp(
        (progress - flightEnd) / Math.max(0.001, 1 - flightEnd),
        0,
        1,
      );
      const impactOpacity =
        smoothStep(0, 0.08, impactProgress) *
        (1 - smoothStep(0.62, 1, impactProgress));
      writeCanonicalPath(
        impactRingGeometry,
        circleAtHyperbolicRadius(
          target,
          (isBaseProjectile ? 0.1 : 0.045) +
            (isBaseProjectile ? 0.23 : 0.095) * easeOutCubic(impactProgress),
          isBaseProjectile ? 28 : 18,
        ),
        nextViewTransform,
        worldRadius,
        EFFECT_HEIGHT + 0.05,
      );
      writeCanonicalPath(
        impactSparkGeometry,
        radialSigilSegments(
          target,
          0.012,
          (isBaseProjectile ? 0.26 : 0.1) * easeOutCubic(impactProgress),
          isBaseProjectile ? 10 : 5,
          Math.PI / 4 + progress * Math.PI * 4,
        ),
        nextViewTransform,
        worldRadius,
        EFFECT_HEIGHT + 0.08,
      );
      impactRingMaterial.opacity = (isBaseProjectile ? 0.98 : 0.82) * impactOpacity;
      impactSparkMaterial.opacity = (isBaseProjectile ? 0.86 : 0.7) * impactOpacity;
      updateFlash(
        impactFlash,
        target,
        nextViewTransform,
        worldRadius,
        (isBaseProjectile ? 1 : 0.82) * impactOpacity,
        (isBaseProjectile ? 0.2 : 0.085) +
          (isBaseProjectile ? 0.18 : 0.08) * easeOutCubic(impactProgress),
      );

      if (baseImpactRing && baseImpactRingGeometry && baseImpactRingMaterial) {
        writeCanonicalPath(
          baseImpactRingGeometry,
          circleAtHyperbolicRadius(
            target,
            0.16 + 0.34 * easeOutCubic(impactProgress),
            32,
          ),
          nextViewTransform,
          worldRadius,
          EFFECT_HEIGHT + 0.034,
        );
        baseImpactRingMaterial.opacity = 0.72 * impactOpacity;
      }
    },
    dispose(): void {
      tailOuterGeometry.dispose();
      tailOuterMaterial.dispose();
      tailCoreGeometry.dispose();
      tailCoreMaterial.dispose();
      core.geometry.dispose();
      core.material.dispose();
      halo.geometry.dispose();
      halo.material.dispose();
      sourceFlash.geometry.dispose();
      sourceFlash.material.dispose();
      impactFlash.geometry.dispose();
      impactFlash.material.dispose();
      impactRingGeometry.dispose();
      impactRingMaterial.dispose();
      impactSparkGeometry.dispose();
      impactSparkMaterial.dispose();
      baseHaloRingGeometry?.dispose();
      baseHaloRingMaterial?.dispose();
      baseSigilGeometry?.dispose();
      baseSigilMaterial?.dispose();
      baseImpactRingGeometry?.dispose();
      baseImpactRingMaterial?.dispose();
    },
  };
  return effect;
}

/**
 * Renders short-lived, native Three.js feedback for resolved tower attacks.
 *
 * The game remains authoritative in canonical H² coordinates; this class
 * receives a snapshot of those positions, applies the current Mobius view
 * transform every frame, and owns only disposable presentation resources.
 */
export class TowerAttackEffects {
  private readonly scene: THREE.Scene;
  private readonly worldRadius: number;
  private readonly maxActiveEffects: number;
  private readonly effects: ActiveAttackEffect[] = [];
  private disposed = false;

  constructor(
    scene: THREE.Scene,
    worldRadius: number,
    options: TowerAttackEffectsOptions = {},
  ) {
    if (!Number.isFinite(worldRadius) || worldRadius <= 0) {
      throw new RangeError('worldRadius must be a positive finite number.');
    }
    this.scene = scene;
    this.worldRadius = worldRadius;
    this.maxActiveEffects = Math.max(
      1,
      Math.floor(options.maxActiveEffects ?? 72),
    );
  }

  get activeCount(): number {
    return this.effects.length;
  }

  /**
   * Adds an attack flash immediately. Use `update` every render frame to
   * animate it and remap the canonical paths after a camera movement.
   */
  emit(
    request: TowerAttackEffectRequest,
    viewTransform: MobiusTransform = IDENTITY_MOBIUS,
  ): void {
    if (this.disposed || !isUsablePoint(request.origin)) {
      return;
    }
    const origin = normalizePoint(request.origin);
    const targets = request.targets
      .filter(isUsablePoint)
      .slice(0, MAX_EFFECT_TARGETS)
      .map(normalizePoint);
    if (targets.length === 0) {
      return;
    }

    let effect: ActiveAttackEffect;
    switch (request.kind) {
      case 'sector':
        effect = createSectorEffect(origin, targets, this.worldRadius);
        break;
      case 'prism':
        effect = createPrismEffect(origin, targets, this.worldRadius);
        break;
      case 'pulse':
        effect = createPulseEffect(
          origin,
          targets,
          request.range,
          this.worldRadius,
        );
        break;
      case 'anchor':
        effect = createAnchorEffect(
          origin,
          targets,
          request.range,
          this.worldRadius,
        );
        break;
      case 'arc':
        effect = createArcEffect(origin, targets, this.worldRadius);
        break;
      case 'sniper':
        effect = createPrecisionProjectileEffect(
          origin,
          targets[0],
          this.worldRadius,
          request.style ?? 'sniper-projectile',
        );
        break;
    }

    effect.update(viewTransform);
    this.scene.add(effect.group);
    this.effects.push(effect);
    while (this.effects.length > this.maxActiveEffects) {
      this.remove(this.effects.shift()!);
    }
  }

  /** Advances lifetimes and reapplies the current Mobius camera transform. */
  update(
    deltaTime: number,
    viewTransform: MobiusTransform = IDENTITY_MOBIUS,
  ): void {
    if (this.disposed) {
      return;
    }
    const elapsed = Number.isFinite(deltaTime) ? Math.max(0, deltaTime) : 0;
    for (let index = this.effects.length - 1; index >= 0; index -= 1) {
      const effect = this.effects[index];
      effect.age += elapsed;
      if (effect.age >= effect.duration) {
        this.effects.splice(index, 1);
        this.remove(effect);
        continue;
      }
      effect.update(viewTransform);
    }
  }

  clear(): void {
    while (this.effects.length > 0) {
      this.remove(this.effects.pop()!);
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.clear();
  }

  private remove(effect: ActiveAttackEffect): void {
    this.scene.remove(effect.group);
    effect.dispose();
  }
}
