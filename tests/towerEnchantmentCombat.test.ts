import { describe, expect, it } from 'vitest';
import { hyperbolicRadiusToPoincare, type Vec2 } from '../src/math/hyperbolic';
import {
  applyTowerAllyHeal,
  applyTowerSelfRepair,
  getTowerAttackIntervalMultiplier,
  getTowerAssaultDamage,
  getTowerEnchantedMaxHealth,
  getFortifiedTowerDamage,
  getTowerIncomingDamageMultiplier,
  getTowerEnchantmentCombatStats,
  resolveAllyHealTarget,
  restoreTowerHealth,
  type AllyHealTower,
} from '../src/game/towerEnchantmentCombat';
import type { TowerEnchantmentLevels } from '../src/game/towerEnchantments';

const NO_ENCHANTMENTS: TowerEnchantmentLevels = {
  selfRepair: 0,
  allyHeal: 0,
  attackSpeed: 0,
  fortify: 0,
  knockback: 0,
};

function levels(
  overrides: Partial<TowerEnchantmentLevels>,
): TowerEnchantmentLevels {
  return { ...NO_ENCHANTMENTS, ...overrides };
}

function pointAt(radius: number, angle = 0): Vec2 {
  const diskRadius = hyperbolicRadiusToPoincare(radius);
  return {
    x: diskRadius * Math.cos(angle),
    y: diskRadius * Math.sin(angle),
  };
}

function ally(
  id: string,
  radius: number,
  health: number,
  maxHealth = 100,
): AllyHealTower {
  return { id, position: pointAt(radius), health, maxHealth };
}

describe('tower enchantment combat rules', () => {
  it('derives combat stats without changing an unenchanted tower', () => {
    expect(
      getTowerEnchantmentCombatStats(
        { maxHealth: 200, attackIntervalSeconds: 1 },
        NO_ENCHANTMENTS,
      ),
    ).toEqual({
      maxHealth: 200,
      attackIntervalSeconds: 1,
      selfRepairPerSecond: 0,
      allyHealPerSecond: 0,
      allyHealRange: 0,
      damageTakenMultiplier: 1,
    });
  });

  it('combines haste and fortify into the derived attack interval and health', () => {
    const stats = getTowerEnchantmentCombatStats(
      { maxHealth: 200, attackIntervalSeconds: 1 },
      levels({ attackSpeed: 5, fortify: 5 }),
    );

    expect(stats.maxHealth).toBeCloseTo(320);
    expect(stats.attackIntervalSeconds).toBeCloseTo(1 / 1.7);
    expect(stats.damageTakenMultiplier).toBeCloseTo(0.7);
    expect(getTowerEnchantedMaxHealth(200, levels({ fortify: 5 }))).toBeCloseTo(
      320,
    );
    expect(getTowerAttackIntervalMultiplier(levels({ attackSpeed: 5 }))).toBeCloseTo(
      1 / 1.7,
    );
    expect(getTowerIncomingDamageMultiplier(levels({ fortify: 5 }))).toBeCloseTo(
      0.7,
    );
  });

  it('repairs a tower over time and never overfills its current health cap', () => {
    const selfRepair = levels({ selfRepair: 5 });

    expect(applyTowerSelfRepair(100, 160, selfRepair, 3)).toBe(130);
    expect(applyTowerSelfRepair(155, 160, selfRepair, 3)).toBe(160);
    expect(applyTowerSelfRepair(100, 160, selfRepair, -1)).toBe(100);
    expect(restoreTowerHealth(Number.NaN, 160, 10, 1)).toBe(10);
  });

  it('uses fortify mitigation without rounding combat damage', () => {
    const fortify = levels({ fortify: 5 });

    expect(getFortifiedTowerDamage(80, NO_ENCHANTMENTS)).toBe(80);
    expect(getFortifiedTowerDamage(80, fortify)).toBeCloseTo(56);
    expect(getFortifiedTowerDamage(-20, fortify)).toBe(0);
  });

  it('stacks a bulwark shell before optional fortify while ordinary towers keep normal damage', () => {
    const fortify = levels({ fortify: 5 });

    expect(getTowerAssaultDamage('sector', 1, 80, NO_ENCHANTMENTS)).toBe(80);
    expect(
      getTowerAssaultDamage('bulwark', 1, 80, NO_ENCHANTMENTS),
    ).toBeCloseTo(46.4);
    expect(getTowerAssaultDamage('bulwark', 3, 80, fortify)).toBeCloseTo(
      21.28,
    );
  });

  it('heals the most damaged other tower in strict H² range', () => {
    const source = { id: 'source', position: pointAt(0) };
    const target = resolveAllyHealTarget(
      source,
      [
        ally('source', 0.1, 0),
        ally('full', 0.2, 100),
        ally('less-damaged', 0.4, 25),
        ally('critical', 0.9, 10),
        ally('outside', 1.5, 0),
      ],
      levels({ allyHeal: 1 }),
    );

    expect(target).toEqual({
      targetId: 'critical',
      healingPerSecond: 4,
      range: 1.2,
    });
  });

  it('uses H²-nearest and ID ordering to deterministically break heal ties', () => {
    const source = { id: 'source', position: pointAt(0) };
    const target = resolveAllyHealTarget(
      source,
      [ally('zeta', 0.8, 50), ally('alpha', 0.4, 50)],
      levels({ allyHeal: 3 }),
    );
    expect(target?.targetId).toBe('alpha');

    const idTiebreak = resolveAllyHealTarget(
      source,
      [ally('zeta', 0.4, 50), ally('alpha', 0.4, 50)],
      levels({ allyHeal: 3 }),
    );
    expect(idTiebreak?.targetId).toBe('alpha');
  });

  it('exposes the heal rate for the selected target and clamps its application', () => {
    const healer = levels({ allyHeal: 3 });
    expect(applyTowerAllyHeal(60, 100, healer, 2)).toBe(84);
    expect(applyTowerAllyHeal(95, 100, healer, 2)).toBe(100);
    expect(
      resolveAllyHealTarget(
        { id: 'source', position: pointAt(0) },
        [ally('healthy', 0.5, 100)],
        healer,
      ),
    ).toBeNull();
  });
});
