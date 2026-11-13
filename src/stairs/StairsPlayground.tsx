import { useEffect, useState } from "react";
import { createAudioController, sampleAudioBands, type AudioController } from "./audioBands.ts";
import { FLORA_PACK_MANIFEST } from "./floraPack.ts";
import WalkScene from "./WalkScene.tsx";
import type { AudioBands, AudioInputMode, FlowerNode, StairsVariant } from "./types.ts";

const modeCopy: Record<StairsVariant, { title: string; kicker: string; detail: string; hint: string }> = {
  flora: {
    title: "彩色花梯",
    kicker: "STAIRS / FLORA",
    detail: "沿着一组不稳定的彩色楼梯走近花束。每一个平台都有自己的颜色和呼吸，狐尾百合会在高处等你。",
    hint: "寻找下一束发光的花",
  },
  sound: {
    title: "声流楼梯",
    kicker: "STAIRS / SOUND",
    detail: "声音不是背景，而是一股穿过楼梯的流体。低频让花茎倾斜，中频打开花序，高频把空间打成光点。",
    hint: "让声音改变你看到的空间",
  },
};

const initialVariant = (): StairsVariant => {
  if (typeof window === "undefined") return "flora";
  return new URLSearchParams(window.location.search).get("mode") === "sound" ? "sound" : "flora";
};

export default function StairsPlayground() {
  const [variant, setVariant] = useState<StairsVariant>(initialVariant);
  const [audioBands, setAudioBands] = useState<AudioBands>(() => sampleAudioBands(0));
  const [audioMode, setAudioMode] = useState<AudioInputMode>("SAMPLE");
  const [audioError, setAudioError] = useState("");
  const [started, setStarted] = useState(false);
  const [startingAudio, setStartingAudio] = useState(false);
  const [resetNonce, setResetNonce] = useState(0);
  const [selectedNode, setSelectedNode] = useState<FlowerNode | null>(null);
  const [audioController] = useState<AudioController>(() => createAudioController());
  const info = modeCopy[variant];

  useEffect(() => {
    let frame = 0;
    let lastUpdate = 0;
    const tick = (now: number) => {
      if (now - lastUpdate > 42) {
        lastUpdate = now;
        setAudioBands(audioController.read(now / 1000));
        if (audioController.error) setAudioError(audioController.error);
        setAudioMode(audioController.mode);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [audioController]);

  useEffect(() => () => audioController.stop(), [audioController]);

  const startSample = async () => {
    setStartingAudio(true);
    const startedSample = await audioController.startSample();
    setAudioMode("SAMPLE");
    setAudioError(startedSample ? "" : audioController.error);
    setStarted(true);
    setStartingAudio(false);
  };

  const startMicrophone = async () => {
    setStartingAudio(true);
    const startedMicrophone = await audioController.startMicrophone();
    setAudioMode(startedMicrophone ? "MICROPHONE" : "SAMPLE");
    setAudioError(audioController.error);
    setStarted(true);
    setStartingAudio(false);
  };

  const switchVariant = (next: StairsVariant) => {
    setVariant(next);
    setSelectedNode(null);
    setResetNonce((value) => value + 1);
    window.history.replaceState({}, "", `${window.location.pathname}?mode=${next}`);
  };

  const resetScene = () => {
    setSelectedNode(null);
    setResetNonce((value) => value + 1);
  };

  return (
    <main className={`stairs-app variant-${variant}`}>
      <header className="stairs-topbar">
        <div className="stairs-brand">
          <span className="stairs-eyebrow">{info.kicker}</span>
          <h1>{info.title}</h1>
        </div>
        <nav className="stairs-switcher" aria-label="切换空间版本">
          <button className={variant === "flora" ? "active" : ""} onClick={() => switchVariant("flora")}>彩色花梯</button>
          <button className={variant === "sound" ? "active" : ""} onClick={() => switchVariant("sound")}>声流楼梯</button>
        </nav>
        <div className="stairs-topbar-status" aria-label="音频状态">
          <span className={`status-orb ${audioMode.toLowerCase()}`} />
          <span>{audioMode === "MICROPHONE" ? "MIC LIVE" : "SAMPLE READY"}</span>
        </div>
      </header>

      <section className="stairs-viewport">
        <WalkScene variant={variant} audioBands={audioBands} resetNonce={resetNonce} onFocusNode={setSelectedNode} />

        <aside className="stairs-card stairs-info-card">
          <span className="stairs-eyebrow">{info.hint}</span>
          <p>{info.detail}</p>
          <div className="stairs-controls-copy">
            <span><kbd>W A S D</kbd> 行走</span>
            <span><kbd>鼠标</kbd> 观看</span>
            <span><kbd>ESC</kbd> 释放鼠标</span>
          </div>
        </aside>

        <aside className="stairs-card stairs-audio-card">
          <div className="stairs-card-heading">
            <span className="stairs-eyebrow">音频入口</span>
            <span className="audio-state">{audioMode}</span>
          </div>
          <div className="audio-buttons">
            <button className={audioMode === "SAMPLE" ? "active" : ""} onClick={() => void startSample()}>SAMPLE</button>
            <button className={audioMode === "MICROPHONE" ? "active" : ""} onClick={() => void startMicrophone()}>本机麦克风</button>
          </div>
          <div className="audio-pulse" aria-label="音频正在驱动花束">
            <span style={{ transform: `scaleY(${0.28 + audioBands.subBass * 0.72})` }} />
            <span style={{ transform: `scaleY(${0.28 + audioBands.mid * 0.72})` }} />
            <span style={{ transform: `scaleY(${0.28 + audioBands.high * 0.72})` }} />
          </div>
          <p className="audio-note">SAMPLE 会实时合成声音；麦克风失败时自动回到 SAMPLE。</p>
          {audioError && <p className="audio-error">{audioError}</p>}
        </aside>

        {selectedNode && (
          <div className="stairs-node-toast" role="status">
            <span className="stairs-eyebrow">你发现了</span>
            <strong>{selectedNode.title}</strong>
            <small>靠近它，听花束继续变化</small>
          </div>
        )}

        {!started && (
          <div className="stairs-welcome">
            <div className="stairs-welcome-mark">✦</div>
            <span className="stairs-eyebrow">A WALK THROUGH SOUND AND FLOWERS</span>
            <h2>先让空间发出声音</h2>
            <p>戴上耳机，点击开始。然后用键盘走进楼梯，让花束对声音做出反应。</p>
            <div className="welcome-actions">
              <button className="primary-control" onClick={() => void startSample()} disabled={startingAudio}>
                {startingAudio ? "正在启动…" : "开始 SAMPLE 体验"}
              </button>
              <button onClick={() => void startMicrophone()} disabled={startingAudio}>直接使用麦克风</button>
            </div>
            <small>资源包 {FLORA_PACK_MANIFEST.version} · 狐尾百合为可拆解程序化花束</small>
          </div>
        )}

        <div className="stairs-bottom-hint">点击画面锁定鼠标 · 点击近处花束查看 · R 重置位置</div>
        <button className="stairs-reset-button" onClick={resetScene} aria-label="重置位置">重新开始</button>
      </section>
    </main>
  );
}
