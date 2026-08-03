/** Multipliers available to the simulation speed control. */
export const SUPPORTED_GAME_SPEEDS = [1, 2, 3, 6] as const;

export const DEFAULT_GAME_SPEED = 1;

export type GameSpeedMultiplier = (typeof SUPPORTED_GAME_SPEEDS)[number];

/**
 * UI-agnostic simulation-speed state. The scene can multiply simulation
 * delta time by `multiplier` while leaving rendering time unchanged.
 */
export interface GameSpeedState {
  readonly multiplier: GameSpeedMultiplier;
}

export function isSupportedGameSpeed(
  speed: number,
): speed is GameSpeedMultiplier {
  return SUPPORTED_GAME_SPEEDS.includes(speed as GameSpeedMultiplier);
}

/** Creates a valid speed state, falling back to normal speed for bad input. */
export function createGameSpeed(speed: number = DEFAULT_GAME_SPEED): GameSpeedState {
  return {
    multiplier: isSupportedGameSpeed(speed) ? speed : DEFAULT_GAME_SPEED,
  };
}

/**
 * Returns the next supported multiplier without changing the input state.
 * An externally corrupted state is recovered at normal speed.
 */
export function cycleGameSpeed(state: GameSpeedState): GameSpeedState {
  const currentIndex = SUPPORTED_GAME_SPEEDS.indexOf(state.multiplier);
  const nextMultiplier =
    currentIndex === -1
      ? DEFAULT_GAME_SPEED
      : SUPPORTED_GAME_SPEEDS[(currentIndex + 1) % SUPPORTED_GAME_SPEEDS.length];

  return { multiplier: nextMultiplier };
}
