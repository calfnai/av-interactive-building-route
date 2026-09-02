export type PerformancePoint = {
  normalizedX: number;
  normalizedY: number;
  midi: number;
  frequency: number;
  brightness: number;
  wet: number;
  color: number;
};

export type NoteEvent = PerformancePoint & {
  id: string;
  startedAt: number;
  duration: number;
  intensity: number;
};

export type SpecimenMeta = {
  seed: string;
  durationSeconds: number;
  pulseCount: number;
  generatedAt: string;
};

const D_DORIAN_TWO_OCTAVES = [50, 52, 53, 55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72, 74] as const;
const PALETTE = [0x7775ff, 0x7569e8, 0x9b6ed8, 0xdd718f, 0xff8169, 0xf1bf67] as const;

export function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

export function midiToFrequency(midi: number) {
  return 440 * 2 ** ((midi - 69) / 12);
}

function channel(color: number, shift: number) {
  return (color >> shift) & 0xff;
}

function interpolateColor(start: number, end: number, amount: number) {
  const mix = (shift: number) => Math.round(channel(start, shift) + (channel(end, shift) - channel(start, shift)) * amount);
  return (mix(16) << 16) | (mix(8) << 8) | mix(0);
}

export function colorForPosition(normalizedX: number) {
  const scaled = clamp(normalizedX) * (PALETTE.length - 1);
  const index = Math.min(PALETTE.length - 2, Math.floor(scaled));
  return interpolateColor(PALETTE[index], PALETTE[index + 1], scaled - index);
}

export function performanceFromNormalized(normalizedX: number, normalizedY: number): PerformancePoint {
  const x = clamp(normalizedX);
  const y = clamp(normalizedY);
  const noteIndex = Math.min(D_DORIAN_TWO_OCTAVES.length - 1, Math.floor(x * D_DORIAN_TWO_OCTAVES.length));
  const midi = D_DORIAN_TWO_OCTAVES[noteIndex];
  return {
    normalizedX: x,
    normalizedY: y,
    midi,
    frequency: midiToFrequency(midi),
    brightness: 0.22 + (1 - y) * 0.78,
    wet: 0.18 + y * 0.68,
    color: colorForPosition(x),
  };
}

export function createNoteEvent(point: PerformancePoint, startedAt: number, intensity = 0.72, id?: string): NoteEvent {
  return {
    ...point,
    id: id ?? `pulse-${Math.round(startedAt)}-${point.midi}`,
    startedAt,
    duration: 0,
    intensity: clamp(intensity, 0.15, 1),
  };
}

export function makeSeed(randomValue = Math.random()) {
  return Math.floor(clamp(randomValue, 0, 0.999999) * 0xffffff).toString(16).toUpperCase().padStart(6, "0");
}

export function makeSpecimenMeta(seed: string, startedAt: number, now: number, pulseCount: number, generatedAt = new Date()): SpecimenMeta {
  return {
    seed,
    durationSeconds: Math.max(0, Math.round((now - startedAt) / 1000)),
    pulseCount: Math.max(0, Math.floor(pulseCount)),
    generatedAt: generatedAt.toISOString(),
  };
}

export function specimenFilename(date = new Date()) {
  const stamp = date.toISOString().replace(/[-:]/g, "").replace(/T/, "-").slice(0, 15);
  return `memory-specimen-${stamp}.png`;
}
