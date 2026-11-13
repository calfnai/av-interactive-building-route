import assert from "node:assert/strict";
import test from "node:test";
import { bandsFromFrequencyData, sampleAudioBands } from "../src/stairs/audioBands.ts";
import { FLORA_PACK_MANIFEST, flowerNodesForVariant, floraLayoutForSeed } from "../src/stairs/floraPack.ts";
import { flowerMotionForNode } from "../src/stairs/flowerMotion.ts";
import { createFoxtailLily } from "../src/stairs/foxtailLily.ts";
import { routeEventAt, routePoseAt, routePointsUntil } from "../src/stairs/route.ts";
import { ROUTE_EVENTS } from "../src/spatial-data.ts";

test("walk route starts and ends on exact route events", () => {
  const start = routePoseAt(0);
  const end = routePoseAt(1);
  assert.deepEqual(start.position.toArray(), ROUTE_EVENTS[0].position);
  assert.deepEqual(end.position.toArray(), ROUTE_EVENTS.at(-1)?.position);
  assert.equal(routeEventAt(1).id, "finish");
  assert.ok(routePointsUntil(1).at(-1)?.distanceTo(end.position) === 0);
});

test("walk route interpolates continuously without leaving the event corridor", () => {
  let previous = routePoseAt(0).position;
  for (let index = 1; index <= 1000; index += 1) {
    const pose = routePoseAt(index / 1000);
    assert.ok(Number.isFinite(pose.position.length()));
    assert.ok(previous.distanceTo(pose.position) < 0.8, `unexpected route jump at ${index / 1000}`);
    previous = pose.position;
  }
});

test("same seed produces the same flora layout and another seed changes placement", () => {
  const first = floraLayoutForSeed(20260814);
  const second = floraLayoutForSeed(20260814);
  const alternate = floraLayoutForSeed(20260815);
  assert.deepEqual(first, second);
  assert.notDeepEqual(first, alternate);
  assert.equal(first.filter((item) => item.flowerId.includes("foxtail")).length, 2);
});

test("flora pack is self-contained and source-attributed", () => {
  assert.equal(FLORA_PACK_MANIFEST.version, 1);
  assert.equal(FLORA_PACK_MANIFEST.sourceProject, "dailyflora");
  assert.match(FLORA_PACK_MANIFEST.sourceRevision, /5016812/);
  assert.ok(FLORA_PACK_MANIFEST.flowers.some((flower) => flower.rarity === "rare"));
});

test("sample audio exposes distinct bounded bands", () => {
  const bands = sampleAudioBands(2.5);
  for (const value of Object.values(bands)) assert.ok(value >= 0 && value <= 1);
  assert.notEqual(bands.subBass, bands.high);
});

test("frequency mapper isolates low and high activity", () => {
  const values = new Uint8Array(512);
  values[0] = 255;
  values[100] = 210;
  const bands = bandsFromFrequencyData(values, 48000);
  assert.ok(bands.subBass > bands.high);
  assert.ok(bands.mid >= 0);
});

test("new scenes expose six deterministic flower nodes per variant", () => {
  const flora = flowerNodesForVariant("flora", 20260814);
  const sound = flowerNodesForVariant("sound", 20260814);
  assert.equal(flora.length, 6);
  assert.equal(sound.length, 6);
  assert.deepEqual(flora, flowerNodesForVariant("flora", 20260814));
  assert.notDeepEqual(flora, sound);
  assert.equal(flora.filter((node) => node.rarity === "rare").length, 2);
});

test("flower motion keeps low, mid, and high frequency responsibilities separate", () => {
  const node = flowerNodesForVariant("sound", 20260814)[0];
  const low = flowerMotionForNode(node, { subBass: 1, bass: 1, lowMid: 0, mid: 0, high: 0, activity: 0.6 }, 1);
  const mid = flowerMotionForNode(node, { subBass: 0, bass: 0, lowMid: 1, mid: 1, high: 0, activity: 0.6 }, 1);
  const high = flowerMotionForNode(node, { subBass: 0, bass: 0, lowMid: 0, mid: 0, high: 1, activity: 0.6 }, 1);
  assert.ok(low.sway > mid.sway);
  assert.ok(mid.bloom > low.bloom);
  assert.ok(high.shimmer > low.shimmer);
  assert.ok(high.pollen > low.pollen);
});

test("foxtail lily keeps the inspectable named part contract", () => {
  const lily = createFoxtailLily(7);
  assert.deepEqual(lily.userData.actionReadiness.namedParts, ["stem", "spike", "florets", "leaves", "halo"]);
  for (const part of ["stem", "spike", "florets", "leaves", "halo"]) assert.ok(lily.getObjectByName(part));
  assert.ok(lily.getObjectByName("pollen"));
});
