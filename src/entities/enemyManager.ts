import * as THREE from 'three';
import {
  ENEMY_KINDS,
  getEnemyType,
  type EnemyKind,
} from '../game/enemyTypes';
import {
  buildEnemyRoute,
  sampleEnemyRoute,
  type EnemyRoute,
} from '../game/enemyRoutes';
import {
  IDENTITY_MOBIUS,
  applyMobius,
  hyperbolicDistance,
  mobiusDerivativeAngle,
  vec2LengthSquared,
  type MobiusTransform,
  type Vec2,
} from '../math/hyperbolic';

/** Matches the visible route guides around the edge of the battlefield. */
export const DEFAULT_ENEMY_START_RADIUS = 4.7;
const DEFAULT_ENEMY_TYPE = getEnemyType('basic');
export const DEFAULT_ENEMY_SPEED = DEFAULT_ENEMY_TYPE.speed;
export const DEFAULT_ENEMY_HEALTH = DEFAULT_ENEMY_TYPE.baseHealth;
const DEFAULT_ENEMY_CONTACT_DAMAGE = DEFAULT_ENEMY_TYPE.contactDamage;
const DEFAULT_ENEMY_REWARD = DEFAULT_ENEMY_TYPE.reward;

/**
 * Kept as a renderer-facing alias for callers that previously selected a
 * visual directly. The enemy catalog is the sole owner of the actual union.
 */
export const ENEMY_VISUAL_KINDS = ENEMY_KINDS;
export type EnemyVisualKind = EnemyKind;

const ARRIVAL_EPSILON = 1e-8;
const REROUTE_CENTER_EPSILON = 1e-12;
const HEALTH_PIP_COUNT = 6;
const ENEMY_VISUAL_SCALE = 2;

export interface EnemySpawnOptions {
  /**
   * Direction of a generated direct route in canonical Poincare coordinates.
   * A supplied `route` owns its entry angle and makes this optional.
   */
  routeAngle?: number;
  /** Optional stable id. An id is generated when this is omitted. */
  id?: string;
  /** H2 distance from the center at which this enemy enters the battlefield. */
  startRadius?: number;
  /** H2 distance travelled per second. */
  speed?: number;
  maxHealth?: number;
  contactDamage?: number;
  reward?: number;
  /** Gameplay family. Its catalog supplies stats not explicitly overridden. */
  kind?: EnemyKind;
  /** An authored multi-leg path. Its total H2 length drives arrival timing. */
  route?: EnemyRoute;
  /** Backwards-compatible renderer alias for `kind`. */
  visualKind?: EnemyVisualKind;
}

export interface EnemyManagerOptions {
  startRadius?: number;
  speed?: number;
  maxHealth?: number;
  contactDamage?: number;
  reward?: number;
  onReachCenter?: (enemy: HyperbolicEnemy) => void;
}

/**
 * Per-frame movement modifiers keyed by active enemy id. They deliberately
 * live outside the enemy record: effects such as a slowing field belong to
 * the combat simulation, while this manager remains the canonical-motion
 * owner.
 */
export type EnemySpeedMultipliers = ReadonlyMap<string, number>;

/**
 * Public enemy state. `canonicalPosition` is always in the unwarped Poincare
 * disk; `group` is the corresponding Three.js visual after the current view
 * Mobius transform has been applied.
 */
export interface HyperbolicEnemy {
  readonly id: string;
  readonly kind: EnemyKind;
  readonly routeAngle: number;
  readonly route: EnemyRoute;
  readonly startRadius: number;
  readonly speed: number;
  readonly maxHealth: number;
  readonly contactDamage: number;
  readonly reward: number;
  readonly visualKind: EnemyVisualKind;
  health: number;
  travelledDistance: number;
  canonicalPosition: Vec2;
  readonly group: THREE.Group;
}

interface EnemyRecord
  extends Omit<HyperbolicEnemy, 'routeAngle' | 'route' | 'startRadius'> {
  routeAngle: number;
  route: EnemyRoute;
  startRadius: number;
  readonly visualScale: number;
  readonly healthPips: readonly THREE.Mesh<
    THREE.BoxGeometry,
    THREE.MeshBasicMaterial
  >[];
}

