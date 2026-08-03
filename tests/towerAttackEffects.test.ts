import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { TowerAttackEffects } from '../src/entities/towerAttackEffects';
import { hyperbolicRadiusToPoincare } from '../src/math/hyperbolic';

describe('support tower attack effects', () => {
  it('emits its field pulse without requiring an enemy target', () => {
    const scene = new THREE.Scene();
    const effects = new TowerAttackEffects(scene, 10);
    const friendlyRadius = hyperbolicRadiusToPoincare(0.8);

    effects.emit({
      kind: 'support',
      origin: { x: 0, y: 0 },
      targets: [],
      supportTargets: [{ x: friendlyRadius, y: 0 }],
      range: 1.45,
    });

    expect(effects.activeCount).toBe(1);
    expect(scene.children[0]?.name).toBe('tower-support-resonance-pulse');

    effects.update(0.91);
    expect(effects.activeCount).toBe(0);
    effects.dispose();
  });

  it('emits a low-intensity bulwark shield pulse without an enemy target', () => {
    const scene = new THREE.Scene();
    const effects = new TowerAttackEffects(scene, 10);

    effects.emit({
      kind: 'bulwark',
      origin: { x: 0, y: 0 },
      targets: [],
      range: 0.9,
    });

    expect(effects.activeCount).toBe(1);
    expect(scene.children[0]?.name).toBe('tower-bulwark-shield-pulse');

    effects.update(0.99);
    expect(effects.activeCount).toBe(0);
    effects.dispose();
  });
});
