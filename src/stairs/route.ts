import * as THREE from "three";
import { ROUTE_EVENTS, type RouteEvent, type Vec3 } from "../spatial-data.ts";
import type { RoutePose } from "./types.ts";

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const vectorFrom = (value: Vec3) => new THREE.Vector3(value[0], value[1], value[2]);

export function routePoseAt(progress: number): RoutePose {
  const safeProgress = clamp01(progress);
  const maxIndex = ROUTE_EVENTS.length - 1;
  const scaled = safeProgress * maxIndex;
  const eventIndex = Math.min(Math.floor(scaled), maxIndex);
  const alpha = eventIndex === maxIndex ? 0 : scaled - eventIndex;
  const from = vectorFrom(ROUTE_EVENTS[eventIndex].position);
  const to = vectorFrom(ROUTE_EVENTS[Math.min(eventIndex + 1, maxIndex)].position);
  const position = from.clone().lerp(to, alpha);
  const direction = to.sub(from);

  if (direction.lengthSq() < 1e-8) {
    direction.set(0, 0, -1);
  } else {
    direction.normalize();
  }

  return { position, direction, eventIndex, alpha };
}

export function routeEventAt(progress: number): RouteEvent {
  const index = Math.min(ROUTE_EVENTS.length - 1, Math.round(clamp01(progress) * (ROUTE_EVENTS.length - 1)));
  return ROUTE_EVENTS[index];
}

export function routePointsUntil(progress: number): THREE.Vector3[] {
  const pose = routePoseAt(progress);
  return ROUTE_EVENTS.slice(0, pose.eventIndex + 1)
    .map((event) => vectorFrom(event.position))
    .concat(pose.position);
}

export function routeLength(): number {
  return ROUTE_EVENTS.slice(1).reduce((total, event, index) => {
    const previous = vectorFrom(ROUTE_EVENTS[index].position);
    return total + previous.distanceTo(vectorFrom(event.position));
  }, 0);
}

export const WALK_EYE_HEIGHT = 1.58;
export const WALK_LOOK_DISTANCE = 7;