interface EnemyVisualResources {
  readonly geometries: readonly THREE.BufferGeometry[];
  readonly materials: readonly THREE.Material[];
  readonly basicBodyGeometry: THREE.BufferGeometry;
  readonly basicProwGeometry: THREE.BufferGeometry;
  readonly basicCoreGeometry: THREE.BufferGeometry;
  readonly swarmBodyGeometry: THREE.BufferGeometry;
  readonly swarmWingGeometry: THREE.BufferGeometry;
  readonly swarmCoreGeometry: THREE.BufferGeometry;
  readonly armoredBodyGeometry: THREE.BufferGeometry;
  readonly armoredPlateGeometry: THREE.BufferGeometry;
  readonly armoredCoreGeometry: THREE.BufferGeometry;
  readonly splitterLobeGeometry: THREE.BufferGeometry;
  readonly splitterShardGeometry: THREE.BufferGeometry;
  readonly splitterCoreGeometry: THREE.BufferGeometry;
  readonly raiderBodyGeometry: THREE.BufferGeometry;
  readonly raiderWingGeometry: THREE.BufferGeometry;
  readonly raiderCoreGeometry: THREE.BufferGeometry;
  readonly bossBodyGeometry: THREE.BufferGeometry;
  readonly bossRingGeometry: THREE.BufferGeometry;
  readonly bossSpikeGeometry: THREE.BufferGeometry;
  readonly bossCoreGeometry: THREE.BufferGeometry;
  readonly healthPipGeometry: THREE.BoxGeometry;
  readonly basicBodyMaterial: THREE.MeshStandardMaterial;
  readonly basicProwMaterial: THREE.MeshStandardMaterial;
  readonly basicCoreMaterial: THREE.MeshStandardMaterial;
  readonly swarmBodyMaterial: THREE.MeshStandardMaterial;
  readonly swarmWingMaterial: THREE.MeshStandardMaterial;
  readonly swarmCoreMaterial: THREE.MeshStandardMaterial;
  readonly armoredBodyMaterial: THREE.MeshStandardMaterial;
  readonly armoredPlateMaterial: THREE.MeshStandardMaterial;
  readonly armoredCoreMaterial: THREE.MeshStandardMaterial;
  readonly splitterLobeMaterial: THREE.MeshStandardMaterial;
  readonly splitterShardMaterial: THREE.MeshStandardMaterial;
  readonly splitterCoreMaterial: THREE.MeshStandardMaterial;
  readonly raiderBodyMaterial: THREE.MeshStandardMaterial;
  readonly raiderWingMaterial: THREE.MeshStandardMaterial;
  readonly raiderCoreMaterial: THREE.MeshStandardMaterial;
  readonly bossBodyMaterial: THREE.MeshStandardMaterial;
  readonly bossRingMaterial: THREE.MeshStandardMaterial;
  readonly bossSpikeMaterial: THREE.MeshStandardMaterial;
  readonly bossCoreMaterial: THREE.MeshStandardMaterial;
  readonly healthPipFullMaterial: THREE.MeshBasicMaterial;
  readonly healthPipEmptyMaterial: THREE.MeshBasicMaterial;
}

interface EnemyVisual {
  group: THREE.Group;
  visualScale: number;
  healthPips: readonly THREE.Mesh<
    THREE.BoxGeometry,
    THREE.MeshBasicMaterial
  >[];
}

interface EnemyVisualLayout {
  visualScale: number;
  healthPipHeight: number;
}

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive finite number.`);
  }
}

function assertNonNegativeFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative finite number.`);
  }
}

function assertReroutePosition(point: Vec2): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new RangeError('canonicalPosition must use finite coordinates.');
  }

  const radiusSquared = vec2LengthSquared(point);
  if (radiusSquared >= 1) {
    throw new RangeError(
      'canonicalPosition must be strictly inside the Poincare disk.',
    );
  }
  if (radiusSquared <= REROUTE_CENTER_EPSILON) {
    throw new RangeError('canonicalPosition cannot be the base center.');
  }
}

function resolveEnemyKind(kind: EnemyKind | undefined): EnemyKind {
  if (kind === undefined) {
    return 'basic';
  }
  if (!ENEMY_KINDS.includes(kind)) {
    throw new RangeError(`Unsupported enemy kind "${kind}".`);
  }
  return kind;
}

