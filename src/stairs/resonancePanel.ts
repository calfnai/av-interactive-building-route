import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { AudioBands, StairsVariant } from "./types.ts";

export interface ResonancePanelRuntime {
  group: THREE.Group;
  ready: Promise<boolean>;
}

interface PanelUniforms {
  low: { value: number };
  mid: { value: number };
  high: { value: number };
  routePulse: { value: number };
  time: { value: number };
  variant: { value: number };
}

function panelMaterial(uniforms: PanelUniforms) {
  return new THREE.ShaderMaterial({
    uniforms: uniforms as unknown as Record<string, THREE.IUniform<number>>,
    transparent: true,
    vertexShader: `
      uniform float low;
      uniform float mid;
      uniform float time;
      uniform float variant;
      varying vec3 vPosition;
      varying vec2 vUv;
      void main() {
        vPosition = position;
        vUv = uv;
        vec3 displaced = position;
        float channel = sin(position.z * 11.0 + time * 1.2) * mid * 0.012;
        displaced.y += channel + low * 0.018 * sin(position.x * 7.0 + time);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
      }
    `,
    fragmentShader: `
      uniform float low;
      uniform float mid;
      uniform float high;
      uniform float routePulse;
      uniform float time;
      uniform float variant;
      varying vec3 vPosition;
      varying vec2 vUv;
      void main() {
        float grain = 0.5 + 0.5 * sin(vPosition.x * 120.0 + vPosition.z * 71.0 + time * 3.0);
        float fissure = smoothstep(0.75, 0.95, abs(sin(vPosition.z * 13.0 + vPosition.x * 4.0)));
        vec3 base = vec3(0.055, 0.105, 0.11);
        vec3 lowColor = vec3(0.12, 0.48, 0.42) * low;
        vec3 midColor = vec3(0.46, 0.76, 0.27) * mid;
        vec3 highColor = vec3(0.95, 0.88, 0.34) * high;
        vec3 routeColor = vec3(0.32, 0.86, 0.78) * routePulse;
        vec3 color = base + lowColor + midColor + highColor + routeColor;
        color += grain * (0.015 + high * 0.08);
        color += fissure * (0.025 + mid * 0.13);
        float alpha = 0.9 + min(0.1, routePulse * 0.1);
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });
}

function decoratePanel(root: THREE.Object3D, uniforms: PanelUniforms) {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = panelMaterial(uniforms);
    mesh.userData.clickable = true;
    mesh.userData.sculptPart = "resonance-panel";
  });
}

function fallbackPanel(uniforms: PanelUniforms) {
  const group = new THREE.Group();
  group.name = "resonance-panel-fallback";
  const material = panelMaterial(uniforms);
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.1, 0.08), material);
  base.userData.clickable = true;
  base.userData.sculptPart = "resonance-panel";
  group.add(base);
  for (let index = 0; index < 9; index += 1) {
    const ratio = index / 8;
    const height = 1.25 + Math.abs(Math.cos(ratio * Math.PI)) * 0.52;
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.018, height, 0.012), material);
    rib.position.set(-0.28 + ratio * 0.56, 0.02 * Math.cos(ratio * Math.PI), -0.052);
    rib.userData.clickable = true;
    rib.userData.sculptPart = "resonance-channel";
    group.add(rib);
  }
  return group;
}

export function createResonancePanel(): ResonancePanelRuntime {
  const uniforms: PanelUniforms = {
    low: { value: 0 },
    mid: { value: 0 },
    high: { value: 0 },
    routePulse: { value: 0 },
    time: { value: 0 },
    variant: { value: 0 },
  };
  const group = new THREE.Group();
  group.name = "foxtail-resonance-panel";
  group.userData.clickable = true;
  const fallback = fallbackPanel(uniforms);
  group.add(fallback);

  const url = new URL("../assets/cad/resonance_panel.glb", import.meta.url).href;
  const ready = new Promise<boolean>((resolve) => {
    new GLTFLoader().load(
      url,
      (gltf) => {
        group.remove(fallback);
        fallback.traverse((object) => {
          const mesh = object as THREE.Mesh;
          mesh.geometry?.dispose?.();
        });
        const model = gltf.scene;
        model.scale.setScalar(0.001);
        model.name = "resonance-panel-step-derived-glb";
        decoratePanel(model, uniforms);
        group.add(model);
        group.userData.assetStatus = "loaded";
        resolve(true);
      },
      undefined,
      () => {
        group.userData.assetStatus = "fallback";
        resolve(false);
      },
    );
  });

  group.userData.panelUniforms = uniforms;
  return { group, ready };
}

export function updateResonancePanel(
  group: THREE.Group,
  timeSeconds: number,
  audio: AudioBands,
  variant: StairsVariant,
  routePulse: number,
) {
  const uniforms = group.userData.panelUniforms as PanelUniforms | undefined;
  if (!uniforms) return;
  uniforms.low.value = variant === "sound" ? audio.subBass * 0.72 + audio.bass * 0.28 : 0;
  uniforms.mid.value = variant === "sound" ? audio.lowMid * 0.45 + audio.mid * 0.55 : 0;
  uniforms.high.value = variant === "sound" ? audio.high : 0;
  uniforms.routePulse.value = variant === "flora" ? routePulse : Math.max(routePulse * 0.35, audio.activity * 0.12);
  uniforms.time.value = timeSeconds;
  uniforms.variant.value = variant === "sound" ? 1 : 0;
}
