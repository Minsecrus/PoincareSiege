import {
  IDENTITY_MAT3,
  applyMat3,
  geodesicInterpolate,
  hyperboloidToPoincare,
  multiplyMat3,
  poincareToHyperboloid,
  reflectionMatrix,
  type HyperPoint,
  type Mat3,
  type Vec2,
} from '../math/hyperbolic';

export interface HyperbolicTile {
  id: string;
  ring: number;
  center: Vec2;
  boundary: Vec2[];
}

export interface TilingResult {
  tiles: HyperbolicTile[];
  circumradius: number;
  inradius: number;
}

interface TileTransform {
  ring: number;
  matrix: Mat3;
}

const ORIGIN: HyperPoint = [0, 0, 1];

function cotangent(value: number): number {
  return 1 / Math.tan(value);
}

function centerKey(center: Vec2): string {
  const precision = 10_000_000;
  return `${Math.round(center.x * precision)}:${Math.round(center.y * precision)}`;
}

function signedArea(points: Vec2[]): number {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return area / 2;
}

function sampleBoundary(
  vertices: HyperPoint[],
  samplesPerEdge: number,
): Vec2[] {
  const boundary: Vec2[] = [];

  for (let index = 0; index < vertices.length; index += 1) {
    const start = vertices[index];
    const end = vertices[(index + 1) % vertices.length];
    for (let sample = 0; sample < samplesPerEdge; sample += 1) {
      boundary.push(
        hyperboloidToPoincare(
          geodesicInterpolate(start, end, sample / samplesPerEdge),
        ),
      );
    }
  }

  if (signedArea(boundary) < 0) {
    boundary.reverse();
  }

  return boundary;
}

export function createRegularTiling(
  polygonSides = 7,
  polygonsAtVertex = 3,
  maxRing = 4,
  samplesPerEdge = 7,
): TilingResult {
  const halfCenterAngle = Math.PI / polygonSides;
  const halfVertexAngle = Math.PI / polygonsAtVertex;
  const circumradius = Math.acosh(
    cotangent(halfCenterAngle) * cotangent(halfVertexAngle),
  );
  const inradius = Math.acosh(
    Math.cos(halfVertexAngle) / Math.sin(halfCenterAngle),
  );

  const vertexRadius = Math.tanh(circumradius / 2);
  const baseVertices: HyperPoint[] = Array.from(
    { length: polygonSides },
    (_, index) => {
      const angle = ((2 * index + 1) * Math.PI) / polygonSides;
      return poincareToHyperboloid({
        x: vertexRadius * Math.cos(angle),
        y: vertexRadius * Math.sin(angle),
      });
    },
  );

  const baseEdgeNormals: HyperPoint[] = Array.from(
    { length: polygonSides },
    (_, index) => {
      const angle = (2 * Math.PI * index) / polygonSides;
      return [
        Math.cosh(inradius) * Math.cos(angle),
        Math.cosh(inradius) * Math.sin(angle),
        Math.sinh(inradius),
      ];
    },
  );

  const transforms: TileTransform[] = [
    { ring: 0, matrix: IDENTITY_MAT3 },
  ];
  const knownCenters = new Set<string>([centerKey({ x: 0, y: 0 })]);

  for (let cursor = 0; cursor < transforms.length; cursor += 1) {
    const current = transforms[cursor];
    if (current.ring >= maxRing) {
      continue;
    }

    for (const baseNormal of baseEdgeNormals) {
      const worldNormal = applyMat3(current.matrix, baseNormal);
      const reflection = reflectionMatrix(worldNormal);
      const neighborMatrix = multiplyMat3(reflection, current.matrix);
      const neighborCenter = hyperboloidToPoincare(
        applyMat3(neighborMatrix, ORIGIN),
      );
      const key = centerKey(neighborCenter);

      if (knownCenters.has(key)) {
        continue;
      }

      knownCenters.add(key);
      transforms.push({ ring: current.ring + 1, matrix: neighborMatrix });
    }
  }

  const tiles = transforms.map((transform, index): HyperbolicTile => {
    const transformedVertices = baseVertices.map((vertex) =>
      applyMat3(transform.matrix, vertex),
    );
    return {
      id: `tile-${index}`,
      ring: transform.ring,
      center: hyperboloidToPoincare(applyMat3(transform.matrix, ORIGIN)),
      boundary: sampleBoundary(transformedVertices, samplesPerEdge),
    };
  });

  return { tiles, circumradius, inradius };
}