function createVisualResources(): EnemyVisualResources {
  // Resource instances are deliberately shared between units. That keeps
  // swarm-heavy waves inexpensive and lets the manager dispose every GPU
  // resource exactly once when the battlefield is torn down.
  const basicBodyGeometry = new THREE.IcosahedronGeometry(0.24, 1);
  const basicProwGeometry = new THREE.ConeGeometry(0.12, 0.38, 5);
  const basicCoreGeometry = new THREE.SphereGeometry(0.085, 12, 8);
  const swarmBodyGeometry = new THREE.OctahedronGeometry(0.19, 0);
  const swarmWingGeometry = new THREE.ConeGeometry(0.065, 0.24, 3);
  const swarmCoreGeometry = new THREE.SphereGeometry(0.055, 10, 6);
  const armoredBodyGeometry = new THREE.DodecahedronGeometry(0.27, 0);
  const armoredPlateGeometry = new THREE.BoxGeometry(0.3, 0.075, 0.105);
  const armoredCoreGeometry = new THREE.SphereGeometry(0.075, 12, 8);
  const splitterLobeGeometry = new THREE.IcosahedronGeometry(0.18, 0);
  const splitterShardGeometry = new THREE.TetrahedronGeometry(0.065, 0);
  const splitterCoreGeometry = new THREE.SphereGeometry(0.065, 10, 6);
  const raiderBodyGeometry = new THREE.ConeGeometry(0.15, 0.48, 4);
  const raiderWingGeometry = new THREE.BoxGeometry(0.2, 0.035, 0.19);
  const raiderCoreGeometry = new THREE.SphereGeometry(0.055, 10, 6);
  const bossBodyGeometry = new THREE.IcosahedronGeometry(0.37, 1);
  const bossRingGeometry = new THREE.TorusGeometry(0.35, 0.035, 8, 24);
  const bossSpikeGeometry = new THREE.ConeGeometry(0.11, 0.3, 5);
  const bossCoreGeometry = new THREE.SphereGeometry(0.11, 14, 10);
  const healthPipGeometry = new THREE.BoxGeometry(0.095, 0.018, 0.05);

  // The basic palette stays red/pink so existing waves retain their current
  // appearance. The other kinds deliberately use high-saturation silhouettes
  // that stay legible against the teal battlefield.
  const basicBodyMaterial = new THREE.MeshStandardMaterial({
    color: 0xff3d63,
    emissive: 0x7a001c,
    emissiveIntensity: 0.92,
    metalness: 0.42,
    roughness: 0.3,
  });
  const basicProwMaterial = new THREE.MeshStandardMaterial({
    color: 0xd91e4d,
    emissive: 0x5d0018,
    emissiveIntensity: 0.82,
    metalness: 0.52,
    roughness: 0.26,
  });
  const basicCoreMaterial = new THREE.MeshStandardMaterial({
    color: 0xffe17a,
    emissive: 0xff4f12,
    emissiveIntensity: 1.9,
    metalness: 0.12,
    roughness: 0.14,
  });
  const swarmBodyMaterial = new THREE.MeshStandardMaterial({
    color: 0xffd43b,
    emissive: 0x8f4500,
    emissiveIntensity: 1.15,
    metalness: 0.34,
    roughness: 0.26,
  });
  const swarmWingMaterial = new THREE.MeshStandardMaterial({
    color: 0xff8f18,
    emissive: 0x702000,
    emissiveIntensity: 0.8,
    metalness: 0.5,
    roughness: 0.22,
  });
  const swarmCoreMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffb2,
    emissive: 0xff9800,
    emissiveIntensity: 2.1,
    roughness: 0.1,
  });
  const armoredBodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x4059ff,
    emissive: 0x09177c,
    emissiveIntensity: 0.82,
    metalness: 0.76,
    roughness: 0.22,
  });
  const armoredPlateMaterial = new THREE.MeshStandardMaterial({
    color: 0x7d9bff,
    emissive: 0x152c8c,
    emissiveIntensity: 0.54,
    metalness: 0.88,
    roughness: 0.16,
  });
  const armoredCoreMaterial = new THREE.MeshStandardMaterial({
    color: 0x8dfff5,
    emissive: 0x00d8ca,
    emissiveIntensity: 1.8,
    roughness: 0.12,
  });
  const splitterLobeMaterial = new THREE.MeshStandardMaterial({
    color: 0xf044ff,
    emissive: 0x70007d,
    emissiveIntensity: 1.12,
    metalness: 0.42,
    roughness: 0.23,
  });
  const splitterShardMaterial = new THREE.MeshStandardMaterial({
    color: 0xa86aff,
    emissive: 0x3b006b,
    emissiveIntensity: 1.0,
    metalness: 0.58,
    roughness: 0.2,
  });
  const splitterCoreMaterial = new THREE.MeshStandardMaterial({
    color: 0xfff58f,
    emissive: 0xffb300,
    emissiveIntensity: 2.1,
    roughness: 0.1,
  });
  const raiderBodyMaterial = new THREE.MeshStandardMaterial({
    color: 0xff592c,
    emissive: 0x8c1200,
    emissiveIntensity: 1.08,
    metalness: 0.58,
    roughness: 0.18,
  });
  const raiderWingMaterial = new THREE.MeshStandardMaterial({
    color: 0xffba45,
    emissive: 0x7c3300,
    emissiveIntensity: 0.9,
    metalness: 0.7,
    roughness: 0.16,
  });
  const raiderCoreMaterial = new THREE.MeshStandardMaterial({
    color: 0xfff4a3,
    emissive: 0xff6d00,
    emissiveIntensity: 2.2,
    roughness: 0.1,
  });
  const bossBodyMaterial = new THREE.MeshStandardMaterial({
    color: 0xe5256b,
    emissive: 0x740026,
    emissiveIntensity: 1.08,
    metalness: 0.54,
    roughness: 0.24,
  });
  const bossRingMaterial = new THREE.MeshStandardMaterial({
    color: 0xffb33b,
    emissive: 0xc33d00,
    emissiveIntensity: 1.45,
    metalness: 0.7,
    roughness: 0.18,
  });
  const bossSpikeMaterial = new THREE.MeshStandardMaterial({
    color: 0xff6a37,
    emissive: 0x8f1400,
    emissiveIntensity: 1.0,
    metalness: 0.64,
    roughness: 0.18,
  });
  const bossCoreMaterial = new THREE.MeshStandardMaterial({
    color: 0xffff9c,
    emissive: 0xff6a00,
    emissiveIntensity: 2.4,
    roughness: 0.08,
  });
  // Basic materials keep health readable even when the enemy is near the dim
  // horizon, where scene lights are intentionally subdued.
  const healthPipFullMaterial = new THREE.MeshBasicMaterial({
    color: 0xb6ff8a,
  });
  const healthPipEmptyMaterial = new THREE.MeshBasicMaterial({
    color: 0x542231,
  });

  return {
    geometries: [
      basicBodyGeometry,
      basicProwGeometry,
      basicCoreGeometry,
      swarmBodyGeometry,
      swarmWingGeometry,
      swarmCoreGeometry,
      armoredBodyGeometry,
      armoredPlateGeometry,
      armoredCoreGeometry,
      splitterLobeGeometry,
      splitterShardGeometry,
      splitterCoreGeometry,
      raiderBodyGeometry,
      raiderWingGeometry,
      raiderCoreGeometry,
      bossBodyGeometry,
      bossRingGeometry,
      bossSpikeGeometry,
      bossCoreGeometry,
      healthPipGeometry,
    ],
    materials: [
      basicBodyMaterial,
      basicProwMaterial,
      basicCoreMaterial,
      swarmBodyMaterial,
      swarmWingMaterial,
      swarmCoreMaterial,
      armoredBodyMaterial,
      armoredPlateMaterial,
      armoredCoreMaterial,
      splitterLobeMaterial,
      splitterShardMaterial,
      splitterCoreMaterial,
      raiderBodyMaterial,
      raiderWingMaterial,
      raiderCoreMaterial,
      bossBodyMaterial,
      bossRingMaterial,
      bossSpikeMaterial,
      bossCoreMaterial,
      healthPipFullMaterial,
      healthPipEmptyMaterial,
    ],
    basicBodyGeometry,
    basicProwGeometry,
    basicCoreGeometry,
    swarmBodyGeometry,
    swarmWingGeometry,
    swarmCoreGeometry,
    armoredBodyGeometry,
    armoredPlateGeometry,
    armoredCoreGeometry,
    splitterLobeGeometry,
    splitterShardGeometry,
    splitterCoreGeometry,
    raiderBodyGeometry,
    raiderWingGeometry,
    raiderCoreGeometry,
    bossBodyGeometry,
    bossRingGeometry,
    bossSpikeGeometry,
    bossCoreGeometry,
    healthPipGeometry,
    basicBodyMaterial,
    basicProwMaterial,
    basicCoreMaterial,
    swarmBodyMaterial,
    swarmWingMaterial,
    swarmCoreMaterial,
    armoredBodyMaterial,
    armoredPlateMaterial,
    armoredCoreMaterial,
    splitterLobeMaterial,
    splitterShardMaterial,
    splitterCoreMaterial,
    raiderBodyMaterial,
    raiderWingMaterial,
    raiderCoreMaterial,
    bossBodyMaterial,
    bossRingMaterial,
    bossSpikeMaterial,
    bossCoreMaterial,
    healthPipFullMaterial,
    healthPipEmptyMaterial,
  };
}

