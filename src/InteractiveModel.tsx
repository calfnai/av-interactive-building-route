"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import BuildingScene, { type CameraCommand } from "./BuildingScene";
import HandControlPanel from "./HandControlPanel";
import { clamp01, gestureCommandFor } from "./hand-control";
import { BLOCKED_EVENTS, CHAPTERS, GHOST_ROUTES, ROUTE_EVENTS } from "./spatial-data";
import { useHandController } from "./useHandController";

const statusLabel = {
  move: "行进",
  wait: "等待",
  blocked: "阻隔",
  wrong: "误入 / 折返",
  access: "通行事件",
  finish: "终点",
};

export default function InteractiveModel() {
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [floorFocus, setFloorFocus] = useState<number | null>(null);
  const [cameraCommand, setCameraCommand] = useState<CameraCommand>("overview");
  const [commandVersion, setCommandVersion] = useState(0);
  const [panelOpen, setPanelOpen] = useState(true);
  const [handPanelCollapsed, setHandPanelCollapsed] = useState(false);
  const [lastHandCommand, setLastHandCommand] = useState("");
  const handController = useHandController();
  const pinchAnchorRef = useRef({ active: false, x: 0.5, progress: 0 });
  const gestureLatchRef = useRef({ gesture: "None", at: 0 });

  const eventIndex = Math.min(ROUTE_EVENTS.length - 1, Math.round(progress * (ROUTE_EVENTS.length - 1)));
  const currentEvent = ROUTE_EVENTS[eventIndex];
  const activeChapter = currentEvent.chapter;
  const primaryHand = handController.frame.hands[handController.frame.primaryHand];
  const handActive = handController.frame.status === "connected" && primaryHand.tracked;
  const gestureFloor = handActive && primaryHand.openness > 0.52
    ? Math.max(1, Math.min(10, Math.round((1 - primaryHand.y) * 9) + 1))
    : null;
  const effectiveFloorFocus = gestureFloor ?? floorFocus;
  const xray = handActive ? clamp01((primaryHand.openness - 0.38) / 0.54) : 0;
  const floorSpread = handController.frame.status === "connected"
    ? clamp01((handController.frame.spread - 0.18) / 0.72)
    : 0;
  const ghostRoute = GHOST_ROUTES[currentEvent.id] ?? null;
  const ghostIntensity = ghostRoute ? xray : 0;
  const cameraHandActive = handActive
    && !handController.frame.pinchActive
    && primaryHand.openness < 0.5
    && primaryHand.gesture === "None";
  const handOrbit = cameraHandActive ? primaryHand.x : null;
  const handZoom = cameraHandActive ? primaryHand.depth : null;

  useEffect(() => {
    const anchor = pinchAnchorRef.current;
    if (!handActive || !handController.frame.pinchActive) {
      anchor.active = false;
      return;
    }
    if (!anchor.active) {
      anchor.active = true;
      anchor.x = primaryHand.x;
      anchor.progress = progress;
      setPlaying(false);
      return;
    }
    setProgress(clamp01(anchor.progress + (primaryHand.x - anchor.x) * 1.45));
  }, [handActive, handController.frame.pinchActive, primaryHand.x, progress]);

  useEffect(() => {
    if (!handActive) {
      gestureLatchRef.current.gesture = "None";
      return;
    }
    const gesture = primaryHand.gesture;
    const latch = gestureLatchRef.current;
    if (gesture === "None" || gesture === "Open_Palm") {
      latch.gesture = gesture;
      return;
    }
    const now = performance.now();
    if (gesture === latch.gesture || now - latch.at < 850) return;
    latch.gesture = gesture;
    latch.at = now;
    const command = gestureCommandFor(gesture);
    if (command === "play") {
      if (progress >= 1) setProgress(0);
      setPlaying(true);
      setLastHandCommand("👍 开始 / 继续播放");
    } else if (command === "pause") {
      setPlaying(false);
      setLastHandCommand("✊ 暂停播放");
    } else if (command === "beginning") {
      setProgress(0);
      setPlaying(false);
      setLastHandCommand("☝ 回到路线开头");
    } else if (command === "ending") {
      setProgress(1);
      setPlaying(false);
      setLastHandCommand("✌ 跳到路线结尾");
    }
  }, [handActive, primaryHand.gesture, progress]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      const delta = now - previous;
      previous = now;
      setProgress((value) => {
        const next = value + (delta / 1000) * (0.014 * speed);
        if (next >= 1) {
          setPlaying(false);
          return 1;
        }
        return next;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed]);

  const chapterStart = useMemo(() => {
    const starts = new Map<number, number>();
    ROUTE_EVENTS.forEach((item, index) => {
      if (!starts.has(item.chapter)) starts.set(item.chapter, index / (ROUTE_EVENTS.length - 1));
    });
    return starts;
  }, []);

  const jumpToEvent = (index: number) => {
    setProgress(index / (ROUTE_EVENTS.length - 1));
    setPlaying(false);
    setCameraCommand("route");
    setCommandVersion((value) => value + 1);
  };

  const setCamera = (command: CameraCommand) => {
    setCameraCommand(command);
    setCommandVersion((value) => value + 1);
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <span className="eyebrow">AV / INTERACTIVE SPATIAL STUDY 01</span>
          <h1>楼栋路径复刻器</h1>
        </div>
        <div className="top-metrics" aria-label="模型统计">
          <span><b>02</b> 单元</span>
          <span><b>10</b> 楼层</span>
          <span><b>{ROUTE_EVENTS.length}</b> 轨迹事件</span>
          <span><b>{BLOCKED_EVENTS.length}</b> 硬阻隔</span>
        </div>
        <button className="panel-toggle" onClick={() => setPanelOpen((value) => !value)} aria-expanded={panelOpen}>
          {panelOpen ? "收起路径" : "展开路径"}
        </button>
      </header>

      <section className={`viewport ${handPanelCollapsed ? "" : "hand-control-open"}`}>
        <BuildingScene
          progress={progress}
          currentEvent={currentEvent}
          floorFocus={effectiveFloorFocus}
          floorSpread={floorSpread}
          xray={xray}
          ghostRoute={ghostRoute}
          ghostIntensity={ghostIntensity}
          handOrbit={handOrbit}
          handZoom={handZoom}
          cameraCommand={cameraCommand}
          commandVersion={commandVersion}
        />

        <HandControlPanel
          frame={handController.frame}
          videoRef={handController.videoRef}
          overlayRef={handController.overlayRef}
          startBrowser={handController.startBrowser}
          connectDesktop={handController.connectDesktop}
          stop={handController.stop}
          collapsed={handPanelCollapsed}
          lastCommand={lastHandCommand}
          onToggle={() => setHandPanelCollapsed((value) => !value)}
        />

        <div className="scene-tools" aria-label="三维视角控制">
          <button className={cameraCommand === "overview" ? "active" : ""} onClick={() => setCamera("overview")}>全楼</button>
          <button className={cameraCommand === "route" ? "active" : ""} onClick={() => setCamera("route")}>跟随</button>
          <button className={cameraCommand === "chase" ? "active" : ""} onClick={() => setCamera("chase")}>身后</button>
          <button className={cameraCommand === "top" ? "active" : ""} onClick={() => setCamera("top")}>俯视</button>
          <select
            value={floorFocus ?? "all"}
            onChange={(event) => setFloorFocus(event.target.value === "all" ? null : Number(event.target.value))}
            aria-label="楼层切片"
          >
            <option value="all">全部楼层</option>
            {Array.from({ length: 10 }, (_, index) => 10 - index).map((floor) => (
              <option key={floor} value={floor}>{floor}F 切片</option>
            ))}
          </select>
        </div>

        <div className={`route-panel ${panelOpen ? "open" : "closed"}`}>
          <div className="panel-heading">
            <div>
              <span className="eyebrow">STRICT ROUTE SEQUENCE</span>
              <h2>完整行进记录</h2>
            </div>
            <span className="step-count">{String(eventIndex + 1).padStart(2, "0")} / {ROUTE_EVENTS.length}</span>
          </div>
          <div className="chapters">
            {CHAPTERS.map((chapter, index) => {
              const chapterNumber = index + 1;
              return (
                <button
                  key={chapter}
                  className={activeChapter === chapterNumber ? "active" : ""}
                  onClick={() => jumpToEvent(Math.round((chapterStart.get(chapterNumber) ?? 0) * (ROUTE_EVENTS.length - 1)))}
                >
                  <span>{String(chapterNumber).padStart(2, "0")}</span>
                  <p>{chapter}</p>
                </button>
              );
            })}
          </div>
          <div className="event-list" aria-label="全部轨迹事件">
            {ROUTE_EVENTS.map((item, index) => (
              <button key={item.id} className={`event-row ${index === eventIndex ? "active" : ""} ${item.status}`} onClick={() => jumpToEvent(index)}>
                <span className="event-index">{String(index + 1).padStart(2, "0")}</span>
                <span className="event-copy">
                  <b>{item.title}</b>
                  <small>{item.detail}</small>
                </span>
                <span className="event-floor">U{item.unit} · {item.floor}F</span>
              </button>
            ))}
          </div>
        </div>

        <article className={`event-card ${currentEvent.status}`}>
          <div className="event-meta">
            <span>阶段 {currentEvent.chapter}</span>
            <span className="status-pill">{statusLabel[currentEvent.status]}</span>
            <span>{currentEvent.unit} 单元 · {currentEvent.floor}F</span>
          </div>
          <h3>{currentEvent.title}</h3>
          <p>{currentEvent.detail}</p>
        </article>

        <div className="legend" aria-label="空间图例">
          <span><i className="unit-one" />1 单元</span>
          <span><i className="unit-two" />2 单元</span>
          <span><i className="route" />已走轨迹</span>
          <span><i className="locked" />上锁 / 不可通行</span>
          <span><i className="interior" />室内同层</span>
        </div>
      </section>

      <footer className="transport">
        <button className="play-button" onClick={() => {
          if (progress >= 1) setProgress(0);
          setPlaying((value) => !value);
        }} aria-label={playing ? "暂停轨迹" : "播放轨迹"}>
          {playing ? "Ⅱ" : "▶"}
        </button>
        <span className="timecode">{String(eventIndex + 1).padStart(2, "0")}<i>/</i>{ROUTE_EVENTS.length}</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.001"
          value={progress}
          onChange={(event) => {
            setProgress(Number(event.target.value));
            setPlaying(false);
          }}
          aria-label="轨迹时间轴"
          style={{ "--progress": `${progress * 100}%` } as React.CSSProperties}
        />
        <div className="speed-control" aria-label="播放速度">
          {[0.5, 1, 2].map((value) => (
            <button key={value} className={speed === value ? "active" : ""} onClick={() => setSpeed(value)}>{value}×</button>
          ))}
        </div>
        <div className="constraint-note"><span />锁闭条件已强制启用</div>
      </footer>
    </main>
  );
}
