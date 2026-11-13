import { useEffect, useRef } from "react";
import * as THREE from "three";
import { flowerMotionForNode } from "./flowerMotion.ts";
import { flowerNodesForVariant } from "./floraPack.ts";
import { createCommonFlower, createFoxtailLily, updateCommonFlower, updateFoxtailLily } from "./foxtailLily.ts";
import type { AudioBands, FlowerNode, StairsVariant } from "./types.ts";

interface WalkSceneProps {
  variant: StairsVariant;
  audioBands: AudioBands;
  resetNonce: number;
  onFocusNode: (node: FlowerNode | null) => void;
}

interface NodeRuntime {
  node: FlowerNode;
  group: THREE.Group;
  landmark: THREE.Group;
  light: THREE.PointLight;
  flowers: THREE.Group[];
}

interface SceneValues {
  audioBands: AudioBands;
  resetNonce: number;
}

const EYE_HEIGHT = 1.58;
const WALK_SPEED = 3.2;
const WALKABLE_TOP_Y = 22;

const palettes = {
  flora: {
    background: 0x130d27,
    fog: 0x130d27,
    step: 0x31204d,
    stepEdge: 0x9c6bcb,
    rail: 0xf19ccc,
    accent: [0xff5ca8, 0xffd36e, 0x73f7d2, 0xb48cff],
  },
  sound: {
    background: 0x050b1d,
    fog: 0x07112c,
    step: 0x0b1d3c,
    stepEdge: 0x3c8dff,
    rail: 0x5cf6e4,
    accent: [0x4cf5d6, 0x426bff, 0xff61b0, 0xb8f56b],
  },
} as const;

function addPlatform(
  scene: THREE.Scene,
  node: FlowerNode,
  variant: StairsVariant,
  walkables: THREE.Mesh[],
  index: number,
) {
  const palette = palettes[variant];
  const material = new THREE.MeshStandardMaterial({
    color: palette.step,
    roughness: variant === "sound" ? 0.28 : 0.64,
    metalness: variant === "sound" ? 0.58 : 0.08,
    emissive: palette.accent[index % palette.accent.length],
    emissiveIntensity: variant === "sound" ? 0.18 : 0.08,
  });
  const platformWidth = variant === "sound" ? 5.8 : 8.2;
  const platformDepth = variant === "sound" ? 3.6 : 4.6;
  const platform = new THREE.Mesh(new THREE.BoxGeometry(platformWidth, 0.18, platformDepth), material);
  platform.position.set(node.position[0], node.position[1] - 0.09, node.position[2]);
  platform.userData.walkable = true;
  scene.add(platform);
  walkables.push(platform);

  const edgeMaterial = new THREE.MeshBasicMaterial({ color: palette.accent[index % palette.accent.length], transparent: true, opacity: 0.5 });
  const edge = new THREE.Mesh(new THREE.BoxGeometry(platformWidth + 0.02, 0.025, 0.05), edgeMaterial);
  edge.position.set(node.position[0], node.position[1] + 0.01, node.position[2] - platformDepth / 2 + 0.04);
  scene.add(edge);

  if (variant === "sound") {
    const underglow = new THREE.Mesh(
      new THREE.BoxGeometry(platformWidth - 0.45, 0.025, platformDepth - 0.35),
      new THREE.MeshBasicMaterial({ color: palette.accent[index % palette.accent.length], transparent: true, opacity: 0.12 }),
    );
    underglow.position.set(node.position[0], node.position[1] - 0.2, node.position[2]);
    scene.add(underglow);
  }
}

function cylinderBetween(start: THREE.Vector3, end: THREE.Vector3, radius: number, material: THREE.Material) {
  const direction = end.clone().sub(start);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), 6), material);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return mesh;
}

