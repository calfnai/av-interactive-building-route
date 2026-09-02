import type { PerformancePoint } from "./organism-model";

type ActiveVoice = {
  oscillators: OscillatorNode[];
  gain: GainNode;
  filter: BiquadFilterNode;
  panner: StereoPannerNode;
};

export class OrganismAudioEngine {
  private context: AudioContext | null = null;
  private input: GainNode | null = null;
  private output: GainNode | null = null;
  private delay: DelayNode | null = null;
  private feedback: GainNode | null = null;
  private wetGain: GainNode | null = null;
  private droneGain: GainNode | null = null;
  private droneOscillators: OscillatorNode[] = [];
  private voices = new Map<string, ActiveVoice>();
  private muted = false;
  private focused = true;

  async start() {
    if (this.context) {
      await this.context.resume();
      return;
    }
    const context = new AudioContext();
    const input = context.createGain();
    const compressor = context.createDynamicsCompressor();
    const output = context.createGain();
    const delay = context.createDelay(2.5);
    const feedback = context.createGain();
    const wetGain = context.createGain();
    const droneGain = context.createGain();

    compressor.threshold.value = -20;
    compressor.knee.value = 18;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.012;
    compressor.release.value = 0.32;
    output.gain.value = 0.72;
    delay.delayTime.value = 0.46;
    feedback.gain.value = 0.34;
    wetGain.gain.value = 0.3;
    droneGain.gain.value = 0.0001;

    input.connect(compressor);
    input.connect(delay);
    delay.connect(feedback).connect(delay);
    delay.connect(wetGain).connect(compressor);
    droneGain.connect(input);
    compressor.connect(output).connect(context.destination);

    for (const [frequency, type, level] of [[73.42, "sine", 0.055], [110, "triangle", 0.022]] as const) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      gain.gain.value = level;
      oscillator.connect(gain).connect(droneGain);
      oscillator.start();
      this.droneOscillators.push(oscillator);
    }
    droneGain.gain.exponentialRampToValueAtTime(0.8, context.currentTime + 2.4);

    this.context = context;
    this.input = input;
    this.output = output;
    this.delay = delay;
    this.feedback = feedback;
    this.wetGain = wetGain;
    this.droneGain = droneGain;
    await context.resume();
  }

  beginGesture(id: string, point: PerformancePoint, intensity: number) {
    if (!this.context || !this.input) return;
    if (this.voices.size >= 8) {
      const oldest = this.voices.keys().next().value;
      if (oldest) this.endGesture(oldest, 0.08);
    }
    const now = this.context.currentTime;
    const gain = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    const panner = this.context.createStereoPanner();
    filter.type = "lowpass";
    filter.Q.value = 1.8;
    filter.frequency.value = 720 + point.brightness * 4400;
    panner.pan.value = point.normalizedX * 1.6 - 0.8;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.075 + intensity * 0.085, now + 0.055);
    gain.connect(filter).connect(panner).connect(this.input);

    const oscillators = [
      { ratio: 1, type: "sine" as OscillatorType, level: 0.7 },
      { ratio: 2.002, type: "triangle" as OscillatorType, level: 0.16 },
    ].map(({ ratio, type, level }) => {
      const oscillator = this.context!.createOscillator();
      const voiceGain = this.context!.createGain();
      oscillator.type = type;
      oscillator.frequency.value = point.frequency * ratio;
      voiceGain.gain.value = level;
      oscillator.connect(voiceGain).connect(gain);
      oscillator.start(now);
      return oscillator;
    });
    this.wetGain?.gain.setTargetAtTime(point.wet * 0.48, now, 0.08);
    this.voices.set(id, { oscillators, gain, filter, panner });
  }

  updateGesture(id: string, point: PerformancePoint) {
    if (!this.context) return;
    const voice = this.voices.get(id);
    if (!voice) return;
    const now = this.context.currentTime;
    voice.oscillators[0].frequency.setTargetAtTime(point.frequency, now, 0.045);
    voice.oscillators[1].frequency.setTargetAtTime(point.frequency * 2.002, now, 0.045);
    voice.filter.frequency.setTargetAtTime(720 + point.brightness * 4400, now, 0.06);
    voice.panner.pan.setTargetAtTime(point.normalizedX * 1.6 - 0.8, now, 0.04);
    this.wetGain?.gain.setTargetAtTime(point.wet * 0.48, now, 0.1);
  }

  endGesture(id: string, release = 1.15) {
    if (!this.context) return;
    const voice = this.voices.get(id);
    if (!voice) return;
    this.voices.delete(id);
    const now = this.context.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(Math.max(voice.gain.gain.value, 0.0001), now);
    voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + release);
    for (const oscillator of voice.oscillators) oscillator.stop(now + release + 0.08);
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.applyOutputLevel();
  }

  setFocused(focused: boolean) {
    this.focused = focused;
    this.applyOutputLevel();
  }

  private applyOutputLevel() {
    if (!this.context || !this.output) return;
    const target = this.muted ? 0.0001 : this.focused ? 0.72 : 0.08;
    this.output.gain.cancelScheduledValues(this.context.currentTime);
    this.output.gain.setTargetAtTime(target, this.context.currentTime, 0.08);
  }

  dispose() {
    for (const id of [...this.voices.keys()]) this.endGesture(id, 0.02);
    for (const oscillator of this.droneOscillators) oscillator.stop();
    this.droneOscillators = [];
    void this.context?.close();
    this.context = null;
  }
}
