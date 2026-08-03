export type WavePhase = 'pending' | 'active' | 'complete' | 'victory';

export interface WaveState {
  currentWave: number;
  totalWaves: number;
  phase: WavePhase;
  plannedEnemies: number;
  spawnedEnemies: number;
  remainingEnemies: number;
  paused: boolean;
}

function assertTotalWaves(totalWaves: number): void {
  if (!Number.isSafeInteger(totalWaves) || totalWaves <= 0) {
    throw new RangeError('totalWaves must be a positive safe integer.');
  }
}

/**
 * Starts a level-specific wave tracker. Every campaign level owns its own
 * authored wave count; there is no global survival-mode fallback.
 */
export function createWaveState(totalWaves: number): WaveState {
  assertTotalWaves(totalWaves);
  return {
    currentWave: 0,
    totalWaves,
    phase: 'pending',
    plannedEnemies: 0,
    spawnedEnemies: 0,
    remainingEnemies: 0,
    paused: false,
  };
}

function isEnemyCount(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function isSafeEnemyCount(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function isNonNegativeEnemyCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

/**
 * Checks the counter invariants an active wave must satisfy before accepting
 * a runtime reinforcement. This keeps a malformed external state from being
 * made even harder to settle by a later completion transition.
 */
function hasValidActiveEnemyCounts(state: WaveState): boolean {
  return (
    isSafeEnemyCount(state.plannedEnemies) &&
    isNonNegativeEnemyCount(state.spawnedEnemies) &&
    isNonNegativeEnemyCount(state.remainingEnemies) &&
    state.spawnedEnemies <= state.plannedEnemies &&
    state.remainingEnemies <= state.spawnedEnemies
  );
}

export function canStartNextWave(state: WaveState): boolean {
  return (
    !state.paused &&
    state.currentWave < state.totalWaves &&
    (state.phase === 'pending' || state.phase === 'complete')
  );
}

/** Starts the next authored wave. The caller owns the enemy-count curve. */
export function startNextWave(
  state: WaveState,
  plannedEnemies: number,
): WaveState {
  if (!canStartNextWave(state) || !isEnemyCount(plannedEnemies)) {
    return state;
  }

  return {
    ...state,
    currentWave: state.currentWave + 1,
    phase: 'active',
    plannedEnemies,
    spawnedEnemies: 0,
    remainingEnemies: 0,
  };
}

export function canSpawnEnemy(state: WaveState): boolean {
  return (
    !state.paused &&
    state.phase === 'active' &&
    state.spawnedEnemies < state.plannedEnemies
  );
}

/** Records a scheduled enemy becoming active on the battlefield. */
export function spawnEnemy(state: WaveState): WaveState {
  if (!canSpawnEnemy(state)) {
    return state;
  }

  return {
    ...state,
    spawnedEnemies: state.spawnedEnemies + 1,
    remainingEnemies: state.remainingEnemies + 1,
  };
}

/**
 * Registers enemies that are already entering the battlefield, such as
 * splitter children or a boss's immediate adds. They are deliberately added
 * to every live counter at once: no future scheduled spawn is created, and
 * `plannedEnemies - spawnedEnemies` therefore stays unchanged.
 *
 * Invalid quantities and states outside an unpaused active wave are ignored
 * by returning the original state object. This mirrors the normal state
 * transitions and keeps victory/intermission/paused states immutable.
 */
export function addActiveReinforcements(
  state: WaveState,
  count: number,
): WaveState {
  if (
    state.paused ||
    state.phase !== 'active' ||
    !isSafeEnemyCount(count) ||
    !hasValidActiveEnemyCounts(state)
  ) {
    return state;
  }

  const plannedEnemies = state.plannedEnemies + count;
  const spawnedEnemies = state.spawnedEnemies + count;
  const remainingEnemies = state.remainingEnemies + count;
  if (
    !Number.isSafeInteger(plannedEnemies) ||
    !Number.isSafeInteger(spawnedEnemies) ||
    !Number.isSafeInteger(remainingEnemies)
  ) {
    return state;
  }

  return {
    ...state,
    plannedEnemies,
    spawnedEnemies,
    remainingEnemies,
  };
}

export function isWaveComplete(state: WaveState): boolean {
  return (
    state.phase === 'active' &&
    state.spawnedEnemies === state.plannedEnemies &&
    state.remainingEnemies === 0
  );
}

/**
 * Converts a drained active wave into an intermission, or the final victory
 * state. It is public so an external simulation can settle an already-drained
 * wave after a batch update.
 */
export function completeWave(state: WaveState): WaveState {
  if (!isWaveComplete(state)) {
    return state;
  }

  return {
    ...state,
    phase: state.currentWave === state.totalWaves ? 'victory' : 'complete',
    paused: false,
  };
}

/** Records an active enemy being defeated or reaching the base. */
export function defeatEnemy(state: WaveState): WaveState {
  if (state.paused || state.phase !== 'active' || state.remainingEnemies === 0) {
    return state;
  }

  return completeWave({
    ...state,
    remainingEnemies: state.remainingEnemies - 1,
  });
}

export function hasWon(state: WaveState): boolean {
  return state.phase === 'victory';
}

/** Pausing is only meaningful before the final victory screen. */
export function togglePause(state: WaveState): WaveState {
  if (hasWon(state)) {
    return state;
  }

  return { ...state, paused: !state.paused };
}