function addFlight(
  scene: THREE.Scene,
  from: FlowerNode,
  to: FlowerNode,
  variant: StairsVariant,
  walkables: THREE.Mesh[],
) {
  const palette = palettes[variant];
  const start = new THREE.Vector3(from.position[0], from.position[1], from.position[2]);
  const end = new THREE.Vector3(to.position[0], to.position[1], to.position[2]);
  const horizontal = new THREE.Vector3(end.x - start.x, 0, end.z - start.z);
  const length = horizontal.length();
  const direction = horizontal.normalize();
  const side = new THREE.Vector3(-direction.z, 0, direction.x);
  const stepCount = 15;
  const depth = length / stepCount;
  const rise = (end.y - start.y) / stepCount;
  const stepMaterial = new THREE.MeshStandardMaterial({
    color: palette.step,
    roughness: variant === "sound" ? 0.26 : 0.68,
    metalness: variant === "sound" ? 0.62 : 0.05,
    emissive: palette.stepEdge,
    emissiveIntensity: variant === "sound" ? 0.13 : 0.045,
  });
  for (let index = 0; index < stepCount; index += 1) {
    const center = start.clone().add(direction.clone().multiplyScalar(depth * (index + 0.5)));
    const top = start.y + rise * (index + 1);
    const height = Math.max(0.2, rise + 0.18);
    const stepWidth = variant === "sound" ? 2.35 : 3.4;
    const step = new THREE.Mesh(new THREE.BoxGeometry(stepWidth, height, depth * 1.08), stepMaterial);
    step.position.set(center.x, top - height / 2, center.z);
    step.rotation.y = Math.atan2(direction.x, direction.z);
    step.userData.walkable = true;
    scene.add(step);
    walkables.push(step);
  }

  if (variant === "sound") return;
  const railMaterial = new THREE.MeshBasicMaterial({ color: palette.rail, transparent: true, opacity: 0.42 });
  for (const sideSign of [-1, 1]) {
    const railStart = start.clone().add(side.clone().multiplyScalar(sideSign * 2.05)).add(new THREE.Vector3(0, 1.08, 0));
    const railEnd = end.clone().add(side.clone().multiplyScalar(sideSign * 2.05)).add(new THREE.Vector3(0, 1.08, 0));
    scene.add(cylinderBetween(railStart, railEnd, 0.026, railMaterial));
    for (let index = 0; index <= 5; index += 1) {
      const alpha = index / 5;
      const postBase = start.clone().lerp(end, alpha).add(side.clone().multiplyScalar(sideSign * 2.05));
      const postTop = postBase.clone().add(new THREE.Vector3(0, 1.08, 0));
      scene.add(cylinderBetween(postBase, postTop, 0.018, railMaterial));
    }
  }
}

function buildFloraLandmark(node: FlowerNode, color: number) {
  const landmark = new THREE.Group();
  landmark.name = `flora-landmark-${node.id}`;
  const petalMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
  for (let index = 0; index < 7; index += 1) {
    const petal = new THREE.Mesh(
      new THREE.SphereGeometry(0.72 + (index % 3) * 0.12, 12, 8),
      petalMaterial,
    );
    const angle = (index / 7) * Math.PI * 2;
    petal.scale.set(0.28, 1.75 - (index % 2) * 0.25, 0.12);
    petal.position.set(Math.cos(angle) * 0.8, 1.2 + Math.sin(angle * 1.7) * 0.42, Math.sin(angle) * 0.8);
    petal.rotation.set(Math.sin(angle) * 0.35, -angle, Math.cos(angle) * 0.28);
    landmark.add(petal);
  }
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 12, 8),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.78 }),
  );
  core.position.y = 1.72;
  landmark.add(core);
  return landmark;
}

function buildSoundLandmark(node: FlowerNode, color: number) {
  const landmark = new THREE.Group();
  landmark.name = `sound-landmark-${node.id}`;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.18, 0.045, 8, 40),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.66 }),
  );
  ring.position.y = 1.35;
  ring.rotation.x = Math.PI / 2;
  landmark.add(ring);
  const bars = new THREE.Group();
  bars.name = "frequency-bars";
  for (let index = 0; index < 9; index += 1) {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.8 + (index % 3) * 0.45, 0.07),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7 }),
    );
    bar.position.set(-1.2 + index * 0.3, 0.55, 0.18);
    bars.add(bar);
  }
  landmark.add(bars);
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(1.6, 1.63, 48),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, side: THREE.DoubleSide }),
  );
  halo.position.y = 0.02;
  halo.rotation.x = -Math.PI / 2;
  landmark.add(halo);
  return landmark;
}

