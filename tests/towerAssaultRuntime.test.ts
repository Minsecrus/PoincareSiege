import { describe, expect, it } from 'vitest';
import { hyperbolicRadiusToPoincare } from '../src/math/hyperbolic';
import { resolveTowerAssaultFrame } from '../src/game/towerAssaultRuntime';

function pointAt(radius: number) {
  return { x: hyperbolicRadiusToPoincare(radius), y: 0 };
}

describe('tower assault runtime', () => {
  it('pauses an engaged enemy and emits hits on its own fixed timer', () => {
    const enemies = [{ id: 'enemy', position: pointAt(1), contactDamage: 125 }];
    const towers = [{ id: 'tower', position: pointAt(1.1), health: 100 }];
    const first = resolveTowerAssaultFrame(4, enemies, towers, new Map());

    expect(first.pausedEnemyIds).toEqual(['enemy']);
    expect(first.hits).toEqual([
      { enemyId: 'enemy', towerId: 'tower', damage: 25 },
    ]);
    const second = resolveTowerAssaultFrame(
      4.2,
      enemies,
      towers,
      first.clocks,
    );
    expect(second.hits).toEqual([]);

    const nextTime = second.clocks.get('enemy')?.nextAttackAt ?? 0;
    const third = resolveTowerAssaultFrame(
      nextTime,
      enemies,
      towers,
      second.clocks,
    );
    expect(third.hits).toHaveLength(1);
  });

  it('clears a timer once an enemy no longer has an attackable tower', () => {
    const previous = new Map([
      ['enemy', { targetTowerId: 'tower', nextAttackAt: 10 }],
    ]);
    const frame = resolveTowerAssaultFrame(
      5,
      [{ id: 'enemy', position: pointAt(1), contactDamage: 125 }],
      [{ id: 'tower', position: pointAt(2), health: 100 }],
      previous,
    );

    expect(frame.pausedEnemyIds).toEqual([]);
    expect(frame.clocks.size).toBe(0);
  });
});