function addVisualMesh(
  group: THREE.Group,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position: readonly [number, number, number],
  rotation?: readonly [number, number, number],
): THREE.Mesh<THREE.BufferGeometry, THREE.Material> {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  if (rotation) {
    mesh.rotation.set(...rotation);
  }
  mesh.castShadow = true;
  group.add(mesh);
  return mesh;
}

function createEnemyModel(
  group: THREE.Group,
  visualKind: EnemyVisualKind,
  resources: EnemyVisualResources,
): EnemyVisualLayout {
  switch (visualKind) {
    case 'basic':
      addVisualMesh(
        group,
        resources.basicBodyGeometry,
        resources.basicBodyMaterial,
        [0, 0.24, 0],
      );
      addVisualMesh(
        group,
        resources.basicProwGeometry,
        resources.basicProwMaterial,
        [0, 0.24, 0.27],
        [Math.PI / 2, 0, 0],
      );
      addVisualMesh(
        group,
        resources.basicCoreGeometry,
        resources.basicCoreMaterial,
        [0, 0.24, 0.055],
      );
      return { visualScale: 1, healthPipHeight: 0.61 };

    case 'swarm':
      addVisualMesh(
        group,
        resources.swarmBodyGeometry,
        resources.swarmBodyMaterial,
        [0, 0.2, 0],
      );
      addVisualMesh(
        group,
        resources.swarmWingGeometry,
        resources.swarmWingMaterial,
        [-0.13, 0.19, -0.055],
        [Math.PI / 2, 0, -0.38],
      );
      addVisualMesh(
        group,
        resources.swarmWingGeometry,
        resources.swarmWingMaterial,
        [0.13, 0.19, -0.055],
        [Math.PI / 2, 0, 0.38],
      );
      addVisualMesh(
        group,
        resources.swarmCoreGeometry,
        resources.swarmCoreMaterial,
        [0, 0.205, 0.11],
      );
      return { visualScale: 0.78, healthPipHeight: 0.52 };

    case 'armored':
      addVisualMesh(
        group,
        resources.armoredBodyGeometry,
        resources.armoredBodyMaterial,
        [0, 0.27, 0],
      );
      addVisualMesh(
        group,
        resources.armoredPlateGeometry,
        resources.armoredPlateMaterial,
        [0, 0.28, 0.18],
      );
      addVisualMesh(
        group,
        resources.armoredPlateGeometry,
        resources.armoredPlateMaterial,
        [0, 0.28, -0.18],
        [0, Math.PI / 2, 0],
      );
      addVisualMesh(
        group,
        resources.armoredCoreGeometry,
        resources.armoredCoreMaterial,
        [0, 0.29, 0.23],
      );
      return { visualScale: 1.22, healthPipHeight: 0.78 };

    case 'splitter':
      addVisualMesh(
        group,
        resources.splitterLobeGeometry,
        resources.splitterLobeMaterial,
        [-0.115, 0.22, 0.015],
        [0, 0.26, 0.2],
      );
      addVisualMesh(
        group,
        resources.splitterLobeGeometry,
        resources.splitterLobeMaterial,
        [0.115, 0.22, 0.015],
        [0, -0.26, -0.2],
      );
      addVisualMesh(
        group,
        resources.splitterShardGeometry,
        resources.splitterShardMaterial,
        [0, 0.32, -0.12],
        [0.22, 0, 0.3],
      );
      addVisualMesh(
        group,
        resources.splitterCoreGeometry,
        resources.splitterCoreMaterial,
        [0, 0.22, 0.16],
      );
      return { visualScale: 1.06, healthPipHeight: 0.66 };

    case 'raider':
      addVisualMesh(
        group,
        resources.raiderBodyGeometry,
        resources.raiderBodyMaterial,
        [0, 0.2, 0.1],
        [Math.PI / 2, 0, 0],
      );
      addVisualMesh(
        group,
        resources.raiderWingGeometry,
        resources.raiderWingMaterial,
        [-0.17, 0.17, -0.07],
        [0, 0, -0.38],
      );
      addVisualMesh(
        group,
        resources.raiderWingGeometry,
        resources.raiderWingMaterial,
        [0.17, 0.17, -0.07],
        [0, 0, 0.38],
      );
      addVisualMesh(
        group,
        resources.raiderCoreGeometry,
        resources.raiderCoreMaterial,
        [0, 0.2, 0.17],
      );
      return { visualScale: 0.96, healthPipHeight: 0.56 };

    case 'boss':
      addVisualMesh(
        group,
        resources.bossBodyGeometry,
        resources.bossBodyMaterial,
        [0, 0.36, 0],
      );
      addVisualMesh(
        group,
        resources.bossRingGeometry,
        resources.bossRingMaterial,
        [0, 0.36, 0],
        [Math.PI / 2, 0, 0],
      );
      addVisualMesh(
        group,
        resources.bossSpikeGeometry,
        resources.bossSpikeMaterial,
        [0, 0.36, 0.34],
        [Math.PI / 2, 0, 0],
      );
      addVisualMesh(
        group,
        resources.bossSpikeGeometry,
        resources.bossSpikeMaterial,
        [0, 0.36, -0.34],
        [-Math.PI / 2, 0, 0],
      );
      addVisualMesh(
        group,
        resources.bossCoreGeometry,
        resources.bossCoreMaterial,
        [0, 0.36, 0.18],
      );
      return { visualScale: 2.15, healthPipHeight: 1.08 };
  }

  throw new Error(`Unhandled enemy visual kind "${visualKind}".`);
}

