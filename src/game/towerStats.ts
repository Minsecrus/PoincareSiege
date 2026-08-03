import {
  SECTOR_TOWER_MAX_LEVEL,
  type TowerKind,
} from './towerEconomy';

export type { TowerKind } from './towerEconomy';

/** The targeting rule used by a tower family. */
export type TowerAttackMode =
  | 'sector'
  | 'geodesic-beam'
  | 'pulse'
  | 'slow-field'
  | 'chain-arc'
  | 'single-target';

/** Values shared by every tower family. `range` is always an H² distance. */
export interface TowerStatsBase<
  Kind extends TowerKind,
  AttackMode extends TowerAttackMode,
> {
  kind: Kind;
  level: number;
  maxHealth: number;
  damage: number;
  range: number;
  attackMode: AttackMode;
  /** Seconds between attacks, pulses, or field ticks. */
  attackIntervalSeconds: number;
}

/**
 * Values used to render and resolve the sector tower's attack. `range` is a
 * hyperbolic (H²) distance, not a Poincare-disk Euclidean radius.
 */
export interface SectorTowerStats
  extends TowerStatsBase<'sector', 'sector'> {
  /** Full width of the attack sector, expressed in radians. */
  attackAngleRadians: number;
}

/** A piercing beam that follows one strict hyperbolic geodesic. */
export interface PrismTowerStats
  extends TowerStatsBase<'prism', 'geodesic-beam'> {
  /** Maximum targets hit by one beam, including its primary target. */
  pierceCount: number;
  /** Full H² cross-track width used when resolving a beam hit. */
  beamWidth: number;
}

/** A periodic circular burst centered on the tower. */
export interface PulseTowerStats extends TowerStatsBase<'pulse', 'pulse'> {
  /** H² radius of each burst; equal to the displayed targeting range. */
  pulseRadius: number;
}

/** A damage-over-time field that reduces enemy movement. */
export interface AnchorTowerStats
  extends TowerStatsBase<'anchor', 'slow-field'> {
  /** Enemy speed multiplier while the field is active; lower is stronger. */
  slowMultiplier: number;
  /** Seconds that one field tick keeps its slow active. */
  slowDurationSeconds: number;
}

/** A bolt that chains through nearby enemies by H² distance. */
export interface ArcTowerStats extends TowerStatsBase<'arc', 'chain-arc'> {
  /** Maximum targets hit by one bolt, including its primary target. */
  chainCount: number;
  /** Maximum H² distance between successive chain targets. */
  chainRange: number;
  /** Damage multiplier applied after every jump. */
  chainDamageMultiplier: number;
}

/** A long-range specialist that can damage exactly one enemy per shot. */
export interface SniperTowerStats
  extends TowerStatsBase<'sniper', 'single-target'> {}

export interface TowerStatsByKind {
  sector: SectorTowerStats;
  prism: PrismTowerStats;
  pulse: PulseTowerStats;
  anchor: AnchorTowerStats;
  arc: ArcTowerStats;
  sniper: SniperTowerStats;
}

export type TowerStats = TowerStatsByKind[TowerKind];
export type TowerStatsForKind<Kind extends TowerKind> = TowerStatsByKind[Kind];

/**
 * Presentation-neutral health information for a row of square health pips.
 * Consumers can render `totalSegments` squares and fill the first
 * `filledSegments`, without exposing a numeric health value.
 */
export interface TowerHealthSegments {
  totalSegments: number;
  filledSegments: number;
}

/** Compatibility name for callers that currently only render sector towers. */
export type SectorTowerHealthSegments = TowerHealthSegments;

export const SECTOR_TOWER_HEALTH_PER_SEGMENT = 50;

const SECTOR_STATS_BY_LEVEL: readonly SectorTowerStats[] = [
  {
    kind: 'sector',
    level: 1,
    maxHealth: 200,
    damage: 18,
    range: 1.5,
    attackMode: 'sector',
    attackIntervalSeconds: 0.65,
    attackAngleRadians: Math.PI,
  },
  {
    kind: 'sector',
    level: 2,
    maxHealth: 300,
    damage: 30,
    range: 1.8,
    attackMode: 'sector',
    attackIntervalSeconds: 0.55,
    attackAngleRadians: (10 * Math.PI) / 9,
  },
  {
    kind: 'sector',
    level: 3,
    maxHealth: 450,
    damage: 48,
    range: 2.1,
    attackMode: 'sector',
    attackIntervalSeconds: 0.45,
    attackAngleRadians: (11 * Math.PI) / 9,
  },
];

const PRISM_STATS_BY_LEVEL: readonly PrismTowerStats[] = [
  {
    kind: 'prism',
    level: 1,
    maxHealth: 180,
    damage: 36,
    range: 2.3,
    attackMode: 'geodesic-beam',
    attackIntervalSeconds: 1.1,
    pierceCount: 2,
    beamWidth: 0.16,
  },
  {
    kind: 'prism',
    level: 2,
    maxHealth: 260,
    damage: 58,
    range: 2.7,
    attackMode: 'geodesic-beam',
    attackIntervalSeconds: 0.9,
    pierceCount: 3,
    beamWidth: 0.19,
  },
  {
    kind: 'prism',
    level: 3,
    maxHealth: 360,
    damage: 84,
    range: 3.1,
    attackMode: 'geodesic-beam',
    attackIntervalSeconds: 0.72,
    pierceCount: 4,
    beamWidth: 0.22,
  },
];

