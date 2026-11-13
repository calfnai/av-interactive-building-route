import * as THREE from "three";
import type { AudioBands, FlowerMotionState } from "./types.ts";
import { seededValue } from "./floraPack.ts";

const lilyPalette = {
  stem: 0x677d32,
  leaf: 0x9ab85a,
  floret: 0xe7e6aa,
  pollen: 0xffe4a0,
  halo: 0xffcfff,
};

function colorFromPalette(palette: string[] | undefined, index: number, fallback: number): number {
  const value = palette?.[index % (palette.length || 1)];
  if (!value) return fallback;
  const parsed = Number.parseInt(value.replace("#", ""), 16);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function markPart(object: THREE.Object3D, part: string) {
  object.userData.sculptPart = part;
  object.userData.clickable = true;
}

function rememberBaseTransforms(root: THREE.Object3D) {
  root.userData.basePosition = root.position.clone();
  root.userData.baseRotation = root.rotation.clone();
  root.children.forEach(rememberBaseTransforms);
}

export function createFoxtailLily(seed = 1, palette?: string[]): THREE.Group {
  const root = new THREE.Group();
  root.name = "foxtail-lily";
  root.userData.flowerId = "foxtail-lily-rare-spatial-event";
  root.userData.clickable = true;
  root.userData.seed = seed;

  const stem = new THREE.Group();
  stem.name = "stem";
  markPart(stem, "stem");
  const stemMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.038, 0.06, 1.88, 8),
    new THREE.MeshStandardMaterial({ color: colorFromPalette(palette, 2, lilyPalette.stem), roughness: 0.82 }),
  );
  stemMesh.position.y = 0.94;
  stemMesh.name = "stem-visual";
  stem.add(stemMesh);
  const stemSpikeSocket = new THREE.Object3D();
  stemSpikeSocket.name = "stem-spike-socket";
  stemSpikeSocket.position.y = 1.84;
  stemSpikeSocket.userData.socket = "stem-spike-socket";
  stem.add(stemSpikeSocket);

  const spike = new THREE.Group();
  spike.name = "spike";
  markPart(spike, "spike");
  const spikeMesh = new THREE.Mesh(
    new THREE.ConeGeometry(0.16, 1.58, 10),
    new THREE.MeshStandardMaterial({ color: colorFromPalette(palette, 1, lilyPalette.leaf), roughness: 0.7 }),
  );
  spikeMesh.position.y = 2.08;
  spikeMesh.name = "spike-visual";
  spike.add(spikeMesh);

  const florets = new THREE.Group();
  florets.name = "florets";
  markPart(florets, "florets");
  for (let index = 0; index < 22; index += 1) {
    const ratio = index / 21;
    const floret = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.075 + (1 - ratio) * 0.045, 1),
      new THREE.MeshStandardMaterial({
        color: index % 4 === 0 ? colorFromPalette(palette, 2, lilyPalette.pollen) : colorFromPalette(palette, 0, lilyPalette.floret),
        roughness: 0.54,
        emissive: index % 4 === 0 ? colorFromPalette(palette, 2, lilyPalette.pollen) : 0x000000,
        emissiveIntensity: index % 4 === 0 ? 0.12 : 0,
      }),
    );
    const side = index % 2 === 0 ? -1 : 1;
    floret.position.set(
      side * (0.065 + seededValue(seed + index) * 0.13) * (0.35 + ratio),
      1.35 + ratio * 1.42,
      (seededValue(seed + index + 29) - 0.5) * 0.1,
    );
    floret.rotation.set(seed * 0.02, ratio * Math.PI, index * 0.7);
    floret.userData.sculptPart = "florets";
    florets.add(floret);
  }

  const leaves = new THREE.Group();
  leaves.name = "leaves";
  markPart(leaves, "leaves");
  for (let index = 0; index < 4; index += 1) {
    const leaf = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 8, 5),
      new THREE.MeshStandardMaterial({ color: colorFromPalette(palette, 1, lilyPalette.leaf), roughness: 0.86 }),
    );
    leaf.scale.set(0.28, 1.35, 0.08);
    leaf.position.set(index % 2 === 0 ? -0.13 : 0.13, 0.36 + index * 0.33, 0.02);
    leaf.rotation.z = (index % 2 === 0 ? -1 : 1) * (0.4 + index * 0.17);
    leaf.userData.sculptPart = "leaves";
    leaves.add(leaf);
  }

  const halo = new THREE.Group();
  halo.name = "halo";
  markPart(halo, "halo");
  const haloMesh = new THREE.Mesh(
    new THREE.TorusGeometry(0.48, 0.018, 8, 36),
    new THREE.MeshBasicMaterial({ color: colorFromPalette(palette, 3, lilyPalette.halo), transparent: true, opacity: 0.58 }),
  );
  haloMesh.rotation.x = Math.PI / 2;
  haloMesh.position.y = 2.92;
  halo.add(haloMesh);

  const pollen = new THREE.Group();
  pollen.name = "pollen";
  for (let index = 0; index < 13; index += 1) {
    const mote = new THREE.Mesh(
      new THREE.SphereGeometry(0.018 + seededValue(seed + index * 2) * 0.018, 5, 4),
      new THREE.MeshBasicMaterial({ color: colorFromPalette(palette, 2, lilyPalette.pollen), transparent: true, opacity: 0.72 }),
    );
    mote.position.set((seededValue(seed + index * 3) - 0.5) * 0.68, 1.25 + seededValue(seed + index * 5) * 1.9, (seededValue(seed + index * 7) - 0.5) * 0.45);
    mote.userData.basePosition = mote.position.clone();
    pollen.add(mote);
  }

  root.add(stem, spike, florets, leaves, halo, pollen);
  rememberBaseTransforms(root);
  const nodes: Record<string, THREE.Object3D> = {};
  const meshes: Record<string, THREE.Mesh> = {};
  const sockets: Record<string, THREE.Object3D> = { "stem:stem-spike-socket": stemSpikeSocket };
  const colliders: Record<string, unknown> = {};
  const destructionGroups: Record<string, THREE.Object3D[]> = {};
  for (const part of ["stem", "spike", "florets", "leaves", "halo"]) {
    const node = root.getObjectByName(part);
    if (!node) continue;
    nodes[part] = node;
    colliders[part] = { type: part === "stem" ? "capsule" : "sphere", isTrigger: true };
    destructionGroups[part] = [node];
    const mesh = node.children.find((child): child is THREE.Mesh => child instanceof THREE.Mesh);
    if (mesh) meshes[part] = mesh;
  }
  root.userData.sculptRuntime = { nodes, meshes, sockets, colliders, destructionGroups };
  root.userData.actionReadiness = { namedParts: Object.keys(nodes), socketIds: Object.keys(sockets) };
  return root;
}

