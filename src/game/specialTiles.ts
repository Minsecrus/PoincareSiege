import type { HyperbolicTile } from '../world/tiling';

export type SpecialTileKind = 'power' | 'haste' | 'repair';

export interface SpecialTileEffect {
  readonly damageMultiplier: number;
  readonly attackIntervalMultiplier: number;
  readonly healingPerSecond: number;
}

export const NEUTRAL_SPECIAL_TILE_EFFECT: SpecialTileEffect = Object.freeze({
  damageMultiplier: 1,
  attackIntervalMultiplier: 1,
  healingPerSecond: 0,
});

export const SPECIAL_TILE_EFFECTS: Readonly<
  Record<SpecialTileKind, SpecialTileEffect>
> = Object.freeze({
  power: Object.freeze({
    damageMultiplier: 1.35,
    attackIntervalMultiplier: 1,
    healingPerSecond: 0,
  }),
  haste: Object.freeze({
    damageMultiplier: 1,
    attackIntervalMultiplier: 0.75,
    healingPerSecond: 0,
  }),
  repair: Object.freeze({
    damageMultiplier: 1,
    attackIntervalMultiplier: 1,
    healingPerSecond: 18,
  }),
});

const SPECIAL_TILE_KIND_ORDER: readonly SpecialTileKind[] = [
  'power',
  'haste',
  'repair',
];
const ASSIGNMENTS_PER_KIND = 2;

export function getSpecialTileEffect(
  kind: SpecialTileKind | null | undefined,
): SpecialTileEffect {
  if (kind === 'power' || kind === 'haste' || kind === 'repair') {
    return SPECIAL_TILE_EFFECTS[kind];
  }
  return NEUTRAL_SPECIAL_TILE_EFFECT;
}

function hashText(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  return hash >>> 0;
}

function tilePriority(tile: HyperbolicTile): number {
  return tile.ring === 2 || tile.ring === 3 ? 0 : 1;
}

/**
 * Assigns two deterministic, non-overlapping battlefield cells to every
 * unlocked special-tile kind. Rings two and three are exhausted before the
 * allocator falls back to another non-base ring.
 */
export function createSpecialTileAssignments(
  tiles: readonly HyperbolicTile[],
  availableKinds: readonly SpecialTileKind[],
  seed: number,
): ReadonlyMap<string, SpecialTileKind> {
  const normalizedSeed = Number.isFinite(seed) ? Math.trunc(seed) : 0;
  const uniqueTiles = new Map<string, HyperbolicTile>();
  for (const tile of tiles) {
    if (tile.ring > 0 && !uniqueTiles.has(tile.id)) {
      uniqueTiles.set(tile.id, tile);
    }
  }

  const enabledKinds = new Set(availableKinds);
  const assignments = new Map<string, SpecialTileKind>();

  for (const kind of SPECIAL_TILE_KIND_ORDER) {
    if (!enabledKinds.has(kind)) {
      continue;
    }

    const orderedCandidates = [...uniqueTiles.values()]
      .filter((tile) => !assignments.has(tile.id))
      .sort((left, right) => {
        const priorityDifference = tilePriority(left) - tilePriority(right);
        if (priorityDifference !== 0) {
          return priorityDifference;
        }

        const leftScore = hashText(`${normalizedSeed}:${kind}:${left.id}`);
        const rightScore = hashText(`${normalizedSeed}:${kind}:${right.id}`);
        return leftScore - rightScore || left.id.localeCompare(right.id);
      });

    for (
      let index = 0;
      index < Math.min(ASSIGNMENTS_PER_KIND, orderedCandidates.length);
      index += 1
    ) {
      assignments.set(orderedCandidates[index].id, kind);
    }
  }

  return assignments;
}
