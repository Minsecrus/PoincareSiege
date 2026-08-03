import * as THREE from 'three';

/**
 * The visual identity of a tower.  This deliberately lives beside the Three.js
 * meshes rather than in the game rules, so rendering can stay independent from
 * attack behaviour.
 */
export type TowerVisualKind = 'sector' | 'prism' | 'pulse' | 'anchor' | 'arc';

export interface TowerMaterials {
  armor: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  energy: THREE.MeshStandardMaterial;
}

/** The common handles animated and picked by TowerCollection. */
export interface TowerVisual {
  group: THREE.Group;
  head: THREE.Group;
  core: THREE.Mesh;
  levelIndicators: THREE.Mesh[];
}

/** @deprecated Use TowerVisual; retained for existing sector-tower consumers. */
export type SectorTowerVisual = TowerVisual;

export function createTowerMaterials(): TowerMaterials {
  return {
    armor: new THREE.MeshStandardMaterial({
      color: 0x789a9c,
      emissive: 0x0b292b,
      emissiveIntensity: 0.42,
      metalness: 0.64,
      roughness: 0.38,
    }),
    dark: new THREE.MeshStandardMaterial({
      color: 0x38585f,
      emissive: 0x07191c,
      emissiveIntensity: 0.38,
      metalness: 0.68,
      roughness: 0.42,
    }),
    energy: new THREE.MeshStandardMaterial({
      color: 0x87d8cd,
      emissive: 0x1fae9e,
      emissiveIntensity: 1.25,
      metalness: 0.3,
      roughness: 0.2,
    }),
  };
}

