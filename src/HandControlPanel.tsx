import type { HandControlFrame } from "./hand-control";
import type { HandControllerApi } from "./useHandController";

interface HandControlPanelProps extends Pick<HandControllerApi, "videoRef" | "overlayRef" | "startBrowser" | "connectDesktop" | "stop"> {
  frame: HandControlFrame;
  collapsed: boolean;
  lastCommand: string;
  onToggle: () => void;
}

const percent = (value: number) => `${Math.round(value * 100)}%`;

export default function HandControlPanel({
  frame,
  videoRef,
  overlayRef,
  startBrowser,
  connectDesktop,
  stop,
  collapsed,
  lastCommand,
  onToggle,
}: HandControlPanelProps) {
  const primary = frame.hands[frame.primaryHand];
  return (
    <aside className={`hand-panel ${collapsed ? "collapsed" : ""}`}>
      <button className="hand-panel-toggle" onClick={onToggle} aria-expanded={!collapsed}>
        <span className={`connection-dot ${frame.status}`} />
        {collapsed ? "手势" : "收起"}
      </button>
      {!collapsed && (
        <>
          <div className="hand-preview">
            <video ref={videoRef} playsInline muted />
            <canvas ref={overlayRef} />
            {frame.source !== "browser" && <div className="preview-placeholder">HAND INPUT</div>}
            <span>{frame.fps ? `${frame.fps.toFixed(0)} FPS` : frame.source.toUpperCase()}</span>
          </div>
          <div className="hand-panel-copy">
            <span className="eyebrow">CROSS-PLATFORM HAND INPUT</span>
            <h2>双手楼梯沙盘</h2>
            <p>{frame.message}</p>
          </div>
          <div className="hand-actions">
            <button className={frame.source === "browser" ? "active" : ""} onClick={() => void startBrowser()}>启用本机摄像头</button>
            <button className={frame.source === "desktop" ? "active" : ""} onClick={connectDesktop}>连接桌面控制器</button>
            {frame.source !== "off" && <button className="quiet" onClick={stop}>关闭</button>}
          </div>
          <div className="gesture-values">
            <span><b>主手</b>{primary.tracked ? frame.primaryHand.toUpperCase() : "—"}</span>
            <span><b>手势</b>{primary.tracked ? primary.gesture.replaceAll("_", " ") : "—"}</span>
            <span><b>捏合</b>{percent(primary.pinch)}</span>
            <span><b>张开</b>{percent(primary.openness)}</span>
            <span><b>双手距</b>{percent(frame.spread)}</span>
            <span><b>距离</b>{percent(primary.depth)}</span>
          </div>
          <div className={`gesture-command ${lastCommand ? "active" : ""}`}>
            <span>LAST COMMAND</span>
            <b>{lastCommand || "等待手势命令"}</b>
          </div>
          <div className="gesture-guide">
            <span><i className="pinch-icon" />捏住后左右移动：拖动路线</span>
            <span><i className="palm-icon" />张开手掌上下移动：楼层剖切</span>
            <span><i className="spread-icon" />双手拉开：拆开楼层</span>
            <span><i className="ghost-icon" />阻隔点张开手：显示幽灵路线</span>
            <span><i className="orbit-icon" />放松手左右/前后：旋转与缩放</span>
            <span><i className="play-icon" />👍 播放 · ✊ 暂停</span>
            <span><i className="jump-icon" />☝ 回到开头 · ✌ 跳到结尾</span>
          </div>
        </>
      )}
    </aside>
  );
}
