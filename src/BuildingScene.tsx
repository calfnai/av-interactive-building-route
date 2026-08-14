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
  type RouteEvent,
  type Vec3,
} from "./spatial-data";
import { floorAVReactionFor, type FloorAVReaction, type WallReactionState } from "./audio-bands";

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

function applyFirstPersonCamera(camera: THREE.PerspectiveCamera, player: PlayerState) {
  const eye = player.position.clone().add(new THREE.Vector3(0, 1.5, 0));
  const direction = new THREE.Vector3(
    Math.sin(player.yaw) * Math.cos(player.pitch),
    Math.sin(player.pitch),
    Math.cos(player.yaw) * Math.cos(player.pitch),
  );
  camera.position.copy(eye);
  camera.lookAt(eye.clone().add(direction));
}

function updateKeyboardPlayer(player: PlayerState, keys: Set<string>, delta: number) {
  const forward = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
  const right = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  const movement = new THREE.Vector3();
  if (keys.has("w")) movement.add(forward);
  if (keys.has("s")) movement.sub(forward);
  if (keys.has("d")) movement.add(right);
  if (keys.has("a")) movement.sub(right);
  if (!movement.lengthSq()) return;

  movement.normalize().multiplyScalar(Math.min(delta, 0.05) * 3.6);
  player.position.x = THREE.MathUtils.clamp(player.position.x + movement.x, -12.4, 12.4);
  player.position.z = THREE.MathUtils.clamp(player.position.z + movement.z, -5.2, 5.2);
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
  floor: number;
  theme: FloorAVReaction;
  panelMaterial: THREE.ShaderMaterial;
  stripMaterials: THREE.MeshStandardMaterial[];
  particleMaterial: THREE.PointsMaterial;
  rippleMeshes: THREE.Mesh[];
  rippleMaterials: THREE.MeshBasicMaterial[];
}

