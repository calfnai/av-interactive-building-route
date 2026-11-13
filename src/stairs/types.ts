import type * as THREE from "three";

export type StairsVariant = "flora" | "sound";
export type WalkCameraMode = "walk" | "overview" | "chase" | "top";
export type AudioInputMode = "SAMPLE" | "MICROPHONE";

export interface FlowerNode {
  id: string;
  title: string;
  position: [number, number, number];
  seed: number;
  rarity: "common" | "rare";
  palette: string[];
  responseProfile: "soft" | "pulse" | "wild";
}

export interface FlowerMotionState {
  sway: number;
  bloom: number;
  shimmer: number;
  breath: number;
  pollen: number;
}

export interface AudioBands {
  subBass: number;
  bass: number;
  lowMid: number;
  mid: number;
  high: number;
  activity: number;
}

export const ZERO_AUDIO_BANDS: AudioBands = {
  subBass: 0,
  bass: 0,
  lowMid: 0,
  mid: 0,
  high: 0,
  activity: 0,
};

export interface RoutePose {
  position: THREE.Vector3;
  direction: THREE.Vector3;
  eventIndex: number;
  alpha: number;
}