function createEnemyVisual(
  id: string,
  visualKind: EnemyVisualKind,
  resources: EnemyVisualResources,
): EnemyVisual {
  const group = new THREE.Group();
  group.name = `enemy-${id}`;
  group.userData.enemyId = id;
  group.userData.enemyVisualKind = visualKind;
  const layout = createEnemyModel(group, visualKind, resources);

  const healthPips: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>[] =
    [];
  const gap = 0.018;
  const healthWidth = HEALTH_PIP_COUNT * 0.095 + (HEALTH_PIP_COUNT - 1) * gap;
  for (let index = 0; index < HEALTH_PIP_COUNT; index += 1) {
    const pip = new THREE.Mesh(
      resources.healthPipGeometry,
      resources.healthPipFullMaterial,
    );
    pip.position.set(
      index * (0.095 + gap) - healthWidth / 2 + 0.095 / 2,
      layout.healthPipHeight,
      0,
    );
    pip.renderOrder = 2;
    group.add(pip);
    healthPips.push(pip);
  }

  return { group, visualScale: layout.visualScale, healthPips };
}

/**
 * Keeps enemy simulation in canonical hyperbolic coordinates and only warps
 * visuals for the player's Mobius camera transform.
 */
export class EnemyManager {
  private readonly scene: THREE.Scene;
  private readonly worldRadius: number;
  private readonly defaultStartRadius: number;
  private readonly defaultSpeed: number;
  private readonly defaultMaxHealth: number;
  private readonly defaultContactDamage: number;
  private readonly defaultReward: number;
  private readonly hasDefaultSpeedOverride: boolean;
  private readonly hasDefaultMaxHealthOverride: boolean;
  private readonly hasDefaultContactDamageOverride: boolean;
  private readonly hasDefaultRewardOverride: boolean;
  private readonly onReachCenter?: (enemy: HyperbolicEnemy) => void;
  private readonly enemies = new Map<string, EnemyRecord>();
  private readonly visualResources = createVisualResources();
  private nextId = 1;
  private disposed = false;