function createResonanceSurface(scene: THREE.Scene, position: Vec3, floor: number): ResonanceSurface {
  const group = new THREE.Group();
  group.position.set(...position);
  const theme = floorAVReactionFor(floor);

  addBox(group, [1.04, 2.22, 0.1], [0, 0, -0.06], 0x17262b, 0.96);
  const panelMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uDisplacement: { value: 0 },
      uColorShift: { value: 0 },
      uLineDensity: { value: 0 },
      uBloom: { value: 0 },
      uHue: { value: theme.hue },
      uPattern: { value: theme.pattern },
    },
      vertexShader: `
      uniform float uTime;
      uniform float uDisplacement;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 transformed = position;
        float wave = sin(position.y * 15.0 + uTime * 1.8) * cos(position.x * 18.0 + uTime * 0.7);
        transformed.z += wave * uDisplacement * 0.12;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uColorShift;
      uniform float uLineDensity;
      uniform float uBloom;
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
        float channels = smoothstep(0.56, 0.92, sin((vUv.y * uPattern + vUv.x * 7.0) * 3.14159) * 0.5 + 0.5);
        float glow = 0.28 + uBloom * 1.12 + channels * uLineDensity * 0.95;
        gl_FragColor = vec4(base * glow, 0.78 + uBloom * 0.2);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 2.1, 18, 36), panelMaterial);
  panel.position.z = 0.01;
  group.add(panel);

  const stripMaterials: THREE.MeshStandardMaterial[] = [];
  for (let index = 0; index < 7; index += 1) {
    const strip = addBox(group, [0.025, 1.88, 0.035], [-0.34 + index * 0.115, 0, 0.075], 0x6de0d0, 0.34);
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

  const particlePositions = new Float32Array(160 * 3);
  for (let index = 0; index < 160; index += 1) {
    const seed = index * 17.731;
    particlePositions[index * 3] = ((Math.sin(seed) * 0.5 + 0.5) - 0.5) * 0.84;
    particlePositions[index * 3 + 1] = ((Math.sin(seed * 1.7) * 0.5 + 0.5) - 0.5) * 1.98;
    particlePositions[index * 3 + 2] = 0.12 + (Math.sin(seed * 2.3) * 0.5 + 0.5) * 0.06;
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
  group.add(createTextSprite(`${floor}F · ${theme.label}`, "#dffb8a", 0.34));
  group.children[group.children.length - 1].position.set(0, 1.3, 0.08);
  scene.add(group);
  return { floor, theme, panelMaterial, stripMaterials, particleMaterial, rippleMeshes, rippleMaterials };
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
  const cameraCommandRef = useRef(cameraCommand);
  const walkFloorRef = useRef(walkFloor);
  const onWalkFloorChangeRef = useRef(onWalkFloorChange);
  const playerRef = useRef<PlayerState>({
    position: toVector(ROUTE_EVENTS[0].position),
    yaw: Math.PI,
    pitch: 0,
    floor: walkFloor,
  });
  const movementKeysRef = useRef(new Set<string>());
  const mouseLookRef = useRef(false);

  cameraCommandRef.current = cameraCommand;
  walkFloorRef.current = walkFloor;
  onWalkFloorChangeRef.current = onWalkFloorChange;
  const characterHeadingRef = useRef(new THREE.Vector3(0, 0, -1));
  const focusGroupsRef = useRef<Map<number, THREE.Group>>(new Map());

  useEffect(() => {
    const player = playerRef.current;
    player.floor = walkFloor;
    player.position.y = yForFloor(walkFloor) + 0.38;
  }, [walkFloor]);

  useEffect(() => {
    const editableTarget = (target: EventTarget | null) => {
      const element = target as HTMLElement | null;
      return element?.tagName === "INPUT" || element?.tagName === "SELECT" || element?.tagName === "TEXTAREA";
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (editableTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (["w", "a", "s", "d"].includes(key)) {
        movementKeysRef.current.add(key);
        event.preventDefault();
        return;
      }
      const floor = event.key === "0" ? 10 : Number(event.key);
      if (floor >= 1 && floor <= 10) {
        onWalkFloorChangeRef.current(floor);
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
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.setAttribute("aria-label", "居民楼栋三维空间与人物行进轨迹");
    host.appendChild(renderer.domElement);

    const onPointerDown = () => {
      mouseLookRef.current = true;
    };
    const onPointerUp = () => {
      mouseLookRef.current = false;
    };
    const onPointerMove = (event: MouseEvent) => {
      if (!mouseLookRef.current || cameraCommandRef.current !== "walk") return;
      playerRef.current.yaw -= event.movementX * 0.004;
      playerRef.current.pitch = THREE.MathUtils.clamp(playerRef.current.pitch - event.movementY * 0.003, -0.9, 0.75);
    };
    renderer.domElement.addEventListener("mousedown", onPointerDown);
    window.addEventListener("mouseup", onPointerUp);
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

    for (const floor of FLOORS) {
      const floorGroup = new THREE.Group();
      floorGroup.userData.floor = floor;
      focusGroupsRef.current.set(floor, floorGroup);
      building.add(floorGroup);
      const y = yForFloor(floor);

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
          addFlatDoor(floorGroup, [elevatorX, y + 0.72, -1.43], 0.88, false, palette.elevator, floor === 6 && unit === 1 ? "6F Elevator Door" : undefined);
        }

        for (let room = 0; room < 3; room += 1) {
          addBox(floorGroup, [1.85, 1.45, 2.15], [x + (room - 1) * 2.15, y + 0.76, 3.15], palette.room, 0.5);
          const doorId = `u${unit}-f${floor}-door-${["a", "b", "c"][room]}`;
          const doorNode = SPATIAL_NODES.find((node) => node.id === doorId);
          const locked = doorNode?.access === "locked";
          const keyed = doorNode?.access === "key";
          addFlatDoor(
            floorGroup,
            [x + (room - 1) * 1.65, y + 0.68, 2.02],
            0.7,
            locked,
            keyed ? 0xf2ff63 : palette.open,
            keyed ? "Key Door" : undefined,
          );
        }

        const unitLabel = createTextSprite(`Unit ${unit} · ${floor}F`, unit === 1 ? "#7ce0d5" : "#7eb1ff", 0.78);
        unitLabel.position.set(x, y + 1.55, -0.1);
        floorGroup.add(unitLabel);
      }

      addBox(floorGroup, [3.2, 0.1, 1.05], [0, y, 0], palette.floorEdge, 0.46);
      const bridgeLocked = floor !== 8 && floor !== 10;
      addDoor(floorGroup, [0, y + 0.78, 0], bridgeLocked, `${floor}F Link Door`);

      if (floor === 10) {
        addDoor(floorGroup, [-9.05, y + 0.78, -1.72], true, "Unit 1 10F Stair Door");
      }

      if (floor === 1) {
        addDoor(floorGroup, [-10.8, y + 0.78, 0.4], false, "Unit 1 1F Side Door");
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

    resonanceSurfacesRef.current = FLOORS.map((floor) => createResonanceSurface(
      scene,
      floor === 1 ? [unitX(1) - 1.2, yForFloor(floor) + 1.2, -3.3] : [0, yForFloor(floor) + 1.2, -1.15],
      floor,
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
    const clock = new THREE.Clock();
    const animate = () => {
      frame = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const t = clock.getElapsedTime();
      halo.rotation.z = t * 0.65;
      body.scale.setScalar(1 + Math.sin(t * 4) * 0.035);
      resonanceSurfacesRef.current.forEach((surface) => {
        surface.panelMaterial.uniforms.uTime.value = t;
      });
      if (cameraCommandRef.current === "walk") {
        controls.enabled = false;
        const player = playerRef.current;
        player.floor = walkFloorRef.current;
        player.position.y = yForFloor(player.floor) + 0.38;
        updateKeyboardPlayer(player, movementKeysRef.current, delta);
        applyFirstPersonCamera(camera, player);
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
      renderer.domElement.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("mouseup", onPointerUp);
      window.removeEventListener("mousemove", onPointerMove);
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
    };
  }, []);

  useEffect(() => {
    resonanceSurfacesRef.current.forEach((surface) => {
      const floorFocus = surface.floor === walkFloor ? 1 : 0.22;
      surface.panelMaterial.uniforms.uDisplacement.value = wallReaction.displacement * floorFocus;
      surface.panelMaterial.uniforms.uColorShift.value = wallReaction.colorShift;
      surface.panelMaterial.uniforms.uLineDensity.value = wallReaction.lineDensity * floorFocus;
      surface.panelMaterial.uniforms.uBloom.value = wallReaction.bloom * floorFocus;
      surface.stripMaterials.forEach((material, index) => {
        material.emissive.setHSL(0.48 - wallReaction.colorShift * 0.14 + index * 0.005, 0.72, 0.34);
        material.emissiveIntensity = 0.16 + wallReaction.bloom * floorFocus * 2.2;
        material.opacity = 0.12 + wallReaction.lineDensity * floorFocus * 0.62;
      });
      surface.particleMaterial.opacity = 0.03 + wallReaction.particleEmission * floorFocus * 0.82;
      surface.particleMaterial.size = 0.018 + wallReaction.particleEmission * floorFocus * 0.045;
      surface.rippleMeshes.forEach((ripple, index) => {
        const pulse = wallReaction.displacement * floorFocus * (1 + index * 0.24) + wallReaction.bloom * floorFocus * 0.42;
        ripple.scale.setScalar(0.5 + index * 0.22 + pulse * 1.35);
        surface.rippleMaterials[index].opacity = 0.04 + wallReaction.bloom * floorFocus * (0.38 - index * 0.06);
        surface.rippleMaterials[index].color.setHSL(0.16 - wallReaction.colorShift * 0.08, 0.86, 0.58);
      });
    });
  }, [wallReaction, walkFloor]);

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
      playerRef.current.floor = walkFloor;
      playerRef.current.position.y = yForFloor(walkFloor) + 0.38;
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
    </div>
  );
}
