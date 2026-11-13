import type { AudioBands, FlowerMotionState, FlowerNode, StairsVariant } from "./types.ts";

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const profileScale = {
  soft: { sway: 0.78, bloom: 0.86, shimmer: 0.72 },
  pulse: { sway: 1, bloom: 1, shimmer: 1 },
  wild: { sway: 1.28, bloom: 1.22, shimmer: 1.38 },
} as const;

export function flowerMotionForNode(
  node: FlowerNode,
  audio: AudioBands,
  timeSeconds: number,
  proximity = 0,
  variant: StairsVariant = "flora",
): FlowerMotionState {
  const scale = profileScale[node.responseProfile];
  const breathWave = (Math.sin(timeSeconds * 1.35 + node.seed * 0.07) + 1) / 2;
  const audioPulse = clamp01(audio.activity * 0.68 + audio.subBass * 0.32);
  const focus = clamp01(proximity);
  const soundSceneBoost = variant === "sound" ? 1.12 : 1;

  return {
    sway: clamp01((0.05 + audio.subBass * 0.48 + audio.bass * 0.3 + breathWave * 0.08) * scale.sway * soundSceneBoost),
    bloom: clamp01((0.08 + audio.lowMid * 0.32 + audio.mid * 0.52 + focus * 0.12) * scale.bloom * soundSceneBoost),
    shimmer: clamp01((audio.high * 0.78 + audio.mid * 0.12 + focus * 0.08) * scale.shimmer * soundSceneBoost),
    breath: clamp01(0.08 + audioPulse * 0.52 + focus * 0.18 + breathWave * 0.12),
    pollen: clamp01((audio.high * 0.7 + audio.activity * 0.22 + focus * 0.16) * scale.shimmer),
  };
}
