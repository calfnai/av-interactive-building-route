import type { AudioBands } from "./types.ts";

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export function sampleAudioBands(timeSeconds: number): AudioBands {
  const pulse = (frequency: number, phase = 0) => (Math.sin(timeSeconds * frequency + phase) + 1) / 2;
  const beat = Math.pow(pulse(0.92, 0.2), 4);
  const subBass = clamp01(0.14 + pulse(0.92, 0.2) * 0.34 + beat * 0.34);
  const bass = clamp01(0.12 + pulse(1.7, 0.7) * 0.32 + pulse(0.92, 0.2) * 0.3);
  const lowMid = clamp01(0.1 + pulse(2.2, 1.1) * 0.32 + pulse(0.58, 1.6) * 0.16);
  const mid = clamp01(0.08 + pulse(3.7, 2.2) * 0.42 + pulse(1.05, 0.4) * 0.12);
  const high = clamp01(0.06 + pulse(6.8, 0.7) * 0.36 + Math.pow(pulse(4.9, 2.1), 5) * 0.32);
  return {
    subBass,
    bass,
    lowMid,
    mid,
    high,
    activity: clamp01((subBass * 1.15 + bass + lowMid + mid + high) / 2.9),
  };
}

function averageRange(values: Uint8Array, start: number, end: number): number {
  if (values.length === 0) return 0;
  const safeStart = Math.max(0, Math.min(values.length - 1, start));
  const safeEnd = Math.max(safeStart + 1, Math.min(values.length, end));
  let total = 0;
  for (let index = safeStart; index < safeEnd; index += 1) total += values[index];
  return total / (safeEnd - safeStart) / 255;
}

export function bandsFromFrequencyData(values: Uint8Array, sampleRate = 48000): AudioBands {
  const nyquist = sampleRate / 2;
  const binFor = (frequency: number) => Math.round((frequency / nyquist) * values.length);
  const band = (low: number, high: number) => averageRange(values, binFor(low), binFor(high) + 1);
  const subBass = band(20, 60);
  const bass = band(60, 180);
  const lowMid = band(180, 420);
  const mid = band(420, 1600);
  const high = band(1600, 8000);
  return {
    subBass,
    bass,
    lowMid,
    mid,
    high,
    activity: clamp01((subBass * 1.15 + bass + lowMid + mid + high) / 2.9),
  };
}

type AudioMode = "SAMPLE" | "MICROPHONE";

interface SampleVoice {
  oscillator: OscillatorNode;
  gain: GainNode;
}

export interface AudioController {
  readonly mode: AudioMode;
  readonly error: string;
  startSample(): Promise<boolean>;
  startMicrophone(): Promise<boolean>;
  stop(): void;
  read(timeSeconds: number): AudioBands;
}

function createSampleVoice(
  context: AudioContext,
  destination: AudioNode,
  type: OscillatorType,
  frequency: number,
  gainValue: number,
): SampleVoice {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gain.gain.value = gainValue;
  oscillator.connect(gain).connect(destination);
  oscillator.start();
  return { oscillator, gain };
}

export function createAudioController(): AudioController {
  let context: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let data: Uint8Array<ArrayBuffer> | null = null;
  let inputStream: MediaStream | null = null;
  let sampleMaster: GainNode | null = null;
  let sampleVoices: SampleVoice[] = [];
  let mode: AudioMode = "SAMPLE";
  let error = "";

  const closeContext = () => {
    inputStream?.getTracks().forEach((track) => track.stop());
    inputStream = null;
    sampleVoices.forEach(({ oscillator }) => {
      try {
        oscillator.stop();
      } catch {
        // Oscillators may already be stopped during browser teardown.
      }
      oscillator.disconnect();
    });
    sampleVoices = [];
    sampleMaster?.disconnect();
    sampleMaster = null;
    void context?.close();
    context = null;
    analyser = null;
    data = null;
  };

  const startSample = async () => {
    error = "";
    if (context && mode === "SAMPLE") {
      if (context.state === "suspended") await context.resume();
      return true;
    }
    closeContext();
    try {
      context = new AudioContext();
      if (context.state === "suspended") await context.resume();
      sampleMaster = context.createGain();
      sampleMaster.gain.value = 0.22;
      analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.68;
      data = new Uint8Array(analyser.frequencyBinCount);
      sampleMaster.connect(analyser).connect(context.destination);
      sampleVoices = [
        createSampleVoice(context, sampleMaster, "sine", 54.5, 0.16),
        createSampleVoice(context, sampleMaster, "triangle", 109, 0.035),
        createSampleVoice(context, sampleMaster, "sine", 218, 0.018),
        createSampleVoice(context, sampleMaster, "triangle", 436, 0.008),
        createSampleVoice(context, sampleMaster, "sine", 873, 0.003),
      ];
      mode = "SAMPLE";
      return true;
    } catch (caught) {
      error = caught instanceof Error ? `SAMPLE 音频不可用：${caught.message}` : "SAMPLE 音频不可用。";
      closeContext();
      mode = "SAMPLE";
      return false;
    }
  };

  return {
    get mode() {
      return mode;
    },
    get error() {
      return error;
    },
    startSample,
    async startMicrophone() {
      if (!navigator.mediaDevices?.getUserMedia) {
        const fallbackError = "当前浏览器不支持本机麦克风，已回退 SAMPLE。";
        await startSample();
        error = fallbackError;
        return false;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        closeContext();
        inputStream = stream;
        context = new AudioContext();
        if (context.state === "suspended") await context.resume();
        analyser = context.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.74;
        data = new Uint8Array(analyser.frequencyBinCount);
        context.createMediaStreamSource(stream).connect(analyser);
        mode = "MICROPHONE";
        error = "";
        return true;
      } catch (caught) {
        const fallbackError = caught instanceof Error ? `麦克风不可用，已回退 SAMPLE：${caught.message}` : "麦克风不可用，已回退 SAMPLE。";
        await startSample();
        error = fallbackError;
        return false;
      }
    },
    stop() {
      closeContext();
      mode = "SAMPLE";
    },
    read(timeSeconds) {
      if (mode === "SAMPLE") {
        const bands = sampleAudioBands(timeSeconds);
        if (context && sampleMaster) {
          const now = context.currentTime;
          const targets = [
            bands.subBass * 0.18,
            bands.bass * 0.045,
            bands.lowMid * 0.024,
            bands.mid * 0.012,
            bands.high * 0.006,
          ];
          sampleVoices.forEach((voice, index) => voice.gain.gain.setTargetAtTime(targets[index], now, 0.035));
        }
        return bands;
      }
      if (analyser && data && context) {
        analyser.getByteFrequencyData(data);
        return bandsFromFrequencyData(data, context.sampleRate);
      }
      return sampleAudioBands(timeSeconds);
    },
  };
}
