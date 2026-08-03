import { describe, expect, it } from 'vitest';
import {
  TOWER_ENCHANTMENT_KINDS,
  TOWER_ENCHANTMENT_MAX_LEVEL,
  TOWER_ENCHANTMENT_REFUND_RATE,
  createTowerEnchantmentLevels,
  getTowerEnchantmentEffects,
  getTowerEnchantmentInvestedCost,
  getTowerEnchantmentRefund,
  getTowerEnchantmentUpgradeCost,
  getTowerEnchantmentsInvestedCost,
  getTowerEnchantmentsRefund,
  normalizeTowerEnchantmentLevel,
  normalizeTowerEnchantmentLevels,
} from '../src/game/towerEnchantments';

describe('tower enchantments', () => {
  it('starts every placed tower with four independent zero-rank enchantments', () => {
    expect(TOWER_ENCHANTMENT_KINDS).toEqual([
      'selfRepair',
      'allyHeal',
      'attackSpeed',
      'fortify',
    ]);
    expect(TOWER_ENCHANTMENT_MAX_LEVEL).toBe(5);
    expect(createTowerEnchantmentLevels()).toEqual({
      selfRepair: 0,
      allyHeal: 0,
      attackSpeed: 0,
      fortify: 0,
    });
    expect(createTowerEnchantmentLevels()).not.toBe(
      createTowerEnchantmentLevels(),
    );
  });

  it('prices every rank independently and stops upgrades at rank five', () => {
    expect(getTowerEnchantmentUpgradeCost('selfRepair', 0)).toBe(50);
    expect(getTowerEnchantmentUpgradeCost('selfRepair', 1)).toBe(80);
    expect(getTowerEnchantmentUpgradeCost('selfRepair', 4)).toBe(260);
    expect(getTowerEnchantmentUpgradeCost('allyHeal', 0)).toBe(70);
    expect(getTowerEnchantmentUpgradeCost('allyHeal', 3)).toBe(240);
    expect(getTowerEnchantmentUpgradeCost('attackSpeed', 2)).toBe(200);
    expect(getTowerEnchantmentUpgradeCost('attackSpeed', 4)).toBe(380);
    expect(getTowerEnchantmentUpgradeCost('fortify', 1)).toBe(100);
    expect(getTowerEnchantmentUpgradeCost('fortify', 4)).toBe(300);

    for (const kind of TOWER_ENCHANTMENT_KINDS) {
      expect(
        getTowerEnchantmentUpgradeCost(kind, TOWER_ENCHANTMENT_MAX_LEVEL),
      ).toBeNull();
    }
  });

  it('includes each purchased enchantment rank in investment and resale value', () => {
    const levels = {
      selfRepair: 3,
      allyHeal: 2,
      attackSpeed: 5,
      fortify: 1,
    };

    expect(getTowerEnchantmentInvestedCost('selfRepair', 3)).toBe(250);
    expect(getTowerEnchantmentInvestedCost('allyHeal', 2)).toBe(180);
    expect(getTowerEnchantmentInvestedCost('attackSpeed', 5)).toBe(1_080);
    expect(getTowerEnchantmentInvestedCost('fortify', 1)).toBe(60);
    expect(getTowerEnchantmentsInvestedCost(levels)).toBe(1_570);
    expect(TOWER_ENCHANTMENT_REFUND_RATE).toBe(0.5);
    expect(getTowerEnchantmentRefund('attackSpeed', 5)).toBe(540);
    expect(getTowerEnchantmentsRefund(levels)).toBe(785);
  });

  it('raises sale return by the same recovery fraction as further ranks are bought', () => {
    const rankOne = { ...createTowerEnchantmentLevels(), fortify: 1 };
    const rankThree = { ...rankOne, fortify: 3 };
    const addedInvestment =
      getTowerEnchantmentsInvestedCost(rankThree) -
      getTowerEnchantmentsInvestedCost(rankOne);

    expect(addedInvestment).toBe(260);
    expect(getTowerEnchantmentsRefund(rankThree)).toBe(
      getTowerEnchantmentsRefund(rankOne) +
        addedInvestment * TOWER_ENCHANTMENT_REFUND_RATE,
    );
  });

  it('normalizes malformed levels consistently for cost, investment, and effects', () => {
    expect(normalizeTowerEnchantmentLevel(Number.NaN)).toBe(0);
    expect(normalizeTowerEnchantmentLevel(-4)).toBe(0);
    expect(normalizeTowerEnchantmentLevel(3.9)).toBe(3);
    expect(normalizeTowerEnchantmentLevel(99)).toBe(5);
    expect(normalizeTowerEnchantmentLevels({ attackSpeed: 99 })).toEqual({
      selfRepair: 0,
      allyHeal: 0,
      attackSpeed: 5,
      fortify: 0,
    });
    expect(getTowerEnchantmentUpgradeCost('allyHeal', Number.NaN)).toBe(70);
    expect(getTowerEnchantmentInvestedCost('fortify', -1)).toBe(0);
  });

  it('returns neutral effects at zero and the documented combat values per rank', () => {
    expect(getTowerEnchantmentEffects(createTowerEnchantmentLevels())).toEqual({
      selfRepairPerSecond: 0,
      allyHealPerSecond: 0,
      allyHealRange: 0,
      attackIntervalMultiplier: 1,
      maxHealthMultiplier: 1,
      damageTakenMultiplier: 1,
    });

    const effects = getTowerEnchantmentEffects({
      selfRepair: 5,
      allyHeal: 3,
      attackSpeed: 4,
      fortify: 2,
    });
    expect(effects.selfRepairPerSecond).toBe(10);
    expect(effects.allyHealPerSecond).toBe(12);
    expect(effects.allyHealRange).toBe(1.5);
    expect(effects.attackIntervalMultiplier).toBeCloseTo(1 / 1.56);
    expect(effects.maxHealthMultiplier).toBeCloseTo(1.24);
    expect(effects.damageTakenMultiplier).toBeCloseTo(0.88);
  });
});