  constructor(
    scene: THREE.Scene,
    worldRadius: number,
    options: EnemyManagerOptions = {},
  ) {
    assertPositiveFinite(worldRadius, 'worldRadius');
    const startRadius = options.startRadius ?? DEFAULT_ENEMY_START_RADIUS;
    const speed = options.speed ?? DEFAULT_ENEMY_SPEED;
    const maxHealth = options.maxHealth ?? DEFAULT_ENEMY_HEALTH;
    const contactDamage =
      options.contactDamage ?? DEFAULT_ENEMY_CONTACT_DAMAGE;
    const reward = options.reward ?? DEFAULT_ENEMY_REWARD;
    assertPositiveFinite(startRadius, 'startRadius');
    assertNonNegativeFinite(speed, 'speed');
    assertPositiveFinite(maxHealth, 'maxHealth');
    assertNonNegativeFinite(contactDamage, 'contactDamage');
    assertNonNegativeFinite(reward, 'reward');

    this.scene = scene;
    this.worldRadius = worldRadius;
    this.defaultStartRadius = startRadius;
    this.defaultSpeed = speed;
    this.defaultMaxHealth = maxHealth;
    this.defaultContactDamage = contactDamage;
    this.defaultReward = reward;
    this.hasDefaultSpeedOverride = options.speed !== undefined;
    this.hasDefaultMaxHealthOverride = options.maxHealth !== undefined;
    this.hasDefaultContactDamageOverride = options.contactDamage !== undefined;
    this.hasDefaultRewardOverride = options.reward !== undefined;
    this.onReachCenter = options.onReachCenter;
  }

  get activeCount(): number {
    return this.enemies.size;
  }

  getActiveCount(): number {
    return this.enemies.size;
  }

