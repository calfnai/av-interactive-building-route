export type ColliderKind =
  | "boundary"
  | "wall"
  | "room"
  | "door"
  | "elevator"
  | "shaft";

export interface Vec2 {
  x: number;
  z: number;
}

export interface Collider {
  id: string;
  kind: ColliderKind;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface MovementKeys {
  forward?: boolean;
  backward?: boolean;
  left?: boolean;
  right?: boolean;
}

export interface CorridorColliderOptions {
  openElevator?: boolean;
  openInterconnect?: boolean;
}

export const PLAYER_RADIUS = 0.28;
export const PLAYER_HEIGHT = 1.6;

const UNIT_WIDTH = 11.1;
const UNIT_CENTER = 7.2;
const WORLD_MIN_X = -12.75;
const WORLD_MAX_X = 12.75;
const WORLD_MIN_Z = -5.2;
const WORLD_MAX_Z = 5.2;

function unitCenter(unit: 1 | 2): number {
  return unit === 1 ? -UNIT_CENTER : UNIT_CENTER;
}

function addCollider(
  colliders: Collider[],
  id: string,
  kind: ColliderKind,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
): void {
  colliders.push({ id, kind, minX, maxX, minZ, maxZ });
}

/**
 * Build the lightweight play-space collision layer. Visual meshes are not
 * used as colliders: this keeps the FPS controls stable and lets the route
 * remain authored independently from the playable corridor.
 */
export function createCorridorColliders(
  floor: number,
  options: CorridorColliderOptions = {},
): Collider[] {
  const colliders: Collider[] = [];

  addCollider(colliders, `boundary-left-${floor}`, "boundary", WORLD_MIN_X - 0.3, WORLD_MIN_X, WORLD_MIN_Z, WORLD_MAX_Z);
  addCollider(colliders, `boundary-right-${floor}`, "boundary", WORLD_MAX_X, WORLD_MAX_X + 0.3, WORLD_MIN_Z, WORLD_MAX_Z);
  addCollider(colliders, `boundary-front-${floor}`, "boundary", WORLD_MIN_X, WORLD_MAX_X, WORLD_MIN_Z - 0.3, WORLD_MIN_Z);
  addCollider(colliders, `boundary-back-${floor}`, "boundary", WORLD_MIN_X, WORLD_MAX_X, WORLD_MAX_Z, WORLD_MAX_Z + 0.3);

  // Apartment blocks start behind the public corridor. The door faces remain
  // visible, but the first-person prototype treats them as closed room fronts
  // so the player cannot walk through rooms or the back wall.
  for (const unit of [1, 2] as const) {
    const center = unitCenter(unit);
    addCollider(
      colliders,
      `rooms-${floor}-unit-${unit}`,
      "room",
      center - UNIT_WIDTH / 2 + 0.12,
      center + UNIT_WIDTH / 2 - 0.12,
      2.05,
      WORLD_MAX_Z,
    );
  }

  // The central bridge is only a valid connection on the authored open
  // floors. On other floors it is a locked interconnect door.
  if (!options.openInterconnect) {
    addCollider(colliders, `interconnect-door-${floor}`, "door", -0.38, 0.38, -0.4, 1.25);
  }

  // Keep the elevator shaft and cabin volume sealed during normal walking.
  // The elevator state machine handles entering the cabin after E/W and
  // removes this logical obstacle while the player is inside the ride.
  for (const unit of [1, 2] as const) {
    const center = unitCenter(unit) + (unit === 1 ? 2.95 : -2.95);
    if (!options.openElevator) {
      addCollider(colliders, `elevator-cabin-${floor}-unit-${unit}`, "elevator", center - 0.82, center + 0.82, -3.35, -1.25);
    }
    addCollider(colliders, `elevator-shaft-${floor}-unit-${unit}`, "shaft", center - 1.05, center + 1.05, -3.65, -3.35);
  }

  // Rail-side blockers protect the stair void while leaving the stair mouth
  // open. During a stair transition the player is additionally constrained to
  // the stair centerline by the transition state in BuildingScene.
  for (const unit of [1, 2] as const) {
    const center = unitCenter(unit) + (unit === 1 ? 4.8 : -4.8);
    addCollider(colliders, `stair-rail-${floor}-unit-${unit}-left`, "shaft", center - 0.82, center - 0.62, -3.35, -1.05);
    addCollider(colliders, `stair-rail-${floor}-unit-${unit}-right`, "shaft", center + 0.62, center + 0.82, -3.35, -1.05);
  }

  return colliders;
}

export function movementBasis(yaw: number): { forward: Vec2; right: Vec2 } {
  const forward = { x: Math.sin(yaw), z: Math.cos(yaw) };
  // forward x world-up. This is screen-right for the camera convention above.
  const right = { x: -Math.cos(yaw), z: Math.sin(yaw) };
  return { forward, right };
}

export function movementVector(yaw: number, keys: MovementKeys): Vec2 {
  const { forward, right } = movementBasis(yaw);
  const vector = { x: 0, z: 0 };

  if (keys.forward) {
    vector.x += forward.x;
    vector.z += forward.z;
  }
  if (keys.backward) {
    vector.x -= forward.x;
    vector.z -= forward.z;
  }
  if (keys.left) {
    vector.x -= right.x;
    vector.z -= right.z;
  }
  if (keys.right) {
    vector.x += right.x;
    vector.z += right.z;
  }

  const length = Math.hypot(vector.x, vector.z);
  if (length > 0) {
    vector.x /= length;
    vector.z /= length;
  }
  return vector;
}

export function collidesAt(position: Vec2, colliders: Collider[], radius = PLAYER_RADIUS): boolean {
  return colliders.some(
    (collider) =>
      position.x > collider.minX - radius &&
      position.x < collider.maxX + radius &&
      position.z > collider.minZ - radius &&
      position.z < collider.maxZ + radius,
  );
}

/** Resolve independently on X and Z so a wall can be slid along. */
export function resolveMotion(
  position: Vec2,
  delta: Vec2,
  colliders: Collider[],
  radius = PLAYER_RADIUS,
): Vec2 {
  let x = position.x;
  let z = position.z;
  const nextX = { x: x + delta.x, z };
  if (!collidesAt(nextX, colliders, radius)) {
    x = nextX.x;
  }

  const nextZ = { x, z: z + delta.z };
  if (!collidesAt(nextZ, colliders, radius)) {
    z = nextZ.z;
  }

  return { x, z };
}

export function distanceSquared(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}
