import { ROUTE_EVENTS, type Vec3 } from "../spatial-data.ts";
import type { FlowerNode, StairsVariant } from "./types.ts";

export interface FloraPackFlower {
  id: string;
  rarity: "common" | "rare";
  palette: string[];
  scale: number;
  placement: "landing" | "blocked-event" | "wall";
}

export interface FloraPackManifest {
  version: 1;
  sourceProject: "dailyflora";
  sourceRevision: string;
  reference: string;
  licenseNote: string;
  flowers: FloraPackFlower[];
}

export interface FloraPlacement {
  id: string;
  flowerId: string;
  eventId: string;
  position: Vec3;
  variant: StairsVariant | "both";
  seedOffset: number;
}

export const FLORA_PACK_MANIFEST: FloraPackManifest = {
  version: 1,
  sourceProject: "dailyflora",
  sourceRevision: "codex/hand-stairs-playground@5016812",
  reference: "docs/img2threejs/foxtail-lily-reference.jpg",
  licenseNote: "Local project study asset; retain DailyFlora source and reference attribution in distributions.",
  flowers: [
    {
      id: "dailyflora-common-wild-stem",
      rarity: "common",
      palette: ["#eafa61", "#60d5c8", "#b48cff"],
      scale: 0.85,
      placement: "landing",
    },
    {
      id: "foxtail-lily-rare-spatial-event",
      rarity: "rare",
      palette: ["#838d2e", "#515c16", "#aeb382", "#f1e7b1"],
      scale: 1,
      placement: "blocked-event",
    },
  ],
};

const eventPosition = (eventId: string): Vec3 => {
  const event = ROUTE_EVENTS.find((item) => item.id === eventId);
  if (!event) throw new Error(`Missing route event for flora placement: ${eventId}`);
  return event.position;
};

export const FLORA_PLACEMENTS: FloraPlacement[] = [
  { id: "flower-landing-start", flowerId: "dailyflora-common-wild-stem", eventId: "start", position: eventPosition("start"), variant: "both", seedOffset: 11 },
  { id: "flower-landing-f8", flowerId: "dailyflora-common-wild-stem", eventId: "bridge-f8-open", position: eventPosition("bridge-f8-open"), variant: "both", seedOffset: 27 },
  { id: "foxtail-lily-f10-locked", flowerId: "foxtail-lily-rare-spatial-event", eventId: "u1-f10-locked-stair", position: eventPosition("u1-f10-locked-stair"), variant: "both", seedOffset: 43 },
  { id: "foxtail-lily-wall-memory", flowerId: "foxtail-lily-rare-spatial-event", eventId: "bridge-f8-open", position: eventPosition("bridge-f8-open"), variant: "both", seedOffset: 71 },
];

const FLORA_NODES: FlowerNode[] = [
  {
    id: "flora-threshold",
    title: "色彩的入口",
    position: [0, 0, 5],
    seed: 17,
    rarity: "common",
    palette: ["#ff5ca8", "#ffda69", "#73f7d2"],
    responseProfile: "soft",
  },
  {
    id: "flora-citrus-turn",
    title: "柑橘转角",
    position: [3.1, 1.8, 0],
    seed: 29,
    rarity: "common",
    palette: ["#ff8c42", "#f9f871", "#b7ffda"],
    responseProfile: "pulse",
  },
  {
    id: "flora-violet-landing",
    title: "紫色平台",
    position: [-3.1, 3.6, -5],
    seed: 43,
    rarity: "rare",
    palette: ["#b48cff", "#ff73b9", "#f4ef9f", "#6bffda"],
    responseProfile: "wild",
  },
  {
    id: "flora-aqua-turn",
    title: "水色转折",
    position: [3.1, 5.4, -10],
    seed: 61,
    rarity: "common",
    palette: ["#6bf2ff", "#70ffa5", "#d3a6ff"],
    responseProfile: "soft",
  },
  {
    id: "flora-sunrise-landing",
    title: "日出花束",
    position: [-3.1, 7.2, -15],
    seed: 79,
    rarity: "common",
    palette: ["#ffcf70", "#ff7d9e", "#b9ffef"],
    responseProfile: "pulse",
  },
  {
    id: "flora-foxtail-apex",
    title: "狐尾百合的高处",
    position: [0, 9, -20],
    seed: 97,
    rarity: "rare",
    palette: ["#e8e8a4", "#8ba15a", "#fff1b1", "#e3a6ff"],
    responseProfile: "wild",
  },
];

const SOUND_NODES: FlowerNode[] = [
  {
    id: "sound-low-threshold",
    title: "低频入口",
    position: [0, 0, 5],
    seed: 113,
    rarity: "common",
    palette: ["#4cf5d6", "#426bff", "#c9f56b"],
    responseProfile: "soft",
  },
  {
    id: "sound-blue-pulse",
    title: "蓝色脉冲",
    position: [-4.5, 1.8, 0],
    seed: 127,
    rarity: "common",
    palette: ["#58b7ff", "#8e7bff", "#8affee"],
    responseProfile: "pulse",
  },
  {
    id: "sound-violet-well",
    title: "紫色声井",
    position: [4.5, 3.6, -5],
    seed: 149,
    rarity: "rare",
    palette: ["#c579ff", "#5f7bff", "#f5a5df", "#80ffe0"],
    responseProfile: "wild",
  },
  {
    id: "sound-green-bridge",
    title: "绿色回声桥",
    position: [-4.5, 5.4, -10],
    seed: 163,
    rarity: "common",
    palette: ["#55ffbb", "#b7ff72", "#53a6ff"],
    responseProfile: "soft",
  },
  {
    id: "sound-red-break",
    title: "红色断拍",
    position: [4.5, 7.2, -15],
    seed: 181,
    rarity: "common",
    palette: ["#ff547e", "#ff9e62", "#b783ff"],
    responseProfile: "pulse",
  },
  {
    id: "sound-foxtail-peak",
    title: "高频花冠",
    position: [0, 9, -20],
    seed: 199,
    rarity: "rare",
    palette: ["#d2ff8a", "#89a9ff", "#fff5b5", "#e4a4ff"],
    responseProfile: "wild",
  },
];

export function seededValue(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

export function floraLayoutForSeed(seed: number): FloraPlacement[] {
  return FLORA_PLACEMENTS.map((placement) => ({
    ...placement,
    position: [
      placement.position[0] + (seededValue(seed + placement.seedOffset) - 0.5) * 0.34,
      placement.position[1],
      placement.position[2] + (seededValue(seed + placement.seedOffset + 9) - 0.5) * 0.28,
    ],
  }));
}

function nodeWithSeed(node: FlowerNode, seed: number): FlowerNode {
  const spread = node.rarity === "rare" ? 0.22 : 0.34;
  return {
    ...node,
    seed: node.seed + Math.round(seededValue(seed + node.seed) * 1000),
    position: [
      node.position[0] + (seededValue(seed + node.seed) - 0.5) * spread,
      node.position[1],
      node.position[2] + (seededValue(seed + node.seed + 31) - 0.5) * spread,
    ],
  };
}

export function flowerNodesForVariant(variant: StairsVariant, seed = 20260814): FlowerNode[] {
  const source = variant === "flora" ? FLORA_NODES : SOUND_NODES;
  return source.map((node) => nodeWithSeed(node, seed));
}
