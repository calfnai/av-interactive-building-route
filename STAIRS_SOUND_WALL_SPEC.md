# 楼梯声音改造 · RangeEcho 墙面版

## 目标

把楼梯变成一个由声音驱动的空间仪器：

- 用户点击画面锁定鼠标，使用 WASD 以 FPS 方式行走，鼠标移动转头，Esc 释放鼠标。
- 用户观看楼梯、墙面和花朵的声音反应。
- 低频改变墙面的大尺度呼吸和结构亮度。
- 中频驱动纵向纹理、裂缝和墙面传播。
- 高频产生细碎闪烁、花粉和表面噪声。
- 不做浇水、养成、照料或新的 seed 系统。

## Git 分支

基于：

`codex/hand-stairs-playground`

新分支：

`codex/stairs-sound-wall`

## 项目边界

RangeEcho 只导出频段映射、场景命名和视觉参数，不直接连接 RangeEcho 运行时。

DailyFlora 只导出花材资源包和参数。

img2threejs 只负责狐尾百合程序化 Three.js 工厂。

text-to-cad 只负责墙面共振板 STEP 和网页 GLB。

不修改 DailyFlora、RangeEcho 或生产部署。

## 声音输入

声音版内置：

- `SAMPLE`：无需麦克风即可体验。
- 本机麦克风/BlackHole：用于现场声音。

统一输出：

```ts
interface AudioBands {
  subBass: number;
  bass: number;
  lowMid: number;
  mid: number;
  high: number;
  activity: number;
}
```

声音输入失败时必须回退到 `SAMPLE`，不允许停留在无反应的空状态。

Web Audio `AnalyserNode` 可持续读取频域数据；Three.js `ShaderMaterial` 的 uniforms 适合逐帧驱动墙面反应。

## 墙面共振板

text-to-cad 生成：

- 900 × 2100 × 80 mm 参数化墙面板。
- 边框、纵向浮雕、狭缝和安装定位点。
- 狐尾百合穗形转译为墙面结构。
- STEP 为唯一主 CAD 文件。
- GLB 为网页派生文件。

网页中：

```ts
interface WallReactionState {
  displacement: number;
  colorShift: number;
  lineDensity: number;
  bloom: number;
  particleEmission: number;
}
```

映射规则：

- `subBass`/`bass`：墙面整体呼吸、亮度和轻微位移。
- `lowMid`/`mid`：纵向纹理、浮雕线和裂缝传播。
- `high`：细碎亮点、花粉、闪烁。
- `activity`：整体可见度和事件触发强度。

几何保持静态，声音只改变 shader、材质和粒子状态。

## 狐尾百合

使用和第一版本相同的本地参考图：

`dailyFlora/docs/untitled folder/有整体，有局部细节/狐尾百合✨_4_Césped_来自小红书网页版.jpg`

裁出左侧高穗，经过 img2threejs 分阶段质量流程生成：

- `stem`
- `spike`
- `florets`
- `leaves`
- audio response anchors

声音版中：

- 低频让茎秆慢速摆动。
- 中频让花序开合。
- 高频让花粉点和花瓣边缘闪烁。
- 狐尾百合固定出现在墙面共振板或楼梯转折平台附近。
- 不生成用户照料、成长或持久化状态。

## 第一人称体验

新增 `walk` 摄像机模式：

- 默认不自动播放路线。
- 点击 3D 画面后进入 Pointer Lock；`W/A/S/D` 持续控制人物移动，鼠标移动直接控制第一人称视角，`Shift` 加速，Esc 释放鼠标。
- 人物的 Y 坐标固定在当前楼层，不能通过自由移动穿过楼板。
- 走到楼梯口后按 `W` / `S` 才能触发上下楼过渡；楼梯锁定时不能穿过。
- 走到电梯门前按 `E` 开门，按 `W` 进入轿厢；仅在轿厢内用数字键 `1`–`9`、`0` 选层，再按 `E` 关门运行。
- 电梯到达后自动开门，必须用 `W/A/S/D` 走出轿厢，才能恢复该楼层的自由行走。
- 原有 `ROUTE_EVENTS` 继续作为空间路线和楼层约束参考，不再强制摄像机自动前进。
- 每一层拥有独立的色相、纹理密度、波纹节奏和粒子性格。
- 到达阻隔事件或通过楼梯 / 电梯切换楼层时，当前楼层墙面反应增强。
- 保留全楼、跟随、身后、俯视调试视角。
- 不增加自由飞行；移动保持在楼层体验边界内。

## 资源接口

RangeEcho 导出本地映射包：

```ts
interface RangeEchoMappingManifest {
  version: 1;
  sourceProject: "rangeecho";
  sourceRevision: string;
  bands: {
    subBass: string;
    bass: string;
    lowMid: string;
    mid: string;
    high: string;
  };
  scenes: Array<{
    id: string;
    hue: number;
    warp: number;
    feedback: number;
  }>;
}
```

## 验收

- `SAMPLE` 启动后墙面持续有可辨认反应。
- 麦克风/BlackHole 可切换。
- 麦克风失败自动回退 `SAMPLE`。
- 点击画面后可用 FPS 方式行走和转向，默认不自动播放路线；未锁定鼠标时不接受移动输入。
- 人物不能用自由移动、数字键或 UI 选择器跳层；楼层变化只能发生在楼梯过渡或电梯运行完成后。
- 楼梯口按键会产生可见的逐层过渡；上锁楼梯不会穿越。
- 电梯必须经过开门、进入、选层、运行、到站开门、WASD 出轿厢的完整流程。
- 1F–10F 均有可辨认且不同的 AV reaction。
- 低、中、高频产生不同视觉结果。
- 墙面不会因为音频变形而穿透楼层或破坏路线。
- 狐尾百合可加载、可定位、可动画。
- STEP 通过 CAD 几何检查和 snapshot。
- GLB 可加载并贴合墙面。
- 浏览器无错误覆盖层和控制台错误。
- `npm test`、`npm run build` 通过。
- 不依赖 RangeEcho 进程、不依赖外部网络服务。

## 对话启动语

请按 `STAIRS_SOUND_WALL_SPEC.md` 开发，只修改楼梯项目的 `codex/stairs-sound-wall` 分支。
