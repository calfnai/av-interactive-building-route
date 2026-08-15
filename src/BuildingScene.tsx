"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  BLOCKED_EVENTS,
  FLOOR_HEIGHT,
  FLOORS,
  ROUTE_EVENTS,
  SPATIAL_CONNECTIONS,
  SPATIAL_NODES,
  unitX,
  yForFloor,
  type AccessState,
  type RouteEvent,
  type Vec3,
} from "./spatial-data";
import { floorAVReactionFor, type FloorAVReaction, type WallReactionState } from "./audio-bands";
import {
  createCorridorColliders,
  movementVector,
  resolveMotion,
  type Collider,
} from "./fps-navigation";

export type CameraCommand = "overview" | "route" | "chase" | "walk" | "top";

interface BuildingSceneProps {
  progress: number;
  currentEvent: RouteEvent;
  floorFocus: number | null;
  floorSpread: number;
  xray: number;
  ghostRoute: Vec3[] | null;
  ghostIntensity: number;
  handOrbit: number | null;
  handZoom: number | null;
  cameraCommand: CameraCommand;
  commandVersion: number;
  wallReaction: WallReactionState;
  walkFloor: number;
  onWalkFloorChange: (floor: number) => void;
}

const palette = {
  floor: 0x223038,
  floorEdge: 0x5d7078,
  unit1: 0x60d5c8,
  unit2: 0x68a4ff,
  room: 0x28343a,
  wall: 0x334951,
  stair: 0xd2c4a7,
  elevator: 0xc3a7ff,
  route: 0xf2ff63,
  locked: 0xff715b,
  open: 0x63e6be,
};

const toVector = ([x, y, z]: Vec3) => new THREE.Vector3(x, y, z);

function makeLine(points: THREE.Vector3[], color: number, opacity = 1) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity });
  return new THREE.Line(geometry, material);
}

function routePoseAt(progress: number) {
  const maxIndex = ROUTE_EVENTS.length - 1;
  const scaled = Math.max(0, Math.min(1, progress)) * maxIndex;
  const startIndex = Math.min(Math.floor(scaled), maxIndex - 1);
  const alpha = scaled - startIndex;
  const from = toVector(ROUTE_EVENTS[startIndex].position);
  const to = toVector(ROUTE_EVENTS[Math.min(startIndex + 1, maxIndex)].position);
  const position = from.clone().lerp(to, alpha);
  const movement = to.clone().sub(from);
  const flatMovement = new THREE.Vector3(movement.x, 0, movement.z);

  if (flatMovement.lengthSq() < 0.01) {
    return { position, heading: null, startIndex };
  }

  return { position, heading: flatMovement.normalize(), startIndex };
}

function explodePosition(position: THREE.Vector3, floorSpread: number) {
  const floorCoordinate = position.y / FLOOR_HEIGHT + 1;
  return position.clone().add(new THREE.Vector3(0, (floorCoordinate - 5.5) * floorSpread * 0.92, 0));
}

function applyChaseCamera(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  position: THREE.Vector3,
  heading: THREE.Vector3,
  immediate = false,
) {
  const right = new THREE.Vector3(heading.z, 0, -heading.x);
  const lookAt = position
    .clone()
    .add(heading.clone().multiplyScalar(1.55))
    .add(new THREE.Vector3(0, 0.95, 0));
  const cameraPosition = position
    .clone()
    .add(heading.clone().multiplyScalar(-3.9))
    .add(right.multiplyScalar(0.62))
    .add(new THREE.Vector3(0, 1.75, 0));

  if (immediate) {
    camera.position.copy(cameraPosition);
    controls.target.copy(lookAt);
  } else {
    camera.position.lerp(cameraPosition, 0.18);
    controls.target.lerp(lookAt, 0.24);
  }
  controls.update();
}

function applyWalkCamera(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  position: THREE.Vector3,
  heading: THREE.Vector3,
  immediate = false,
) {
  const eye = position.clone().add(new THREE.Vector3(0, 1.5, 0));
  const lookAt = eye.clone().add(heading.clone().multiplyScalar(2.8)).add(new THREE.Vector3(0, 0.2, 0));
  if (immediate) {
    camera.position.copy(eye);
    controls.target.copy(lookAt);
  } else {
    camera.position.lerp(eye, 0.2);
    controls.target.lerp(lookAt, 0.24);
  }
  controls.update();
}

interface PlayerState {
  position: THREE.Vector3;
  yaw: number;
  pitch: number;
  floor: number;
}

type NavigationMode =
  | "walking"
  | "stairs"
  | "elevator-opening"
  | "elevator-open"
  | "elevator-inside"
  | "elevator-riding"
  | "elevator-arrived";

interface NavigationState {
  mode: NavigationMode;
  floor: number;
  transitionStarted: number;
  transitionFromY: number;
  transitionToY: number;
  transitionTargetFloor: number;
  transitionArcDirection: number;
  transitionFromZ: number;
  transitionToZ: number;
  transitionFromX: number;
  transitionStairX: number;
  transitionDuration: number;
  elevatorUnit: 1 | 2;
  elevatorTargetFloor: number;
}

function applyFirstPersonCamera(camera: THREE.PerspectiveCamera, player: PlayerState, cameraBob = 0) {
  const eye = player.position.clone().add(new THREE.Vector3(0, 1.5 + cameraBob, 0));
  const direction = new THREE.Vector3(
    Math.sin(player.yaw) * Math.cos(player.pitch),
    Math.sin(player.pitch),
    Math.cos(player.yaw) * Math.cos(player.pitch),
  );
  camera.position.copy(eye);
  camera.lookAt(eye.clone().add(direction));
}

function updateKeyboardPlayer(player: PlayerState, keys: Set<string>, delta: number, colliders: Collider[]) {
  const movement = movementVector(player.yaw, {
    forward: keys.has("w"),
    backward: keys.has("s"),
    left: keys.has("a"),
    right: keys.has("d"),
  });
  if (!movement.x && !movement.z) return false;
  const speed = keys.has("shift") ? 5.1 : 3.6;
  const step = Math.min(delta, 0.05) * speed;
  const resolved = resolveMotion(
    { x: player.position.x, z: player.position.z },
    { x: movement.x * step, z: movement.z * step },
    colliders,
  );
  const moved = resolved.x !== player.position.x || resolved.z !== player.position.z;
  player.position.x = resolved.x;
  player.position.z = resolved.z;
  return moved;
}

function nearestSpatialNode(
  position: THREE.Vector3,
  kind: "stair" | "elevatorHall" | "elevatorCabin",
  floor: number,
) {
  let nearest: (typeof SPATIAL_NODES)[number] | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const node of SPATIAL_NODES) {
    if (node.kind !== kind || node.floor !== floor) continue;
    const distance = Math.hypot(node.position[0] - position.x, node.position[2] - position.z);
    if (distance < nearestDistance) {
      nearest = node;
      nearestDistance = distance;
    }
  }
  return nearestDistance < 1.85 ? nearest : null;
}

function faceMarker(marker: THREE.Group, heading: THREE.Vector3) {
  marker.rotation.y = Math.atan2(heading.x, heading.z);
}

function createTextSprite(text: string, color = "#dce7e8", scale = 1) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d")!;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = 260 * ratio;
  canvas.height = 54 * ratio;
  context.scale(ratio, ratio);
  context.font = "600 18px Arial, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "rgba(10, 16, 19, .82)";
  context.roundRect(2, 2, 256, 50, 9);
  context.fill();
  context.fillStyle = color;
  context.fillText(text, 130, 27);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(4.8 * scale, 1 * scale, 1);
  sprite.renderOrder = 20;
  return sprite;
}