  get(id: string): HyperbolicEnemy | null {
    return this.enemies.get(id) ?? null;
  }

  /** Returns a snapshot so callers cannot modify the active-enemy collection. */
  activeEnemies(): readonly HyperbolicEnemy[] {
    return Array.from(this.enemies.values());
  }

  spawn(
    options: EnemySpawnOptions,
    viewTransform: MobiusTransform = IDENTITY_MOBIUS,
  ): HyperbolicEnemy {
    if (this.disposed) {
      throw new Error('Cannot spawn an enemy after EnemyManager.dispose().');
    }
    if (
      options.kind !== undefined &&
      options.visualKind !== undefined &&
      options.kind !== options.visualKind
    ) {
      throw new RangeError('kind and visualKind must match when both are supplied.');
    }

    const kind = resolveEnemyKind(options.kind ?? options.visualKind);
    const type = getEnemyType(kind);
    const requestedRouteAngle = options.route?.entryAngle ?? options.routeAngle;
    if (
      requestedRouteAngle === undefined ||
      !Number.isFinite(requestedRouteAngle)
    ) {
      throw new RangeError('routeAngle must be a finite number.');
    }

    const requestedStartRadius = options.startRadius ?? this.defaultStartRadius;
    assertPositiveFinite(requestedStartRadius, 'startRadius');
    const route =
      options.route ??
      buildEnemyRoute({
        entryAngle: requestedRouteAngle,
        startRadius: requestedStartRadius,
      });
    const startRadius = route.startRadius;
    const speed =
      options.speed ??
      (this.hasDefaultSpeedOverride ? this.defaultSpeed : type.speed);
    const maxHealth =
      options.maxHealth ??
      (this.hasDefaultMaxHealthOverride
        ? this.defaultMaxHealth
        : type.baseHealth);
    const contactDamage =
      options.contactDamage ??
      (this.hasDefaultContactDamageOverride
        ? this.defaultContactDamage
        : type.contactDamage);
    const reward =
      options.reward ??
      (this.hasDefaultRewardOverride ? this.defaultReward : type.reward);
    assertNonNegativeFinite(speed, 'speed');
    assertPositiveFinite(maxHealth, 'maxHealth');
    assertNonNegativeFinite(contactDamage, 'contactDamage');
    assertNonNegativeFinite(reward, 'reward');

    const id = this.resolveId(options.id);
    const canonicalPosition = sampleEnemyRoute(route, 0);
    const visual = createEnemyVisual(id, kind, this.visualResources);
    const enemy: EnemyRecord = {
      id,
      kind,
      routeAngle: route.entryAngle,
      route,
      startRadius,
      speed,
      maxHealth,
      contactDamage,
      reward,
      visualKind: kind,
      health: maxHealth,
      travelledDistance: 0,
      canonicalPosition,
      group: visual.group,
      visualScale: visual.visualScale,
      healthPips: visual.healthPips,
    };

    this.enemies.set(id, enemy);
    this.scene.add(enemy.group);
    this.updateVisual(enemy, viewTransform);
    return enemy;
  }

  /**
   * Advances each enemy in H2 distance, then applies the camera-only Mobius
   * transform to its Three.js group. Reached enemies are removed and returned.
   */
  update(
    deltaTime: number,
    viewTransform: MobiusTransform = IDENTITY_MOBIUS,
    speedMultipliers?: EnemySpeedMultipliers,
  ): HyperbolicEnemy[] {
    if (this.disposed) {
      return [];
    }
    const safeDeltaTime = Number.isFinite(deltaTime)
      ? Math.max(0, deltaTime)
      : 0;
    const reached: EnemyRecord[] = [];

    for (const enemy of this.enemies.values()) {
      const requestedMultiplier = speedMultipliers?.get(enemy.id) ?? 1;
      const speedMultiplier =
        Number.isFinite(requestedMultiplier) && requestedMultiplier >= 0
          ? requestedMultiplier
          : 1;
      enemy.travelledDistance = Math.min(
        enemy.route.totalLength,
        enemy.travelledDistance +
          enemy.speed * speedMultiplier * safeDeltaTime,
      );
      this.updateCanonicalPosition(enemy);
      this.updateVisual(enemy, viewTransform);

      if (
        enemy.travelledDistance >=
        enemy.route.totalLength - ARRIVAL_EPSILON
      ) {
        reached.push(enemy);
      }
    }

    for (const enemy of reached) {
      this.detach(enemy);
      this.onReachCenter?.(enemy);
    }
    return reached;
  }