function addMesh(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position?: THREE.Vector3Tuple,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  if (position) {
    mesh.position.set(...position);
  }
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function addFoundation(group: THREE.Group, materials: TowerMaterials): void {
  const foundation = addMesh(
    group,
    new THREE.CylinderGeometry(0.29, 0.35, 0.12, 7),
    materials.dark,
    [0, 0.06, 0],
  );
  foundation.receiveShadow = true;

  addMesh(
    group,
    new THREE.CylinderGeometry(0.235, 0.29, 0.045, 7),
    materials.energy,
    [0, 0.13, 0],
  );
}

function addLevelIndicators(
  group: THREE.Group,
  materials: TowerMaterials,
  position: THREE.Vector3Tuple,
): THREE.Mesh[] {
  const levelIndicators: THREE.Mesh[] = [];
  for (let index = 0; index < 3; index += 1) {
    const indicator = addMesh(
      group,
      new THREE.BoxGeometry(0.045, 0.032, 0.024),
      materials.energy,
      [position[0] + (index - 1) * 0.065, position[1], position[2]],
    );
    indicator.visible = index === 0;
    levelIndicators.push(indicator);
  }
  return levelIndicators;
}

function createSectorVisual(materials: TowerMaterials): TowerVisual {
  const group = new THREE.Group();
  addFoundation(group, materials);

  addMesh(
    group,
    new THREE.CylinderGeometry(0.19, 0.25, 0.3, 7),
    materials.armor,
    [0, 0.25, 0],
  );
  addMesh(
    group,
    new THREE.CylinderGeometry(0.205, 0.205, 0.045, 7),
    materials.energy,
    [0, 0.37, 0],
  );
  const levelIndicators = addLevelIndicators(group, materials, [0, 0.315, 0.236]);

  const head = new THREE.Group();
  head.position.y = 0.49;
  group.add(head);
  addMesh(head, new THREE.BoxGeometry(0.34, 0.2, 0.28), materials.armor);
  addMesh(
    head,
    new THREE.BoxGeometry(0.2, 0.075, 0.025),
    materials.energy,
    [0, 0.012, 0.153],
  );

  for (const side of [-1, 1]) {
    addMesh(
      head,
      new THREE.BoxGeometry(0.055, 0.06, 0.34),
      materials.dark,
      [side * 0.1, 0.015, 0.25],
    );
    addMesh(
      head,
      new THREE.BoxGeometry(0.065, 0.07, 0.04),
      materials.energy,
      [side * 0.1, 0.015, 0.43],
    );
  }

  const core = addMesh(
    head,
    new THREE.OctahedronGeometry(0.09, 0),
    materials.energy,
    [0, 0.17, 0],
  );
  return { group, head, core, levelIndicators };
}

/** A high crystal held in a three-rail geodesic focusing frame. */
function createPrismVisual(materials: TowerMaterials): TowerVisual {
  const group = new THREE.Group();
  addFoundation(group, materials);
  addMesh(
    group,
    new THREE.CylinderGeometry(0.18, 0.25, 0.22, 6),
    materials.armor,
    [0, 0.22, 0],
  );
  const levelIndicators = addLevelIndicators(group, materials, [0, 0.18, 0.23]);

  const head = new THREE.Group();
  head.position.y = 0.43;
  group.add(head);

  for (let index = 0; index < 3; index += 1) {
    const angle = (index * Math.PI * 2) / 3 + Math.PI / 6;
    const rail = addMesh(
      head,
      new THREE.BoxGeometry(0.045, 0.72, 0.055),
      materials.armor,
      [Math.cos(angle) * 0.18, 0.23, Math.sin(angle) * 0.18],
    );
    rail.rotation.z = Math.sin(angle) * 0.17;
    rail.rotation.x = -Math.cos(angle) * 0.17;

    const railTip = addMesh(
      head,
      new THREE.BoxGeometry(0.07, 0.045, 0.07),
      materials.energy,
      [Math.cos(angle) * 0.18, 0.61, Math.sin(angle) * 0.18],
    );
    railTip.rotation.y = angle;
  }

  const core = addMesh(
    head,
    new THREE.OctahedronGeometry(0.19, 1),
    materials.energy,
    [0, 0.25, 0],
  );
  core.geometry.scale(0.68, 1.9, 0.68);
  core.rotation.y = Math.PI / 4;

  const forwardRail = addMesh(
    head,
    new THREE.BoxGeometry(0.09, 0.06, 0.25),
    materials.dark,
    [0, 0.23, 0.29],
  );
  forwardRail.rotation.x = -0.18;
  return { group, head, core, levelIndicators };
}

/** A low radial emitter made from stacked, concentric resonance rings. */
function createPulseVisual(materials: TowerMaterials): TowerVisual {
  const group = new THREE.Group();
  addFoundation(group, materials);
  addMesh(
    group,
    new THREE.CylinderGeometry(0.27, 0.29, 0.13, 8),
    materials.armor,
    [0, 0.19, 0],
  );
  const levelIndicators = addLevelIndicators(group, materials, [0, 0.235, 0.255]);

  const head = new THREE.Group();
  head.position.y = 0.26;
  group.add(head);

  for (const [radius, height, material] of [
    [0.25, 0, materials.energy],
    [0.17, 0.035, materials.armor],
    [0.095, 0.07, materials.energy],
  ] as const) {
    const ring = addMesh(
      head,
      new THREE.TorusGeometry(radius, 0.018, 6, 32),
      material,
      [0, height, 0],
    );
    ring.rotation.x = Math.PI / 2;
  }

  const core = addMesh(
    head,
    new THREE.IcosahedronGeometry(0.105, 1),
    materials.energy,
    [0, 0.11, 0],
  );
  for (const angle of [Math.PI / 4, (3 * Math.PI) / 4]) {
    const brace = addMesh(
      head,
      new THREE.BoxGeometry(0.045, 0.055, 0.28),
      materials.dark,
      [Math.cos(angle) * 0.19, 0.04, Math.sin(angle) * 0.19],
    );
    brace.rotation.y = -angle;
  }
  return { group, head, core, levelIndicators };
}

/** A braced pylon with broad fins that visibly anchors a slowing field. */
function createAnchorVisual(materials: TowerMaterials): TowerVisual {
  const group = new THREE.Group();
  addFoundation(group, materials);
  addMesh(
    group,
    new THREE.CylinderGeometry(0.16, 0.25, 0.32, 6),
    materials.armor,
    [0, 0.28, 0],
  );
  const levelIndicators = addLevelIndicators(group, materials, [0, 0.23, 0.235]);

  const head = new THREE.Group();
  head.position.y = 0.44;
  group.add(head);
  addMesh(head, new THREE.ConeGeometry(0.17, 0.48, 4), materials.dark, [0, 0.21, 0]);

  for (const angle of [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3]) {
    const fin = addMesh(
      head,
      new THREE.BoxGeometry(0.09, 0.32, 0.29),
      materials.armor,
      [Math.cos(angle) * 0.17, 0.075, Math.sin(angle) * 0.17],
    );
    fin.rotation.y = angle;
    fin.rotation.z = Math.sin(angle) * 0.2;
  }

  const core = addMesh(
    head,
    new THREE.OctahedronGeometry(0.115, 0),
    materials.energy,
    [0, 0.46, 0],
  );
  const cap = addMesh(
    head,
    new THREE.CylinderGeometry(0.055, 0.075, 0.1, 6),
    materials.energy,
    [0, 0.31, 0],
  );
  cap.rotation.y = Math.PI / 6;
  return { group, head, core, levelIndicators };
}

/** Twin emitters connected by upright coils for a chained electric arc. */
function createArcVisual(materials: TowerMaterials): TowerVisual {
  const group = new THREE.Group();
  addFoundation(group, materials);
  addMesh(
    group,
    new THREE.CylinderGeometry(0.22, 0.29, 0.23, 6),
    materials.armor,
    [0, 0.225, 0],
  );
  const levelIndicators = addLevelIndicators(group, materials, [0, 0.24, 0.25]);

  const head = new THREE.Group();
  head.position.y = 0.39;
  group.add(head);
  const bridge = addMesh(
    head,
    new THREE.BoxGeometry(0.42, 0.08, 0.16),
    materials.dark,
    [0, 0.05, 0],
  );
  bridge.rotation.x = -0.12;

  for (const side of [-1, 1]) {
    addMesh(
      head,
      new THREE.CylinderGeometry(0.095, 0.12, 0.25, 6),
      materials.armor,
      [side * 0.2, 0.13, 0.05],
    );
    const coil = addMesh(
      head,
      new THREE.TorusGeometry(0.105, 0.018, 6, 18),
      materials.energy,
      [side * 0.2, 0.23, 0.07],
    );
    coil.rotation.x = Math.PI / 2;
    addMesh(
      head,
      new THREE.ConeGeometry(0.065, 0.19, 5),
      materials.energy,
      [side * 0.2, 0.14, 0.26],
    ).rotation.x = Math.PI / 2;
  }

  const core = addMesh(
    head,
    new THREE.DodecahedronGeometry(0.105, 0),
    materials.energy,
    [0, 0.17, 0.07],
  );
  return { group, head, core, levelIndicators };
}

/** Creates the intentionally distinct visual silhouette for a tower kind. */
export function createTowerVisual(
  kind: TowerVisualKind,
  materials: TowerMaterials,
): TowerVisual {
  switch (kind) {
    case 'prism':
      return createPrismVisual(materials);
    case 'pulse':
      return createPulseVisual(materials);
    case 'anchor':
      return createAnchorVisual(materials);
    case 'arc':
      return createArcVisual(materials);
    case 'sector':
      return createSectorVisual(materials);
  }
}

/** Retained as a narrow compatibility helper for the original tower. */
export function createSectorTowerVisual(
  materials: TowerMaterials,
): SectorTowerVisual {
  return createTowerVisual('sector', materials);
}

export function setTowerVisualLevel(visual: TowerVisual, level: number): void {
  const normalizedLevel = THREE.MathUtils.clamp(Math.floor(level), 1, 3);
  visual.levelIndicators.forEach((indicator, index) => {
    indicator.visible = index < normalizedLevel;
  });
  visual.head.scale.setScalar(1 + (normalizedLevel - 1) * 0.075);
}

/** Retained for the original tower's callers. */
export function setSectorTowerLevel(
  visual: SectorTowerVisual,
  level: number,
): void {
  setTowerVisualLevel(visual, level);
}

export function disposeTowerVisual(visual: TowerVisual): void {
  visual.group.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose();
    }
  });
}

/** Retained for the original tower's callers. */
export function disposeSectorTowerVisual(visual: SectorTowerVisual): void {
  disposeTowerVisual(visual);
}