const PULSE_STATS_BY_LEVEL: readonly PulseTowerStats[] = [
  {
    kind: 'pulse',
    level: 1,
    maxHealth: 280,
    damage: 34,
    range: 1.1,
    attackMode: 'pulse',
    attackIntervalSeconds: 1.55,
    pulseRadius: 1.1,
  },
  {
    kind: 'pulse',
    level: 2,
    maxHealth: 390,
    damage: 54,
    range: 1.35,
    attackMode: 'pulse',
    attackIntervalSeconds: 1.25,
    pulseRadius: 1.35,
  },
  {
    kind: 'pulse',
    level: 3,
    maxHealth: 530,
    damage: 80,
    range: 1.6,
    attackMode: 'pulse',
    attackIntervalSeconds: 1,
    pulseRadius: 1.6,
  },
];

const ANCHOR_STATS_BY_LEVEL: readonly AnchorTowerStats[] = [
  {
    kind: 'anchor',
    level: 1,
    maxHealth: 320,
    damage: 6,
    range: 1.15,
    attackMode: 'slow-field',
    attackIntervalSeconds: 1,
    slowMultiplier: 0.7,
    slowDurationSeconds: 1.25,
  },
  {
    kind: 'anchor',
    level: 2,
    maxHealth: 440,
    damage: 10,
    range: 1.4,
    attackMode: 'slow-field',
    attackIntervalSeconds: 0.82,
    slowMultiplier: 0.58,
    slowDurationSeconds: 1.5,
  },
  {
    kind: 'anchor',
    level: 3,
    maxHealth: 590,
    damage: 16,
    range: 1.65,
    attackMode: 'slow-field',
    attackIntervalSeconds: 0.68,
    slowMultiplier: 0.46,
    slowDurationSeconds: 1.75,
  },
];

const ARC_STATS_BY_LEVEL: readonly ArcTowerStats[] = [
  {
    kind: 'arc',
    level: 1,
    maxHealth: 190,
    damage: 22,
    range: 1.65,
    attackMode: 'chain-arc',
    attackIntervalSeconds: 0.78,
    chainCount: 3,
    chainRange: 0.85,
    chainDamageMultiplier: 0.8,
  },
  {
    kind: 'arc',
    level: 2,
    maxHealth: 270,
    damage: 36,
    range: 1.95,
    attackMode: 'chain-arc',
    attackIntervalSeconds: 0.62,
    chainCount: 4,
    chainRange: 1,
    chainDamageMultiplier: 0.8,
  },
  {
    kind: 'arc',
    level: 3,
    maxHealth: 370,
    damage: 54,
    range: 2.25,
    attackMode: 'chain-arc',
    attackIntervalSeconds: 0.5,
    chainCount: 5,
    chainRange: 1.15,
    chainDamageMultiplier: 0.8,
  },
];

const SNIPER_STATS_BY_LEVEL: readonly SniperTowerStats[] = [
  {
    kind: 'sniper',
    level: 1,
    maxHealth: 130,
    damage: 115,
    range: 3.2,
    attackMode: 'single-target',
    attackIntervalSeconds: 0.85,
  },
  {
    kind: 'sniper',
    level: 2,
    maxHealth: 180,
    damage: 185,
    range: 3.65,
    attackMode: 'single-target',
    attackIntervalSeconds: 0.7,
  },
  {
    kind: 'sniper',
    level: 3,
    maxHealth: 240,
    damage: 290,
    range: 4.1,
    attackMode: 'single-target',
    attackIntervalSeconds: 0.56,
  },
];

const STATS_BY_KIND: {
  readonly [Kind in TowerKind]: readonly TowerStatsForKind<Kind>[];
} = {
  sector: SECTOR_STATS_BY_LEVEL,
  prism: PRISM_STATS_BY_LEVEL,
  pulse: PULSE_STATS_BY_LEVEL,
  anchor: ANCHOR_STATS_BY_LEVEL,
  arc: ARC_STATS_BY_LEVEL,
  sniper: SNIPER_STATS_BY_LEVEL,
};

function normalizeTowerLevel(level: number): number {
  return Math.min(
    SECTOR_TOWER_MAX_LEVEL,
    Math.max(1, Math.floor(Number.isFinite(level) ? level : 1)),
  );
}

/** Returns the catalog combat values for a valid, clamped tower level. */
export function getTowerStats<Kind extends TowerKind>(
  kind: Kind,
  level: number,
): TowerStatsForKind<Kind> {
  const stats = STATS_BY_KIND[kind][normalizeTowerLevel(level) - 1];
  return { ...stats } as TowerStatsForKind<Kind>;
}

/** Returns sector tower combat values for a valid, clamped tower level. */
export function getSectorTowerStats(level: number): SectorTowerStats {
  return getTowerStats('sector', level);
}

/**
 * Converts a tower's current health into square-pip state. Invalid health is
 * treated as empty, while values above the level maximum are capped.
 */
export function getTowerHealthSegments(
  kind: TowerKind,
  level: number,
  health: number,
): TowerHealthSegments {
  const maxHealth = getTowerStats(kind, level).maxHealth;
  const clampedHealth = Number.isFinite(health)
    ? Math.min(maxHealth, Math.max(0, health))
    : 0;

  return {
    totalSegments: Math.ceil(maxHealth / SECTOR_TOWER_HEALTH_PER_SEGMENT),
    filledSegments: Math.ceil(clampedHealth / SECTOR_TOWER_HEALTH_PER_SEGMENT),
  };
}

/** Original sector-only health-pip API retained for existing callers. */
export function getSectorTowerHealthSegments(
  level: number,
  health: number,
): SectorTowerHealthSegments {
  return getTowerHealthSegments('sector', level, health);
}
