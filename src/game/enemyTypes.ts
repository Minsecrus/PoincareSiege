/**
 * Gameplay catalog for every enemy family.  Movement speed belongs to the
 * family and is deliberately never derived from the current wave: difficulty
 * ramps through health, composition, and count instead.
 */
export const ENEMY_KINDS = [
  'basic',
  'swarm',
  'armored',
  'splitter',
  'raider',
  'boss',
] as const;

export type EnemyKind = (typeof ENEMY_KINDS)[number];

/** Route-planner identifiers. The runtime owns the corresponding movement. */
export const ENEMY_MOVEMENT_BEHAVIORS = [
  'direct',
  'flock',
  'split-on-death',
  'flank',
  'siege',
] as const;

export type EnemyMovementBehavior =
  (typeof ENEMY_MOVEMENT_BEHAVIORS)[number];

/** How a wave planner should think about a family's battlefield population. */
export const ENEMY_SPAWN_COUNT_INTENTS = [
  'swarm',
  'standard',
  'elite',
  'boss',
] as const;

export type EnemySpawnCountIntent =
  (typeof ENEMY_SPAWN_COUNT_INTENTS)[number];

export interface EnemyVisualPalette {
  /** Three.js-compatible hexadecimal color values. */
  readonly body: number;
  readonly accent: number;
  readonly core: number;
  readonly healthFull: number;
  readonly healthEmpty: number;
}

/** A stable model selector for the entity renderer; it is not a display name. */
export type EnemyModelId =
  | 'scout'
  | 'swarm-drone'
  | 'armored-shell'
  | 'splitter-core'
  | 'raider-wing'
  | 'geodesic-colossus';

export interface EnemyVisualProfile {
  readonly model: EnemyModelId;
  readonly palette: EnemyVisualPalette;
  /** Relative model scale before the Poincare projection's size correction. */
  readonly modelScale: number;
}

export interface EnemySpawnProfile {
  /** The first wave in which this family may appear. */
  readonly minimumWave: number;
  /** Relative selection likelihood among families eligible in a normal wave. */
  readonly weight: number;
  /** Population role exposed to a composition planner. */
  readonly countIntent: EnemySpawnCountIntent;
  /** Multiplier against a wave's normal enemy-count budget. */
  readonly countMultiplier: number;
  /** Restricts special families, such as bosses, to recurring milestone waves. */
  readonly everyNWaves?: number;
}

/** Extra spawns emitted after an enemy is defeated. */
export interface EnemySpawnChildrenOnDefeat {
  readonly kind: 'spawn-children';
  readonly childKind: EnemyKind;
  readonly count: number;
  /** Applied to the child's otherwise wave-scaled maximum health. */
  readonly healthMultiplier: number;
}

export interface EnemyTypeDefinition {
  readonly kind: EnemyKind;
  /** Fixed H² distance per second; waves must never scale this value. */
  readonly speed: number;
  /** Maximum health before the authored wave multiplier is applied. */
  readonly baseHealth: number;
  /** Base-health damage if this enemy reaches the central base. */
  readonly contactDamage: number;
  /** Whole resources awarded when this family is defeated. */
  readonly reward: number;
  readonly movementBehavior: EnemyMovementBehavior;
  readonly spawn: EnemySpawnProfile;
  readonly visual: EnemyVisualProfile;
  readonly onDefeat?: EnemySpawnChildrenOnDefeat;
}

const HEALTH_FULL = 0xb6ff8a;
const HEALTH_EMPTY = 0x542231;

/**
 * The baseline keeps the existing 100 HP / 0.1 H² per-second scout intact.
 * Later families trade visible threat, count, path behavior, or durability;
 * none derive their speed from wave number.
 */
