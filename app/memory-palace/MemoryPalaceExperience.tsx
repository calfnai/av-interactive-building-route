"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import styles from "./memory-palace.module.css";
import { OrganismAudioEngine } from "./organism-audio";
import { createNoteEvent, makeSeed, makeSpecimenMeta, performanceFromNormalized, specimenFilename, type NoteEvent, type SpecimenMeta } from "./organism-model";

type Phase = "dormant" | "active" | "capturing" | "specimen";
type SceneApi = { capture: (meta: SpecimenMeta) => Promise<string>; setFrozen: (frozen: boolean) => void };

const MAX_CELLS = 54;
const MAX_TENDRILS = 48;
const MAX_SPORE_CLOUDS = 18;

function colorCss(color: number) { return `#${color.toString(16).padStart(6, "0")}`; }
function formatDuration(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

export default function MemoryPalaceExperience() {
  const hostRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const phaseRef = useRef<Phase>("dormant");
  const audioRef = useRef<OrganismAudioEngine | null>(null);
  const sceneApiRef = useRef<SceneApi | null>(null);
  const eventsRef = useRef<NoteEvent[]>([]);
  const activeEventRef = useRef<NoteEvent | null>(null);
  const startedAtRef = useRef(0);
  const specimenUrlRef = useRef<string | null>(null);
  const [seed, setSeed] = useState("DORMANT");
  const [phase, setPhase] = useState<Phase>("dormant");
  const [muted, setMuted] = useState(false);
  const [pulseCount, setPulseCount] = useState(0);
  const [specimenUrl, setSpecimenUrl] = useState<string | null>(null);
  const [specimenMeta, setSpecimenMeta] = useState<SpecimenMeta | null>(null);

  const setExperiencePhase = (next: Phase) => { phaseRef.current = next; setPhase(next); };
  const awaken = async () => {
    const audio = new OrganismAudioEngine();
    audioRef.current = audio;
    await audio.start();
    setSeed(makeSeed());
    startedAtRef.current = performance.now();
    setExperiencePhase("active");
  };
  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    audioRef.current?.setMuted(next);
  };
  const captureSpecimen = async () => {
    if (phaseRef.current !== "active" || pulseCount < 6 || !sceneApiRef.current) return;
    setExperiencePhase("capturing");
    const meta = makeSpecimenMeta(seed, startedAtRef.current, performance.now(), pulseCount);
    setSpecimenMeta(meta);
    sceneApiRef.current.setFrozen(true);
    try {
      const url = await sceneApiRef.current.capture(meta);
      if (specimenUrlRef.current) URL.revokeObjectURL(specimenUrlRef.current);
      specimenUrlRef.current = url;
      setSpecimenUrl(url);
      setExperiencePhase("specimen");
    } catch {
      sceneApiRef.current.setFrozen(false);
      setExperiencePhase("active");
    }
  };
  const continueGrowing = () => {
    if (specimenUrlRef.current) URL.revokeObjectURL(specimenUrlRef.current);
    specimenUrlRef.current = null;
    setSpecimenUrl(null);
    sceneApiRef.current?.setFrozen(false);
    setExperiencePhase("active");
  };

  useEffect(() => () => {
    audioRef.current?.dispose();
    if (specimenUrlRef.current) URL.revokeObjectURL(specimenUrlRef.current);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020207);
    scene.fog = new THREE.FogExp2(0x05030b, 0.052);
    const camera = new THREE.PerspectiveCamera(48, host.clientWidth / host.clientHeight, 0.1, 80);
    camera.position.set(0, 0.7, 9.2);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.domElement.setAttribute("aria-label", "有机声音生命体演奏空间");
    host.appendChild(renderer.domElement);
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(host.clientWidth, host.clientHeight), 0.58, 0.68, 0.82));

    scene.add(new THREE.HemisphereLight(0xb4a9ff, 0x100811, 0.72));
    const coreLight = new THREE.PointLight(0xa798ff, 34, 18, 1.8);
    scene.add(coreLight);
    const warmLight = new THREE.PointLight(0xff8b6c, 18, 14, 2);
    warmLight.position.set(-3.5, 1.5, 3);
    scene.add(warmLight);

    const organismUniforms = { uTime: { value: 0 }, uEnergy: { value: 0.08 }, uAwake: { value: 0 } };
    const organismMaterial = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: organismUniforms,
      vertexShader: `
        uniform float uTime; uniform float uEnergy; uniform float uAwake;
        varying vec3 vNormalView; varying float vPulse;
        void main() {
          vec3 direction = normalize(position);
          float folds = sin(position.x * 3.7 + uTime * .72) * sin(position.y * 4.1 - uTime * .48);
          folds += sin(position.z * 5.3 + uTime * .34) * .55;
          float breath = sin(uTime * 1.18) * .055 + folds * (.07 + uEnergy * .16);
          vec3 displaced = position + direction * breath * (0.35 + uAwake);
          displaced.x += sin(position.y * 2.2 + uTime * .31) * (.035 + uEnergy * .085);
          displaced.y += sin(position.z * 2.8 - uTime * .27) * (.025 + uEnergy * .06);
          vPulse = folds * .5 + .5; vNormalView = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
        }`,
      fragmentShader: `
        uniform float uEnergy; uniform float uAwake;
        varying vec3 vNormalView; varying float vPulse;
        void main() {
          float fresnel = pow(1.0 - abs(dot(vNormalView, vec3(0.0, 0.0, 1.0))), 2.15);
          vec3 sleeping = vec3(.11, .09, .2); vec3 violet = vec3(.39, .32, .91); vec3 coral = vec3(.96, .34, .31);
          vec3 color = mix(violet, coral, clamp(uEnergy * .48 + vPulse * .22, 0.0, 1.0));
          color = mix(sleeping, color, .16 + uAwake * .84);
          gl_FragColor = vec4(color * (.18 + fresnel * 1.08 + uEnergy * .16), .2 + fresnel * .42 + uAwake * .04);
        }`,
    });
    const organism = new THREE.Mesh(new THREE.IcosahedronGeometry(2.02, 5), organismMaterial);
    organism.scale.set(0.96, 1.24, 0.82);
    scene.add(organism);
    const innerCore = new THREE.Mesh(new THREE.IcosahedronGeometry(0.82, 3), new THREE.MeshBasicMaterial({ color: 0x7067ff, transparent: true, opacity: 0.24, blending: THREE.AdditiveBlending }));
    scene.add(innerCore);

    const dustCount = 420;
    const dustPositions = new Float32Array(dustCount * 3);
    for (let index = 0; index < dustCount; index += 1) {
      const radius = 3.2 + Math.random() * 7;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      dustPositions[index * 3] = Math.sin(phi) * Math.cos(theta) * radius;
      dustPositions[index * 3 + 1] = Math.cos(phi) * radius * 0.7;
      dustPositions[index * 3 + 2] = Math.sin(phi) * Math.sin(theta) * radius;
    }
    const dustGeometry = new THREE.BufferGeometry();
    dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
    const dust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({ color: 0x9288cc, size: 0.018, transparent: true, opacity: 0.34 }));
    scene.add(dust);

    const cells: THREE.Mesh[] = [];
    const tendrils: THREE.Mesh[] = [];
    const sporeClouds: THREE.Points[] = [];
    const sharedCellGeometry = new THREE.SphereGeometry(0.11, 12, 12);
    let lastGrowthPoint = new THREE.Vector3(0, -1.8, 0.2);
    let orbitAngle = 0, cameraDistance = 9.2, energy = 0.08, lastTrailAt = 0, frozen = false;
    const pointForPerformance = (event: NoteEvent) => {
      const theta = (event.normalizedX - 0.5) * Math.PI * 1.55 + orbitAngle * 0.32;
      const phi = (event.normalizedY - 0.5) * Math.PI * 0.82;
      const radius = 2.02 + event.intensity * 0.18;
      return new THREE.Vector3(Math.sin(theta) * Math.cos(phi) * radius, -Math.sin(phi) * radius * 1.13, Math.cos(theta) * Math.cos(phi) * radius * 0.92);
    };
    const removeOldest = <T extends THREE.Object3D>(items: T[], maximum: number) => {
      while (items.length > maximum) {
        const object = items.shift()!;
        scene.remove(object);
        const mesh = object as THREE.Mesh;
        if (mesh.geometry !== sharedCellGeometry) mesh.geometry?.dispose();
        if (Array.isArray(mesh.material)) mesh.material.forEach((entry) => entry.dispose()); else mesh.material?.dispose();
      }
    };
    const addSpores = (point: THREE.Vector3, color: number, intensity: number) => {
      const count = 18, positions = new Float32Array(count * 3), velocities = new Float32Array(count * 3);
      for (let index = 0; index < count; index += 1) {
        positions[index * 3] = point.x; positions[index * 3 + 1] = point.y; positions[index * 3 + 2] = point.z;
        velocities[index * 3] = (Math.random() - 0.5) * 0.018; velocities[index * 3 + 1] = (Math.random() - 0.2) * 0.022; velocities[index * 3 + 2] = (Math.random() - 0.5) * 0.018;
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const cloud = new THREE.Points(geometry, new THREE.PointsMaterial({ color, size: 0.035 + intensity * 0.035, transparent: true, opacity: 0.76, blending: THREE.AdditiveBlending, depthWrite: false }));
      cloud.userData.velocities = velocities; cloud.userData.age = 0;
      scene.add(cloud); sporeClouds.push(cloud); removeOldest(sporeClouds, MAX_SPORE_CLOUDS);
    };
    const growAt = (event: NoteEvent, makeCell: boolean) => {
      const point = pointForPerformance(event), color = new THREE.Color(event.color);
      if (makeCell) {
        const cell = new THREE.Mesh(sharedCellGeometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.88, blending: THREE.AdditiveBlending }));
        cell.position.copy(point); cell.userData.baseScale = 0.65 + event.intensity * 1.35; cell.scale.setScalar(cell.userData.baseScale); cell.userData.birth = performance.now();
        scene.add(cell); cells.push(cell); removeOldest(cells, MAX_CELLS); addSpores(point, event.color, event.intensity);
      }
      const bend = new THREE.Vector3().crossVectors(lastGrowthPoint, point).normalize().multiplyScalar(0.24 + event.wet * 0.5);
      const middleA = lastGrowthPoint.clone().lerp(point, 0.34).multiplyScalar(1.1).add(bend);
      const middleB = lastGrowthPoint.clone().lerp(point, 0.68).multiplyScalar(1.15).sub(bend.clone().multiplyScalar(0.55));
      middleA.y += (event.normalizedY - 0.5) * 0.5;
      const curve = new THREE.CatmullRomCurve3([lastGrowthPoint.clone(), middleA, middleB, point.clone()]);
      const tendril = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.026 + event.intensity * 0.024, 6, false), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
      scene.add(tendril); tendrils.push(tendril); removeOldest(tendrils, MAX_TENDRILS);
      lastGrowthPoint = point; energy = Math.min(1.6, energy + (makeCell ? 0.12 : 0.025));
    };
    const coordinates = (event: PointerEvent) => {
      const bounds = renderer.domElement.getBoundingClientRect();
      return { x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)), y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)), bounds };
    };
    const onPointerMove = (event: PointerEvent) => {
      const { x, y, bounds } = coordinates(event);
      if (cursorRef.current) {
        cursorRef.current.style.opacity = phaseRef.current === "active" ? "1" : "0";
        cursorRef.current.style.transform = `translate3d(${event.clientX - bounds.left}px, ${event.clientY - bounds.top}px, 0)`;
        cursorRef.current.style.setProperty("--note-color", colorCss(performanceFromNormalized(x, y).color));
      }
      const active = activeEventRef.current;
      if (!active || phaseRef.current !== "active") return;
      Object.assign(active, performanceFromNormalized(x, y)); active.duration = performance.now() - active.startedAt;
      audioRef.current?.updateGesture(active.id, active);
      if (performance.now() - lastTrailAt > 82) { growAt(active, false); lastTrailAt = performance.now(); }
    };
    const finishGesture = (event?: PointerEvent) => {
      const active = activeEventRef.current;
      if (!active) return;
      active.duration = performance.now() - active.startedAt;
      audioRef.current?.endGesture(active.id, Math.min(2.2, 0.7 + active.wet * 1.6));
      activeEventRef.current = null;
      if (event && renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (phaseRef.current !== "active") return;
      const { x, y } = coordinates(event), startedAt = performance.now();
      const note = createNoteEvent(performanceFromNormalized(x, y), startedAt, 0.68 + Math.min(0.3, event.pressure || 0), `pulse-${eventsRef.current.length + 1}-${Math.round(startedAt)}`);
      eventsRef.current.push(note); activeEventRef.current = note; renderer.domElement.setPointerCapture(event.pointerId);
      audioRef.current?.beginGesture(note.id, note, note.intensity); growAt(note, true); lastTrailAt = performance.now(); setPulseCount(eventsRef.current.length);
    };
    const onPointerLeave = () => { if (cursorRef.current) cursorRef.current.style.opacity = "0"; };
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup", finishGesture);
    renderer.domElement.addEventListener("pointercancel", finishGesture);
    renderer.domElement.addEventListener("pointerleave", onPointerLeave);

    const keys = new Set<string>();
    const onKeyDown = (event: KeyboardEvent) => { if (["a", "d", "w", "s", "arrowleft", "arrowright", "arrowup", "arrowdown"].includes(event.key.toLowerCase())) event.preventDefault(); keys.add(event.key.toLowerCase()); };
    const onKeyUp = (event: KeyboardEvent) => keys.delete(event.key.toLowerCase());
    const onVisibility = () => audioRef.current?.setFocused(!document.hidden);
    window.addEventListener("keydown", onKeyDown); window.addEventListener("keyup", onKeyUp); document.addEventListener("visibilitychange", onVisibility);

    const drawSpecimen = async (meta: SpecimenMeta) => {
      const displayWidth = host.clientWidth, displayHeight = host.clientHeight, displayAspect = camera.aspect, displayPixelRatio = renderer.getPixelRatio();
      renderer.setPixelRatio(1); renderer.setSize(2048, 2048, false); composer.setSize(2048, 2048); camera.aspect = 1; camera.updateProjectionMatrix(); composer.render();
      const imageUrl = renderer.domElement.toDataURL("image/png");
      renderer.setPixelRatio(displayPixelRatio); renderer.setSize(displayWidth, displayHeight, false); composer.setSize(displayWidth, displayHeight); camera.aspect = displayAspect; camera.updateProjectionMatrix();
      const source = new Image(); source.src = imageUrl; await source.decode();
      const canvas = document.createElement("canvas"); canvas.width = 2048; canvas.height = 2048;
      const context = canvas.getContext("2d")!; context.drawImage(source, 0, 0, 2048, 2048);
      const gradient = context.createLinearGradient(0, 1360, 0, 2048); gradient.addColorStop(0, "rgba(2,2,7,0)"); gradient.addColorStop(1, "rgba(2,2,7,.92)");
      context.fillStyle = gradient; context.fillRect(0, 1300, 2048, 748); context.fillStyle = "rgba(239,235,230,.9)"; context.font = "500 34px ui-monospace, monospace"; context.fillText("MEMORY SPECIMEN", 116, 1804);
      context.font = "400 26px ui-monospace, monospace"; context.fillStyle = "rgba(239,235,230,.58)"; context.fillText(`SEED ${meta.seed}   LIFE ${formatDuration(meta.durationSeconds)}   PULSES ${meta.pulseCount}`, 116, 1860);
      context.fillText(new Date(meta.generatedAt).toLocaleString("zh-CN", { hour12: false }), 116, 1910);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("PNG creation failed")), "image/png"));
      return URL.createObjectURL(blob);
    };
    sceneApiRef.current = { capture: drawSpecimen, setFrozen(value) { frozen = value; } };

    let animationFrame = 0, previousTime = performance.now(), elapsed = 0;
    const animate = () => {
      animationFrame = requestAnimationFrame(animate);
      const now = performance.now(), delta = Math.min(0.04, (now - previousTime) / 1000); previousTime = now;
      if (!frozen) elapsed += delta;
      const awake = phaseRef.current === "dormant" ? 0.14 : 1;
      if (!frozen) {
        if (keys.has("a") || keys.has("arrowleft")) orbitAngle -= delta * 0.62;
        if (keys.has("d") || keys.has("arrowright")) orbitAngle += delta * 0.62;
        if (keys.has("w") || keys.has("arrowup")) cameraDistance -= delta * 2.6;
        if (keys.has("s") || keys.has("arrowdown")) cameraDistance += delta * 2.6;
        cameraDistance = THREE.MathUtils.clamp(cameraDistance, 5.6, 12.5);
        energy += (0.06 + eventsRef.current.length * 0.004 - energy) * delta * 0.22;
      }
      organismUniforms.uTime.value = elapsed; organismUniforms.uEnergy.value = energy; organismUniforms.uAwake.value += (awake - organismUniforms.uAwake.value) * 0.035;
      organism.rotation.y = elapsed * 0.055; organism.rotation.z = Math.sin(elapsed * 0.13) * 0.08;
      innerCore.rotation.set(elapsed * 0.08, -elapsed * 0.11, elapsed * 0.05); innerCore.scale.setScalar(0.92 + Math.sin(elapsed * 1.18) * 0.09 + Math.min(0.4, energy * 0.1));
      coreLight.intensity = 16 + awake * 22 + Math.sin(elapsed * 1.18) * 4 + energy * 8; dust.rotation.y = elapsed * 0.008; dust.rotation.x = Math.sin(elapsed * 0.05) * 0.08;
      camera.position.set(Math.sin(orbitAngle) * cameraDistance, 0.7 + Math.sin(elapsed * 0.17) * 0.22, Math.cos(orbitAngle) * cameraDistance); camera.lookAt(0, 0, 0);
      for (const cell of cells) {
        const age = (now - cell.userData.birth) / 1000, pulse = 1 + Math.sin(age * 2.6) * 0.1;
        cell.scale.setScalar(cell.userData.baseScale * pulse);
        (cell.material as THREE.MeshBasicMaterial).opacity = Math.max(0.24, 0.88 - age * 0.018);
      }
      for (const cloud of sporeClouds) {
        const position = cloud.geometry.getAttribute("position") as THREE.BufferAttribute, velocities = cloud.userData.velocities as Float32Array;
        for (let index = 0; index < position.count; index += 1) position.setXYZ(index, position.getX(index) + velocities[index * 3], position.getY(index) + velocities[index * 3 + 1], position.getZ(index) + velocities[index * 3 + 2]);
        position.needsUpdate = true; cloud.userData.age += delta; (cloud.material as THREE.PointsMaterial).opacity = Math.max(0.08, 0.76 - cloud.userData.age * 0.035);
      }
      composer.render();
    };
    animate();
    const resize = () => { if (frozen) return; camera.aspect = host.clientWidth / host.clientHeight; camera.updateProjectionMatrix(); renderer.setSize(host.clientWidth, host.clientHeight); composer.setSize(host.clientWidth, host.clientHeight); };
    const observer = new ResizeObserver(resize); observer.observe(host);
    return () => {
      cancelAnimationFrame(animationFrame); observer.disconnect();
      renderer.domElement.removeEventListener("pointermove", onPointerMove); renderer.domElement.removeEventListener("pointerdown", onPointerDown); renderer.domElement.removeEventListener("pointerup", finishGesture); renderer.domElement.removeEventListener("pointercancel", finishGesture); renderer.domElement.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); document.removeEventListener("visibilitychange", onVisibility);
      composer.dispose(); renderer.dispose(); renderer.domElement.remove();
      scene.traverse((object) => { const mesh = object as THREE.Mesh; if (mesh.geometry && mesh.geometry !== sharedCellGeometry) mesh.geometry.dispose(); if (Array.isArray(mesh.material)) mesh.material.forEach((material) => material.dispose()); else mesh.material?.dispose?.(); });
      sharedCellGeometry.dispose(); sceneApiRef.current = null;
    };
  }, []);

  return <main className={styles.shell} data-phase={phase}>
    <div ref={hostRef} className={styles.scene} />
    <div ref={cursorRef} className={styles.soundCursor} aria-hidden="true"><i /></div>
    <header className={styles.header}>
      <Link href="/" aria-label="返回楼栋">← 返回</Link>
      {phase !== "dormant" && <div className={styles.actions}>
        <button type="button" onClick={toggleMute}>{muted ? "恢复声音" : "静音"}</button>
        <button type="button" className={styles.captureButton} onClick={captureSpecimen} disabled={pulseCount < 6 || phase !== "active"}>{phase === "capturing" ? "凝固中…" : pulseCount < 6 ? `标本 ${pulseCount}/6` : "采集标本"}</button>
      </div>}
    </header>
    {phase === "active" && <div className={styles.guide}><span>按住并拖动，培育声音</span><span>A D 环绕 · W S 靠近</span></div>}
    {phase === "dormant" && <section className={styles.intro}><p>ORGANISM / {seed}</p><h1>它还没有听见你</h1><button type="button" onClick={awaken}>唤醒它</button><small>声音将在你的触碰之后开始</small></section>}
    {phase === "capturing" && <div className={styles.capturing}><span />正在凝固这一刻</div>}
    {phase === "specimen" && specimenUrl && specimenMeta && <section className={styles.specimen} aria-label="记忆标本预览">
      <div className={styles.specimenImage}>
        {/* eslint-disable-next-line @next/next/no-img-element -- This preview is a local Blob URL generated by the player. */}
        <img src={specimenUrl} alt={`种子 ${specimenMeta.seed} 的记忆标本`} />
      </div>
      <div className={styles.specimenInfo}><p>MEMORY SPECIMEN / {specimenMeta.seed}</p><h2>它记住了<br />你的这一段声音</h2><dl><div><dt>生命时长</dt><dd>{formatDuration(specimenMeta.durationSeconds)}</dd></div><div><dt>脉冲</dt><dd>{specimenMeta.pulseCount}</dd></div></dl><div className={styles.specimenActions}><a href={specimenUrl} download={specimenFilename(new Date(specimenMeta.generatedAt))}>下载 PNG</a><button type="button" onClick={continueGrowing}>继续培育</button></div></div>
    </section>}
    <div className={styles.mobileNotice}>请在桌面浏览器中唤醒这个生命体</div>
  </main>;
}
