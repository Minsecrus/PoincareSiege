import {
  applyMobius,
  hyperbolicDistance,
  poincareToHyperboloid,
  translationToOrigin,
  type Vec2,
} from '../math/hyperbolic';
import { getTowerStats, type TowerKind } from './towerStats';

const ORIGIN: Vec2 = { x: 0, y: 0 };
const COMPARISON_EPSILON = 1e-9;
const UNIT_VECTOR_EPSILON = 1e-12;

/** Canonical, view-independent tower data used by combat resolution. */
export interface CombatTower {
  kind: TowerKind;
  level: number;
  position: Vec2;
}

/** Canonical enemy data used by combat resolution. */
export interface CombatEnemy {
  id: string;
  position: Vec2;
}

/** A speed multiplier applied for the supplied duration. */
export interface SlowEffect {
  multiplier: number;
  durationSeconds: number;
}

/** One enemy affected by the current tower attack. */
export interface TowerCombatEffect {
  enemyId: string;
  damage: number;
  slow?: SlowEffect;
}

/**
 * A deterministic combat result. `targetIds` and `effects` share the same
 * order, so a visual system can animate the exact resolved target sequence.
 */
export interface TowerCombatResolution {
  targetIds: string[];
  effects: TowerCombatEffect[];
}

interface BeamCoordinates {
  /** Signed H² distance along the forward geodesic from the tower. */
  along: number;
  /** Perpendicular H² distance to that geodesic. */
  crossTrack: number;
}

function isFinitePoint(point: Vec2): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function isWithinHyperbolicRange(
  source: Vec2,
  target: Vec2,
  range: number,
): boolean {
  return (
    Number.isFinite(range) &&
    range >= 0 &&
    hyperbolicDistance(source, target) <= range + COMPARISON_EPSILON
  );
}

function compareIds(left: CombatEnemy, right: CombatEnemy): number {
  if (left.id < right.id) {
    return -1;
  }
  if (left.id > right.id) {
    return 1;
  }
  return 0;
}

function sortByDistance(
  source: Vec2,
  enemies: readonly CombatEnemy[],
): CombatEnemy[] {
  return [...enemies].sort((left, right) => {
    const difference =
      hyperbolicDistance(source, left.position) -
      hyperbolicDistance(source, right.position);
    return Math.abs(difference) <= COMPARISON_EPSILON
      ? compareIds(left, right)
      : difference;
  });
}

/**
 * Enemies nearer the central base are considered further advanced. Stable ID
 * ordering resolves an exact H²-distance tie without relying on input order.
 */
function sortNearestToBase(enemies: readonly CombatEnemy[]): CombatEnemy[] {
  return [...enemies].sort((left, right) => {
    const difference =
      hyperbolicDistance(ORIGIN, left.position) -
      hyperbolicDistance(ORIGIN, right.position);
    return Math.abs(difference) <= COMPARISON_EPSILON
      ? compareIds(left, right)
      : difference;
  });
}

function getValidUniqueEnemies(
  enemies: readonly CombatEnemy[],
): CombatEnemy[] {
  const ids = new Set<string>();
  const validEnemies: CombatEnemy[] = [];

  for (const enemy of enemies) {
    if (
      ids.has(enemy.id) ||
      !isFinitePoint(enemy.position) ||
      typeof enemy.id !== 'string'
    ) {
      continue;
    }

    ids.add(enemy.id);
    validEnemies.push(enemy);
  }

  return validEnemies;
}

function createResolution(
  targets: readonly CombatEnemy[],
  getDamage: (index: number) => number,
  getSlow?: (index: number) => SlowEffect | undefined,
): TowerCombatResolution {
  const effects = targets.map((target, index) => {
    const slow = getSlow?.(index);
    return slow
      ? { enemyId: target.id, damage: getDamage(index), slow }
      : { enemyId: target.id, damage: getDamage(index) };
  });

  return {
    targetIds: targets.map((target) => target.id),
    effects,
  };
}

function getTowerLocalPoint(towerPosition: Vec2, point: Vec2): Vec2 {
  return applyMobius(translationToOrigin(towerPosition), point);
}

/**
 * Returns the unit tangent vector facing away from the central base. Möbius
 * translation maps the tower to the origin and preserves the local angle.
 */