  /**
   * Discards an active enemy's previous path and starts a newly generated
   * route from a canonical disk position. The new path keeps the enemy's
   * movement behavior and deterministic variation, but is otherwise wholly
   * independent of the route it was following before the displacement.
   */
  rerouteFromPosition(
    enemyOrId: HyperbolicEnemy | string,
    canonicalPosition: Vec2,
    viewTransform: MobiusTransform = IDENTITY_MOBIUS,
  ): HyperbolicEnemy | null {
    assertReroutePosition(canonicalPosition);

    const enemy = this.resolveEnemy(enemyOrId);
    if (!enemy) {
      return null;
    }

    const route = buildEnemyRoute({
      behavior: enemy.route.behavior,
      seed: enemy.route.seed,
      entryAngle: Math.atan2(canonicalPosition.y, canonicalPosition.x),
      startRadius: hyperbolicDistance(canonicalPosition, { x: 0, y: 0 }),
    });
    enemy.route = route;
    enemy.routeAngle = route.entryAngle;
    enemy.startRadius = route.startRadius;
    enemy.travelledDistance = 0;
    this.updateCanonicalPosition(enemy);
    this.updateVisual(enemy, viewTransform);
    return enemy;
  }

  /** Removes an enemy without treating it as an arrival at the base. */
  remove(enemyOrId: HyperbolicEnemy | string): HyperbolicEnemy | null {
    const enemy = this.resolveEnemy(enemyOrId);
    if (!enemy) {
      return null;
    }
    this.detach(enemy);
    return enemy;
  }

  /** Semantic alias for tower/combat systems. */
  defeat(enemyOrId: HyperbolicEnemy | string): HyperbolicEnemy | null {
    return this.remove(enemyOrId);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    for (const enemy of this.enemies.values()) {
      this.scene.remove(enemy.group);
    }
    this.enemies.clear();
    for (const geometry of new Set(this.visualResources.geometries)) {
      geometry.dispose();
    }
    for (const material of new Set(this.visualResources.materials)) {
      material.dispose();
    }
  }

  private resolveId(requestedId: string | undefined): string {
    if (requestedId !== undefined) {
      if (requestedId.length === 0) {
        throw new RangeError('Enemy id cannot be empty.');
      }
      if (this.enemies.has(requestedId)) {
        throw new Error(`An active enemy already has id "${requestedId}".`);
      }
      return requestedId;
    }

    let id = `enemy-${this.nextId}`;
    while (this.enemies.has(id)) {
      this.nextId += 1;
      id = `enemy-${this.nextId}`;
    }
    this.nextId += 1;
    return id;
  }

  private resolveEnemy(
    enemyOrId: HyperbolicEnemy | string,
  ): EnemyRecord | null {
    const id = typeof enemyOrId === 'string' ? enemyOrId : enemyOrId.id;
    return this.enemies.get(id) ?? null;
  }

  private detach(enemy: EnemyRecord): void {
    this.scene.remove(enemy.group);
    this.enemies.delete(enemy.id);
  }

  private updateCanonicalPosition(enemy: EnemyRecord): void {
    enemy.canonicalPosition = sampleEnemyRoute(
      enemy.route,
      enemy.travelledDistance,
    );
  }

  private updateVisual(
    enemy: EnemyRecord,
    viewTransform: MobiusTransform,
  ): void {
    const viewPoint = applyMobius(viewTransform, enemy.canonicalPosition);
    const intrinsicScale =
      ENEMY_VISUAL_SCALE *
      enemy.visualScale *
      Math.max(0.065, 1.12 * (1 - vec2LengthSquared(viewPoint)));
    const heading =
      enemy.routeAngle + Math.PI +
      mobiusDerivativeAngle(viewTransform, enemy.canonicalPosition);

    enemy.group.position.set(
      viewPoint.x * this.worldRadius,
      0.075,
      -viewPoint.y * this.worldRadius,
    );
    enemy.group.scale.setScalar(intrinsicScale);
    enemy.group.rotation.y = Math.PI / 2 + heading;
    this.updateHealthPips(enemy);
  }

  /** Synchronises the compact, number-free health display with game state. */
  private updateHealthPips(enemy: EnemyRecord): void {
    const healthRatio = Number.isFinite(enemy.health)
      ? THREE.MathUtils.clamp(enemy.health / enemy.maxHealth, 0, 1)
      : 0;
    const filledPips = Math.ceil(healthRatio * enemy.healthPips.length);
    for (const [index, pip] of enemy.healthPips.entries()) {
      pip.material =
        index < filledPips
          ? this.visualResources.healthPipFullMaterial
          : this.visualResources.healthPipEmptyMaterial;
    }
  }
}
