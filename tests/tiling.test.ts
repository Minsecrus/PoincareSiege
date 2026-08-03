import { describe, expect, it } from 'vitest';
import { hyperbolicDistance } from '../src/math/hyperbolic';
import { createRegularTiling } from '../src/world/tiling';

describe('{7,3} regular tiling', () => {
  const tiling = createRegularTiling(7, 3, 4, 5);

  it('has the expected coordination sequence', () => {
    const counts = Array.from({ length: 5 }, (_, ring) =>
      tiling.tiles.filter((tile) => tile.ring === ring).length,
    );
    expect(counts).toEqual([1, 7, 21, 56, 147]);
  });

  it('places every first-ring tile at the same hyperbolic distance', () => {
    const distances = tiling.tiles
      .filter((tile) => tile.ring === 1)
      .map((tile) => hyperbolicDistance({ x: 0, y: 0 }, tile.center));

    expect(distances).toHaveLength(7);
    for (const distance of distances) {
      expect(distance).toBeCloseTo(2 * tiling.inradius, 9);
    }
  });

  it('keeps every sampled boundary point inside the ideal disk', () => {
    for (const tile of tiling.tiles) {
      for (const point of tile.boundary) {
        expect(point.x * point.x + point.y * point.y).toBeLessThan(1);
      }
    }
  });
});
