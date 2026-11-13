import { useRef, useState } from "react";
import { bandsToWallReaction, useAudioBands } from "./audio-bands";
import BuildingScene, { type ResonanceInput } from "./BuildingScene";
import { ROUTE_EVENTS } from "./spatial-data";
import "./resonance-probe.css";

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export default function FPSResonanceProbe() {
  const audio = useAudioBands();
  const [floor, setFloor] = useState(1);
  const [resonance, setResonance] = useState({ energy: 0, coverage: 0 });
  const visitedCellsRef = useRef(new Set<string>());
  const energyRef = useRef(0);

  const onResonanceInput = (input: ResonanceInput) => {
    if (input.floor !== 1) return;
    const cellX = Math.floor((input.position[0] + 12.75) / 1.25);
    const cellZ = Math.floor((input.position[2] + 5.2) / 1.25);
    if (input.moved) visitedCellsRef.current.add(`${cellX}:${cellZ}`);

    const movementGain = input.moved ? 0.018 : -0.003;
    const audioGain = audio.bands.activity * (input.moved ? 0.006 : 0.001);
    energyRef.current = clamp01(energyRef.current + movementGain + audioGain);
    setResonance({
      energy: energyRef.current,
      coverage: clamp01(visitedCellsRef.current.size / 26),
    });
  };

  const wallReaction = bandsToWallReaction(
    audio.bands,
    resonance.energy * 0.52 + resonance.coverage * 0.22,
  );
  const bloomed = resonance.energy > 0.7 && resonance.coverage > 0.62;

  return (
    <main className={`resonance-probe-shell ${bloomed ? "bloomed" : ""}`}>
      <header className="resonance-probe-topbar">
        <div>
          <span className="resonance-eyebrow">STAIR SOUND WALL / FPS PLAY PROBE 01</span>
          <h1>楼层乐器</h1>
        </div>
        <span className="resonance-floor-label">{floor}F · WALKING INSTRUMENT</span>
        <a href="/" className="resonance-back">返回空间</a>
      </header>

      <section className="resonance-probe-stage">
        <BuildingScene
          progress={0}
          currentEvent={ROUTE_EVENTS[0]}
          floorFocus={null}
          floorSpread={0}
          xray={0}
          ghostRoute={null}
          ghostIntensity={0}
          handOrbit={null}
          handZoom={null}
          cameraCommand="walk"
          commandVersion={0}
          wallReaction={wallReaction}
          walkFloor={floor}
          onWalkFloorChange={setFloor}
          resonanceMode
          resonanceEnergy={resonance.energy}
          resonanceCoverage={resonance.coverage}
          onResonanceInput={onResonanceInput}
          immersive
        />

        <div className="resonance-copy">
          <span className="resonance-eyebrow">ONE FLOOR / ONE INSTRUMENT</span>
          <h2>{bloomed ? "这一层已经开花" : "让这一层楼听见你"}</h2>
          <p>{bloomed ? "继续走，看看你留下的共振会不会改变形状。" : "不用找隐藏按钮。走路本身，就是你的演奏。"}</p>
          <div className="resonance-meters">
            <div>
              <span>花束成长</span>
              <i><b style={{ width: `${resonance.energy * 100}%` }} /></i>
              <em>{Math.round(resonance.energy * 100)}%</em>
            </div>
            <div>
              <span>走过的空间</span>
              <i><b style={{ width: `${resonance.coverage * 100}%` }} /></i>
              <em>{Math.round(resonance.coverage * 100)}%</em>
            </div>
          </div>
          <div className="resonance-controls">
            <span>点击画面后开始行走</span>
            <span>WASD 行走</span>
            <span>拖动鼠标转向</span>
            <span>Shift 改变强度</span>
            <span>R 重置本层</span>
          </div>
          <div className="resonance-audio">
            <span>{audio.source === "MICROPHONE" ? "MIC LIVE" : "SAMPLE SOUND"}</span>
            <button onClick={() => void audio.startMicrophone()}>
              {audio.source === "MICROPHONE" ? "声音正在参与" : "让我的声音参与"}
            </button>
          </div>
        </div>

        {bloomed && <div className="resonance-bloom-note">地板、立面墙和花束正在同一拍呼吸</div>}
      </section>
      <footer className="resonance-probe-footer"><span />这一段只测试：移动是否能让整层空间持续回应。</footer>
    </main>
  );
}
