import { useCallback, useEffect, useRef, useState } from "react";

export interface AudioBands {
  subBass: number;
  bass: number;
  lowMid: number;
  mid: number;
  high: number;
  activity: number;
}

export type AudioSource = "SAMPLE" | "MICROPHONE";

export interface WallReactionState {
  displacement: number;
  colorShift: number;
  lineDensity: number;
  bloom: number;
  particleEmission: number;
  pulse: number;
  propagation: number;
}

export interface FloorAVReaction {
  floor: number;
  label: string;
  hue: number;
  pattern: number;
}

export const FLOOR_AV_REACTIONS: FloorAVReaction[] = [
  { floor: 1, label: "SUB BASS / FOUNDATION", hue: 0.52, pattern: 8 },
  { floor: 2, label: "GRAIN / STAIRS", hue: 0.59, pattern: 14 },
  { floor: 3, label: "MID / GLASS", hue: 0.12, pattern: 20 },
  { floor: 4, label: "PHASE / HALL", hue: 0.82, pattern: 12 },
  { floor: 5, label: "STATIC / ROOM", hue: 0.67, pattern: 28 },
  { floor: 6, label: "FEEDBACK / BRIDGE", hue: 0.94, pattern: 18 },
  { floor: 7, label: "DUST / HIGH", hue: 0.3, pattern: 34 },
  { floor: 8, label: "ECHO / VOID", hue: 0.55, pattern: 10 },
  { floor: 9, label: "FRACTURE / LINE", hue: 0.03, pattern: 24 },
  { floor: 10, label: "TERMINAL / BLOOM", hue: 0.76, pattern: 16 },
];

export function floorAVReactionFor(floor: number) {
  return FLOOR_AV_REACTIONS.find((reaction) => reaction.floor === floor) ?? FLOOR_AV_REACTIONS[0];
}

export interface AudioBandState {
  bands: AudioBands;
  source: AudioSource;
  error: string | null;
  startMicrophone: () => Promise<void>;
  useSample: () => void;
}

