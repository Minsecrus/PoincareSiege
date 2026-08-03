/**
 * Deterministic boundary-entry planning for authored enemy waves.
 *
 * The first three waves deliberately use only the seven visible guide
 * geodesics. Later waves still favour those guides, but use a stratified
 * perimeter sequence so a full wave cannot collapse into an arbitrary hash
 * cluster that one finite AOE field can erase at once.
 */

const TAU = Math.PI * 2;
const GOLDEN_RATIO_CONJUGATE = 0.6180339887498949;

/** Number of guide geodesics drawn around the opening battlefield. */
export const ENEMY_ENTRY_GUIDE_COUNT = 7;

/** Waves 1–3 remain an exact tutorial for the visible guide geodesics. */
export const STRICT_GUIDE_ENTRY_WAVES = 3;

const GUIDE_SECTOR_RADIANS = TAU / ENEMY_ENTRY_GUIDE_COUNT;

/**
 * Later entries are pulled this fraction of the way from a uniform perimeter
 * stratum toward its closest guide. It preserves whole-wave coverage while
 * making the seven guides remain visually meaningful.
 */
const GUIDE_ATTRACTION = 0.72;

/** Greatest possible late-wave angular distance from the nearest guide. */
export const MAX_LATE_ENTRY_GUIDE_DEVIATION_RADIANS =
  (GUIDE_SECTOR_RADIANS / 2) * GUIDE_ATTRACTION;

function assertPositiveSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive safe integer.`);
  }
}

function assertWave(wave: number): void {
  if (!Number.isSafeInteger(wave) || wave <= 0) {
    throw new RangeError('wave must be a positive safe integer.');
  }
}

function normalizeAngle(angle: number): number {
  const normalized = angle % TAU;
  return normalized < 0 ? normalized + TAU : normalized;
}

function signedAngleDelta(angle: number): number {
  const normalized = normalizeAngle(angle);
  return normalized > Math.PI ? normalized - TAU : normalized;
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a;
}

/**
 * A coprime stride visits every one of `count` perimeter strata exactly once.
 * Choosing a golden-ratio-adjacent stride also makes the beginning of the
 * spawn sequence cover distant parts of the battlefield, rather than walking
 * clockwise through neighbouring angles.
 */
function getStratifiedStride(count: number): number {
  if (count === 1) {
    return 1;
  }

  const desired = Math.min(
    count - 1,
    Math.max(1, Math.round(count * GOLDEN_RATIO_CONJUGATE)),
  );

  for (let distance = 0; distance < count; distance += 1) {
    const lower = desired - distance;
    if (lower > 0 && greatestCommonDivisor(lower, count) === 1) {
      return lower;
    }

    const upper = desired + distance;
    if (
      distance > 0 &&
      upper < count &&
      greatestCommonDivisor(upper, count) === 1
    ) {
      return upper;
    }
  }

  // One is always coprime to a positive integer. This is unreachable, but it
  // makes the invariant explicit if the search above is changed later.
  return 1;
}

function getNearestGuideAngle(angle: number): number {
  const guideIndex = Math.round(angle / GUIDE_SECTOR_RADIANS);
  return guideIndex * GUIDE_SECTOR_RADIANS;
}

/**
 * Produces a single canonical boundary angle for one authored spawn.
 *
 * `plannedCount` is required because late-wave dispersion is deliberately a
 * property of the whole wave, not a mutable random stream. Calling this for
 * every index from zero through `plannedCount - 1` yields one well-separated
 * entry per perimeter stratum.
 */
export function getEnemyEntryAngle(
  wave: number,
  spawnedIndex: number,
  plannedCount: number,
): number {
  assertWave(wave);
  assertPositiveSafeInteger(plannedCount, 'plannedCount');
  if (!Number.isSafeInteger(spawnedIndex) || spawnedIndex < 0 || spawnedIndex >= plannedCount) {
    throw new RangeError('spawnedIndex must be a safe integer within plannedCount.');
  }

  if (wave <= STRICT_GUIDE_ENTRY_WAVES) {
    return ((spawnedIndex % ENEMY_ENTRY_GUIDE_COUNT) * TAU) / ENEMY_ENTRY_GUIDE_COUNT;
  }

  const stride = getStratifiedStride(plannedCount);
  const phase = (wave * 3) % plannedCount;
  const stratum = (spawnedIndex * stride + phase) % plannedCount;
  const uniformAngle = (stratum * TAU) / plannedCount;
  const guideAngle = getNearestGuideAngle(uniformAngle);
  const guideOffset = signedAngleDelta(uniformAngle - guideAngle);

  return normalizeAngle(guideAngle + guideOffset * GUIDE_ATTRACTION);
}

/** Returns every entry angle in the authored spawn order for a whole wave. */
export function getEnemyEntryAngles(
  wave: number,
  plannedCount: number,
): readonly number[] {
  assertWave(wave);
  assertPositiveSafeInteger(plannedCount, 'plannedCount');
  return Object.freeze(
    Array.from({ length: plannedCount }, (_, spawnedIndex) =>
      getEnemyEntryAngle(wave, spawnedIndex, plannedCount),
    ),
  );
}
