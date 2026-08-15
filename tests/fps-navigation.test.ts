import assert from "node:assert/strict";
import test from "node:test";
import {
  collidesAt,
  createCorridorColliders,
  movementBasis,
  movementVector,
  resolveMotion,
} from "../src/fps-navigation.ts";
import { bandsToWallReaction } from "../src/audio-bands.ts";

test("FPS basis keeps W/A/S/D orthogonal and screen-relative", () => {
  const yaw = Math.PI;
  const { forward, right } = movementBasis(yaw);
  assert.ok(Math.abs(forward.x * right.x + forward.z * right.z) < 1e-9);
  assert.ok(Math.abs(Math.hypot(forward.x, forward.z) - 1) < 1e-9);
  assert.ok(Math.abs(Math.hypot(right.x, right.z) - 1) < 1e-9);

  const left = movementVector(yaw, { left: true });
  const screenRight = movementVector(yaw, { right: true });
  assert.ok(left.x < -0.99, "A must move to screen-left at the initial heading");
  assert.ok(screenRight.x > 0.99, "D must move to screen-right at the initial heading");
  assert.ok(left.x * screenRight.x + left.z * screenRight.z < -0.99, "A and D must be opposite directions");
});

test("corridor collision resolves independently on X and Z", () => {
  const colliders = createCorridorColliders(1);
  const wall = colliders.find((collider) => collider.id === "interconnect-door-1");
  assert.ok(wall);
  assert.equal(collidesAt({ x: 0, z: 0.1 }, colliders), true);

  const slid = resolveMotion({ x: -0.7, z: -0.5 }, { x: 1, z: 0.6 }, colliders);
  assert.ok(slid.x < -0.6, "the player must not pass through the locked door");
  assert.ok(slid.z > -0.5, "the free axis should still slide along the obstacle");
});

test("open interconnect and room blockers remain explicit", () => {
  const closed = createCorridorColliders(6);
  const open = createCorridorColliders(8, { openInterconnect: true });
  assert.ok(closed.some((collider) => collider.kind === "door"));
  assert.equal(open.some((collider) => collider.kind === "door"), false);
  assert.ok(open.some((collider) => collider.kind === "room"));
  assert.ok(open.some((collider) => collider.kind === "shaft"));
});

test("wall reaction separates low, mid and high frequency behavior", () => {
  const low = bandsToWallReaction({ subBass: 1, bass: 1, lowMid: 0, mid: 0, high: 0, activity: 0.5 });
  const high = bandsToWallReaction({ subBass: 0, bass: 0, lowMid: 0, mid: 0, high: 1, activity: 0.5 });
  const mid = bandsToWallReaction({ subBass: 0, bass: 0, lowMid: 1, mid: 1, high: 0, activity: 0.5 });
  assert.ok(low.displacement > high.displacement);
  assert.ok(high.particleEmission > low.particleEmission);
  assert.ok(mid.lineDensity > low.lineDensity);
  assert.ok(low.pulse > high.pulse);
  assert.ok(mid.propagation > 0);
});