const ENEMY_TYPES: Readonly<Record<EnemyKind, EnemyTypeDefinition>> = {
  basic: {
    kind: 'basic',
    speed: 0.1,
    baseHealth: 100,
    contactDamage: 125,
    reward: 6,
    movementBehavior: 'direct',
    spawn: {
      minimumWave: 1,
      weight: 12,
      countIntent: 'standard',
      countMultiplier: 1,
    },
    visual: {
      model: 'scout',
      palette: {
        body: 0xff3d63,
        accent: 0xd91e4d,
        core: 0xffe17a,
        healthFull: HEALTH_FULL,
        healthEmpty: HEALTH_EMPTY,
      },
      modelScale: 1,
    },
  },
  swarm: {
    kind: 'swarm',
    speed: 0.13,
    baseHealth: 46,
    contactDamage: 48,
    reward: 3,
    movementBehavior: 'flock',
    spawn: {
      minimumWave: 2,
      weight: 9,
      countIntent: 'swarm',
      countMultiplier: 1.6,
    },
    visual: {
      model: 'swarm-drone',
      palette: {
        body: 0xffc53d,
        accent: 0xff7a18,
        core: 0xfff0a3,
        healthFull: HEALTH_FULL,
        healthEmpty: HEALTH_EMPTY,
      },
      modelScale: 0.76,
    },
  },
  armored: {
    kind: 'armored',
    speed: 0.055,
    // Durable enough to remain an elite target once wave health scaling starts,
    // without making late-wave armored packs absorb the entire battle.
    baseHealth: 260,
    contactDamage: 260,
    reward: 18,
    movementBehavior: 'direct',
    spawn: {
      minimumWave: 3,
      weight: 4,
      countIntent: 'elite',
      countMultiplier: 0.45,
    },
    visual: {
      model: 'armored-shell',
      palette: {
        body: 0x8b5cf6,
        accent: 0x4c1d95,
        core: 0xd8b4fe,
        healthFull: HEALTH_FULL,
        healthEmpty: HEALTH_EMPTY,
      },
      modelScale: 1.34,
    },
  },
  splitter: {
    kind: 'splitter',
    speed: 0.08,
    baseHealth: 160,
    contactDamage: 145,
    reward: 12,
    movementBehavior: 'split-on-death',
    spawn: {
      minimumWave: 4,
      weight: 4,
      countIntent: 'elite',
      countMultiplier: 0.65,
    },
    visual: {
      model: 'splitter-core',
      palette: {
        body: 0xff4fd8,
        accent: 0xa21caf,
        core: 0xffbcf7,
        healthFull: HEALTH_FULL,
        healthEmpty: HEALTH_EMPTY,
      },
      modelScale: 1.08,
    },
    onDefeat: {
      kind: 'spawn-children',
      childKind: 'swarm',
      count: 2,
      healthMultiplier: 0.5,
    },
  },
  raider: {
    kind: 'raider',
    speed: 0.15,
    baseHealth: 82,
    contactDamage: 110,
    reward: 8,
    movementBehavior: 'flank',
    spawn: {
      minimumWave: 5,
      weight: 5,
      countIntent: 'standard',
      countMultiplier: 0.85,
    },
    visual: {
      model: 'raider-wing',
      palette: {
        body: 0x35d0ff,
        accent: 0x075985,
        core: 0xc4f6ff,
        healthFull: HEALTH_FULL,
        healthEmpty: HEALTH_EMPTY,
      },
      modelScale: 0.92,
    },
  },
  boss: {
    kind: 'boss',
    speed: 0.04,
    // A Boss is a large, high-impact encounter with two reinforcement stages.
    // Milestone waves are intentionally allowed to create a visible threat
    // spike instead of flattening the whole twenty-wave curve.
    // Bosses retain their milestone threat and reinforcement stages, but their
    // wave-scaled health should not eclipse every other enemy in the wave.
    baseHealth: 1_000,
    contactDamage: 500,
    reward: 60,
    movementBehavior: 'siege',
    spawn: {
      minimumWave: 5,
      weight: 1,
      countIntent: 'boss',
      countMultiplier: 1,
      everyNWaves: 5,
    },
    visual: {
      model: 'geodesic-colossus',
      palette: {
        body: 0xff5a36,
        accent: 0x7f1d1d,
        core: 0xffd166,
        healthFull: 0xd8ff70,
        healthEmpty: 0x5b1d28,
      },
      modelScale: 2.15,
    },
  },
};