function addBox(
  group: THREE.Group,
  size: Vec3,
  position: Vec3,
  color: number,
  opacity = 1,
  wireframe = false,
) {
  const geometry = new THREE.BoxGeometry(...size);
  const material = new THREE.MeshStandardMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    roughness: 0.76,
    metalness: 0.08,
    wireframe,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.userData.baseOpacity = opacity;
  group.add(mesh);
  return mesh;
}

function addDoor(group: THREE.Group, position: Vec3, locked: boolean, label: string) {
  const door = addBox(group, [0.16, 1.45, 1.15], position, locked ? palette.locked : palette.open, 0.88);
  door.userData.isDoor = true;
  const sprite = createTextSprite(locked ? `LOCKED · ${label}` : `OPEN · ${label}`, locked ? "#ff8b78" : "#75f0c7", 0.7);
  sprite.position.set(position[0], position[1] + 1.05, position[2]);
  group.add(sprite);
  return door;
}

function addFlatDoor(
  group: THREE.Group,
  position: Vec3,
  width: number,
  locked: boolean,
  color: number,
  label?: string,
) {
  const door = addBox(group, [width, 1.08, 0.12], position, locked ? palette.locked : color, 0.82);
  door.userData.isDoor = true;
  addBox(group, [0.08, 0.12, 0.1], [position[0] + width * 0.32, position[1] + 0.05, position[2] - 0.08], 0xf4f1d0, 0.95);
  if (label) {
    const sprite = createTextSprite(label, locked ? "#ff8b78" : "#dce7e8", 0.55);
    sprite.position.set(position[0], position[1] + 0.82, position[2] + 0.06);
    group.add(sprite);
  }
  return door;
}

function addStairSteps(group: THREE.Group, base: Vec3, unit: 1 | 2) {
  const direction = unit === 1 ? -1 : 1;
  const stepCount = 18;
  for (let index = 0; index < stepCount; index += 1) {
    const alpha = index / (stepCount - 1);
    addBox(
      group,
      [1.12, 0.08, 0.3],
      [base[0], base[1] + alpha * FLOOR_HEIGHT, base[2] + direction * (-0.88 + alpha * 1.76)],
      palette.stair,
      0.74,
    );
  }
  addBox(group, [1.34, FLOOR_HEIGHT, 0.08], [base[0], base[1] + FLOOR_HEIGHT * 0.5, base[2] - direction * 1.04], palette.stair, 0.22);
  addBox(group, [1.34, FLOOR_HEIGHT, 0.08], [base[0], base[1] + FLOOR_HEIGHT * 0.5, base[2] + direction * 1.04], palette.stair, 0.22);
}

interface ResonanceSurface {
  group: THREE.Group;
  floor: number;
  theme: FloorAVReaction;
  panelMaterial: THREE.ShaderMaterial;
  stripMeshes: THREE.Mesh[];
  stripMaterials: THREE.MeshStandardMaterial[];
  particleMaterial: THREE.PointsMaterial;
  particleGeometry: THREE.BufferGeometry;
  particleBase: Float32Array;
  particlePhases: Float32Array;
  rippleMeshes: THREE.Mesh[];
  rippleMaterials: THREE.MeshBasicMaterial[];
}

interface InteractiveDoor {
  id: string;
  mesh: THREE.Mesh;
  floor: number;
  position: Vec3;
  access: AccessState;
  label: string;
  kind: "room" | "interconnect" | "side" | "stair" | "elevator";
  open: boolean;
}

