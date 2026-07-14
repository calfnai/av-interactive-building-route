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
  assert.equal(ROUTE_EVENTS.length, 55);
  assert.ok(ROUTE_EVENTS.filter((item) => item.status === "wrong").length >= 6);
  assert.equal(ROUTE_EVENTS.some((item) => item.id === "u1-f8-lift"), false);
  assert.deepEqual(
    ROUTE_EVENTS.slice(
      ROUTE_EVENTS.findIndex((item) => item.id === "u1-f8-public"),
      ROUTE_EVENTS.findIndex((item) => item.id === "u1-f7-public-a") + 1,
    ).map((item) => item.id),
    [
      "u1-f8-public",
      "u1-f8-door-a",
      "u1-f8-room-a",
      "u1-f8-room-b",
      "u1-f8-exit-room",
      "u1-f8-stair-to-7",
      "u1-f7-stair",
      "u1-f7-public-a",
    ],
  );
  assert.equal(ROUTE_EVENTS.at(-2)?.id, "u1-f6-correct-door");
  assert.equal(ROUTE_EVENTS.at(-1)?.status, "finish");
});

test("initial side-door approach keeps the original turns", () => {
  assert.deepEqual(
    ROUTE_EVENTS.slice(0, 12).map((item) => item.id),
    [
      "start",
      "u1-stair-half-up",
      "f2-no-lift",
      "u1-stair-half-down",
      "return-f1",
      "turn-left-90-at-origin",
      "side-door",
      "after-side-left-50",
      "corridor-forward-a",
      "corridor-right-90-a",
      "corridor-forward-b",
      "corridor-right-90-b",
    ],
  );
});

test("interior movement never changes floors", () => {
  const nodeById = new Map(SPATIAL_NODES.map((node) => [node.id, node]));
  const interiorEdges = SPATIAL_CONNECTIONS.filter((edge) => edge.mode === "interior" && edge.traversable);

  assert.ok(interiorEdges.length > 0);
  for (const edge of interiorEdges) {
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    assert.ok(from && to);
    assert.equal(from.floor, to.floor, `${edge.from} -> ${edge.to} must stay on the same floor`);
  }
  assert.equal(interiorEdges.some((edge) => /u1-f7-room/.test(edge.from) || /u1-f7-room/.test(edge.to)), false);
});

test("route floor changes only happen through stairs or elevator", () => {
  for (let index = 1; index < ROUTE_EVENTS.length; index += 1) {
    const previous = ROUTE_EVENTS[index - 1];
    const current = ROUTE_EVENTS[index];
    if (previous.floor === current.floor) continue;

    const routeText = `${current.id} ${current.title} ${current.detail}`;
    assert.match(routeText, /楼梯|电梯|stair|lift/, `${previous.id} -> ${current.id} changes floors without vertical transport`);
  }
});