function buildFloraCanopy(scene: THREE.Scene) {
  const canopy = new THREE.Group();
  canopy.name = "flora-canopy";
  const colors = [0xff5ca8, 0xffd36e, 0x73f7d2, 0xb48cff];
  for (let index = 0; index < 13; index += 1) {
    const petal = new THREE.Mesh(
      new THREE.SphereGeometry(1, 12, 8),
      new THREE.MeshBasicMaterial({ color: colors[index % colors.length], transparent: true, opacity: 0.22, side: THREE.DoubleSide }),
    );
    petal.scale.set(1.4 + (index % 3) * 0.55, 0.12 + (index % 2) * 0.08, 0.52 + (index % 4) * 0.12);
    petal.position.set(-8.5 + (index % 5) * 4.25, 5.8 + (index % 4) * 2.6, -4 - Math.floor(index / 5) * 7.5);
    petal.rotation.set(index * 0.17, index * 0.43, (index % 3 - 1) * 0.5);
    petal.userData.floraRole = "petal";
    canopy.add(petal);
  }
  const vineMaterial = new THREE.MeshBasicMaterial({ color: 0xb4ffcf, transparent: true, opacity: 0.34 });
  for (let index = 0; index < 5; index += 1) {
    const points = Array.from({ length: 18 }, (_, pointIndex) => {
      const ratio = pointIndex / 17;
      return new THREE.Vector3(
        -8 + index * 4 + Math.sin(ratio * Math.PI * 2 + index) * 1.3,
        2.4 + ratio * 10,
        -5 - index * 3.6 + Math.cos(ratio * Math.PI * 2) * 0.9,
      );
    });
    const vine = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 40, 0.026, 5, false), vineMaterial);
    vine.userData.floraRole = "vine";
    canopy.add(vine);
  }
  scene.add(canopy);
}

function buildSoundField(scene: THREE.Scene) {
  const field = new THREE.Group();
  field.name = "sound-field";
  const colors = [0x4cf5d6, 0x426bff, 0xff61b0, 0xb8f56b];
  const frameMaterial = new THREE.MeshBasicMaterial({ color: 0x76e7ff, transparent: true, opacity: 0.36 });
  for (let index = 0; index < 10; index += 1) {
    const frame = new THREE.Group();
    frame.name = `sound-frame-${index}`;
    frame.userData.soundRole = "frame";
    const z = -2 - index * 2.65;
    const height = 3.6 + (index % 3) * 1.1;
    const width = 7.8 + (index % 2) * 1.8;
    const left = new THREE.Mesh(new THREE.BoxGeometry(0.045, height, 0.045), frameMaterial);
    const right = left.clone();
    const top = new THREE.Mesh(new THREE.BoxGeometry(width, 0.045, 0.045), frameMaterial);
    left.position.set(-width / 2, height / 2, z);
    right.position.set(width / 2, height / 2, z);
    top.position.set(0, height, z);
    frame.add(left, right, top);
    field.add(frame);
  }
  for (let index = 0; index < 5; index += 1) {
    const points = Array.from({ length: 28 }, (_, pointIndex) => {
      const ratio = pointIndex / 27;
      return new THREE.Vector3(
        Math.sin(ratio * Math.PI * 4 + index * 0.8) * (2.2 + index * 0.38),
        1.2 + index * 0.9 + Math.cos(ratio * Math.PI * 3) * 0.45,
        2 - ratio * 28,
      );
    });
    const wave = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 72, 0.045 + index * 0.012, 6, false),
      new THREE.MeshBasicMaterial({ color: colors[index % colors.length], transparent: true, opacity: 0.56 }),
    );
    wave.name = `sound-wave-${index}`;
    wave.userData.soundRole = "wave";
    field.add(wave);
  }
  scene.add(field);
}

