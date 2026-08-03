import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { TowerCollection } from '../src/entities/towerCollection';
import {
  TOWER_ENCHANTMENT_KINDS,
  TOWER_ENCHANTMENT_MAX_LEVEL,
} from '../src/game/towerEnchantments';
import { getTowerStats, type TowerKind } from '../src/game/towerStats';
import { IDENTITY_MOBIUS } from '../src/math/hyperbolic';
import type { HyperbolicTile } from '../src/world/tiling';

const TILE: HyperbolicTile = {
  id: 'ring-1-tile-0',
  ring: 1,
  center: { x: 0.2, y: -0.1 },
  boundary: [
    { x: 0.1, y: -0.2 },
    { x: 0.3, y: -0.2 },
    { x: 0.3, y: 0 },
    { x: 0.1, y: 0 },
  ],
};

describe('tower collection', () => {
  it('places only one tower in a tile and transforms it with the view', () => {
    const scene = new THREE.Scene();
    const towers = new TowerCollection(scene, 5);
    const tower = towers.place(TILE, 0);

    expect(tower).not.toBeNull();
    expect(towers.place(TILE, 0)).toBeNull();
    expect(towers.has(TILE.id)).toBe(true);
    expect(scene.children).toContain(tower?.group);

    towers.update(IDENTITY_MOBIUS, 1);
    expect(tower?.group.position.x).toBeCloseTo(1);
    expect(tower?.group.position.z).toBeCloseTo(0.5);
    scene.updateMatrixWorld(true);
    const raycaster = new THREE.Raycaster(
      new THREE.Vector3(1, 3, 0.5),
      new THREE.Vector3(0, -1, 0),
    );
    expect(towers.towerAtRay(raycaster)).toBe(tower);
    towers.dispose();
  });

  it('upgrades to level three and exposes one level pip per level', () => {
    const towers = new TowerCollection(new THREE.Scene(), 5);
    const tower = towers.place(TILE, 0);
    if (!tower) {
      throw new Error('Tower was not placed.');
    }

    expect(tower.levelIndicators.map((indicator) => indicator.visible)).toEqual([
      true,
      false,
      false,
    ]);
    expect(tower.health).toBe(200);
    expect(towers.upgrade(tower)).toBe(true);
    expect(tower.health).toBe(300);
    expect(towers.upgrade(tower)).toBe(true);
    expect(tower.health).toBe(450);
    expect(towers.upgrade(tower)).toBe(false);
    expect(tower.level).toBe(3);
    expect(tower.levelIndicators.every((indicator) => indicator.visible)).toBe(
      true,
    );
    towers.dispose();
  });

  it('removes a tower and releases its tile', () => {
    const scene = new THREE.Scene();
    const towers = new TowerCollection(scene, 5);
    const tower = towers.place(TILE, 0);
    if (!tower) {
      throw new Error('Tower was not placed.');
    }

    towers.remove(tower);
    expect(towers.has(TILE.id)).toBe(false);
    expect(scene.children).not.toContain(tower.group);
    towers.dispose();
  });

  it('places every tower kind with its own combat health and visible mesh', () => {
    const towers = new TowerCollection(new THREE.Scene(), 5);
    const kinds: readonly TowerKind[] = [
      'sector',
      'prism',
      'pulse',
      'anchor',
      'arc',
    ];

    const placed = kinds.map((kind, index) => {
      const tower = towers.place(
        { ...TILE, id: `tower-kind-${index}` },
        kind,
        index,
      );
      if (!tower) {
        throw new Error(`Failed to place ${kind}.`);
      }
      return tower;
    });

    expect(placed.map((tower) => tower.kind)).toEqual(kinds);
    expect(placed.map((tower) => tower.health)).toEqual(
      kinds.map((kind) => getTowerStats(kind, 1).maxHealth),
    );
    expect(placed.every((tower) => tower.core.isMesh)).toBe(true);
    expect(towers.activeTowers()).toHaveLength(kinds.length);
    towers.dispose();
  });

  it('initializes independent five-rank enchantment tracks for every tower', () => {
    const towers = new TowerCollection(new THREE.Scene(), 5);
    const first = towers.place(TILE, 0);
    const second = towers.place({ ...TILE, id: 'enchanted-neighbor' }, 0);
    if (!first || !second) {
      throw new Error('Towers were not placed.');
    }

    expect(first.enchantments).toEqual({
      selfRepair: 0,
      allyHeal: 0,
      attackSpeed: 0,
      fortify: 0,
    });
    expect(first.enchantments).not.toBe(second.enchantments);

    for (const enchantment of TOWER_ENCHANTMENT_KINDS) {
      for (let level = 0; level < TOWER_ENCHANTMENT_MAX_LEVEL; level += 1) {
        expect(towers.upgradeEnchantment(first, enchantment)).toBe(true);
      }
      expect(first.enchantments[enchantment]).toBe(TOWER_ENCHANTMENT_MAX_LEVEL);
      expect(towers.upgradeEnchantment(first, enchantment)).toBe(false);
      expect(second.enchantments[enchantment]).toBe(0);
    }

    towers.dispose();
  });

  it('keeps an effective maximum health cap for fortify and tower ranks', () => {
    const towers = new TowerCollection(new THREE.Scene(), 5);
    const tower = towers.place(TILE, 0);
    if (!tower) {
      throw new Error('Tower was not placed.');
    }

    tower.health = 80;
    expect(tower.maxHealth).toBe(200);
    expect(towers.upgradeEnchantment(tower, 'fortify')).toBe(true);
    expect(tower.maxHealth).toBeCloseTo(224);
    // The extra capacity is granted, but the old 120 points of damage remain.
    expect(tower.health).toBeCloseTo(104);

    expect(towers.upgrade(tower)).toBe(true);
    expect(tower.maxHealth).toBeCloseTo(336);
    expect(tower.health).toBeCloseTo(216);
    towers.dispose();
  });
});
