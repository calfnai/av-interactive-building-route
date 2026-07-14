import assert from "node:assert/strict";
import test from "node:test";
import {
  BLOCKED_EVENTS,
  ROUTE_EVENTS,
  SPATIAL_CONNECTIONS,
  SPATIAL_NODES,
} from "../app/spatial-data.ts";

test("the building graph defines both units across all ten floors", () => {
  assert.equal(SPATIAL_NODES.filter((node) => node.kind === "public").length, 20);
  assert.equal(SPATIAL_NODES.filter((node) => node.kind === "stair").length, 20);
  assert.equal(SPATIAL_NODES.filter((node) => node.kind === "elevatorHall").length, 19);
  assert.equal(SPATIAL_NODES.find((node) => node.id === "u1-f2-elevator-hall"), undefined);
});

test("locked barriers are non-traversable and the two known open bridges remain open", () => {
  for (const floor of [6, 7]) {
    const edges = SPATIAL_CONNECTIONS.filter((edge) => edge.to === `f${floor}-interconnect`);
    assert.equal(edges.length, 2);
    assert.ok(edges.every((edge) => edge.traversable === false));
  }
  for (const floor of [8, 10]) {
    const edges = SPATIAL_CONNECTIONS.filter((edge) => edge.to === `f${floor}-interconnect`);
    assert.equal(edges.length, 2);
    assert.ok(edges.every((edge) => edge.traversable === true));
  }
  const lockedStair = SPATIAL_CONNECTIONS.find(
    (edge) => edge.from === "u1-f10-public" && edge.to === "u1-f10-stair",
  );
  assert.equal(lockedStair?.traversable, false);
});

test("route preserves all four block events, wrong turns, and the keyed endpoint", () => {
  assert.deepEqual(
    BLOCKED_EVENTS.map((item) => item.id),
    ["f2-no-lift", "u1-f10-locked-stair", "bridge-f6-locked", "bridge-f7-locked"],
  );
  assert.ok(ROUTE_EVENTS.filter((item) => item.status === "wrong").length >= 6);
  assert.equal(ROUTE_EVENTS.at(-2)?.id, "u1-f6-correct-door");
  assert.equal(ROUTE_EVENTS.at(-1)?.status, "finish");
});

test("the required repeated floors remain in chronological order", () => {
  const ids = ROUTE_EVENTS.map((item) => item.id);
  const requiredOrder = [
    "f2-no-lift",
    "return-f1",
    "wait-lift",
    "u1-f10-locked-stair",
    "bridge-f6-locked",
    "bridge-f7-locked",
    "bridge-f8-open",
    "u1-f6-wrong-room",
    "u1-f7-room-b",
    "u1-f6-room-c",
    "u1-f7-room-c",
    "u1-f6-correct-door",
    "finish",
  ];
  let previous = -1;
  for (const id of requiredOrder) {
    const index = ids.indexOf(id);
    assert.ok(index > previous, `${id} must occur after the previous route event`);
    previous = index;
  }
});
