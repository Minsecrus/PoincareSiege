/**
 * Persistent campaign state is deliberately kept independent from the scene.
 * This lets the home screen read progress before Three.js has been created,
 * and makes the module safe to exercise in non-browser environments.
 */
export const TOTAL_CAMPAIGN_LEVELS = 7;

export const CAMPAIGN_LEVEL_IDS = [
  'level-1',
  'level-2',
  'level-3',
  'level-4',
  'level-5',
  'level-6',
  'level-7',
] as const;

export type CampaignLevelId = (typeof CAMPAIGN_LEVEL_IDS)[number];

export const CAMPAIGN_PROGRESS_STORAGE_KEY = 'poincare-siege:campaign-progress';
export const CAMPAIGN_PROGRESS_VERSION = 1;

/** A small Storage subset so callers can inject a test or unavailable store. */
export interface CampaignProgressStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface CampaignProgress {
  /** Completed ids are unique and stored in campaign order. */
  completedLevels: CampaignLevelId[];
  /** One-based index of the furthest level a player may enter. */
  highestUnlockedLevel: number;
}

interface StoredCampaignProgress extends CampaignProgress {
  version: typeof CAMPAIGN_PROGRESS_VERSION;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isCampaignLevelId(value: unknown): value is CampaignLevelId {
  return (
    typeof value === 'string' &&
    (CAMPAIGN_LEVEL_IDS as readonly string[]).includes(value)
  );
}

export function getCampaignLevelNumber(levelId: CampaignLevelId): number {
  return CAMPAIGN_LEVEL_IDS.indexOf(levelId) + 1;
}

export function getCampaignLevelId(levelNumber: number): CampaignLevelId | null {
  if (
    !Number.isSafeInteger(levelNumber) ||
    levelNumber < 1 ||
    levelNumber > TOTAL_CAMPAIGN_LEVELS
  ) {
    return null;
  }

  return CAMPAIGN_LEVEL_IDS[levelNumber - 1];
}

export function createCampaignProgress(): CampaignProgress {
  return {
    completedLevels: [],
    highestUnlockedLevel: 1,
  };
}

function isUnlockedLevel(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= TOTAL_CAMPAIGN_LEVELS
  );
}

/**
 * Turns an untrusted parsed payload into a valid campaign state. Completed
 * levels imply that their following level was unlocked, even if an older
 * saved payload omitted or understated the explicit unlock value.
 */
export function normalizeCampaignProgress(value: unknown): CampaignProgress {
  if (!isRecord(value)) {
    return createCampaignProgress();
  }

  const completed = Array.isArray(value.completedLevels)
    ? value.completedLevels.filter(isCampaignLevelId)
    : [];
  const completedLevels = [...new Set(completed)].sort(
    (left, right) =>
      getCampaignLevelNumber(left) - getCampaignLevelNumber(right),
  );
  const inferredHighestUnlockedLevel = completedLevels.reduce(
    (highest, levelId) =>
      Math.max(
        highest,
        Math.min(TOTAL_CAMPAIGN_LEVELS, getCampaignLevelNumber(levelId) + 1),
      ),
    1,
  );
  const storedHighestUnlockedLevel = isUnlockedLevel(
    value.highestUnlockedLevel,
  )
    ? value.highestUnlockedLevel
    : 1;

  return {
    completedLevels,
    highestUnlockedLevel: Math.max(
      storedHighestUnlockedLevel,
      inferredHighestUnlockedLevel,
    ),
  };
}

function isCampaignProgressStorage(
  value: unknown,
): value is CampaignProgressStorage {
  return (
    isRecord(value) &&
    typeof value.getItem === 'function' &&
    typeof value.setItem === 'function'
  );
}

function getBrowserStorage(): CampaignProgressStorage | null {
  try {
    const storage = globalThis.localStorage;
    return isCampaignProgressStorage(storage) ? storage : null;
  } catch {
    // Access to localStorage may throw in restricted browser contexts.
    return null;
  }
}

function resolveStorage(
  storage: CampaignProgressStorage | null | undefined,
): CampaignProgressStorage | null {
  if (storage === undefined) {
    return getBrowserStorage();
  }

  return isCampaignProgressStorage(storage) ? storage : null;
}

/** Reads saved progress, falling back safely when storage is unavailable. */
export function loadCampaignProgress(
  storage?: CampaignProgressStorage | null,
): CampaignProgress {
  const resolvedStorage = resolveStorage(storage);
  if (resolvedStorage === null) {
    return createCampaignProgress();
  }

  try {
    const serialized = resolvedStorage.getItem(CAMPAIGN_PROGRESS_STORAGE_KEY);
    if (typeof serialized !== 'string') {
      return createCampaignProgress();
    }

    return normalizeCampaignProgress(JSON.parse(serialized) as unknown);
  } catch {
    return createCampaignProgress();
  }
}

/**
 * Normalizes before persisting so callers cannot leave malformed state in
 * storage. Write failures are intentionally non-fatal: the returned state is
 * still usable for the current session.
 */
export function saveCampaignProgress(
  progress: CampaignProgress,
  storage?: CampaignProgressStorage | null,
): CampaignProgress {
  const normalizedProgress = normalizeCampaignProgress(progress);
  const resolvedStorage = resolveStorage(storage);
  if (resolvedStorage === null) {
    return normalizedProgress;
  }

  const storedProgress: StoredCampaignProgress = {
    version: CAMPAIGN_PROGRESS_VERSION,
    ...normalizedProgress,
  };

  try {
    resolvedStorage.setItem(
      CAMPAIGN_PROGRESS_STORAGE_KEY,
      JSON.stringify(storedProgress),
    );
  } catch {
    // Quota and privacy-mode failures should not block a finished level.
  }

  return normalizedProgress;
}

export function isCampaignLevelUnlocked(
  progress: CampaignProgress,
  levelId: CampaignLevelId,
): boolean {
  return getCampaignLevelNumber(levelId) <=
    normalizeCampaignProgress(progress).highestUnlockedLevel;
}

export function isCampaignLevelCompleted(
  progress: CampaignProgress,
  levelId: CampaignLevelId,
): boolean {
  return normalizeCampaignProgress(progress).completedLevels.includes(levelId);
}

/**
 * Marks a completed level and unlocks the immediately following one. Calling
 * it again is idempotent, and completing level seven never unlocks an eighth.
 */
export function completeCampaignLevel(
  progress: CampaignProgress,
  levelId: CampaignLevelId,
): CampaignProgress {
  const normalizedProgress = normalizeCampaignProgress(progress);
  const completedLevels = normalizedProgress.completedLevels.includes(levelId)
    ? normalizedProgress.completedLevels
    : [...normalizedProgress.completedLevels, levelId].sort(
        (left, right) =>
          getCampaignLevelNumber(left) - getCampaignLevelNumber(right),
      );
  const nextUnlock = Math.min(
    TOTAL_CAMPAIGN_LEVELS,
    getCampaignLevelNumber(levelId) + 1,
  );

  return {
    completedLevels,
    highestUnlockedLevel: Math.max(
      normalizedProgress.highestUnlockedLevel,
      nextUnlock,
    ),
  };
}

/** Completes a level and immediately attempts to persist the result. */
export function completeCampaignLevelInStorage(
  levelId: CampaignLevelId,
  storage?: CampaignProgressStorage | null,
): CampaignProgress {
  const currentProgress = loadCampaignProgress(storage);
  return saveCampaignProgress(
    completeCampaignLevel(currentProgress, levelId),
    storage,
  );
}