function updatePartPositions(root: THREE.Group, deconstructed: boolean) {
  root.traverse((object) => {
    const part = object.userData.sculptPart as string | undefined;
    const base = object.userData.basePosition as THREE.Vector3 | undefined;
    if (!part || !base) return;
    const explode = deconstructed ? (part === "halo" ? 0.52 : part === "florets" ? 0.3 : 0.16) : 0;
    object.position.copy(base).add(new THREE.Vector3(
      part === "florets" ? explode * 0.72 : 0,
      part === "halo" ? explode : part === "spike" ? explode * 0.42 : 0,
      part === "leaves" ? explode * 0.62 : 0,
    ));
  });
}

export function updateFoxtailLily(
  root: THREE.Group,
  timeSeconds: number,
  options: { proximity: number; audio: AudioBands; motion: FlowerMotionState; deconstructed?: boolean },
) {
  const { audio, motion, proximity, deconstructed = false } = options;
  const seed = Number(root.userData.seed ?? root.id);
  const stem = root.getObjectByName("stem");
  const spike = root.getObjectByName("spike");
  const florets = root.getObjectByName("florets");
  const leaves = root.getObjectByName("leaves");
  const halo = root.getObjectByName("halo");
  const pollen = root.getObjectByName("pollen");
  const wave = Math.sin(timeSeconds * 1.45 + seed * 0.09);
  const secondaryWave = Math.sin(timeSeconds * 2.1 + seed * 0.13);
  if (stem) {
    stem.rotation.z = wave * 0.028 + motion.sway * 0.28;
    stem.rotation.x = secondaryWave * 0.018 + audio.bass * 0.035;
  }
  if (spike) {
    spike.rotation.z = wave * 0.04 + motion.sway * 0.18;
    spike.scale.y = 1 + motion.bloom * 0.16;
  }
  if (leaves) {
    leaves.rotation.z = secondaryWave * 0.04 + motion.sway * 0.12;
    leaves.scale.setScalar(1 + motion.breath * 0.045);
  }
  if (florets) {
    florets.rotation.y = wave * 0.04 + motion.bloom * 0.28;
    florets.scale.setScalar(1 + proximity * 0.12 + motion.bloom * 0.2);
    florets.children.forEach((child, index) => {
      const baseRotation = child.userData.baseRotation as THREE.Euler | undefined;
      if (!baseRotation) return;
      child.rotation.set(
        baseRotation.x + Math.sin(timeSeconds * 1.5 + index) * motion.bloom * 0.06,
        baseRotation.y + motion.bloom * 0.08,
        baseRotation.z + Math.sin(timeSeconds * 2.2 + index * 0.7) * motion.bloom * 0.14,
      );
    });
  }
  if (halo) {
    halo.scale.setScalar(1 + proximity * 0.24 + motion.shimmer * 0.5);
    halo.rotation.y = timeSeconds * (0.12 + motion.shimmer * 0.24);
    const haloMesh = halo.children[0] as THREE.Mesh | undefined;
    if (haloMesh?.material instanceof THREE.MeshBasicMaterial) haloMesh.material.opacity = 0.32 + motion.shimmer * 0.52;
  }
  if (pollen) {
    pollen.visible = motion.pollen > 0.035;
    pollen.children.forEach((child, index) => {
      const base = child.userData.basePosition as THREE.Vector3;
      child.position.set(
        base.x + Math.sin(timeSeconds * (0.7 + index * 0.05) + seed) * motion.pollen * 0.38,
        base.y + ((timeSeconds * (0.12 + motion.pollen * 0.55) + index * 0.19) % 2.2) * motion.pollen,
        base.z + Math.cos(timeSeconds * 0.8 + index) * motion.pollen * 0.28,
      );
      child.scale.setScalar(0.7 + motion.pollen * 1.8);
    });
  }
  root.scale.setScalar(1 + motion.breath * 0.045);
  updatePartPositions(root, deconstructed);
}

