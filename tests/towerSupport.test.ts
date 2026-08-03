import { describe, expect, it } from 'vitest';
import {
  hyperbolicRadiusToPoincare,
  type Vec2,
} from '../src/math/hyperbolic';
import {
  getSupportAuraTargets,
  resolveTowerSupportAura,
  type SupportAuraTower,
} from '../src/game/towerSupport';
import type { TowerKind } from '../src/game/towerStats';

function pointAt(radius: number, angle = 0): Vec2 {
  const diskRadius = hyperbolicRadiusToPoincare(radius);
  return {
    x: diskRadius * Math.cos(angle),
    y: diskRadius * Math.sin(angle),
  };
}

function tower(
  id: string,
  kind: TowerKind,
  radius: number,
  level = 1,
  angle = 0,
): SupportAuraTower {
  return { id, kind, level, position: pointAt(radius, angle) };
}

describe('support tower aura rules', () => {
  it('finds every other tower in the source support tower H² range', () => {
    const source = tower('support', 'support', 0);
    const near = tower('near', 'sector', 0.4);
    const edge = tower('edge', 'sniper', 1.45);
    const outside = tower('outside', 'arc', 1.5);

    expect(
      getSupportAuraTargets(source, [outside, source, edge, near]).map(
        ({ id }) => id,
      ),
    ).toEqual(['near', 'edge']);
  });

  it('uses H² rather than disk-space distance for aura membership', () => {
    const source = tower('support', 'support', 0);
    // Its disk radius is only tanh(1.5 / 2), but its H² distance is 1.5,
    // just outside the level-one support range of 1.45.
    const deceptivelyClose = tower('disk-close', 'pulse', 1.5);

    expect(getSupportAuraTargets(source, [deceptivelyClose])).toEqual([]);
    expect(
      resolveTowerSupportAura(deceptivelyClose, [source]),
    ).toEqual({
      damageMultiplier: 1,
      healingPerSecond: 0,
      sourceTowerIds: [],
    });
  });

  it('takes only the strongest in-range damage and healing effects', () => {
    const target = tower('target', 'sector', 0);
    const levelOne = tower('weak', 'support', 0.8, 1);
    const levelThree = tower('strong', 'support', 2, 3);

    expect(resolveTowerSupportAura(target, [levelOne, levelThree])).toEqual({
      damageMultiplier: 1.3,
      healingPerSecond: 16,
      sourceTowerIds: ['strong'],
    });
  });

  it('excludes the target itself while allowing support towers to aid each other', () => {
    const target = tower('target-support', 'support', 0, 3);
    const ally = tower('ally-support', 'support', 1, 2);

    expect(resolveTowerSupportAura(target, [target, ally])).toEqual({
      damageMultiplier: 1.2,
      healingPerSecond: 10,
      sourceTowerIds: ['ally-support'],
    });
  });

  it('ignores non-support, duplicate, out-of-range, and invalid sources', () => {
    const target = tower('target', 'sector', 0);
    const support = tower('valid', 'support', 1, 1);
    const duplicate = tower('valid', 'support', 0.2, 3);
    const invalid = {
      ...tower('invalid', 'support', 0.2, 3),
      position: { x: Number.NaN, y: 0 },
    };

    expect(
      resolveTowerSupportAura(target, [
        support,
        duplicate,
        invalid,
        tower('weapon', 'sniper', 0.2, 3),
        tower('far', 'support', 2.2, 3),
      ]),
    ).toEqual({
      damageMultiplier: 1.12,
      healingPerSecond: 6,
      sourceTowerIds: ['valid'],
    });
  });
});
