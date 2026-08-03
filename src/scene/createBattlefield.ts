import * as THREE from 'three';
import {
  OUTERMOST_BUILDABLE_TOWER_RING,
  isBuildableTowerRing,
} from '../game/towerRingRules';
import {
  createSpecialTileAssignments,
  type SpecialTileKind,
} from '../game/specialTiles';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  geodesicInterpolate,
  hyperbolicRadiusToPoincare,
  hyperboloidToPoincare,
  poincareToHyperboloid,
  type Vec2,
} from '../math/hyperbolic';
import { createRegularTiling, type HyperbolicTile } from '../world/tiling';

const MAX_TILING_RING = OUTERMOST_BUILDABLE_TOWER_RING;
const ROUTE_COUNT = 7;
const SPAWN_HYPERBOLIC_RADIUS = 4.7;

const RING_STYLE = [
  { fill: 0x12343c, emissive: 0x0b5a59, line: 0x8affeb, opacity: 1 },
  { fill: 0x0d2a35, emissive: 0x074849, line: 0x4ee6d2, opacity: 1 },
  { fill: 0x0a202c, emissive: 0x063538, line: 0x2b9f9a, opacity: 1 },
  { fill: 0x081823, emissive: 0x041e26, line: 0x1c5e68, opacity: 0.78 },
  { fill: 0x06131d, emissive: 0x03151d, line: 0x123d4c, opacity: 0.54 },
] as const;

const SPECIAL_TILE_STYLE: Readonly<
  Record<SpecialTileKind, { fill: number; line: number }>
> = Object.freeze({
  power: { fill: 0xff7d45, line: 0xffcf86 },
  haste: { fill: 0x4aa8ff, line: 0xb4e9ff },
  repair: { fill: 0x57d995, line: 0xc1ffdc },
});

export interface WarpedMesh {
  geometry: THREE.BufferGeometry;
  canonicalPoints: Float32Array;
}

export interface WarpedSegments {
  geometry: LineSegmentsGeometry;
  canonicalPoints: Vec2[];
  height: number;
}

export interface WarpedRoute {
  line: Line2;
  geometry: LineGeometry;
  canonicalPoints: Vec2[];
  height: number;
}

export interface BattlefieldVisuals {
  lineMaterials: LineMaterial[];
  warpedMeshes: WarpedMesh[];
  warpedSegments: WarpedSegments[];
  warpedRoutes: WarpedRoute[];
  buildableTiles: HyperbolicTile[];
  specialTiles: ReadonlyMap<string, SpecialTileKind>;
}