function createResonanceSurface(
  scene: THREE.Scene,
  position: Vec3,
  floor: number,
  showLabel = false,
  rotationY = 0,
  width = 1.62,
): ResonanceSurface {
  const group = new THREE.Group();
  group.position.set(...position);
  group.rotation.y = rotationY;
  const theme = floorAVReactionFor(floor);

  addBox(group, [width, 2.22, 0.1], [0, 0, -0.06], 0x17262b, 0.96);
  const panelMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uDisplacement: { value: 0 },
      uColorShift: { value: 0 },
      uLineDensity: { value: 0 },
      uBloom: { value: 0 },
      uPulse: { value: 0 },
      uPropagation: { value: 0 },
      uHue: { value: theme.hue },
      uPattern: { value: theme.pattern },
    },
    vertexShader: `
      uniform float uTime;
      uniform float uDisplacement;
      uniform float uPulse;
      uniform float uPropagation;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 transformed = position;
        float wave = sin(position.y * 15.0 + uTime * (1.8 + uPropagation * 4.0))
          * cos(position.x * 18.0 + uTime * (0.7 + uPulse * 2.0));
        transformed.z += wave * uDisplacement * (0.18 + uPulse * 0.34);
        transformed.x += sin(position.y * 5.0 + uTime * 0.8) * uDisplacement * 0.035;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uColorShift;
      uniform float uLineDensity;
      uniform float uBloom;
      uniform float uPropagation;
      uniform float uHue;
      uniform float uPattern;
      varying vec2 vUv;
      vec3 hsv2rgb(vec3 c) {
        vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
        vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
        return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
      }
      void main() {
        vec3 base = hsv2rgb(vec3(mod(uHue + uColorShift * 0.12, 1.0), 0.72, 0.72));
        float sweep = sin((vUv.y * uPattern + vUv.x * 7.0 + uTime * (0.55 + uPropagation * 2.8)) * 3.14159) * 0.5 + 0.5;
        float channels = smoothstep(0.48, 0.88, sweep);
        float glow = 0.32 + uBloom * 1.55 + channels * uLineDensity * 1.5;
        gl_FragColor = vec4(base * glow, 0.82 + uBloom * 0.18);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.84, 2.1, 18, 36), panelMaterial);
  panel.position.z = 0.01;
  group.add(panel);

  const stripMaterials: THREE.MeshStandardMaterial[] = [];
  const stripMeshes: THREE.Mesh[] = [];
  for (let index = 0; index < 7; index += 1) {
    const strip = addBox(
      group,
      [Math.max(0.012, width * 0.016), 1.88, 0.035],
      [-width * 0.32 + index * width * 0.107, 0, 0.075],
      0x6de0d0,
      0.34,
    );
    stripMeshes.push(strip);
    stripMaterials.push(strip.material as THREE.MeshStandardMaterial);
  }

  const rippleMeshes: THREE.Mesh[] = [];
  const rippleMaterials: THREE.MeshBasicMaterial[] = [];
  for (let index = 0; index < 3; index += 1) {
    const rippleMaterial = new THREE.MeshBasicMaterial({
      color: 0xeafa61,
      transparent: true,
      opacity: 0.12,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const ripple = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.165, 48), rippleMaterial);
    ripple.position.set(0, 0.15, 0.12);
    ripple.scale.setScalar(0.55 + index * 0.2);
    group.add(ripple);
    rippleMeshes.push(ripple);
    rippleMaterials.push(rippleMaterial);
  }

  const particleCount = 240;
  const particlePositions = new Float32Array(particleCount * 3);
  const particleBase = new Float32Array(particleCount * 3);
  const particlePhases = new Float32Array(particleCount);
  for (let index = 0; index < particleCount; index += 1) {
    const seed = index * 17.731;
    particleBase[index * 3] = ((Math.sin(seed) * 0.5 + 0.5) - 0.5) * width * 0.84;
    particleBase[index * 3 + 1] = ((Math.sin(seed * 1.7) * 0.5 + 0.5) - 0.5) * 1.98;
    particleBase[index * 3 + 2] = 0.12 + (Math.sin(seed * 2.3) * 0.5 + 0.5) * 0.06;
    particlePositions[index * 3] = particleBase[index * 3];
    particlePositions[index * 3 + 1] = particleBase[index * 3 + 1];
    particlePositions[index * 3 + 2] = particleBase[index * 3 + 2];
    particlePhases[index] = Math.sin(seed * 3.1) * 0.5 + 0.5;
  }
  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
  const particleMaterial = new THREE.PointsMaterial({
    color: 0xf2ff63,
    size: 0.034,
    transparent: true,
    opacity: 0.14,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  group.add(new THREE.Points(particleGeometry, particleMaterial));
  if (showLabel) {
    group.add(createTextSprite(`${floor}F · ${theme.label}`, "#dffb8a", 0.34));
    group.children[group.children.length - 1].position.set(0, 1.3, 0.08);
  }
  scene.add(group);
  return {
    group,
    floor,
    theme,
    panelMaterial,
    stripMeshes,
    stripMaterials,
    particleMaterial,
    particleGeometry,
    particleBase,
    particlePhases,
    rippleMeshes,
    rippleMaterials,
  };
}

export default function BuildingScene({
  progress,
  currentEvent,
  floorFocus,
  floorSpread,
  xray,
  ghostRoute,
  ghostIntensity,
  handOrbit,
  handZoom,
  cameraCommand,
  commandVersion,
  wallReaction,
  walkFloor,
  onWalkFloorChange,
}: BuildingSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [rendererError, setRendererError] = useState(false);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const markerRef = useRef<THREE.Group | null>(null);
  const routeRef = useRef<THREE.Line | null>(null);
  const ghostRouteRef = useRef<THREE.Line | null>(null);
  const resonanceSurfacesRef = useRef<ResonanceSurface[]>([]);
  const collidersRef = useRef<Collider[]>([]);
  const wallReactionRef = useRef(wallReaction);
  const locomotionPhaseRef = useRef(0);
  const elevatorDoorsRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const interactiveDoorsRef = useRef<Map<string, InteractiveDoor>>(new Map());
  const openDoorIdsRef = useRef(new Set<string>());
  const cameraCommandRef = useRef(cameraCommand);
  const onWalkFloorChangeRef = useRef(onWalkFloorChange);
  const initialPlayerPosition = SPATIAL_NODES.find(
    (node) => node.kind === "public" && node.unit === 1 && node.floor === 1,
  )?.position ?? ROUTE_EVENTS[0].position;
  const playerRef = useRef<PlayerState>({
    // Start in the public corridor, not inside the stair trigger. The player
    // must deliberately walk to a stair mouth before a vertical transition.
    position: toVector(initialPlayerPosition),
    // Face the corridor wall and apartment doors on spawn so the sound-wall
    // system is immediately visible before the player starts moving.
    yaw: 0,
    pitch: 0,
    floor: walkFloor,
  });
  const movementKeysRef = useRef(new Set<string>());
  const fpsPointerLockedRef = useRef(false);
  const navigationRef = useRef<NavigationState>({
    mode: "walking",
    floor: walkFloor,
    transitionStarted: 0,
    transitionFromY: yForFloor(walkFloor) + 0.38,
    transitionToY: yForFloor(walkFloor) + 0.38,
    transitionTargetFloor: walkFloor,
    elevatorUnit: 1,
    elevatorTargetFloor: walkFloor,
    transitionArcDirection: 0,
    transitionFromZ: -2.25,
    transitionToZ: -2.25,
    transitionFromX: unitX(1) - 2.4,
    transitionStairX: unitX(1) - 2.4,
    transitionDuration: 1250,
  });
  const elevatorTimeoutRef = useRef<number | null>(null);
  const [fpsPointerLocked, setFpsPointerLocked] = useState(false);
  const [navigationMessage, setNavigationMessageState] = useState("点击画面锁定鼠标 · WASD 行走");
  const navigationMessageRef = useRef("点击画面锁定鼠标 · WASD 行走");

  const setNavigationMessage = (message: string) => {
    if (navigationMessageRef.current === message) return;
    navigationMessageRef.current = message;
    setNavigationMessageState(message);
  };

  cameraCommandRef.current = cameraCommand;
  onWalkFloorChangeRef.current = onWalkFloorChange;
  wallReactionRef.current = wallReaction;
  const characterHeadingRef = useRef(new THREE.Vector3(0, 0, -1));
  const focusGroupsRef = useRef<Map<number, THREE.Group>>(new Map());

  useEffect(() => {
    const player = playerRef.current;
    const navigation = navigationRef.current;
    if (navigation.mode === "walking") {
      player.floor = walkFloor;
      navigation.floor = walkFloor;
      player.position.y = yForFloor(walkFloor) + 0.38;
    }
    collidersRef.current = createCorridorColliders(walkFloor, {
      openInterconnect: walkFloor === 8 || walkFloor === 10,
      openDoors: openDoorIdsRef.current,
    });
  }, [walkFloor]);

  const refreshCorridorColliders = () => {
    const navigation = navigationRef.current;
    collidersRef.current = createCorridorColliders(navigation.floor, {
      openInterconnect: navigation.floor === 8 || navigation.floor === 10 || openDoorIdsRef.current.has(`f${navigation.floor}-interconnect`),
      openElevator: ["elevator-open", "elevator-inside", "elevator-arrived"].includes(navigation.mode),
      openDoors: openDoorIdsRef.current,
    });
  };

  const setDoorOpen = (doorId: string, open: boolean) => {
    const door = interactiveDoorsRef.current.get(doorId);
    if (!door) return;
    door.open = open;
    door.mesh.userData.openTarget = open ? 0.06 : 1;
    if (open) openDoorIdsRef.current.add(doorId);
    else openDoorIdsRef.current.delete(doorId);
    refreshCorridorColliders();
  };

  const setElevatorDoor = (unit: 1 | 2, floor: number, open: boolean) => {
    const door = elevatorDoorsRef.current.get(`${unit}-${floor}`);
    if (door) door.scale.x = open ? 0.06 : 1;
    setDoorOpen(`u${unit}-f${floor}-elevator-door`, open);
  };

  const nearestInteractiveDoor = (position: THREE.Vector3, floor: number, includeElevator = false) => {
    let nearest: InteractiveDoor | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const door of interactiveDoorsRef.current.values()) {
      if (door.floor !== floor || (!includeElevator && door.kind === "elevator")) continue;
      const distance = Math.hypot(door.position[0] - position.x, door.position[2] - position.z);
      if (distance < nearestDistance) {
        nearest = door;
        nearestDistance = distance;
      }
    }
    return nearestDistance < 1.45 ? nearest : null;
  };

  const interactWithNearestDoor = () => {
    const navigation = navigationRef.current;
    const player = playerRef.current;
    const door = nearestInteractiveDoor(player.position, navigation.floor);
    if (!door) {
      setNavigationMessage("请走到门前，再按 E 互动");
      return;
    }
    if (door.access === "locked" || door.access === "card") {
      setNavigationMessage(`${door.label} 已锁定，不能打开`);
      return;
    }
    setDoorOpen(door.id, !door.open);
    setNavigationMessage(door.open ? `${door.label} 已打开` : `${door.label} 已关闭`);
  };

  const startStairTransition = (direction: 1 | -1) => {
    const navigation = navigationRef.current;
    const player = playerRef.current;
    if (navigation.mode !== "walking") return;
    const stair = nearestSpatialNode(player.position, "stair", navigation.floor);
    if (!stair) {
      setNavigationMessage("请先走到楼梯口，再按 W / S 上下楼");
      return;
    }
    const targetFloor = navigation.floor + direction;
    const targetStair = SPATIAL_NODES.find(
      (node) => node.kind === "stair" && node.unit === stair.unit && node.floor === targetFloor,
    );
    if (!targetStair || stair.access === "locked" || targetStair.access === "locked") {
      setNavigationMessage("这段楼梯被锁住了，不能穿过楼层");
      return;
    }
    movementKeysRef.current.clear();
    navigation.mode = "stairs";
    navigation.transitionStarted = performance.now();
    navigation.transitionFromY = player.position.y;
    navigation.transitionToY = yForFloor(targetFloor) + 0.38;
    navigation.transitionTargetFloor = targetFloor;
    navigation.transitionArcDirection = stair.unit === 1 ? -1 : 1;
    navigation.transitionFromZ = player.position.z;
    navigation.transitionToZ = targetStair.position[2];
    navigation.transitionFromX = player.position.x;
    navigation.transitionStairX = stair.position[0];
    navigation.transitionDuration = 1250;
    setNavigationMessage(direction > 0 ? `楼梯上行至 ${targetFloor}F…` : `楼梯下行至 ${targetFloor}F…`);
  };

  const beginElevatorCall = () => {
    const navigation = navigationRef.current;
    const player = playerRef.current;
    if (navigation.mode !== "walking") return;
    const hall = nearestSpatialNode(player.position, "elevatorHall", navigation.floor);
    if (!hall || (hall.unit !== 1 && hall.unit !== 2)) {
      setNavigationMessage("请先走到电梯门前，再按 E 开门");
      return;
    }
    const elevatorUnit = hall.unit;
    movementKeysRef.current.clear();
    navigation.mode = "elevator-opening";
    navigation.elevatorUnit = elevatorUnit;
    navigation.elevatorTargetFloor = navigation.floor;
    setElevatorDoor(elevatorUnit, navigation.floor, false);
    setNavigationMessage("电梯门正在打开…");
    if (elevatorTimeoutRef.current !== null) window.clearTimeout(elevatorTimeoutRef.current);
    elevatorTimeoutRef.current = window.setTimeout(() => {
      if (navigationRef.current.mode !== "elevator-opening") return;
      navigationRef.current.mode = "elevator-open";
      setElevatorDoor(elevatorUnit, navigation.floor, true);
      setNavigationMessage("电梯门已打开，按 W 进入轿厢");
    }, 650);
  };

  useEffect(() => {
    const editableTarget = (target: EventTarget | null) => {
      const element = target as HTMLElement | null;
      return element?.tagName === "INPUT" || element?.tagName === "SELECT" || element?.tagName === "TEXTAREA";
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (editableTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (cameraCommandRef.current !== "walk") return;
      if (!fpsPointerLockedRef.current) return;
      const navigation = navigationRef.current;
      const player = playerRef.current;
      const isMovementKey = ["w", "a", "s", "d", "shift"].includes(key);
      const isDirectionalKey = ["w", "a", "s", "d"].includes(key);
      const numericFloor = event.key === "0" ? 10 : Number(event.key);

      if (navigation.mode === "elevator-inside" && numericFloor >= 1 && numericFloor <= 10) {
        navigation.elevatorTargetFloor = numericFloor;
        setNavigationMessage(`目的楼层 ${numericFloor}F · 按 E 关门并运行`);
        event.preventDefault();
        return;
      }

      if (key === "e" && navigation.mode === "walking") {
        const elevatorHall = nearestSpatialNode(player.position, "elevatorHall", navigation.floor);
        if (elevatorHall) beginElevatorCall();
        else interactWithNearestDoor();
        event.preventDefault();
        return;
      }

      if (key === "e" && navigation.mode === "elevator-inside") {
        if (navigation.elevatorTargetFloor === navigation.floor) {
          setNavigationMessage("请先用数字键选择目的楼层");
          event.preventDefault();
          return;
        }
        if (!elevatorDoorsRef.current.has(`${navigation.elevatorUnit}-${navigation.elevatorTargetFloor}`)) {
          setNavigationMessage(`${navigation.elevatorUnit} 单元没有停靠 ${navigation.elevatorTargetFloor}F 的电梯门`);
          event.preventDefault();
          return;
        }
        setElevatorDoor(navigation.elevatorUnit, navigation.floor, false);
        navigation.mode = "elevator-riding";
        navigation.transitionStarted = performance.now();
        navigation.transitionFromY = player.position.y;
        navigation.transitionTargetFloor = navigation.elevatorTargetFloor;
        navigation.transitionToY = yForFloor(navigation.elevatorTargetFloor) + 0.38;
        movementKeysRef.current.clear();
        setNavigationMessage(`电梯运行至 ${navigation.elevatorTargetFloor}F…`);
        event.preventDefault();
        return;
      }

      if (navigation.mode === "elevator-open" && key === "w") {
        const cabin = nearestSpatialNode(player.position, "elevatorCabin", navigation.floor);
        if (cabin) {
          player.position.set(...cabin.position);
          navigation.mode = "elevator-inside";
          setNavigationMessage("电梯内 · 数字键选择楼层 · E 关门运行");
        }
        event.preventDefault();
        return;
      }

      if (navigation.mode === "elevator-arrived" && isDirectionalKey) {
        const hall = SPATIAL_NODES.find(
          (node) => node.kind === "elevatorHall" && node.unit === navigation.elevatorUnit && node.floor === navigation.floor,
        );
        if (hall) player.position.set(...hall.position);
        navigation.mode = "walking";
        setNavigationMessage("电梯门已打开 · WASD 出电梯");
        movementKeysRef.current.add(key);
        event.preventDefault();
        return;
      }

      if (navigation.mode === "elevator-inside" && isMovementKey) {
        event.preventDefault();
        return;
      }

      if (["stairs", "elevator-opening", "elevator-riding"].includes(navigation.mode)) {
        if (isMovementKey || key === "e") event.preventDefault();
        return;
      }

      if (isMovementKey) {
        movementKeysRef.current.add(key);
        event.preventDefault();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      movementKeysRef.current.delete(event.key.toLowerCase());
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      if (elevatorTimeoutRef.current !== null) window.clearTimeout(elevatorTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1114);
    scene.fog = new THREE.FogExp2(0x0b1114, 0.013);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(42, host.clientWidth / host.clientHeight, 0.1, 140);
    camera.position.set(32, 27, 36);
    cameraRef.current = camera;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    } catch (error) {
      console.warn("3D preview unavailable because this browser could not create a WebGL context.", error);
      setRendererError(true);
      return;
    }
    setRendererError(false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.setAttribute("aria-label", "居民楼栋三维空间与人物行进轨迹");
    renderer.domElement.tabIndex = 0;
    host.appendChild(renderer.domElement);

    const onCanvasClick = () => {
      if (cameraCommandRef.current !== "walk") return;
      try {
        const lockRequest = renderer.domElement.requestPointerLock?.();
        void Promise.resolve(lockRequest).catch(() => {
          setNavigationMessage("当前预览容器不允许锁定鼠标，请复制地址到 Safari / Chrome 打开");
        });
      } catch {
        setNavigationMessage("当前预览容器不允许锁定鼠标，请复制地址到 Safari / Chrome 打开");
      }
    };
    const onPointerLockChange = () => {
      const locked = document.pointerLockElement === renderer.domElement;
      fpsPointerLockedRef.current = locked;
      setFpsPointerLocked(locked);
      renderer.domElement.classList.toggle("fps-canvas-locked", locked);
      if (!locked) {
        movementKeysRef.current.clear();
        setNavigationMessage("点击画面锁定鼠标 · WASD 行走");
      } else {
        setNavigationMessage("WASD 行走 · 鼠标转向 · E 互动");
      }
    };
    const onPointerLockError = () => {
      fpsPointerLockedRef.current = false;
      setFpsPointerLocked(false);
      movementKeysRef.current.clear();
      setNavigationMessage("当前预览容器不允许锁定鼠标，请复制地址到 Safari / Chrome 打开");
    };
    const onPointerMove = (event: MouseEvent) => {
      if (!fpsPointerLockedRef.current || cameraCommandRef.current !== "walk") return;
      playerRef.current.yaw -= event.movementX * 0.0024;
      playerRef.current.pitch = THREE.MathUtils.clamp(playerRef.current.pitch - event.movementY * 0.0024, -0.9, 0.75);
    };
    renderer.domElement.addEventListener("click", onCanvasClick);
    document.addEventListener("pointerlockchange", onPointerLockChange);
    document.addEventListener("pointerlockerror", onPointerLockError);
    window.addEventListener("mousemove", onPointerMove);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.065;
    controls.target.set(0, 10, 0);
    controls.minDistance = 12;
    controls.maxDistance = 72;
    controls.maxPolarAngle = Math.PI * 0.88;
    controls.enabled = cameraCommandRef.current !== "walk";
    controlsRef.current = controls;

    scene.add(new THREE.HemisphereLight(0xccefff, 0x182126, 2.25));
    const key = new THREE.DirectionalLight(0xfff0cf, 3.1);
    key.position.set(16, 34, 20);
    key.castShadow = true;
    scene.add(key);

    const building = new THREE.Group();
    scene.add(building);
    const wallSurfaceSpecs: Array<{
      position: Vec3;
      floor: number;
      rotationY: number;
      width: number;
      showLabel: boolean;
    }> = [];
    interactiveDoorsRef.current.clear();
    openDoorIdsRef.current.clear();
    const registerInteractiveDoor = (
      id: string,
      mesh: THREE.Mesh,
      floor: number,
      position: Vec3,
      access: AccessState,
      label: string,
      kind: InteractiveDoor["kind"],
    ) => {
      mesh.userData.openTarget = 1;
      interactiveDoorsRef.current.set(id, { id, mesh, floor, position, access, label, kind, open: false });
    };

    for (const floor of FLOORS) {
      const floorGroup = new THREE.Group();
      floorGroup.userData.floor = floor;
      focusGroupsRef.current.set(floor, floorGroup);
      building.add(floorGroup);
      const y = yForFloor(floor);
      let floorLabelPlaced = false;

      for (const unit of [1, 2] as const) {
        const x = unitX(unit);
        addBox(floorGroup, [11.1, 0.12, 7.7], [x, y, 0.7], palette.floor, 0.78);

        const outline = new THREE.LineSegments(
          new THREE.EdgesGeometry(new THREE.BoxGeometry(11.1, 0.12, 7.7)),
          new THREE.LineBasicMaterial({ color: unit === 1 ? palette.unit1 : palette.unit2, transparent: true, opacity: 0.34 }),
        );
        outline.position.set(x, y, 0.7);
        floorGroup.add(outline);

        const stairPosition: Vec3 = [x + (unit === 1 ? -2.4 : 2.4), y, -2.25];
        addBox(floorGroup, [1.68, 0.08, 1.78], [stairPosition[0], y + 0.04, stairPosition[2]], palette.stair, 0.22, true);
        if (floor < 10) addStairSteps(floorGroup, stairPosition, unit);
        if (!(unit === 1 && floor === 2)) {
          const elevatorX = x + (unit === 1 ? 2.7 : -2.7);
          addBox(floorGroup, [1.65, 1.8, 1.5], [elevatorX, y + 0.92, -2.25], palette.elevator, 0.2, true);
          const elevatorDoor = addFlatDoor(
            floorGroup,
            [elevatorX, y + 0.72, -1.43],
            0.88,
            false,
            palette.elevator,
            floor === 6 && unit === 1 ? "6F Elevator Door" : undefined,
          );
          elevatorDoorsRef.current.set(`${unit}-${floor}`, elevatorDoor);
          registerInteractiveDoor(
            `u${unit}-f${floor}-elevator-door`,
            elevatorDoor,
            floor,
            [elevatorX, y + 0.72, -1.43],
            unit === 1 ? "card" : "conditional",
            `${unit} 单元 ${floor}F 电梯门`,
            "elevator",
          );
        }

        for (let room = 0; room < 3; room += 1) {
          addBox(floorGroup, [1.85, 1.45, 2.15], [x + (room - 1) * 2.15, y + 0.76, 3.15], palette.room, 0.5);
          const doorId = `u${unit}-f${floor}-door-${["a", "b", "c"][room]}`;
          const doorNode = SPATIAL_NODES.find((node) => node.id === doorId);
          const locked = doorNode?.access === "locked";
          const keyed = doorNode?.access === "key";
          const apartmentDoor = addFlatDoor(
            floorGroup,
            [x + (room - 1) * 1.65, y + 0.68, 2.02],
            0.7,
            locked,
            keyed ? 0xf2ff63 : palette.open,
            keyed ? "Key Door" : undefined,
          );
          registerInteractiveDoor(
            doorId,
            apartmentDoor,
            floor,
            [x + (room - 1) * 1.65, y + 0.68, 2.02],
            doorNode?.access ?? "locked",
            `${unit} 单元 ${floor}F ${["A", "B", "C"][room]} 户门`,
            "room",
          );
        }

        // Continuous corridor wall bays make the floor read as architecture,
        // not as a collection of isolated obstacle blocks. Every bay gets a
        // resonance surface so SAMPLE propagates across the whole floor.
        const wallMin = x - 5.35;
        const wallMax = x + 5.35;
        const doorCenters = [-1.65, 0, 1.65].map((offset) => x + offset);
        const doorGap = 0.48;
        let wallStart = wallMin;
        doorCenters.forEach((doorCenter) => {
          const wallEnd = doorCenter - doorGap;
          if (wallEnd - wallStart > 0.12) {
            const width = wallEnd - wallStart;
            const panelCount = Math.max(1, Math.ceil(width / 1.72));
            for (let panelIndex = 0; panelIndex < panelCount; panelIndex += 1) {
              const panelStart = wallStart + (width * panelIndex) / panelCount;
              const panelEnd = wallStart + (width * (panelIndex + 1)) / panelCount;
              const panelWidth = panelEnd - panelStart;
              addBox(
                floorGroup,
                [panelWidth, 1.82, 0.14],
                [(panelStart + panelEnd) * 0.5, y + 0.91, 2.16],
                palette.wall,
                0.78,
              );
              const showLabel = !floorLabelPlaced;
              floorLabelPlaced = true;
              wallSurfaceSpecs.push({
                position: [(panelStart + panelEnd) * 0.5, y + 1.0, 2.07],
                floor,
                rotationY: 0,
                width: Math.max(0.36, Math.min(panelWidth - 0.12, 1.56)),
                showLabel,
              });
            }
          }
          wallStart = doorCenter + doorGap;
        });
        if (wallMax - wallStart > 0.12) {
          const width = wallMax - wallStart;
          const panelCount = Math.max(1, Math.ceil(width / 1.72));
          for (let panelIndex = 0; panelIndex < panelCount; panelIndex += 1) {
            const panelStart = wallStart + (width * panelIndex) / panelCount;
            const panelEnd = wallStart + (width * (panelIndex + 1)) / panelCount;
            const panelWidth = panelEnd - panelStart;
            addBox(
              floorGroup,
              [panelWidth, 1.82, 0.14],
              [(panelStart + panelEnd) * 0.5, y + 0.91, 2.16],
              palette.wall,
              0.78,
            );
            const showLabel = !floorLabelPlaced;
            floorLabelPlaced = true;
            wallSurfaceSpecs.push({
              position: [(panelStart + panelEnd) * 0.5, y + 1.0, 2.07],
              floor,
              rotationY: 0,
              width: Math.max(0.36, Math.min(panelWidth - 0.12, 1.56)),
              showLabel,
            });
          }
        }

        const outerWallX = unit === 1 ? x - 5.5 : x + 5.5;
        addBox(floorGroup, [0.14, 1.82, 5.5], [outerWallX, y + 0.91, -0.65], palette.wall, 0.72);
        wallSurfaceSpecs.push({
          position: [outerWallX + (unit === 1 ? 0.08 : -0.08), y + 1.0, -0.85],
          floor,
          rotationY: unit === 1 ? Math.PI / 2 : -Math.PI / 2,
          width: 2.1,
          showLabel: false,
        });

        const unitLabel = createTextSprite(`Unit ${unit} · ${floor}F`, unit === 1 ? "#7ce0d5" : "#7eb1ff", 0.78);
        unitLabel.position.set(x, y + 1.55, -0.1);
        floorGroup.add(unitLabel);
      }

      addBox(floorGroup, [3.2, 0.1, 1.05], [0, y, 0], palette.floorEdge, 0.46);
      const bridgeLocked = floor !== 8 && floor !== 10;
      const interconnectDoor = addDoor(floorGroup, [0, y + 0.78, 0], bridgeLocked, `${floor}F Link Door`);
      registerInteractiveDoor(
        `f${floor}-interconnect`,
        interconnectDoor,
        floor,
        [0, y + 0.78, 0],
        bridgeLocked ? "locked" : "open",
        `${floor}F 单元连通门`,
        "interconnect",
      );

      if (floor === 10) {
        const stairDoor = addDoor(floorGroup, [-9.05, y + 0.78, -1.72], true, "Unit 1 10F Stair Door");
        registerInteractiveDoor(
          "u1-f10-stair-door",
          stairDoor,
          floor,
          [-9.05, y + 0.78, -1.72],
          "locked",
          "1 单元 10F 楼梯门",
          "stair",
        );
      }

      if (floor === 1) {
        const sideDoor = addDoor(floorGroup, [-10.8, y + 0.78, 0.4], false, "Unit 1 1F Side Door");
        registerInteractiveDoor(
          "u1-f1-side-door",
          sideDoor,
          floor,
          [-10.8, y + 0.78, 0.4],
          "open",
          "1 单元 1F 侧门",
          "side",
        );
      }
    }

    const exterior = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 70),
      new THREE.MeshStandardMaterial({ color: 0x111a1e, roughness: 1 }),
    );
    exterior.rotation.x = -Math.PI / 2;
    exterior.position.y = -0.18;
    exterior.receiveShadow = true;
    scene.add(exterior);

    const grid = new THREE.GridHelper(70, 35, 0x314047, 0x1a252a);
    grid.position.y = -0.15;
    scene.add(grid);

    resonanceSurfacesRef.current = wallSurfaceSpecs.map((spec) => createResonanceSurface(
      scene,
      spec.position,
      spec.floor,
      spec.showLabel,
      spec.rotationY,
      spec.width,
    ));

    const nodeById = new Map(SPATIAL_NODES.map((node) => [node.id, node]));
    const graphGroup = new THREE.Group();
    scene.add(graphGroup);
    for (const connection of SPATIAL_CONNECTIONS) {
      const from = nodeById.get(connection.from);
      const to = nodeById.get(connection.to);
      if (!from || !to || !connection.traversable) continue;
      if (connection.mode === "walk" && from.kind === "residenceDoor") continue;
      const line = makeLine(
        [toVector(from.position).add(new THREE.Vector3(0, 0.1, 0)), toVector(to.position).add(new THREE.Vector3(0, 0.1, 0))],
        connection.mode === "interior" ? 0xb48cff : 0x516269,
        connection.mode === "interior" ? 0.46 : 0.13,
      );
      graphGroup.add(line);
    }

    const routePoints = ROUTE_EVENTS.map((item) => toVector(item.position));
    const route = makeLine(routePoints, palette.route, 0.27);
    routeRef.current = route;
    scene.add(route);

    const ghostRouteLine = makeLine([new THREE.Vector3(), new THREE.Vector3()], palette.locked, 0);
    (ghostRouteLine.material as THREE.LineBasicMaterial).depthTest = false;
    ghostRouteLine.renderOrder = 24;
    ghostRouteLine.visible = false;
    ghostRouteRef.current = ghostRouteLine;
    scene.add(ghostRouteLine);

    const checkpoints = new THREE.Group();
    scene.add(checkpoints);
    ROUTE_EVENTS.forEach((item, index) => {
      const geometry = new THREE.SphereGeometry(item.status === "blocked" ? 0.18 : 0.1, 12, 8);
      const color = item.status === "blocked" ? palette.locked : item.status === "wrong" ? 0xffa552 : palette.route;
      const point = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: index === 0 ? 1 : 0.7 }));
      point.position.copy(toVector(item.position));
      checkpoints.add(point);
    });

    for (const item of BLOCKED_EVENTS) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.34, 0.055, 8, 28),
        new THREE.MeshBasicMaterial({ color: palette.locked }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.copy(toVector(item.position));
      scene.add(ring);
    }

    const marker = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.14, 0.34, 5, 12),
      new THREE.MeshBasicMaterial({ color: palette.route }),
    );
    body.position.y = 0.44;
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 14, 10),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    head.position.y = 0.78;
    const facing = new THREE.Mesh(
      new THREE.ConeGeometry(0.1, 0.24, 14),
      new THREE.MeshBasicMaterial({ color: 0xffd966 }),
    );
    facing.rotation.x = Math.PI / 2;
    facing.position.set(0, 0.5, 0.25);
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.52, 0.045, 8, 40),
      new THREE.MeshBasicMaterial({ color: palette.route, transparent: true, opacity: 0.78 }),
    );
    halo.rotation.x = Math.PI / 2;
    marker.add(body, head, facing, halo);
    marker.position.copy(routePoints[0]);
    markerRef.current = marker;
    scene.add(marker);

    const resize = () => {
      if (!host.clientWidth || !host.clientHeight) return;
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);

    let frame = 0;
    const animationStarted = performance.now();
    let previousFrame = animationStarted;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      const now = performance.now();
      const delta = Math.min((now - previousFrame) / 1000, 0.05);
      const t = (now - animationStarted) / 1000;
      previousFrame = now;
      halo.rotation.z = t * 0.65;
      body.scale.setScalar(1 + Math.sin(t * 4) * 0.035);
      const navigation = navigationRef.current;
      const reaction = wallReactionRef.current;
      const activeFloor = navigation.floor;
      resonanceSurfacesRef.current.forEach((surface) => {
        const floorDistance = Math.abs(surface.floor - activeFloor);
        // The audio field is global: the current floor is strongest, but every
        // floor keeps a visible response so the building reads as one instrument.
        const floorStrength = Math.max(0.46, 1 - floorDistance * 0.055);
        const phase = surface.floor * 0.57 + t * (0.7 + reaction.propagation * 1.9);
        const pulse = Math.max(0, Math.sin(phase * 1.8)) * 0.5 + 0.5;
        const displacement = reaction.displacement * floorStrength * (0.72 + pulse * 0.62);
        const bloom = reaction.bloom * floorStrength * (0.74 + pulse * 0.4);
        const lineDensity = reaction.lineDensity * floorStrength * (0.78 + pulse * 0.42);

        surface.panelMaterial.uniforms.uTime.value = t - surface.floor * 0.17;
        surface.panelMaterial.uniforms.uDisplacement.value = displacement;
        surface.panelMaterial.uniforms.uColorShift.value = reaction.colorShift + surface.floor * 0.018;
        surface.panelMaterial.uniforms.uLineDensity.value = lineDensity;
        surface.panelMaterial.uniforms.uBloom.value = bloom;
        surface.panelMaterial.uniforms.uPulse.value = reaction.pulse * floorStrength;
        surface.panelMaterial.uniforms.uPropagation.value = reaction.propagation * floorStrength;

        surface.stripMeshes.forEach((mesh, index) => {
          const stripWave = Math.sin(t * (2.2 + reaction.propagation * 3.8) - index * 0.72 + surface.floor * 0.4);
          mesh.position.x = -0.52 + index * 0.17 + stripWave * (0.012 + displacement * 0.035);
          mesh.scale.y = 0.82 + (stripWave * 0.5 + 0.5) * (0.18 + reaction.pulse * 0.28);
        });
        surface.stripMaterials.forEach((material, index) => {
          const hue = 0.48 - reaction.colorShift * 0.14 + index * 0.005 + surface.floor * 0.006;
          material.emissive.setHSL(hue, 0.78, 0.38);
          material.emissiveIntensity = 0.32 + bloom * 3.8;
          material.opacity = 0.18 + lineDensity * 0.78;
        });

        surface.rippleMeshes.forEach((ripple, index) => {
          const ripplePhase = (t * (0.32 + reaction.propagation * 0.72) + index * 0.28 + surface.floor * 0.11) % 1;
          ripple.position.y = -0.95 + ripplePhase * 1.9;
          ripple.scale.setScalar(0.22 + ripplePhase * 0.7 + reaction.pulse * 0.48);
          surface.rippleMaterials[index].opacity = (1 - ripplePhase) * (0.12 + bloom * 0.58);
          surface.rippleMaterials[index].color.setHSL(0.16 - reaction.colorShift * 0.08 + surface.floor * 0.004, 0.9, 0.62);
        });

        const particleAttribute = surface.particleGeometry.getAttribute("position") as THREE.BufferAttribute;
        for (let index = 0; index < surface.particlePhases.length; index += 1) {
          const baseIndex = index * 3;
          const phaseOffset = surface.particlePhases[index];
          const rise = ((surface.particleBase[baseIndex + 1] + 0.99 + t * (0.035 + reaction.propagation * 0.19) + phaseOffset * 1.98) % 1.98) - 0.99;
          particleAttribute.array[baseIndex] = surface.particleBase[baseIndex] + Math.sin(t * 1.4 + phaseOffset * 8 + index) * (0.018 + reaction.particleEmission * 0.075);
          particleAttribute.array[baseIndex + 1] = rise;
          particleAttribute.array[baseIndex + 2] = surface.particleBase[baseIndex + 2] + Math.cos(t * 1.1 + phaseOffset * 7) * (0.012 + reaction.pulse * 0.035);
        }
        particleAttribute.needsUpdate = true;
        surface.particleMaterial.opacity = 0.08 + reaction.particleEmission * floorStrength * 1.12;
        surface.particleMaterial.size = 0.024 + reaction.particleEmission * floorStrength * 0.07;
      });
      interactiveDoorsRef.current.forEach((door) => {
        const targetScale = typeof door.mesh.userData.openTarget === "number" ? door.mesh.userData.openTarget : 1;
        door.mesh.scale.x = THREE.MathUtils.lerp(door.mesh.scale.x, targetScale, Math.min(1, delta * 10));
      });

      let cameraBob = 0;
      if (cameraCommandRef.current === "walk") {
        controls.enabled = false;
        const player = playerRef.current;
        if (navigation.mode === "stairs") {
          const transitionProgress = THREE.MathUtils.clamp(
            (performance.now() - navigation.transitionStarted) / navigation.transitionDuration,
            0,
            1,
          );
          const eased = transitionProgress * transitionProgress * (3 - 2 * transitionProgress);
          player.position.y = THREE.MathUtils.lerp(
            navigation.transitionFromY,
            navigation.transitionToY,
            eased,
          );
          player.position.x = THREE.MathUtils.lerp(navigation.transitionFromX, navigation.transitionStairX, eased);
          player.position.z = THREE.MathUtils.lerp(navigation.transitionFromZ, navigation.transitionToZ, eased)
            + navigation.transitionArcDirection * Math.sin(transitionProgress * Math.PI) * 0.88;
          cameraBob = Math.sin(transitionProgress * Math.PI * 8) * 0.055 + Math.sin(transitionProgress * Math.PI) * 0.025;
          if (transitionProgress >= 1) {
            player.floor = navigation.transitionTargetFloor;
            navigation.floor = player.floor;
            navigation.mode = "walking";
            player.position.x = navigation.transitionStairX;
            player.position.z = navigation.transitionToZ;
            collidersRef.current = createCorridorColliders(player.floor, {
              openInterconnect: player.floor === 8 || player.floor === 10,
            });
            onWalkFloorChangeRef.current(player.floor);
            setNavigationMessage(`已到达 ${player.floor}F · WASD 行走`);
          }
        } else if (navigation.mode === "elevator-riding") {
          const transitionProgress = THREE.MathUtils.clamp(
            (performance.now() - navigation.transitionStarted) / 1500,
            0,
            1,
          );
          player.position.y = THREE.MathUtils.lerp(
            navigation.transitionFromY,
            navigation.transitionToY,
            transitionProgress,
          );
          player.position.x = unitX(navigation.elevatorUnit) + (navigation.elevatorUnit === 1 ? 3.15 : -3.15);
          player.position.z = -2.25;
          cameraBob = Math.sin(transitionProgress * Math.PI * 6) * 0.025;
          if (transitionProgress >= 1) {
            player.floor = navigation.transitionTargetFloor;
            navigation.floor = player.floor;
            navigation.mode = "elevator-arrived";
            setElevatorDoor(navigation.elevatorUnit, player.floor, true);
            onWalkFloorChangeRef.current(player.floor);
            setNavigationMessage(`电梯已到 ${player.floor}F，门已打开 · WASD 出电梯`);
          }
        } else {
          player.floor = navigation.floor;
          player.position.y = yForFloor(player.floor) + 0.38;
          if (navigation.mode === "walking") {
            const stair = nearestSpatialNode(player.position, "stair", navigation.floor);
            const elevatorHall = nearestSpatialNode(player.position, "elevatorHall", navigation.floor);
            const nearbyDoor = nearestInteractiveDoor(player.position, navigation.floor);
            if (fpsPointerLockedRef.current && movementKeysRef.current.size === 0) {
              if (elevatorHall) {
                setNavigationMessage("E 开门");
              } else if (nearbyDoor) {
                setNavigationMessage(
                  nearbyDoor.access === "locked" || nearbyDoor.access === "card"
                    ? `${nearbyDoor.label} 已锁定`
                    : `E ${nearbyDoor.open ? "关门" : "开门"} · ${nearbyDoor.label}`,
                );
              } else if (stair) {
                setNavigationMessage("W 上楼 · S 下楼");
              } else {
                setNavigationMessage("WASD 行走 · 鼠标转向 · E 互动");
              }
            }
            const stairDirection = movementKeysRef.current.has("w")
              ? 1
              : movementKeysRef.current.has("s")
                ? -1
                : null;
            const stairDelta = stair
              ? new THREE.Vector2(stair.position[0] - player.position.x, stair.position[2] - player.position.z)
              : null;
            const stairMotion = stairDirection === 1
              ? movementVector(player.yaw, { forward: true })
              : stairDirection === -1
                ? movementVector(player.yaw, { backward: true })
                : { x: 0, z: 0 };
            const enteringStair = Boolean(
              stair
              && stairDelta
              && (stairDelta.length() < 0.55
                || stairMotion.x * stairDelta.x + stairMotion.z * stairDelta.y > 0.2),
            );
            if (stair && stairDirection !== null && enteringStair) {
              startStairTransition(stairDirection);
            } else {
              const moved = updateKeyboardPlayer(player, movementKeysRef.current, delta, collidersRef.current);
              if (moved) {
                locomotionPhaseRef.current += delta * (movementKeysRef.current.has("shift") ? 13 : 9);
                cameraBob = Math.sin(locomotionPhaseRef.current * 2) * 0.042;
              } else {
                locomotionPhaseRef.current *= 0.88;
              }
            }
          }
        }
        applyFirstPersonCamera(camera, player, cameraBob);
      } else {
        controls.enabled = true;
        controls.update();
      }
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("click", onCanvasClick);
      document.removeEventListener("pointerlockchange", onPointerLockChange);
      document.removeEventListener("pointerlockerror", onPointerLockError);
      window.removeEventListener("mousemove", onPointerMove);
      if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose?.();
        if (Array.isArray(mesh.material)) mesh.material.forEach((material) => material.dispose());
        else mesh.material?.dispose?.();
      });
      focusGroupsRef.current.clear();
      resonanceSurfacesRef.current = [];
      elevatorDoorsRef.current.clear();
      interactiveDoorsRef.current.clear();
      openDoorIdsRef.current.clear();
      if (elevatorTimeoutRef.current !== null) window.clearTimeout(elevatorTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const marker = markerRef.current;
    const route = routeRef.current;
    if (!marker || !route) return;
    const { position, heading, startIndex } = routePoseAt(progress);
    const renderedPosition = explodePosition(position, floorSpread);
    if (heading) {
      characterHeadingRef.current.lerp(heading, 0.32).normalize();
    }
    marker.position.copy(renderedPosition);
    faceMarker(marker, characterHeadingRef.current);
    const geometry = new THREE.BufferGeometry().setFromPoints(
      ROUTE_EVENTS.slice(0, startIndex + 1)
        .map((item) => explodePosition(toVector(item.position), floorSpread))
        .concat([marker.position.clone()]),
    );
    route.geometry.dispose();
    route.geometry = geometry;
    (route.material as THREE.LineBasicMaterial).opacity = 0.96;

    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (cameraCommand === "chase" && camera && controls) {
      applyChaseCamera(camera, controls, renderedPosition, characterHeadingRef.current);
    }
  }, [progress, cameraCommand, floorSpread]);

  useEffect(() => {
    for (const [floor, group] of focusGroupsRef.current.entries()) {
      const active = floorFocus === null || floor === floorFocus;
      group.visible = floorFocus === null || Math.abs(floor - floorFocus) <= 1;
      group.position.y = (floor - 5.5) * floorSpread * 0.92;
      group.traverse((object) => {
        const mesh = object as THREE.Mesh;
        const material = mesh.material as THREE.Material & { opacity?: number };
        if (material && "opacity" in material && typeof material.opacity === "number") {
          const stored = material.userData.baseOpacity;
          const baseOpacity = typeof stored === "number"
            ? stored
            : (mesh.userData.baseOpacity ?? material.opacity);
          material.userData.baseOpacity = baseOpacity;
          material.transparent = true;
          material.opacity = active ? Math.max(0.08, baseOpacity * (1 - xray * 0.72)) : 0.08;
        }
      });
    }
  }, [floorFocus, floorSpread, xray]);

  useEffect(() => {
    const line = ghostRouteRef.current;
    if (!line || !ghostRoute || ghostRoute.length < 2 || ghostIntensity <= 0.02) {
      if (line) line.visible = false;
      return;
    }
    line.visible = true;
    line.geometry.dispose();
    line.geometry = new THREE.BufferGeometry().setFromPoints(
      ghostRoute.map((point) => explodePosition(toVector(point), floorSpread)),
    );
    const material = line.material as THREE.LineBasicMaterial;
    material.opacity = 0.2 + ghostIntensity * 0.8;
    material.transparent = true;
  }, [ghostRoute, ghostIntensity, floorSpread]);

  useEffect(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    if (cameraCommand !== "walk" && document.pointerLockElement) {
      document.exitPointerLock();
    }
    controls.enabled = cameraCommand !== "walk";
    if (cameraCommand === "top") {
      controls.minDistance = 12;
      controls.maxDistance = 72;
      camera.position.set(0, 52, 0.1);
      controls.target.set(0, 10, 0);
    } else if (cameraCommand === "chase") {
      controls.minDistance = 12;
      controls.maxDistance = 72;
      const { position, heading } = routePoseAt(progress);
      if (heading) characterHeadingRef.current.copy(heading);
      applyChaseCamera(camera, controls, position, characterHeadingRef.current, true);
    } else if (cameraCommand === "walk") {
      applyFirstPersonCamera(camera, playerRef.current);
    } else if (cameraCommand === "route") {
      controls.minDistance = 12;
      controls.maxDistance = 72;
      const target = explodePosition(toVector(currentEvent.position), floorSpread);
      camera.position.copy(target.clone().add(new THREE.Vector3(12, 8, 13)));
      controls.target.copy(target);
    } else {
      controls.minDistance = 12;
      controls.maxDistance = 72;
      camera.position.set(32, 27, 36);
      controls.target.set(0, 10, 0);
    }
    if (controls.enabled) controls.update();
  }, [cameraCommand, commandVersion, currentEvent, floorSpread, walkFloor]);

  useEffect(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (cameraCommand === "walk" || handOrbit === null || handZoom === null || !camera || !controls) return;
    const angle = THREE.MathUtils.lerp(-Math.PI * 0.72, Math.PI * 0.72, handOrbit);
    const distance = THREE.MathUtils.lerp(46, 13, handZoom);
    const target = controls.target;
    const desired = new THREE.Vector3(
      target.x + Math.sin(angle) * distance,
      target.y + THREE.MathUtils.lerp(6, 18, 1 - handZoom),
      target.z + Math.cos(angle) * distance,
    );
    camera.position.lerp(desired, 0.2);
    controls.update();
  }, [cameraCommand, handOrbit, handZoom]);

  return (
    <div className={`scene-host${rendererError ? " scene-host-fallback" : ""}`} ref={hostRef}>
      {rendererError && (
        <div className="scene-fallback" role="status">
          <span className="eyebrow">WEBGL PREVIEW UNAVAILABLE</span>
          <h2>当前浏览器无法创建 3D 画布</h2>
          <p>内置预览环境禁用了 WebGL。请复制本页地址，在系统 Safari 或 Chrome 中打开：</p>
          <code>{window.location.href}</code>
          <small>左侧路线、底部播放和事件控制仍可使用；三维楼栋需要系统浏览器渲染。</small>
        </div>
      )}
      {!rendererError && cameraCommand === "walk" && (
        <>
          {fpsPointerLocked && <div className="fps-crosshair" aria-hidden="true" />}
          <div className="walk-status" role="status">
            <span className="eyebrow">FPS NAVIGATION</span>
            <div className="walk-status-meta">
              <strong>{walkFloor}F</strong>
              <span>{floorAVReactionFor(walkFloor).label}</span>
              <span>{fpsPointerLocked ? "鼠标已锁定" : "鼠标未锁定"}</span>
            </div>
            <b>{navigationMessage}</b>
          </div>
        </>
      )}
    </div>
  );
}