export const EMPTY_AUDIO_BANDS: AudioBands = {
  subBass: 0,
  bass: 0,
  lowMid: 0,
  mid: 0,
  high: 0,
  activity: 0,
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export function sampleBands(time: number): AudioBands {
  const kick = Math.pow(Math.max(0, Math.sin(time * 2.15)), 10);
  const bassPulse = Math.sin(time * 3.4) * 0.5 + 0.5;
  const midPulse = Math.sin(time * 5.7 + 1.1) * 0.5 + 0.5;
  const highPulse = Math.sin(time * 12.8 + 0.4) * 0.5 + 0.5;
  const travellingWave = Math.sin(time * 1.35 + Math.sin(time * 0.35) * 1.8) * 0.5 + 0.5;
  const subBass = clamp01(0.22 + kick * 0.78 + travellingWave * 0.12);
  const bass = clamp01(0.22 + bassPulse * 0.42 + kick * 0.3);
  const lowMid = clamp01(0.2 + midPulse * 0.48 + travellingWave * 0.12);
  const mid = clamp01(0.18 + (Math.sin(time * 8.2) * 0.5 + 0.5) * 0.52);
  const high = clamp01(0.14 + highPulse * 0.62 + Math.pow(Math.max(0, Math.sin(time * 4.8 + 0.8)), 8) * 0.18);

  return {
    subBass,
    bass,
    lowMid,
    mid,
    high,
    activity: clamp01(subBass * 0.24 + bass * 0.2 + lowMid * 0.2 + mid * 0.2 + high * 0.16),
  };
}

export function bandsToWallReaction(bands: AudioBands, eventBoost = 0): WallReactionState {
  return {
    displacement: clamp01(bands.subBass * 0.72 + bands.bass * 0.48 + eventBoost * 0.24),
    colorShift: clamp01(bands.lowMid * 0.58 + bands.mid * 0.42),
    lineDensity: clamp01(bands.lowMid * 0.56 + bands.mid * 0.64 + eventBoost * 0.12),
    bloom: clamp01(bands.bass * 0.38 + bands.high * 0.32 + bands.activity * 0.62 + eventBoost * 0.32),
    particleEmission: clamp01(bands.high * 0.82 + bands.activity * 0.38),
    pulse: clamp01(bands.subBass * 0.62 + bands.bass * 0.38 + eventBoost * 0.3),
    propagation: clamp01(bands.activity * 0.72 + bands.lowMid * 0.38 + eventBoost * 0.22),
  };
}

function averageFrequencyBand(
  data: Uint8Array,
  sampleRate: number,
  fftSize: number,
  lowerHz: number,
  upperHz: number,
) {
  const binHz = sampleRate / fftSize;
  const start = Math.max(0, Math.floor(lowerHz / binHz));
  const end = Math.min(data.length - 1, Math.ceil(upperHz / binHz));
  if (end < start) return 0;

  let total = 0;
  for (let index = start; index <= end; index += 1) total += data[index];
  return clamp01((total / (end - start + 1) / 255) * 1.55);
}

function readMicrophoneBands(analyser: AnalyserNode, context: AudioContext, data: Uint8Array<ArrayBuffer>): AudioBands {
  analyser.getByteFrequencyData(data);
  const subBass = averageFrequencyBand(data, context.sampleRate, analyser.fftSize, 20, 70);
  const bass = averageFrequencyBand(data, context.sampleRate, analyser.fftSize, 70, 180);
  const lowMid = averageFrequencyBand(data, context.sampleRate, analyser.fftSize, 180, 420);
  const mid = averageFrequencyBand(data, context.sampleRate, analyser.fftSize, 420, 2000);
  const high = averageFrequencyBand(data, context.sampleRate, analyser.fftSize, 2000, 9000);

  return {
    subBass,
    bass,
    lowMid,
    mid,
    high,
    activity: clamp01(subBass * 0.22 + bass * 0.2 + lowMid * 0.2 + mid * 0.2 + high * 0.18),
  };
}

export function useAudioBands(): AudioBandState {
  const [bands, setBands] = useState<AudioBands>(EMPTY_AUDIO_BANDS);
  const [source, setSource] = useState<AudioSource>("SAMPLE");
  const [error, setError] = useState<string | null>(null);
  const sourceRef = useRef<AudioSource>("SAMPLE");
  const contextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const useSample = useCallback(() => {
    sourceNodeRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    analyserRef.current?.disconnect();
    sourceNodeRef.current = null;
    streamRef.current = null;
    analyserRef.current = null;
    sourceRef.current = "SAMPLE";
    setSource("SAMPLE");
    setError(null);
  }, []);

  const startMicrophone = useCallback(async () => {
    if (sourceRef.current === "MICROPHONE") return;
    if (!navigator.mediaDevices?.getUserMedia) {
      useSample();
      setError("当前浏览器不支持麦克风，已回退 SAMPLE。");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const AudioContextConstructor = window.AudioContext
        ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextConstructor) throw new Error("AudioContext unavailable");

      const context = contextRef.current ?? new AudioContextConstructor();
      await context.resume();
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.78;
      const sourceNode = context.createMediaStreamSource(stream);
      sourceNode.connect(analyser);
      contextRef.current = context;
      streamRef.current = stream;
      sourceNodeRef.current = sourceNode;
      analyserRef.current = analyser;
      sourceRef.current = "MICROPHONE";
      setSource("MICROPHONE");
      setError(null);
    } catch {
      useSample();
      setError("麦克风不可用，已自动回退 SAMPLE。");
    }
  }, [useSample]);

  useEffect(() => {
    let frame = 0;
    let lastEmit = 0;
    const microphoneData = new Uint8Array(new ArrayBuffer(512));
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (now - lastEmit < 33) return;
      lastEmit = now;
      const analyser = analyserRef.current;
      const context = contextRef.current;
      setBands(analyser && context ? readMicrophoneBands(analyser, context, microphoneData) : sampleBands(now / 1000));
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      sourceNodeRef.current?.disconnect();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      analyserRef.current?.disconnect();
      void contextRef.current?.close();
    };
  }, []);

  return { bands, source, error, startMicrophone, useSample };
}
