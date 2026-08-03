export interface Vec2 {
  x: number;
  y: number;
}

export type HyperPoint = readonly [x: number, y: number, time: number];
export type Mat3 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export interface MobiusTransform {
  alpha: Vec2;
  beta: Vec2;
}

const EPSILON = 1e-12;

export const IDENTITY_MAT3: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export const IDENTITY_MOBIUS: MobiusTransform = {
  alpha: { x: 1, y: 0 },
  beta: { x: 0, y: 0 },
};

export function vec2LengthSquared(value: Vec2): number {
  return value.x * value.x + value.y * value.y;
}

export function vec2Length(value: Vec2): number {
  return Math.sqrt(vec2LengthSquared(value));
}

export function clampToDisk(value: Vec2, maxRadius = 1 - 1e-9): Vec2 {
  const radius = vec2Length(value);
  if (radius <= maxRadius) {
    return value;
  }

  const scale = maxRadius / Math.max(radius, EPSILON);
  return { x: value.x * scale, y: value.y * scale };
}

export function poincareToHyperboloid(point: Vec2): HyperPoint {
  const safePoint = clampToDisk(point);
  const radiusSquared = vec2LengthSquared(safePoint);
  const denominator = 1 - radiusSquared;

  return [
    (2 * safePoint.x) / denominator,
    (2 * safePoint.y) / denominator,
    (1 + radiusSquared) / denominator,
  ];
}

export function hyperboloidToPoincare(point: HyperPoint): Vec2 {
  const denominator = point[2] + 1;
  return {
    x: point[0] / denominator,
    y: point[1] / denominator,
  };
}

export function minkowskiDot(a: HyperPoint, b: HyperPoint): number {
  return a[0] * b[0] + a[1] * b[1] - a[2] * b[2];
}

export function hyperbolicDistance(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const numerator = 2 * (dx * dx + dy * dy);
  const denominator =
    (1 - vec2LengthSquared(a)) * (1 - vec2LengthSquared(b));
  const coshDistance = 1 + numerator / Math.max(denominator, EPSILON);
  return Math.acosh(Math.max(1, coshDistance));
}

export function hyperbolicRadiusToPoincare(radius: number): number {
  return Math.tanh(radius / 2);
}

export function geodesicInterpolate(
  start: HyperPoint,
  end: HyperPoint,
  amount: number,
): HyperPoint {
  const clampedAmount = Math.min(1, Math.max(0, amount));
  const distance = Math.acosh(Math.max(1, -minkowskiDot(start, end)));

  if (distance < 1e-9) {
    return [...start] as HyperPoint;
  }

  const denominator = Math.sinh(distance);
  const startWeight = Math.sinh((1 - clampedAmount) * distance) / denominator;
  const endWeight = Math.sinh(clampedAmount * distance) / denominator;

  return [
    startWeight * start[0] + endWeight * end[0],
    startWeight * start[1] + endWeight * end[1],
    startWeight * start[2] + endWeight * end[2],
  ];
}

export function applyMat3(matrix: Mat3, point: HyperPoint): HyperPoint {
  return [
    matrix[0] * point[0] + matrix[1] * point[1] + matrix[2] * point[2],
    matrix[3] * point[0] + matrix[4] * point[1] + matrix[5] * point[2],
    matrix[6] * point[0] + matrix[7] * point[1] + matrix[8] * point[2],
  ];
}

export function multiplyMat3(outer: Mat3, inner: Mat3): Mat3 {
  const result = new Array<number>(9).fill(0);

  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      result[row * 3 + column] =
        outer[row * 3] * inner[column] +
        outer[row * 3 + 1] * inner[3 + column] +
        outer[row * 3 + 2] * inner[6 + column];
    }
  }

  return result as unknown as Mat3;
}

export function reflectionMatrix(unitNormal: HyperPoint): Mat3 {
  const metricNormal: HyperPoint = [
    unitNormal[0],
    unitNormal[1],
    -unitNormal[2],
  ];
  const result = [...IDENTITY_MAT3] as number[];

  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      result[row * 3 + column] -=
        2 * unitNormal[row] * metricNormal[column];
    }
  }

  return result as unknown as Mat3;
}

function complexAdd(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

function complexMultiply(a: Vec2, b: Vec2): Vec2 {
  return {
    x: a.x * b.x - a.y * b.y,
    y: a.x * b.y + a.y * b.x,
  };
}

function complexConjugate(value: Vec2): Vec2 {
  return { x: value.x, y: -value.y };
}

function complexDivide(numerator: Vec2, denominator: Vec2): Vec2 {
  const denominatorSquared = Math.max(vec2LengthSquared(denominator), EPSILON);
  return {
    x:
      (numerator.x * denominator.x + numerator.y * denominator.y) /
      denominatorSquared,
    y:
      (numerator.y * denominator.x - numerator.x * denominator.y) /
      denominatorSquared,
  };
}

export function applyMobius(transform: MobiusTransform, point: Vec2): Vec2 {
  const numerator = complexAdd(
    complexMultiply(transform.alpha, point),
    transform.beta,
  );
  const denominator = complexAdd(
    complexMultiply(complexConjugate(transform.beta), point),
    complexConjugate(transform.alpha),
  );

  return clampToDisk(complexDivide(numerator, denominator));
}

export function composeMobius(
  outer: MobiusTransform,
  inner: MobiusTransform,
): MobiusTransform {
  const alpha = complexAdd(
    complexMultiply(outer.alpha, inner.alpha),
    complexMultiply(outer.beta, complexConjugate(inner.beta)),
  );
  const beta = complexAdd(
    complexMultiply(outer.alpha, inner.beta),
    complexMultiply(outer.beta, complexConjugate(inner.alpha)),
  );
  const determinant = Math.max(
    vec2LengthSquared(alpha) - vec2LengthSquared(beta),
    EPSILON,
  );
  const normalization = 1 / Math.sqrt(determinant);

  return {
    alpha: { x: alpha.x * normalization, y: alpha.y * normalization },
    beta: { x: beta.x * normalization, y: beta.y * normalization },
  };
}

export function translationToOrigin(point: Vec2): MobiusTransform {
  const safePoint = clampToDisk(point);
  const normalization = 1 / Math.sqrt(1 - vec2LengthSquared(safePoint));

  return {
    alpha: { x: normalization, y: 0 },
    beta: {
      x: -safePoint.x * normalization,
      y: -safePoint.y * normalization,
    },
  };
}

export function invertMobius(transform: MobiusTransform): MobiusTransform {
  return {
    alpha: complexConjugate(transform.alpha),
    beta: { x: -transform.beta.x, y: -transform.beta.y },
  };
}

export function mobiusDerivativeScale(
  transform: MobiusTransform,
  point: Vec2,
): number {
  const denominator = complexAdd(
    complexMultiply(complexConjugate(transform.beta), point),
    complexConjugate(transform.alpha),
  );
  return 1 / Math.max(vec2LengthSquared(denominator), EPSILON);
}

export function mobiusDerivativeAngle(
  transform: MobiusTransform,
  point: Vec2,
): number {
  const denominator = complexAdd(
    complexMultiply(complexConjugate(transform.beta), point),
    complexConjugate(transform.alpha),
  );
  return -2 * Math.atan2(denominator.y, denominator.x);
}

export function viewFocus(transform: MobiusTransform): Vec2 {
  return applyMobius(invertMobius(transform), { x: 0, y: 0 });
}