function buildStage(scene: THREE.Scene, variant: StairsVariant, nodes: FlowerNode[]) {
  const palette = palettes[variant];
  const walkables: THREE.Mesh[] = [];
  nodes.forEach((node, index) => addPlatform(scene, node, variant, walkables, index));
  for (let index = 0; index < nodes.length - 1; index += 1) addFlight(scene, nodes[index], nodes[index + 1], variant, walkables);

  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(70, 38),
    new THREE.MeshBasicMaterial({ color: palette.background, transparent: true, opacity: 0.54, side: THREE.DoubleSide }),
  );
  backdrop.position.set(0, 10, -25);
  scene.add(backdrop);

  if (variant === "flora") {
    buildFloraCanopy(scene);
    const stars = new THREE.Points(
      new THREE.BufferGeometry().setFromPoints(Array.from({ length: 110 }, (_, index) => new THREE.Vector3((Math.sin(index * 13.4) * 0.5 + 0.5) * 30 - 15, (Math.sin(index * 2.7) * 0.5 + 0.5) * 24, -4 - (index % 11) * 2.1))),
      new THREE.PointsMaterial({ color: 0xffd7f2, size: 0.06, transparent: true, opacity: 0.62 }),
    );
    stars.name = "flora-atmosphere";
    scene.add(stars);
  } else {
    buildSoundField(scene);
  }

  return walkables;
}

function findFlowerRoot(object: THREE.Object3D | null): THREE.Object3D | null {
  let current = object;
  while (current) {
    if (current.userData.flowerNodeId) return current;
    current = current.parent;
  }
  return null;
}

