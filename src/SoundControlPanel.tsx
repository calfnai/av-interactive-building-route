import type { AudioBandState, AudioBands } from "./audio-bands";

interface SoundControlPanelProps extends AudioBandState {}

const bandRows: Array<{ key: keyof Omit<AudioBands, "activity">; label: string }> = [
  { key: "subBass", label: "SUB BASS" },
  { key: "bass", label: "BASS" },
  { key: "lowMid", label: "LOW MID" },
  { key: "mid", label: "MID" },
  { key: "high", label: "HIGH" },
];

export default function SoundControlPanel({ bands, source, error, startMicrophone, useSample }: SoundControlPanelProps) {
  return (
    <section className="sound-panel" aria-label="声音墙控制">
      <div className="sound-heading">
        <div>
          <span className="eyebrow">RANGE MAPPING / LOCAL</span>
          <h2>声音共振墙</h2>
        </div>
        <span className={`sound-source ${source === "SAMPLE" ? "sample" : "mic"}`}>{source}</span>
      </div>
      <div className="sound-actions">
        <button className={source === "SAMPLE" ? "active" : ""} onClick={useSample}>SAMPLE</button>
        <button className={source === "MICROPHONE" ? "active" : ""} onClick={() => void startMicrophone()}>启用麦克风</button>
      </div>
      <div className="band-meter-list">
        {bandRows.map(({ key, label }) => {
          const value = bands[key];
          return (
            <div className="band-meter" key={key}>
              <span>{label}</span>
              <div className="band-track"><i style={{ width: `${Math.round(value * 100)}%` }} /></div>
              <b>{Math.round(value * 100)}</b>
            </div>
          );
        })}
      </div>
      <div className="sound-activity"><span>ACTIVITY</span><b>{Math.round(bands.activity * 100)}%</b></div>
      {error && <p className="sound-error" role="status">{error}</p>}
    </section>
  );
}