export function createCommonFlower(seed = 1, palette?: string[]): THREE.Group {
  const root = new THREE.Group();
  root.name = "dailyflora-common-flower";
  root.userData.flowerId = "dailyflora-common-wild-stem";
  root.userData.seed = seed;
  root.userData.clickable = true;
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.035, 0.86, 7),
    new THREE.MeshStandardMaterial({ color: colorFromPalette(palette, 1, 0x70dfbd), roughness: 0.84 }),
  );
  stem.name = "common-stem";
  stem.position.y = 0.43;
  const bloom = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 10, 7),
    new THREE.MeshStandardMaterial({ color: colorFromPalette(palette, seed, 0xffcc6e), roughness: 0.58, emissive: colorFromPalette(palette, seed, 0xffcc6e), emissiveIntensity: 0.08 }),
  );
  bloom.name = "common-bloom";
  bloom.position.y = 0.92;
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(0.28, 0.014, 6, 22),
    new THREE.MeshBasicMaterial({ color: colorFromPalette(palette, 0, 0xff7dc5), transparent: true, opacity: 0.38 }),
  );
  halo.name = "common-halo";
  halo.rotation.x = Math.PI / 2;
  halo.position.y = 0.92;
  root.add(stem, bloom, halo);
  rememberBaseTransforms(root);
  return root;
}

export function updateCommonFlower(root: THREE.Group, timeSeconds: number, motion: FlowerMotionState) {
  const seed = Number(root.userData.seed ?? root.id);
  const stem = root.getObjectByName("common-stem");
  const bloom = root.getObjectByName("common-bloom");
  const halo = root.getObjectByName("common-halo");
  const wave = Math.sin(timeSeconds * 1.8 + seed * 0.1);
  if (stem) stem.rotation.z = wave * 0.025 + motion.sway * 0.18;
  if (bloom) {
    bloom.scale.setScalar(1 + motion.bloom * 0.26);
    bloom.rotation.y = timeSeconds * 0.25 + motion.bloom * 0.4;
  }
  if (halo) {
    halo.scale.setScalar(1 + motion.shimmer * 0.4);
    const haloMesh = halo as THREE.Mesh;
    if (haloMesh.material instanceof THREE.MeshBasicMaterial) haloMesh.material.opacity = 0.22 + motion.shimmer * 0.5;
  }
  root.scale.setScalar(1 + motion.breath * 0.04);
}