export default function WalkScene({ variant, audioBands, resetNonce, onFocusNode }: WalkSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const valuesRef = useRef<SceneValues>({ audioBands, resetNonce });
  const callbackRef = useRef(onFocusNode);
  useEffect(() => {
    valuesRef.current = { audioBands, resetNonce };
    callbackRef.current = onFocusNode;
  }, [audioBands, resetNonce, onFocusNode]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const nodes = flowerNodesForVariant(variant, 20260814);
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const scene = new THREE.Scene();
    const palette = palettes[variant];
    scene.background = new THREE.Color(palette.background);
    const fog = new THREE.FogExp2(palette.fog, variant === "sound" ? 0.018 : 0.015);
    scene.fog = fog;
    const fogColor = new THREE.Color(palette.fog);
    const camera = new THREE.PerspectiveCamera(66, Math.max(1, host.clientWidth / Math.max(host.clientHeight, 1)), 0.08, 90);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.65));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = variant === "sound" ? 1.18 : 1.28;
    renderer.domElement.setAttribute("aria-label", `${variant === "flora" ? "彩色花梯" : "声流楼梯"}自由行走场景`);
    renderer.domElement.tabIndex = 0;
    host.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xcdd6ff, variant === "sound" ? 0x050820 : 0x24102d, variant === "sound" ? 1.45 : 1.8));
    const keyLight = new THREE.DirectionalLight(variant === "sound" ? 0x83cfff : 0xffb8df, variant === "sound" ? 1.6 : 2.2);
    keyLight.position.set(-7, 16, 10);
    scene.add(keyLight);

    const walkables = buildStage(scene, variant, nodes);
    const floraCanopy = scene.getObjectByName("flora-canopy");
    const soundField = scene.getObjectByName("sound-field");
    const nodeRuntimes: NodeRuntime[] = [];
    const accentPalette = palettes[variant].accent;
    nodes.forEach((node, nodeIndex) => {
      const group = new THREE.Group();
      group.name = `flower-node-${node.id}`;
      const landmark = variant === "flora" ? buildFloraLandmark(node, accentPalette[nodeIndex % accentPalette.length]) : buildSoundLandmark(node, accentPalette[nodeIndex % accentPalette.length]);
      group.add(landmark);
      const light = new THREE.PointLight(accentPalette[nodeIndex % accentPalette.length], variant === "sound" ? 3.2 : 2.6, 9, 1.5);
      light.position.set(0, 1.5, 0);
      group.add(light);
      const flowerOffsets: [number, number, number][] = [[-0.58, 0.08, 0.18], [0, 0.02, 0], [0.58, 0.06, 0.18]];
      const flowers = flowerOffsets.map((offset, flowerIndex) => {
        const isRare = node.rarity === "rare" && flowerIndex === 1;
        const flower = isRare ? createFoxtailLily(node.seed + flowerIndex, node.palette) : createCommonFlower(node.seed + flowerIndex, node.palette);
        flower.position.set(...offset);
        flower.scale.setScalar(isRare ? 0.78 : 0.72 + flowerIndex * 0.04);
        flower.userData.flowerNodeId = node.id;
        flower.userData.clickable = true;
        group.add(flower);
        return flower;
      });
      group.position.set(...node.position);
      scene.add(group);
      nodeRuntimes.push({ node, group, landmark, light, flowers });
    });

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const pressedKeys = new Set<string>();
    const look = { yaw: 0, pitch: -0.04 };
    const player = new THREE.Vector3(...nodes[0].position);
    let pointerDown = false;
    let lastReset = valuesRef.current.resetNonce;
    let focusNodeId = "";
    let focusUntil = 0;
    let disposed = false;

    const resetPlayer = () => {
      player.set(...nodes[0].position);
      look.yaw = 0;
      look.pitch = -0.04;
      focusNodeId = "";
      focusUntil = 0;
      callbackRef.current(null);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) {
        event.preventDefault();
        pressedKeys.add(key);
      }
      if (key === "r") resetPlayer();
    };
    const onKeyUp = (event: KeyboardEvent) => pressedKeys.delete(event.key.toLowerCase());
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    const onPointerDown = () => {
      pointerDown = true;
      renderer.domElement.focus();
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!pointerDown && document.pointerLockElement !== renderer.domElement) return;
      look.yaw += event.movementX * 0.0026;
      look.pitch = Math.max(-0.92, Math.min(0.78, look.pitch - event.movementY * 0.0022));
    };
    const onPointerUp = (event: PointerEvent) => {
      pointerDown = false;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(scene.children, true).find((item) => findFlowerRoot(item.object));
      const root = findFlowerRoot(hit?.object ?? null);
      const node = root ? nodeById.get(root.userData.flowerNodeId as string) ?? null : null;
      if (node && player.distanceTo(new THREE.Vector3(...node.position)) < 6.5) {
        focusNodeId = node.id;
        focusUntil = performance.now() + 1800;
        callbackRef.current(node);
      }
      else if (!root && renderer.domElement.requestPointerLock) renderer.domElement.requestPointerLock();
    };
    const onPointerCancel = () => {
      pointerDown = false;
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointercancel", onPointerCancel);

    const surfaceYAt = (x: number, z: number, currentY: number) => {
      raycaster.set(new THREE.Vector3(x, WALKABLE_TOP_Y, z), new THREE.Vector3(0, -1, 0));
      const hit = raycaster.intersectObjects(walkables, false)[0];
      if (!hit || Math.abs(hit.point.y - currentY) > 0.72) return null;
      return hit.point.y;
    };

    const resize = () => {
      if (!host.clientWidth || !host.clientHeight) return;
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);

    const clock = new THREE.Clock();
    let frame = 0;
    const animate = () => {
      if (disposed) return;
      frame = requestAnimationFrame(animate);
      const delta = Math.min(clock.getDelta(), 0.05);
      const time = clock.elapsedTime;
      const values = valuesRef.current;
      if (values.resetNonce !== lastReset) {
        lastReset = values.resetNonce;
        resetPlayer();
      }

      const move = new THREE.Vector3();
      const forward = new THREE.Vector3(Math.sin(look.yaw), 0, -Math.cos(look.yaw));
      const right = new THREE.Vector3(Math.cos(look.yaw), 0, Math.sin(look.yaw));
      if (pressedKeys.has("w") || pressedKeys.has("arrowup")) move.add(forward);
      if (pressedKeys.has("s") || pressedKeys.has("arrowdown")) move.sub(forward);
      if (pressedKeys.has("d") || pressedKeys.has("arrowright")) move.add(right);
      if (pressedKeys.has("a") || pressedKeys.has("arrowleft")) move.sub(right);
      if (move.lengthSq() > 0) {
        move.normalize().multiplyScalar(WALK_SPEED * delta);
        const nextX = player.x + move.x;
        const nextZ = player.z + move.z;
        const nextY = surfaceYAt(nextX, nextZ, player.y);
        if (nextY !== null) player.set(nextX, nextY, nextZ);
      }

      const eye = player.clone().add(new THREE.Vector3(0, EYE_HEIGHT, 0));
      let lookDirection = new THREE.Vector3(Math.sin(look.yaw) * Math.cos(look.pitch), Math.sin(look.pitch), -Math.cos(look.yaw) * Math.cos(look.pitch));
      if (focusNodeId && performance.now() < focusUntil) {
        const targetNode = nodeById.get(focusNodeId);
        if (targetNode) {
          const focusDirection = new THREE.Vector3(...targetNode.position).add(new THREE.Vector3(0, 1.2, 0)).sub(eye).normalize();
          lookDirection = lookDirection.lerp(focusDirection, 0.06).normalize();
        }
      } else {
        focusNodeId = "";
      }
      camera.position.copy(eye);
      camera.lookAt(eye.clone().add(lookDirection.multiplyScalar(5.5)));

      if (floraCanopy) {
        floraCanopy.rotation.y = Math.sin(time * 0.18) * 0.06 + values.audioBands.bass * 0.04;
        floraCanopy.scale.setScalar(1 + values.audioBands.activity * 0.025);
      }
      if (soundField) {
        soundField.children.forEach((child, index) => {
          if (child.userData.soundRole === "frame") {
            child.scale.y = 1 + values.audioBands.subBass * (0.08 + (index % 3) * 0.04);
            child.rotation.y = Math.sin(time * 0.7 + index) * values.audioBands.lowMid * 0.025;
          }
          if (child.userData.soundRole === "wave") {
            child.scale.x = 1 + values.audioBands.mid * 0.16;
            child.scale.y = 1 + values.audioBands.subBass * 0.12;
            child.rotation.z = Math.sin(time * 0.5 + index) * values.audioBands.high * 0.035;
          }
        });
      }

      nodeRuntimes.forEach((runtime, nodeIndex) => {
        const nodePosition = new THREE.Vector3(...runtime.node.position);
        const distance = player.distanceTo(nodePosition);
        const proximity = Math.max(0, 1 - distance / 5.5);
        const motion = flowerMotionForNode(runtime.node, values.audioBands, time, proximity, variant);
        runtime.light.intensity = (variant === "sound" ? 2.1 : 1.8) + motion.breath * 5 + proximity * 2;
        runtime.group.position.y = runtime.node.position[1] + Math.sin(time * 0.9 + nodeIndex) * motion.breath * 0.045;
        runtime.landmark.rotation.y = time * (variant === "sound" ? 0.12 + motion.shimmer * 0.45 : 0.05 + motion.bloom * 0.12);
        runtime.landmark.scale.setScalar(1 + proximity * 0.08 + motion.breath * (variant === "sound" ? 0.2 : 0.08));
        if (variant === "sound") {
          const bars = runtime.landmark.getObjectByName("frequency-bars");
          bars?.children.forEach((bar, index) => {
            bar.scale.y = 0.72 + values.audioBands.mid * (0.5 + (index % 3) * 0.26) + values.audioBands.high * (index % 2 ? 0.26 : 0.08);
          });
        }
        runtime.flowers.forEach((flower) => {
          if (flower.name === "foxtail-lily") updateFoxtailLily(flower, time, { proximity, audio: values.audioBands, motion });
          else updateCommonFlower(flower, time, motion);
        });
      });

      if (variant === "sound") {
        const glow = values.audioBands.activity * 0.22 + values.audioBands.subBass * 0.18;
        fog.color.copy(fogColor).offsetHSL(values.audioBands.high * 0.025, 0.06, glow * 0.08);
        fog.density = 0.018 - values.audioBands.activity * 0.003;
      }
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointercancel", onPointerCancel);
      if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
      renderer.dispose();
      renderer.domElement.remove();
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose?.();
        if (Array.isArray(mesh.material)) mesh.material.forEach((material) => material.dispose());
        else mesh.material?.dispose?.();
      });
    };
  }, [variant]);

  return <div ref={hostRef} className={`stairs-scene-host scene-${variant}`} />;
}
