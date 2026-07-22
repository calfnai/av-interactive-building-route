import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type {
  GestureRecognizer,
  GestureRecognizerResult,
  NormalizedLandmark,
} from "@mediapipe/tasks-vision";
import {
  clamp01,
  EMPTY_HAND,
  EMPTY_HAND_FRAME,
  smoothHand,
  type ControlHand,
  type HandControlFrame,
  type HandName,
} from "./hand-control";

const CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

const distance = (a: NormalizedLandmark, b: NormalizedLandmark) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

function interpretHand(points: NormalizedLandmark[], confidence: number, gesture: string): ControlHand {
  const palmIndexes = [0, 5, 9, 13, 17];
  const palmX = palmIndexes.reduce((sum, index) => sum + points[index].x, 0) / palmIndexes.length;
  const palmY = palmIndexes.reduce((sum, index) => sum + points[index].y, 0) / palmIndexes.length;
  const palmWidth = Math.max(0.025, distance(points[5], points[17]));
  const pinchDistance = distance(points[4], points[8]);
  const extension = [4, 8, 12, 16, 20]
    .reduce((sum, index) => sum + distance(points[0], points[index]), 0) / 5 / palmWidth;
  return {
    tracked: true,
    confidence,
    x: clamp01(1 - palmX),
    y: clamp01(palmY),
    depth: clamp01((palmWidth - 0.055) / 0.2),
    pinch: clamp01(1 - pinchDistance / (palmWidth * 0.78)),
    openness: clamp01((extension - 1.15) / 1.55),
    gesture,
    landmarks: points.map((point) => ({ x: 1 - point.x, y: point.y, z: point.z })),
  };
}

function drawHands(canvas: HTMLCanvasElement, result: GestureRecognizerResult) {
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  result.landmarks.forEach((points, handIndex) => {
    const label = result.handedness[handIndex]?.[0]?.categoryName.toLowerCase();
    const color = label === "left" ? "#60d5c8" : "#eafa61";
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = 3;
    for (const [from, to] of CONNECTIONS) {
      context.beginPath();
      context.moveTo((1 - points[from].x) * canvas.width, points[from].y * canvas.height);
      context.lineTo((1 - points[to].x) * canvas.width, points[to].y * canvas.height);
      context.stroke();
    }
    for (const point of points) {
      context.beginPath();
      context.arc((1 - point.x) * canvas.width, point.y * canvas.height, 3.2, 0, Math.PI * 2);
      context.fill();
    }
  });
}

function desktopFrame(payload: Record<string, unknown>, previous: HandControlFrame): HandControlFrame {
  const sourceHands = (payload.hands ?? {}) as Record<string, Partial<ControlHand>>;
  const readHand = (name: HandName): ControlHand => {
    const source = sourceHands[name] ?? {};
    if (!source.tracked) return { ...EMPTY_HAND };
    return {
      tracked: true,
      confidence: Number(source.confidence ?? 0),
      x: Number(source.x ?? 0.5),
      y: Number(source.y ?? 0.5),
      depth: Number(source.depth ?? 0),
      pinch: Number(source.pinch ?? 0),
      openness: Number(source.openness ?? 0),
      gesture: typeof source.gesture === "string"
        ? source.gesture
        : Number(source.openness ?? 0) < 0.2
          ? "Closed_Fist"
          : "None",
      landmarks: source.landmarks ?? [],
    };
  };
  const left = smoothHand(previous.hands.left, readHand("left"));
  const right = smoothHand(previous.hands.right, readHand("right"));
  const primaryHand = payload.primary_hand === "left" ? "left" : "right";
  const primary = primaryHand === "left" ? left : right;
  return {
    source: "desktop",
    status: "connected",
    message: "桌面 Camera Controller 已连接",
    hands: { left, right },
    primaryHand,
    spread: Number(payload.spread ?? 0),
    pinchActive: primary.pinch >= (previous.pinchActive ? 0.55 : 0.72),
    fps: Number(payload.fps ?? 0),
  };
}

export interface HandControllerApi {
  frame: HandControlFrame;
  videoRef: RefObject<HTMLVideoElement | null>;
  overlayRef: RefObject<HTMLCanvasElement | null>;
  startBrowser: () => Promise<void>;
  connectDesktop: () => void;
  stop: () => void;
}

