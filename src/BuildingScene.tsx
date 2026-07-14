"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  BLOCKED_EVENTS,
  FLOORS,
  ROUTE_EVENTS,
  SPATIAL_CONNECTIONS,
  SPATIAL_NODES,
  unitX,
  yForFloor,
  type RouteEvent,
  type Vec3,
} from "./spatial-data";

export type CameraCommand = "overview" | "route" | "chase" | "top";

interface BuildingSceneProps {
  progress: number;
  currentEvent: RouteEvent;
  floorFocus: number | null;
  cameraCommand: CameraCommand;
  commandVersion: number;
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

export default function BuildingScene({
  progress,
  currentEvent,
  floorFocus,
  cameraCommand,
  commandVersion,
}: BuildingSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const markerRef = useRef<THREE.Group | null>(null);
  const routeRef = useRef<THREE.Line | null>(null);
  const characterHeadingRef = useRef(new THREE.Vector3(0, 0, -1));
  const focusGroupsRef = useRef<Map<number, THREE.Group>>(new Map());

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

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.setAttribute("aria-label", "居民楼栋三维空间与人物行进轨迹");
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.065;
    controls.target.set(0, 10, 0);
    controls.minDistance = 12;
    controls.maxDistance = 72;
    controls.maxPolarAngle = Math.PI * 0.88;
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

        addBox(floorGroup, [1.45, 1.55, 1.45], [x + (unit === 1 ? -2.4 : 2.4), y + 0.82, -2.25], palette.stair, 0.24, true);
        if (!(unit === 1 && floor === 2)) {
          addBox(floorGroup, [1.65, 1.8, 1.5], [x + (unit === 1 ? 2.7 : -2.7), y + 0.92, -2.25], palette.elevator, 0.2, true);
        }

        for (let room = 0; room < 3; room += 1) {
          addBox(floorGroup, [1.85, 1.45, 2.15], [x + (room - 1) * 2.15, y + 0.76, 3.15], palette.room, 0.5);
        }

        const unitLabel = createTextSprite(`${unit}单元 · ${floor}F`, unit === 1 ? "#7ce0d5" : "#7eb1ff", 0.78);
        unitLabel.position.set(x, y + 1.55, -0.1);
        floorGroup.add(unitLabel);
      }

      addBox(floorGroup, [3.2, 0.1, 1.05], [0, y, 0], palette.floorEdge, 0.46);
      const bridgeLocked = floor !== 8 && floor !== 10;
      addDoor(floorGroup, [0, y + 0.78, 0], bridgeLocked, `${floor}F 互通门`);

      if (floor === 10) {
        addDoor(floorGroup, [-9.05, y + 0.78, -1.72], true, "1单元 10F 楼梯门");
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
      new THREE.CapsuleGeometry(0.18, 0.55, 6, 14),
      new THREE.MeshBasicMaterial({ color: palette.route }),
    );
    body.position.y = 0.62;
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.17, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    head.position.y = 1.08;
    const facing = new THREE.Mesh(
      new THREE.ConeGeometry(0.13, 0.32, 16),
      new THREE.MeshBasicMaterial({ color: 0xffd966 }),
    );
    facing.rotation.x = Math.PI / 2;
    facing.position.set(0, 0.7, 0.33);
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
      const t = clock.getElapsedTime();
      halo.rotation.z = t * 0.65;
      body.scale.setScalar(1 + Math.sin(t * 4) * 0.035);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
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
    };
  }, []);

  useEffect(() => {
    const marker = markerRef.current;
    const route = routeRef.current;
    if (!marker || !route) return;
    const { position, heading, startIndex } = routePoseAt(progress);
    if (heading) {
      characterHeadingRef.current.lerp(heading, 0.32).normalize();
    }
    marker.position.copy(position);
    faceMarker(marker, characterHeadingRef.current);
    const geometry = new THREE.BufferGeometry().setFromPoints(
      ROUTE_EVENTS.slice(0, startIndex + 1)
        .map((item) => toVector(item.position))
        .concat([marker.position.clone()]),
    );
    route.geometry.dispose();
    route.geometry = geometry;
    (route.material as THREE.LineBasicMaterial).opacity = 0.96;

    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (cameraCommand === "chase" && camera && controls) {
      applyChaseCamera(camera, controls, position, characterHeadingRef.current);
    }
  }, [progress, cameraCommand]);

  useEffect(() => {
    for (const [floor, group] of focusGroupsRef.current.entries()) {
      const active = floorFocus === null || floor === floorFocus;
      group.visible = floorFocus === null || Math.abs(floor - floorFocus) <= 1;
      group.traverse((object) => {
        const mesh = object as THREE.Mesh;
        const material = mesh.material as THREE.Material & { opacity?: number };
        if (material && "opacity" in material && typeof material.opacity === "number") {
          material.transparent = true;
          material.opacity = active ? (mesh.userData.baseOpacity ?? material.opacity) : 0.11;
        }
      });
    }
  }, [floorFocus]);

  useEffect(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    if (cameraCommand === "top") {
      camera.position.set(0, 52, 0.1);
      controls.target.set(0, 10, 0);
    } else if (cameraCommand === "chase") {
      const { position, heading } = routePoseAt(progress);
      if (heading) characterHeadingRef.current.copy(heading);
      applyChaseCamera(camera, controls, position, characterHeadingRef.current, true);
    } else if (cameraCommand === "route") {
      const target = toVector(currentEvent.position);
      camera.position.copy(target.clone().add(new THREE.Vector3(12, 8, 13)));
      controls.target.copy(target);
    } else {
      camera.position.set(32, 27, 36);
      controls.target.set(0, 10, 0);
    }
    controls.update();
  }, [cameraCommand, commandVersion, currentEvent]);

  return <div className="scene-host" ref={hostRef} />;
}
