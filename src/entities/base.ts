import * as THREE from 'three';

export interface BaseVisual {
  group: THREE.Group;
  core: THREE.Mesh;
  orbitA: THREE.Mesh;
  orbitB: THREE.Mesh;
}

function createGlowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Unable to create base glow texture.');
  }

  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(160, 255, 242, 0.94)');
  gradient.addColorStop(0.2, 'rgba(75, 245, 220, 0.5)');
  gradient.addColorStop(0.55, 'rgba(26, 178, 168, 0.14)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

export function createBaseVisual(): BaseVisual {
  const group = new THREE.Group();
  const core = new THREE.Mesh();
  const orbitA = new THREE.Mesh();
  const orbitB = new THREE.Mesh();
  const armorMaterial = new THREE.MeshStandardMaterial({
    color: 0x132a32,
    emissive: 0x061d24,
    emissiveIntensity: 0.55,
    metalness: 0.82,
    roughness: 0.3,
  });
  const armorDarkMaterial = new THREE.MeshStandardMaterial({
    color: 0x07151d,
    emissive: 0x041116,
    emissiveIntensity: 0.5,
    metalness: 0.72,
    roughness: 0.42,
  });
  const trimMaterial = new THREE.MeshStandardMaterial({
    color: 0x78cfc4,
    emissive: 0x168e85,
    emissiveIntensity: 0.95,
    metalness: 0.42,
    roughness: 0.24,
  });
  const coreMaterial = new THREE.MeshStandardMaterial({
    color: 0xbcece5,
    emissive: 0x2cbfac,
    emissiveIntensity: 2.25,
    metalness: 0.08,
    roughness: 0.12,
  });

  const foundation = new THREE.Mesh(
    new THREE.CylinderGeometry(1.02, 1.13, 0.18, 7),
    armorDarkMaterial,
  );
  foundation.position.y = 0.09;
  foundation.castShadow = true;
  foundation.receiveShadow = true;
  group.add(foundation);

  const foundationTrim = new THREE.Mesh(
    new THREE.CylinderGeometry(1.035, 1.145, 0.035, 7),
    trimMaterial,
  );
  foundationTrim.position.y = 0.19;
  group.add(foundationTrim);

  const courtyard = new THREE.Mesh(
    new THREE.CylinderGeometry(0.91, 1.01, 0.13, 7),
    armorMaterial,
  );
  courtyard.position.y = 0.255;
  courtyard.castShadow = true;
  group.add(courtyard);

  for (let index = 0; index < 7; index += 1) {
    const angle = (index * Math.PI * 2) / 7;
    const wallSection = new THREE.Group();
    wallSection.position.set(
      Math.cos(angle) * 0.78,
      0.43,
      Math.sin(angle) * 0.78,
    );
    wallSection.rotation.y = Math.PI / 2 - angle;

    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(0.67, 0.34, 0.17),
      armorMaterial,
    );
    wall.castShadow = true;
    wallSection.add(wall);

    const wallLight = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.075, 0.018),
      trimMaterial,
    );
    wallLight.position.set(0, 0.025, 0.095);
    wallSection.add(wallLight);
    group.add(wallSection);

    const vertexAngle = angle + Math.PI / 7;
    const bastion = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.205, 0.43, 6),
      armorDarkMaterial,
    );
    bastion.position.set(
      Math.cos(vertexAngle) * 0.96,
      0.42,
      Math.sin(vertexAngle) * 0.96,
    );
    bastion.rotation.y = -vertexAngle;
    bastion.castShadow = true;
    group.add(bastion);

    const bastionCap = new THREE.Mesh(
      new THREE.ConeGeometry(0.17, 0.19, 6),
      armorMaterial,
    );
    bastionCap.position.set(
      Math.cos(vertexAngle) * 0.96,
      0.73,
      Math.sin(vertexAngle) * 0.96,
    );
    bastionCap.rotation.y = -vertexAngle;
    bastionCap.castShadow = true;
    group.add(bastionCap);

    const conduit = new THREE.Mesh(
      new THREE.BoxGeometry(0.045, 0.028, 0.55),
      trimMaterial,
    );
    conduit.position.set(
      Math.cos(angle) * 0.38,
      0.337,
      Math.sin(angle) * 0.38,
    );
    conduit.rotation.y = Math.PI / 2 - angle;
    group.add(conduit);
  }

  const keepLower = new THREE.Mesh(
    new THREE.CylinderGeometry(0.47, 0.61, 0.48, 7),
    armorDarkMaterial,
  );
  keepLower.position.y = 0.5;
  keepLower.castShadow = true;
  group.add(keepLower);

  const keepBand = new THREE.Mesh(
    new THREE.CylinderGeometry(0.49, 0.5, 0.075, 7),
    trimMaterial,
  );
  keepBand.position.y = 0.69;
  group.add(keepBand);

  const keepUpper = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.43, 0.34, 7),
    armorMaterial,
  );
  keepUpper.position.y = 0.86;
  keepUpper.castShadow = true;
  group.add(keepUpper);

  core.geometry = new THREE.IcosahedronGeometry(0.255, 0);
  core.material = coreMaterial;
  core.position.y = 1.22;
  core.castShadow = true;
  group.add(core);

  orbitA.geometry = new THREE.TorusGeometry(0.43, 0.024, 8, 72);
  orbitA.material = trimMaterial;
  orbitA.position.y = 1.2;
  orbitA.rotation.x = Math.PI / 2;
  group.add(orbitA);

  orbitB.geometry = new THREE.TorusGeometry(0.35, 0.016, 8, 72);
  orbitB.material = trimMaterial;
  orbitB.position.y = 1.2;
  orbitB.rotation.set(Math.PI / 2, 0.72, 0.4);
  group.add(orbitB);

  const coreLight = new THREE.PointLight(0x56f8e1, 6.5, 5.5, 2);
  coreLight.position.y = 1.22;
  group.add(coreLight);

  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: createGlowTexture(),
      color: 0x52f0dc,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  glow.position.y = 1.2;
  glow.scale.set(1.8, 1.8, 1);
  group.add(glow);

  group.renderOrder = 7;
  return { group, core, orbitA, orbitB };
}

export function animateBaseVisual(visual: BaseVisual, elapsed: number): void {
  visual.core.rotation.y = elapsed * 0.72;
  visual.core.rotation.x = elapsed * 0.28;
  visual.core.position.y = 1.22 + Math.sin(elapsed * 2.1) * 0.045;
  const corePulse = 1 + Math.sin(elapsed * 2.8) * 0.045;
  visual.core.scale.setScalar(corePulse);
  visual.orbitA.rotation.z = elapsed * 0.42;
  visual.orbitB.rotation.y = 0.72 - elapsed * 0.56;
}
