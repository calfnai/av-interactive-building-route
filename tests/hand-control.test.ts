import assert from "node:assert/strict";
import test from "node:test";
import { clamp01, EMPTY_HAND, gestureCommandFor, smoothHand } from "../src/hand-control.ts";

test("hand values stay in the normalized controller range", () => {
  assert.equal(clamp01(-0.2), 0);
  assert.equal(clamp01(0.45), 0.45);
  assert.equal(clamp01(1.7), 1);
});

test("newly tracked hands do not ease in from the neutral position", () => {
  const tracked = { ...EMPTY_HAND, tracked: true, x: 0.9, y: 0.2, pinch: 0.8 };
  assert.deepEqual(smoothHand(EMPTY_HAND, tracked), tracked);
});

test("continuous hand values are smoothed but tracking state is immediate", () => {
  const previous = { ...EMPTY_HAND, tracked: true, x: 0.2, y: 0.3 };
  const next = { ...EMPTY_HAND, tracked: true, x: 0.8, y: 0.9 };
  const smoothed = smoothHand(previous, next);
  assert.equal(smoothed.tracked, true);
  assert.ok(smoothed.x > previous.x && smoothed.x < next.x);
  assert.ok(smoothed.y > previous.y && smoothed.y < next.y);
});

test("recognized gestures map to explicit timeline commands", () => {
  assert.equal(gestureCommandFor("Thumb_Up"), "play");
  assert.equal(gestureCommandFor("Closed_Fist"), "pause");
  assert.equal(gestureCommandFor("Pointing_Up"), "beginning");
  assert.equal(gestureCommandFor("Victory"), "ending");
  assert.equal(gestureCommandFor("Open_Palm"), null);
});
