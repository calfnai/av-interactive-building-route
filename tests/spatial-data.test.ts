import assert from "node:assert/strict";
import test from "node:test";
import {
  BLOCKED_EVENTS,
  ROUTE_EVENTS,
  SPATIAL_CONNECTIONS,
  SPATIAL_NODES,
} from "../src/spatial-data.ts";

test("building graph covers two units and ten floors", () => {
  assert.equal(SPATIAL_NODES.filter((node) => node.kind === "public").length, 20);
  assert.equal(SPATIAL_NODES.filter((node) => node.kind === "stair").length, 20);
  assert.equal(SPATIAL_NODES.find((node) => node.id === "u1-f2-elevator-hall"), undefined);
});

test("hard barriers cannot be traversed", () => {
  for (const floor of [6, 7]) {
    const edges = SPATIAL_CONNECTIONS.filter((edge) => edge.to === `f${floor}-interconnect`);
    assert.ok(edges.length === 2 && edges.every((edge) => edge.traversable === false));
  }
  assert.deepEqual(
    BLOCKED_EVENTS.map((item) => item.id),
    ["f2-no-lift", "u1-f10-locked-stair", "bridge-f6-locked", "bridge-f7-locked"],
  );
});

test("route retains every required detour and keyed finish", () => {
  assert.equal(ROUTE_EVENTS.length, 43);
  assert.ok(ROUTE_EVENTS.filter((item) => item.status === "wrong").length >= 6);
  assert.equal(ROUTE_EVENTS.some((item) => item.id === "u1-f8-lift"), false);
  assert.deepEqual(
    ROUTE_EVENTS.slice(
      ROUTE_EVENTS.findIndex((item) => item.id === "u1-f8-public"),
      ROUTE_EVENTS.findIndex((item) => item.id === "u1-f7-public-a") + 1,
    ).map((item) => item.id),
    ["u1-f8-public", "u1-f8-door-a", "u1-f8-room-a", "u1-f7-room-a", "u1-f7-public-a"],
  );
  assert.equal(ROUTE_EVENTS.at(-2)?.id, "u1-f6-correct-door");
  assert.equal(ROUTE_EVENTS.at(-1)?.status, "finish");
});
