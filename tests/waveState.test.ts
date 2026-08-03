import { describe, expect, it } from 'vitest';
import {
  TOTAL_WAVES,
  addActiveReinforcements,
  canSpawnEnemy,
  canStartNextWave,
  completeWave,
  createWaveState,
  defeatEnemy,
  hasWon,
  isWaveComplete,
  spawnEnemy,
  startNextWave,
  togglePause,
} from '../src/game/waveState';

describe('wave state', () => {
  it('starts before wave one with twenty waves available', () => {
    expect(createWaveState()).toEqual({
      currentWave: 0,
      totalWaves: TOTAL_WAVES,
      phase: 'pending',
      plannedEnemies: 0,
      spawnedEnemies: 0,
      remainingEnemies: 0,
      paused: false,
    });
    expect(canStartNextWave(createWaveState())).toBe(true);
  });

  it('starts a wave and accounts for each spawned enemy', () => {
    const active = startNextWave(createWaveState(), 3);
    expect(active).toMatchObject({
      currentWave: 1,
      phase: 'active',
      plannedEnemies: 3,
      spawnedEnemies: 0,
      remainingEnemies: 0,
    });

    const afterSpawn = spawnEnemy(active);
    expect(afterSpawn).toMatchObject({ spawnedEnemies: 1, remainingEnemies: 1 });
    expect(active).toMatchObject({ spawnedEnemies: 0, remainingEnemies: 0 });
  });

  it('does not spawn more enemies than the wave contains', () => {
    let state = startNextWave(createWaveState(), 1);
    state = spawnEnemy(state);

    expect(canSpawnEnemy(state)).toBe(false);
    expect(spawnEnemy(state)).toBe(state);
  });

  it('adds already-active reinforcements without changing the unsent count', () => {
    let state = startNextWave(createWaveState(), 4);
    state = spawnEnemy(state);
    state = spawnEnemy(state);
    state = defeatEnemy(state);
    const unsentBefore = state.plannedEnemies - state.spawnedEnemies;

    const reinforced = addActiveReinforcements(state, 3);

    expect(reinforced).toMatchObject({
      phase: 'active',
      plannedEnemies: 7,
      spawnedEnemies: 5,
      remainingEnemies: 4,
    });
    expect(reinforced.plannedEnemies - reinforced.spawnedEnemies).toBe(
      unsentBefore,
    );
    expect(state).toMatchObject({
      plannedEnemies: 4,
      spawnedEnemies: 2,
      remainingEnemies: 1,
    });
    expect(reinforced).not.toBe(state);
  });

  it('does not turn already-active reinforcements into future scheduled spawns', () => {
    const fullySpawned = spawnEnemy(startNextWave(createWaveState(), 1));
    const reinforced = addActiveReinforcements(fullySpawned, 2);

    expect(reinforced).toMatchObject({
      plannedEnemies: 3,
      spawnedEnemies: 3,
      remainingEnemies: 3,
    });
    expect(canSpawnEnemy(reinforced)).toBe(false);
  });

  it('rejects invalid reinforcement quantities and malformed active counters', () => {
    const active = spawnEnemy(startNextWave(createWaveState(), 2));
    for (const count of [
      0,
      -1,
      1.5,
      Number.NaN,
      Number.NEGATIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      expect(addActiveReinforcements(active, count)).toBe(active);
    }

    const malformed = {
      ...active,
      plannedEnemies: 1,
      spawnedEnemies: 2,
      remainingEnemies: 1,
    };
    expect(addActiveReinforcements(malformed, 1)).toBe(malformed);

    const nearLimit = {
      ...active,
      plannedEnemies: Number.MAX_SAFE_INTEGER,
    };
    expect(addActiveReinforcements(nearLimit, 1)).toBe(nearLimit);
  });

  it('does not mutate pending, paused, complete, or victory states with reinforcements', () => {
    const pending = createWaveState();
    const paused = togglePause(startNextWave(createWaveState(), 1));
    const complete = defeatEnemy(spawnEnemy(startNextWave(createWaveState(), 1)));

    let victory = createWaveState();
    for (let wave = 1; wave <= TOTAL_WAVES; wave += 1) {
      victory = defeatEnemy(spawnEnemy(startNextWave(victory, 1)));
    }

    for (const state of [pending, paused, complete, victory]) {
      expect(addActiveReinforcements(state, 1)).toBe(state);
    }
    expect(complete.phase).toBe('complete');
    expect(victory.phase).toBe('victory');
  });

  it('only completes once every enemy has spawned and then been defeated', () => {
    let state = startNextWave(createWaveState(), 2);
    state = spawnEnemy(state);
    state = defeatEnemy(state);
    expect(state.phase).toBe('active');
    expect(isWaveComplete(state)).toBe(false);

    state = spawnEnemy(state);
    state = defeatEnemy(state);
    expect(state.phase).toBe('complete');
    expect(state.remainingEnemies).toBe(0);
    expect(isWaveComplete(state)).toBe(false);
  });

  it('does not force completion while enemies are still alive', () => {
    const active = spawnEnemy(startNextWave(createWaveState(), 1));

    expect(completeWave(active)).toBe(active);
  });

  it('allows the next wave only after an intermission', () => {
    let state = startNextWave(createWaveState(), 1);
    expect(startNextWave(state, 2)).toBe(state);

    state = defeatEnemy(spawnEnemy(state));
    const next = startNextWave(state, 2);
    expect(next).toMatchObject({ currentWave: 2, phase: 'active', plannedEnemies: 2 });
  });

  it('toggles pause and prevents simulation transitions while paused', () => {
    const active = startNextWave(createWaveState(), 1);
    const paused = togglePause(active);

    expect(paused.paused).toBe(true);
    expect(spawnEnemy(paused)).toBe(paused);
    expect(defeatEnemy(paused)).toBe(paused);
    expect(togglePause(paused).paused).toBe(false);
  });

  it('reaches victory after the twentieth completed wave and cannot restart', () => {
    let state = createWaveState();
    for (let wave = 1; wave <= TOTAL_WAVES; wave += 1) {
      state = startNextWave(state, 1);
      state = spawnEnemy(state);
      state = defeatEnemy(state);
    }

    expect(state).toMatchObject({
      currentWave: TOTAL_WAVES,
      phase: 'victory',
      paused: false,
    });
    expect(hasWon(state)).toBe(true);
    expect(canStartNextWave(state)).toBe(false);
    expect(togglePause(state)).toBe(state);
  });
});
