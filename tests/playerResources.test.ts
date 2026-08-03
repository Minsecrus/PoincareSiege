import { describe, expect, it } from 'vitest';
import {
  INITIAL_PLAYER_RESOURCES,
  canPayResources,
  createPlayerResources,
  payForTower,
  payForTowerUpgrade,
  payForSectorTower,
  payForSectorTowerUpgrade,
  payForBaseSkillUpgrade,
  payResources,
  refundResources,
  refundTower,
  refundSectorTower,
} from '../src/game/playerResources';

describe('player resources', () => {
  it('starts with five basic-tower costs available', () => {
    expect(INITIAL_PLAYER_RESOURCES).toBe(500);
    expect(createPlayerResources()).toEqual({ amount: 500 });
  });

  it('pays only affordable, whole-number costs without mutating the input', () => {
    const initial = createPlayerResources(180);

    expect(canPayResources(initial, 180)).toBe(true);
    expect(payResources(initial, 100)).toEqual({
      resources: { amount: 80 },
      paid: true,
    });
    expect(initial).toEqual({ amount: 180 });
  });

  it('leaves resources unchanged when a payment cannot be made', () => {
    const initial = createPlayerResources(79);

    const result = payResources(initial, 80);
    expect(result.paid).toBe(false);
    expect(result.resources).toBe(initial);
    expect(payResources(initial, -1).resources).toBe(initial);
    expect(payResources(initial, 1.5).resources).toBe(initial);
  });

  it('adds valid refunds without changing the previous state', () => {
    const initial = createPlayerResources(50);

    expect(refundResources(initial, 90)).toEqual({ amount: 140 });
    expect(initial).toEqual({ amount: 50 });
    expect(refundResources(initial, -1)).toBe(initial);
  });

  it('uses the shared sector-tower costs for build, upgrade, and sell', () => {
    const built = payForSectorTower(createPlayerResources(100));
    expect(built).toEqual({ resources: { amount: 0 }, paid: true });

    const upgraded = payForSectorTowerUpgrade(createPlayerResources(80), 1);
    expect(upgraded).toEqual({ resources: { amount: 0 }, paid: true });
    expect(payForSectorTowerUpgrade(createPlayerResources(999), 3)).toEqual({
      resources: { amount: 999 },
      paid: false,
    });

    expect(refundSectorTower(createPlayerResources(0), 2)).toEqual({
      amount: 90,
    });
  });

  it('uses generic catalog costs for every non-sector tower action', () => {
    expect(payForTower(createPlayerResources(130), 'prism')).toEqual({
      resources: { amount: 0 },
      paid: true,
    });
    expect(payForTower(createPlayerResources(149), 'pulse')).toEqual({
      resources: { amount: 149 },
      paid: false,
    });
    expect(payForTowerUpgrade(createPlayerResources(180), 'pulse', 2)).toEqual({
      resources: { amount: 0 },
      paid: true,
    });
    expect(payForTowerUpgrade(createPlayerResources(999), 'anchor', 3)).toEqual({
      resources: { amount: 999 },
      paid: false,
    });
    expect(refundTower(createPlayerResources(0), 'arc', 3)).toEqual({
      amount: 260,
    });
  });

  it('charges resources for each base skill rank', () => {
    expect(payForBaseSkillUpgrade(createPlayerResources(80), 0)).toEqual({
      resources: { amount: 0 },
      paid: true,
    });
    expect(payForBaseSkillUpgrade(createPlayerResources(139), 1)).toEqual({
      resources: { amount: 139 },
      paid: false,
    });
  });
});
