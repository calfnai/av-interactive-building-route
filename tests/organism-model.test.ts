import assert from "node:assert/strict";
import test from "node:test";
import { colorForPosition, createNoteEvent, makeSeed, makeSpecimenMeta, midiToFrequency, performanceFromNormalized, specimenFilename } from "../app/memory-palace/organism-model.ts";

test("pointer positions quantize to two octaves of D Dorian", () => {
  const left = performanceFromNormalized(0, 0.5);
  const middle = performanceFromNormalized(0.5, 0.5);
  const right = performanceFromNormalized(1, 0.5);
  assert.equal(left.midi, 50);
  assert.equal(middle.midi, 62);
  assert.equal(right.midi, 74);
  assert.ok(Math.abs(left.frequency - midiToFrequency(50)) < 0.0001);
});

test("pointer mapping clamps boundaries and maps depth to brightness and wetness", () => {
  const bright = performanceFromNormalized(-2, -1);
  const deep = performanceFromNormalized(4, 3);
  assert.equal(bright.normalizedX, 0);
  assert.equal(bright.normalizedY, 0);
  assert.equal(bright.brightness, 1);
  assert.equal(bright.wet, 0.18);
  assert.equal(deep.normalizedX, 1);
  assert.equal(deep.normalizedY, 1);
  assert.equal(deep.brightness, 0.22);
  assert.ok(Math.abs(deep.wet - 0.86) < 0.0001);
});

test("the palette grows from violet toward warm gold", () => {
  assert.equal(colorForPosition(0), 0x7775ff);
  assert.equal(colorForPosition(1), 0xf1bf67);
  assert.notEqual(colorForPosition(0.5), colorForPosition(0));
});

test("note and specimen metadata are deterministic at their boundaries", () => {
  const point = performanceFromNormalized(0.25, 0.75);
  const note = createNoteEvent(point, 1234, 2, "known-note");
  assert.equal(note.id, "known-note");
  assert.equal(note.intensity, 1);
  assert.equal(note.duration, 0);
  assert.equal(makeSeed(0), "000000");
  assert.equal(makeSeed(0.999999), "FFFFEE");
  assert.deepEqual(makeSpecimenMeta("ABC123", 1_000, 66_400, 6.9, new Date("2026-09-02T08:00:00.000Z")), {
    seed: "ABC123",
    durationSeconds: 65,
    pulseCount: 6,
    generatedAt: "2026-09-02T08:00:00.000Z",
  });
  assert.equal(specimenFilename(new Date("2026-09-02T08:09:10.000Z")), "memory-specimen-20260902-080910.png");
});