function getOutwardDirection(towerPosition: Vec2): Vec2 {
  const towardBase = getTowerLocalPoint(towerPosition, ORIGIN);
  const length = Math.hypot(towardBase.x, towardBase.y);

  if (length <= UNIT_VECTOR_EPSILON) {
    // A tower at the exact centre has no preferred outward direction.
    return { x: 1, y: 0 };
  }

  return {
    x: -towardBase.x / length,
    y: -towardBase.y / length,
  };
}

function isInsideOutwardFan(
  towerPosition: Vec2,
  enemyPosition: Vec2,
  fullAngleRadians: number,
): boolean {
  if (!Number.isFinite(fullAngleRadians) || fullAngleRadians < 0) {
    return false;
  }
  if (fullAngleRadians >= Math.PI * 2 - COMPARISON_EPSILON) {
    return true;
  }

  const localEnemy = getTowerLocalPoint(towerPosition, enemyPosition);
  const enemyLength = Math.hypot(localEnemy.x, localEnemy.y);
  if (enemyLength <= UNIT_VECTOR_EPSILON) {
    return true;
  }

  const outward = getOutwardDirection(towerPosition);
  const cosine =
    (localEnemy.x * outward.x + localEnemy.y * outward.y) / enemyLength;
  return cosine >= Math.cos(fullAngleRadians / 2) - COMPARISON_EPSILON;
}

/**
 * Calculates Fermi coordinates around the forward geodesic. The input is
 * first moved to the tower's tangent frame, then expressed on the
 * hyperboloid, keeping both values in H² units.
 */
function getBeamCoordinates(
  towerPosition: Vec2,
  direction: Vec2,
  enemyPosition: Vec2,
): BeamCoordinates {
  const localEnemy = getTowerLocalPoint(towerPosition, enemyPosition);
  const hyperboloid = poincareToHyperboloid(localEnemy);
  const alongHyperboloid =
    direction.x * hyperboloid[0] + direction.y * hyperboloid[1];
  const crossHyperboloid =
    -direction.y * hyperboloid[0] + direction.x * hyperboloid[1];
  const tangent = Math.max(
    -1 + COMPARISON_EPSILON,
    Math.min(1 - COMPARISON_EPSILON, alongHyperboloid / hyperboloid[2]),
  );

  return {
    along: Math.atanh(tangent),
    crossTrack: Math.asinh(Math.abs(crossHyperboloid)),
  };
}

function resolveSector(
  tower: CombatTower,
  enemies: readonly CombatEnemy[],
): TowerCombatResolution {
  const stats = getTowerStats(tower.kind, tower.level);
  if (stats.attackMode !== 'sector') {
    return createResolution([], () => 0);
  }

  const targets = sortByDistance(
    tower.position,
    enemies.filter(
      (enemy) =>
        isWithinHyperbolicRange(tower.position, enemy.position, stats.range) &&
        isInsideOutwardFan(
          tower.position,
          enemy.position,
          stats.attackAngleRadians,
        ),
    ),
  );

  return createResolution(targets, () => stats.damage);
}

function resolvePrism(
  tower: CombatTower,
  enemies: readonly CombatEnemy[],
): TowerCombatResolution {
  const stats = getTowerStats(tower.kind, tower.level);
  if (stats.attackMode !== 'geodesic-beam') {
    return createResolution([], () => 0);
  }

  const candidates = enemies.filter((enemy) =>
    isWithinHyperbolicRange(tower.position, enemy.position, stats.range),
  );
  const primary = sortNearestToBase(candidates)[0];
  if (!primary) {
    return createResolution([], () => 0);
  }

  const primaryLocal = getTowerLocalPoint(tower.position, primary.position);
  const primaryLength = Math.hypot(primaryLocal.x, primaryLocal.y);
  if (primaryLength <= UNIT_VECTOR_EPSILON) {
    return createResolution([primary], () => stats.damage);
  }

  const direction = {
    x: primaryLocal.x / primaryLength,
    y: primaryLocal.y / primaryLength,
  };
  const beamHalfWidth = stats.beamWidth / 2;
  const piercingCandidates = candidates.filter((enemy) => {
    if (enemy.id === primary.id) {
      return true;
    }

    const beam = getBeamCoordinates(
      tower.position,
      direction,
      enemy.position,
    );
    return (
      beam.along >= -COMPARISON_EPSILON &&
      beam.along <= stats.range + COMPARISON_EPSILON &&
      beam.crossTrack <= beamHalfWidth + COMPARISON_EPSILON
    );
  });

  const extras = sortByDistance(
    tower.position,
    piercingCandidates.filter((enemy) => enemy.id !== primary.id),
  );
  const targets = [primary, ...extras].slice(0, stats.pierceCount);
  return createResolution(targets, () => stats.damage);
}