/** Read-only catalog for UI previews and static planner inspection. */
export const ENEMY_TYPE_CATALOG = ENEMY_TYPES;

function normalizeWave(wave: number): number {
  return Number.isFinite(wave) ? Math.max(1, Math.floor(wave)) : 1;
}

function cloneTypeDefinition(definition: EnemyTypeDefinition): EnemyTypeDefinition {
  return {
    ...definition,
    spawn: { ...definition.spawn },
    visual: {
      ...definition.visual,
      palette: { ...definition.visual.palette },
    },
    ...(definition.onDefeat === undefined
      ? {}
      : { onDefeat: { ...definition.onDefeat } }),
  };
}

/** True only for one of the catalog keys. */
export function isEnemyKind(value: unknown): value is EnemyKind {
  return typeof value === 'string' && ENEMY_KINDS.includes(value as EnemyKind);
}

/** Returns an isolated copy so a renderer or planner cannot mutate the catalog. */
export function getEnemyType(kind: EnemyKind): EnemyTypeDefinition {
  return cloneTypeDefinition(ENEMY_TYPES[kind]);
}

/** Whether the family may be picked during this wave. */
export function isEnemyTypeEligibleForWave(
  kind: EnemyKind,
  wave: number,
): boolean {
  const definition = ENEMY_TYPES[kind];
  const normalizedWave = normalizeWave(wave);
  const interval = definition.spawn.everyNWaves;
  return (
    normalizedWave >= definition.spawn.minimumWave &&
    (interval === undefined || normalizedWave % interval === 0)
  );
}

/** Stable key-order list of every family available to a wave composition planner. */
export function getEligibleEnemyKinds(wave: number): EnemyKind[] {
  return ENEMY_KINDS.filter((kind) => isEnemyTypeEligibleForWave(kind, wave));
}

/**
 * Converts a normal-wave enemy budget into a family-sized spawn count. Bosses
 * are always singular; invalid budgets produce zero rather than bad spawns.
 */
export function getEnemySpawnCount(
  kind: EnemyKind,
  normalWaveCount: number,
): number {
  if (!Number.isFinite(normalWaveCount) || normalWaveCount <= 0) {
    return 0;
  }
  const definition = ENEMY_TYPES[kind];
  if (definition.spawn.countIntent === 'boss') {
    return 1;
  }
  return Math.max(
    1,
    Math.round(Math.floor(normalWaveCount) * definition.spawn.countMultiplier),
  );
}

/**
 * Deterministically selects an eligible type using a normalized random sample.
 * Non-finite samples safely choose the first eligible family; callers can use
 * this with a seeded hash and still retain reproducible compositions.
 */
export function selectEnemyKindForWave(
  wave: number,
  sample: number,
): EnemyKind {
  const eligible = getEligibleEnemyKinds(wave);
  const candidates: readonly EnemyKind[] =
    eligible.length > 0 ? eligible : ['basic'];
  const totalWeight = candidates.reduce(
    (sum, kind) => sum + ENEMY_TYPES[kind].spawn.weight,
    0,
  );
  const normalizedSample = Number.isFinite(sample)
    ? Math.min(Math.max(sample, 0), 1 - Number.EPSILON)
    : 0;
  const target = normalizedSample * totalWeight;
  let cursor = 0;
  for (const kind of candidates) {
    cursor += ENEMY_TYPES[kind].spawn.weight;
    if (target < cursor) {
      return kind;
    }
  }
  return candidates[candidates.length - 1];
}
