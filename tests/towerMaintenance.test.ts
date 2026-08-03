import { describe, expect, it } from 'vitest';
import { resolveTowerMaintenance } from '../src/game/towerMaintenance';
import type { TowerEnchantmentLevels } from '../src/game/towerEnchantments';

const NONE: TowerEnchantmentLevels = {
  selfRepair: 0,
  allyHeal: 0,
  attackSpeed: 0,
  fortify: 0,
  knockback: 0,
};

describe('tower maintenance', () => {
  it('applies self-repair and then deterministic allied healing', () => {
    const updates = resolveTowerMaintenance(
      [
        {
          id: 'repair',
          position: { x: 0, y: 0 },
          health: 50,
          maxHealth: 100,
          enchantments: { ...NONE, selfRepair: 2 },
        },
        {
          id: 'healer',
          position: { x: 0.1, y: 0 },
          health: 100,
          maxHealth: 100,
          enchantments: { ...NONE, allyHeal: 2 },
        },
      ],
      2,
    );

    expect(updates).toEqual([
      { towerId: 'repair', health: 74 },
      { towerId: 'healer', health: 100 },
    ]);
  });

  it('does not mutate input tower state or resolve invalid simulation time', () => {
    const towers = [
      {
        id: 'tower',
        position: { x: 0, y: 0 },
        health: 50,
        maxHealth: 100,
        enchantments: { ...NONE, selfRepair: 5 },
      },
    ];
    const before = structuredClone(towers);

    expect(resolveTowerMaintenance(towers, 0)).toEqual([]);
    expect(towers).toEqual(before);
  });
});
