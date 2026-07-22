export type HandName = "left" | "right";

export interface ControlLandmark {
  x: number;
  y: number;
  z: number;
}

export interface ControlHand {
  tracked: boolean;
  confidence: number;
  x: number;
  y: number;
  depth: number;
  pinch: number;
  openness: number;
  landmarks: ControlLandmark[];
}

export interface HandControlFrame {
  source: "off" | "browser" | "desktop";
  status: "off" | "loading" | "waiting" | "connected" | "error";
  message: string;
  hands: Record<HandName, ControlHand>;
  primaryHand: HandName;
  spread: number;
  pinchActive: boolean;
  fps: number;
}

export const EMPTY_HAND: ControlHand = {
  tracked: false,
  confidence: 0,
  x: 0.5,
  y: 0.5,
  depth: 0,
  pinch: 0,
  openness: 0,
  landmarks: [],
};

export const EMPTY_HAND_FRAME: HandControlFrame = {
  source: "off",
  status: "off",
  message: "手势控制未启用",
  hands: { left: EMPTY_HAND, right: EMPTY_HAND },
  primaryHand: "right",
  spread: 0,
  pinchActive: false,
  fps: 0,
};

export const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export function mix(previous: number, next: number, amount = 0.28) {
  return previous + (next - previous) * amount;
}

export function smoothHand(previous: ControlHand, next: ControlHand): ControlHand {
  if (!next.tracked) return { ...EMPTY_HAND };
  if (!previous.tracked) return next;
  return {
    ...next,
    x: mix(previous.x, next.x),
    y: mix(previous.y, next.y),
    depth: mix(previous.depth, next.depth),
    pinch: mix(previous.pinch, next.pinch, 0.4),
    openness: mix(previous.openness, next.openness),
  };
}