function resolvePulse(
  tower: CombatTower,
  enemies: readonly CombatEnemy[],
): TowerCombatResolution {
  const stats = getTowerStats(tower.kind, tower.level);
  if (stats.attackMode !== 'pulse') {
    return createResolution([], () => 0);
  }

  const targets = sortByDistance(
    tower.position,
    enemies.filter((enemy) =>
      isWithinHyperbolicRange(
        tower.position,
        enemy.position,
        stats.pulseRadius,
      ),
    ),
  );
  return createResolution(targets, () => stats.damage);
}

function resolveAnchor(
  tower: CombatTower,
  enemies: readonly CombatEnemy[],
): TowerCombatResolution {
  const stats = getTowerStats(tower.kind, tower.level);
  if (stats.attackMode !== 'slow-field') {
    return createResolution([], () => 0);
  }

  const targets = sortByDistance(
    tower.position,
    enemies.filter((enemy) =>
      isWithinHyperbolicRange(tower.position, enemy.position, stats.range),
    ),
  );
  const slow: SlowEffect = {
    multiplier: stats.slowMultiplier,
    durationSeconds: stats.slowDurationSeconds,
  };
  return createResolution(targets, () => stats.damage, () => slow);
}

function scaleChainDamage(damage: number, multiplier: number, hop: number): number {
  if (!Number.isFinite(damage) || damage <= 0) {
    return 0;
  }

  const scaled = damage * Math.pow(multiplier, hop);
  return Math.max(1, Math.round(scaled));
}

function resolveArc(
  tower: CombatTower,
  enemies: readonly CombatEnemy[],
): TowerCombatResolution {
  const stats = getTowerStats(tower.kind, tower.level);
  if (stats.attackMode !== 'chain-arc') {
    return createResolution([], () => 0);
  }

  const primaryCandidates = enemies.filter((enemy) =>
    isWithinHyperbolicRange(tower.position, enemy.position, stats.range),
  );
  const primary = sortNearestToBase(primaryCandidates)[0];
  if (!primary) {
    return createResolution([], () => 0);
  }

  const targets = [primary];
  // A bolt must acquire its primary target in tower range, but every later
  // hop is constrained by `chainRange` from the previous enemy instead.
  const remaining = enemies.filter((enemy) => enemy.id !== primary.id);
  while (targets.length < stats.chainCount) {
    const current = targets[targets.length - 1];
    const next = sortByDistance(
      current.position,
      remaining.filter((enemy) =>
        isWithinHyperbolicRange(
          current.position,
          enemy.position,
          stats.chainRange,
        ),
      ),
    )[0];
    if (!next) {
      break;
    }

    targets.push(next);
    remaining.splice(
      remaining.findIndex((enemy) => enemy.id === next.id),
      1,
    );
  }

  return createResolution(targets, (hop) =>
    scaleChainDamage(stats.damage, stats.chainDamageMultiplier, hop),
  );
}

/**
 * Resolves one attack without mutating tower or enemy state.
 *
 * All range checks, fan tests, beam widths, and chain hops are evaluated in
 * canonical H² coordinates. The caller can apply the returned effects in its
 * own health, status, animation, or audio systems.
 */
export function resolveTowerCombat(
  tower: CombatTower,
  enemies: readonly CombatEnemy[],
): TowerCombatResolution {
  if (!isFinitePoint(tower.position)) {
    return createResolution([], () => 0);
  }

  const validEnemies = getValidUniqueEnemies(enemies);
  switch (tower.kind) {
    case 'sector':
      return resolveSector(tower, validEnemies);
    case 'prism':
      return resolvePrism(tower, validEnemies);
    case 'pulse':
      return resolvePulse(tower, validEnemies);
    case 'anchor':
      return resolveAnchor(tower, validEnemies);
    case 'arc':
      return resolveArc(tower, validEnemies);
  }
}