function createStarField(scene: THREE.Scene): void {
  let seed = 0x7f3;
  const random = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x1_0000_0000;
  };
  const positions: number[] = [];

  for (let index = 0; index < 720; index += 1) {
    const angle = random() * Math.PI * 2;
    const radius = 11 + random() * 26;
    const height = -3 + random() * 21;
    positions.push(
      Math.cos(angle) * radius,
      height,
      Math.sin(angle) * radius,
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  const material = new THREE.PointsMaterial({
    color: 0x87cec8,
    size: 0.045,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.52,
    depthWrite: false,
  });
  scene.add(new THREE.Points(geometry, material));
}

function configureLighting(scene: THREE.Scene): void {
  scene.fog = new THREE.FogExp2(0x030711, 0.028);
  scene.add(new THREE.HemisphereLight(0x84fff0, 0x02040a, 1.35));

  const keyLight = new THREE.DirectionalLight(0x9affed, 1.65);
  keyLight.position.set(-4, 9, 4);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.left = -8;
  keyLight.shadow.camera.right = 8;
  keyLight.shadow.camera.top = 8;
  keyLight.shadow.camera.bottom = -8;
  scene.add(keyLight);

  const rimLight = new THREE.PointLight(0xff784d, 18, 18, 2);
  rimLight.position.set(6, 3, -5);
  scene.add(rimLight);
}

function createTileRing(
  scene: THREE.Scene,
  visuals: BattlefieldVisuals,
  tiles: HyperbolicTile[],
  ring: number,
): void {
  const style = RING_STYLE[ring];
  const geometries = tiles.map((tile) => {
    const shape = new THREE.Shape();
    tile.boundary.forEach((point, index) => {
      if (index === 0) {
        shape.moveTo(point.x, point.y);
      } else {
        shape.lineTo(point.x, point.y);
      }
    });
    shape.closePath();
    const geometry = new THREE.ShapeGeometry(shape);
    geometry.rotateX(-Math.PI / 2);
    return geometry;
  });
  const merged = mergeGeometries(geometries, false);
  geometries.forEach((geometry) => geometry.dispose());
  if (!merged) {
    throw new Error(`Unable to merge tiling ring ${ring}.`);
  }

  const position = merged.getAttribute('position');
  const canonicalPoints = new Float32Array(position.count * 2);
  for (let index = 0; index < position.count; index += 1) {
    canonicalPoints[index * 2] = position.getX(index);
    canonicalPoints[index * 2 + 1] = -position.getZ(index);
  }

  const material = new THREE.MeshStandardMaterial({
    color: style.fill,
    emissive: style.emissive,
    emissiveIntensity: ring < 3 ? 0.68 : 0.35,
    metalness: 0.28,
    roughness: 0.76,
    transparent: ring >= 3,
    opacity: style.opacity,
    side: THREE.DoubleSide,
    depthWrite: ring < 3,
  });
  const mesh = new THREE.Mesh(merged, material);
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.renderOrder = ring >= 3 ? 0 : 1;
  scene.add(mesh);
  visuals.warpedMeshes.push({ geometry: merged, canonicalPoints });

  const segmentPoints: Vec2[] = [];
  for (const tile of tiles) {
    for (let index = 0; index < tile.boundary.length; index += 1) {
      segmentPoints.push(
        tile.boundary[index],
        tile.boundary[(index + 1) % tile.boundary.length],
      );
    }
  }

  const segmentGeometry = new LineSegmentsGeometry();
  const lineMaterial = new LineMaterial({
    color: style.line,
    linewidth: ring < 3 ? 1.25 : 0.8,
    transparent: true,
    opacity: ring === 0 ? 0.9 : style.opacity * 0.66,
    depthWrite: false,
    blending: ring < 2 ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  visuals.lineMaterials.push(lineMaterial);
  const line = new LineSegments2(segmentGeometry, lineMaterial);
  line.frustumCulled = false;
  line.renderOrder = 3;
  scene.add(line);
  visuals.warpedSegments.push({
    geometry: segmentGeometry,
    canonicalPoints: segmentPoints,
    height: 0.012 + ring * 0.0008,
  });
}

type IconSegment = readonly [number, number, number, number];

const SPECIAL_TILE_ICONS: Readonly<
  Record<SpecialTileKind, readonly IconSegment[]>
> = Object.freeze({
  power: [
    [-0.12, 0.58, 0.16, 0.08],
    [0.16, 0.08, -0.02, 0.08],
    [-0.02, 0.08, 0.12, -0.58],
  ],
  haste: [
    [-0.5, 0.34, -0.1, 0],
    [-0.1, 0, -0.5, -0.34],
    [-0.04, 0.34, 0.36, 0],
    [0.36, 0, -0.04, -0.34],
  ],
  repair: [
    [-0.5, 0, 0.5, 0],
    [0, -0.5, 0, 0.5],
  ],
});

function createInsetTileGeometry(
  tiles: readonly HyperbolicTile[],
): THREE.BufferGeometry | null {
  const geometries = tiles.map((tile) => {
    const shape = new THREE.Shape();
    tile.boundary.forEach((point, index) => {
      const x = tile.center.x + (point.x - tile.center.x) * 0.82;
      const y = tile.center.y + (point.y - tile.center.y) * 0.82;
      if (index === 0) {
        shape.moveTo(x, y);
      } else {
        shape.lineTo(x, y);
      }
    });
    shape.closePath();
    const geometry = new THREE.ShapeGeometry(shape);
    geometry.rotateX(-Math.PI / 2);
    return geometry;
  });
  const merged = mergeGeometries(geometries, false);
  geometries.forEach((geometry) => geometry.dispose());
  return merged;
}

function createSpecialTileVisuals(
  scene: THREE.Scene,
  visuals: BattlefieldVisuals,
  tiles: readonly HyperbolicTile[],
): void {
  const tilesById = new Map(tiles.map((tile) => [tile.id, tile]));

  for (const kind of Object.keys(SPECIAL_TILE_STYLE) as SpecialTileKind[]) {
    const assignedTiles = [...visuals.specialTiles]
      .filter(([, assignedKind]) => assignedKind === kind)
      .map(([tileId]) => tilesById.get(tileId))
      .filter((tile): tile is HyperbolicTile => tile !== undefined);
    if (assignedTiles.length === 0) {
      continue;
    }

    const style = SPECIAL_TILE_STYLE[kind];
    const merged = createInsetTileGeometry(assignedTiles);
    if (merged) {
      const positions = merged.getAttribute('position');
      const canonicalPoints = new Float32Array(positions.count * 2);
      for (let index = 0; index < positions.count; index += 1) {
        canonicalPoints[index * 2] = positions.getX(index);
        canonicalPoints[index * 2 + 1] = -positions.getZ(index);
      }

      const material = new THREE.MeshBasicMaterial({
        color: style.fill,
        transparent: true,
        opacity: 0.13,
        side: THREE.DoubleSide,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      const mesh = new THREE.Mesh(merged, material);
      mesh.frustumCulled = false;
      mesh.renderOrder = 2;
      scene.add(mesh);
      visuals.warpedMeshes.push({ geometry: merged, canonicalPoints });
    }

    const iconPoints: Vec2[] = [];
    for (const tile of assignedTiles) {
      const iconRadius =
        Math.min(
          ...tile.boundary.map((point) =>
            Math.hypot(point.x - tile.center.x, point.y - tile.center.y),
          ),
        ) * 0.58;
      for (const [fromX, fromY, toX, toY] of SPECIAL_TILE_ICONS[kind]) {
        iconPoints.push(
          {
            x: tile.center.x + fromX * iconRadius,
            y: tile.center.y + fromY * iconRadius,
          },
          {
            x: tile.center.x + toX * iconRadius,
            y: tile.center.y + toY * iconRadius,
          },
        );
      }
    }

    const iconGeometry = new LineSegmentsGeometry();
    const iconMaterial = new LineMaterial({
      color: style.line,
      linewidth: 1.8,
      transparent: true,
      opacity: 0.68,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    visuals.lineMaterials.push(iconMaterial);
    const icon = new LineSegments2(iconGeometry, iconMaterial);
    icon.frustumCulled = false;
    icon.renderOrder = 6;
    scene.add(icon);
    visuals.warpedSegments.push({
      geometry: iconGeometry,
      canonicalPoints: iconPoints,
      height: 0.038,
    });
  }
}

function createRoutes(
  scene: THREE.Scene,
  visuals: BattlefieldVisuals,
): void {
  const spawnRadius = hyperbolicRadiusToPoincare(SPAWN_HYPERBOLIC_RADIUS);
  const destination = poincareToHyperboloid({ x: 0, y: 0 });

  for (let routeIndex = 0; routeIndex < ROUTE_COUNT; routeIndex += 1) {
    const angle = (routeIndex * Math.PI * 2) / ROUTE_COUNT;
    const start = poincareToHyperboloid({
      x: spawnRadius * Math.cos(angle),
      y: spawnRadius * Math.sin(angle),
    });
    const canonicalPoints: Vec2[] = [];
    for (let sample = 0; sample <= 64; sample += 1) {
      canonicalPoints.push(
        hyperboloidToPoincare(
          geodesicInterpolate(start, destination, sample / 64),
        ),
      );
    }

    const geometry = new LineGeometry();
    const material = new LineMaterial({
      color: 0xff8b59,
      linewidth: 1.55,
      transparent: true,
      opacity: 0.44,
      dashed: true,
      dashSize: 0.12,
      gapSize: 0.085,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    visuals.lineMaterials.push(material);
    const line = new Line2(geometry, material);
    line.frustumCulled = false;
    line.renderOrder = 5;
    scene.add(line);
    visuals.warpedRoutes.push({
      line,
      geometry,
      canonicalPoints,
      height: 0.052,
    });
  }
}

export function createBattlefieldVisuals(
  scene: THREE.Scene,
  worldRadius: number,
  availableKinds: readonly SpecialTileKind[] = [],
  seed = 0,
): BattlefieldVisuals {
  const visuals: BattlefieldVisuals = {
    lineMaterials: [],
    warpedMeshes: [],
    warpedSegments: [],
    warpedRoutes: [],
    buildableTiles: [],
    specialTiles: new Map(),
  };
  configureLighting(scene);
  createStarField(scene);

  const diskGeometry = new THREE.CircleGeometry(worldRadius, 192);
  diskGeometry.rotateX(-Math.PI / 2);
  const disk = new THREE.Mesh(
    diskGeometry,
    new THREE.MeshStandardMaterial({
      color: 0x050d18,
      emissive: 0x06151e,
      emissiveIntensity: 0.72,
      metalness: 0.42,
      roughness: 0.78,
    }),
  );
  disk.position.y = -0.045;
  disk.receiveShadow = true;
  scene.add(disk);

  const boundary = new THREE.Mesh(
    new THREE.TorusGeometry(worldRadius, 0.025, 12, 256),
    new THREE.MeshBasicMaterial({
      color: 0x67f7df,
      transparent: true,
      opacity: 0.82,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  boundary.rotation.x = Math.PI / 2;
  boundary.position.y = 0.035;
  boundary.renderOrder = 8;
  scene.add(boundary);

  const horizon = new THREE.Mesh(
    new THREE.TorusGeometry(worldRadius * 1.006, 0.085, 8, 256),
    new THREE.MeshBasicMaterial({
      color: 0x238f91,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  horizon.rotation.x = Math.PI / 2;
  horizon.position.y = 0.018;
  scene.add(horizon);

  const tiling = createRegularTiling(7, 3, MAX_TILING_RING, 7);
  visuals.buildableTiles.push(
    ...tiling.tiles.filter((tile) => isBuildableTowerRing(tile.ring)),
  );
  visuals.specialTiles = createSpecialTileAssignments(
    visuals.buildableTiles,
    availableKinds,
    seed,
  );
  for (let ring = 0; ring <= MAX_TILING_RING; ring += 1) {
    createTileRing(
      scene,
      visuals,
      tiling.tiles.filter((tile) => tile.ring === ring),
      ring,
    );
  }
  createSpecialTileVisuals(scene, visuals, tiling.tiles);
  createRoutes(scene, visuals);
  return visuals;
}