export function useHandController(): HandControllerApi {
  const [frame, setFrame] = useState<HandControlFrame>(EMPTY_HAND_FRAME);
  const frameRef = useRef(frame);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const recognizerRef = useRef<GestureRecognizer | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const requestRef = useRef(0);
  const socketRef = useRef<WebSocket | null>(null);
  const fpsRef = useRef({ started: performance.now(), frames: 0, value: 0 });

  const update = useCallback((next: HandControlFrame) => {
    frameRef.current = next;
    setFrame(next);
  }, []);

  const stop = useCallback(() => {
    cancelAnimationFrame(requestRef.current);
    requestRef.current = 0;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    socketRef.current?.close();
    socketRef.current = null;
    const context = overlayRef.current?.getContext("2d");
    if (context && overlayRef.current) context.clearRect(0, 0, overlayRef.current.width, overlayRef.current.height);
    update(EMPTY_HAND_FRAME);
  }, [update]);

  const startBrowser = useCallback(async () => {
    stop();
    update({ ...EMPTY_HAND_FRAME, source: "browser", status: "loading", message: "正在加载本地手势模型…" });
    try {
      const wasmPath = new URL("mediapipe/wasm/", document.baseURI).toString();
      const modelPath = new URL("models/gesture_recognizer.task", document.baseURI).toString();
      const { FilesetResolver, GestureRecognizer } = await import("@mediapipe/tasks-vision");
      const vision = await FilesetResolver.forVisionTasks(wasmPath);
      if (!recognizerRef.current) {
        const options = {
          runningMode: "VIDEO" as const,
          numHands: 2,
          minHandDetectionConfidence: 0.6,
          minHandPresenceConfidence: 0.6,
          minTrackingConfidence: 0.6,
        };
        try {
          recognizerRef.current = await GestureRecognizer.createFromOptions(vision, {
            ...options,
            baseOptions: { modelAssetPath: modelPath, delegate: "GPU" },
          });
        } catch {
          recognizerRef.current = await GestureRecognizer.createFromOptions(vision, {
            ...options,
            baseOptions: { modelAssetPath: modelPath, delegate: "CPU" },
          });
        }
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error("摄像头预览尚未准备好");
      video.srcObject = stream;
      await video.play();
      fpsRef.current = { started: performance.now(), frames: 0, value: 0 };

      const process = () => {
        const recognizer = recognizerRef.current;
        const canvas = overlayRef.current;
        if (!recognizer || !canvas || !video.videoWidth || !streamRef.current) return;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const now = performance.now();
        const result = recognizer.recognizeForVideo(video, now);
        drawHands(canvas, result);
        const raw: Record<HandName, ControlHand> = { left: { ...EMPTY_HAND }, right: { ...EMPTY_HAND } };
        result.landmarks.forEach((points, index) => {
          const category = result.handedness[index]?.[0];
          const name = category?.categoryName.toLowerCase() === "left" ? "left" : "right";
          const gesture = result.gestures[index]?.[0]?.categoryName ?? "None";
          raw[name] = interpretHand(points, category?.score ?? 0, gesture);
        });
        const previous = frameRef.current;
        const left = smoothHand(previous.hands.left, raw.left);
        const right = smoothHand(previous.hands.right, raw.right);
        const primaryHand: HandName = right.tracked || !left.tracked ? "right" : "left";
        const primary = primaryHand === "right" ? right : left;
        const palms = [left, right].filter((hand) => hand.tracked);
        const spread = palms.length === 2
          ? clamp01(Math.hypot(left.x - right.x, left.y - right.y) / 0.75)
          : 0;
        const fpsCounter = fpsRef.current;
        fpsCounter.frames += 1;
        if (now - fpsCounter.started >= 500) {
          fpsCounter.value = fpsCounter.frames * 1000 / (now - fpsCounter.started);
          fpsCounter.frames = 0;
          fpsCounter.started = now;
        }
        update({
          source: "browser",
          status: "connected",
          message: palms.length ? `${palms.length} 只手正在控制` : "摄像头已开启，请把手放进画面",
          hands: { left, right },
          primaryHand,
          spread,
          pinchActive: primary.pinch >= (previous.pinchActive ? 0.55 : 0.72),
          fps: fpsCounter.value,
        });
        requestRef.current = requestAnimationFrame(process);
      };
      requestRef.current = requestAnimationFrame(process);
    } catch (error) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      update({
        ...EMPTY_HAND_FRAME,
        source: "browser",
        status: "error",
        message: error instanceof Error ? error.message : "无法启动摄像头",
      });
    }
  }, [stop, update]);

  const connectDesktop = useCallback(() => {
    stop();
    update({ ...EMPTY_HAND_FRAME, source: "desktop", status: "loading", message: "正在连接 ws://127.0.0.1:8765…" });
    const socket = new WebSocket("ws://127.0.0.1:8765/?monitor=1");
    socketRef.current = socket;
    socket.onopen = () => update({ ...frameRef.current, source: "desktop", status: "waiting", message: "已连接，等待手部数据" });
    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(String(event.data)) as Record<string, unknown>;
        if (payload.protocol === "camera-controller/v1") update(desktopFrame(payload, frameRef.current));
      } catch {
        update({ ...frameRef.current, status: "error", message: "桌面控制器发送了无法解析的数据" });
      }
    };
    socket.onerror = () => update({ ...frameRef.current, status: "error", message: "未找到桌面控制器；可以改用浏览器摄像头" });
    socket.onclose = () => {
      if (socketRef.current === socket) update({ ...EMPTY_HAND_FRAME, source: "desktop", status: "error", message: "桌面控制器连接已断开" });
    };
  }, [stop, update]);

  useEffect(() => () => {
    cancelAnimationFrame(requestRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    socketRef.current?.close();
    recognizerRef.current?.close();
  }, []);

  return { frame, videoRef, overlayRef, startBrowser, connectDesktop, stop };
}
