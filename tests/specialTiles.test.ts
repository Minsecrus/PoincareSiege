import { describe, expect, it } from 'vitest';
import {
  createSpecialTileAssignments,
  getSpecialTileEffect,
  NEUTRAL_SPECIAL_TILE_EFFECT,
  type SpecialTileKind,
} from '../src/game/specialTiles';
import { createRegularTiling, type HyperbolicTile } from '../src/world/tiling';

function tile(id: string, ring: number): HyperbolicTile {
  return {
    id,
    ring,
    center: { x: 0, y: 0 },
    boundary: [
      { x: -0.1, y: -0.1 },
      { x: 0.1, y: -0.1 },
      { x: 0, y: 0.1 },
    ],
  };
}

describe('special tile effects', () => {
  it('uses one isolated bonus per kind and neutral values otherwise', () => {
    expect(getSpecialTileEffect('power')).toEqual({
      damageMultiplier: 1.35,
      attackIntervalMultiplier: 1,
      healingPerSecond: 0,
    });
    expect(getSpecialTileEffect('haste')).toEqual({
      damageMultiplier: 1,
      attackIntervalMultiplier: 0.75,
      healingPerSecond: 0,
    });
    expect(getSpecialTileEffect('repair')).toEqual({
      damageMultiplier: 1,
      attackIntervalMultiplier: 1,
      healingPerSecond: 18,
    });
    expect(getSpecialTileEffect(undefined)).toBe(NEUTRAL_SPECIAL_TILE_EFFECT);
    expect(getSpecialTileEffect(null)).toBe(NEUTRAL_SPECIAL_TILE_EFFECT);
    expect(getSpecialTileEffect('unknown' as SpecialTileKind)).toBe(
      NEUTRAL_SPECIAL_TILE_EFFECT,
    );
  });
});

describe('special tile assignment', () => {
  const tiles = createRegularTiling(7, 3, 4, 3).tiles;
  const kinds: readonly SpecialTileKind[] = ['power', 'haste', 'repair'];

  it('places two non-overlapping preferred-ring cells for every enabled kind', () => {
    const assignments = createSpecialTileAssignments(tiles, kinds, 731);
    const tilesById = new Map(tiles.map((entry) => [entry.id, entry]));

    expect(assignments.size).toBe(6);
    expect(new Set(assignments.keys()).size).toBe(6);
    for (const kind of kinds) {
      expect([...assignments.values()].filter((value) => value === kind)).toHaveLength(2);
    }
    for (const tileId of assignments.keys()) {
      expect([2, 3]).toContain(tilesById.get(tileId)?.ring);
    }
  });

  it('is stable across repeated calls and caller ordering', () => {
    const expected = createSpecialTileAssignments(tiles, kinds, 9182);
    const repeated = createSpecialTileAssignments(tiles, kinds, 9182);
    const reordered = createSpecialTileAssignments(
      [...tiles].reverse(),
      [...kinds].reverse(),
      9182,
    );

    expect([...repeated]).toEqual([...expected]);
    expect([...reordered]).toEqual([...expected]);
  });

  it('changes its stable placement when the seed changes', () => {
    const first = createSpecialTileAssignments(tiles, kinds, 10);
    const second = createSpecialTileAssignments(tiles, kinds, 11);
    expect([...second.keys()]).not.toEqual([...first.keys()]);
  });

  it('falls back to other non-base rings only after preferred cells', () => {
    const sparseTiles = [
      tile('base', 0),
      tile('inner-a', 1),
      tile('preferred', 2),
      tile('outer-a', 4),
    ];
    const assignments = createSpecialTileAssignments(
      sparseTiles,
      ['power'],
      42,
    );

    expect(assignments.size).toBe(2);
    expect(assignments.get('preferred')).toBe('power');
    expect(assignments.has('base')).toBe(false);
  });

  it('does not duplicate work for repeated kinds', () => {
    const assignments = createSpecialTileAssignments(
      tiles,
      ['haste', 'haste'],
      8,
    );
    expect(assignments.size).toBe(2);
    expect([...assignments.values()]).toEqual(['haste', 'haste']);
  });
});
