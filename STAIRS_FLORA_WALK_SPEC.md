# 楼梯第一人称 · DailyFlora 花朵版

## 目标

把现有楼梯路线变成自动行走的第一人称空间体验：

- 摄像机沿既有路线自动行走。
- 用户主要观看、转头和观察空间。
- 楼梯平台、阻隔点和转折处会出现随机花材。
- 狐尾百合作为稀有的空间事件。
- 不做浇水、养成、照料或新的 seed 系统。

## Git 分支

基于：

`codex/hand-stairs-playground`

新分支：

`codex/stairs-flora-walk`

## 项目边界

DailyFlora 只导出花材资源包和参数，不直接 import DailyFlora 源码。

img2threejs 只负责生成特殊狐尾百合的程序化 Three.js 工厂。

text-to-cad 只负责生成墙面共振板的 STEP 和网页用 GLB。

不修改 DailyFlora、RangeEcho 或生产部署。

## 第一人称体验

新增 `walk` 摄像机模式：

- 摄像机眼高约为人物高度。
- 沿现有 `ROUTE_EVENTS` 自动前进。
- 通过路线切线确定前进方向。
- 鼠标拖动和手势只控制有限范围的左右/上下观看。
- 不允许自由飞行，不新增自由移动碰撞系统。
- 保留全楼、跟随、身后、俯视视角作为调试视角。

## 花朵行为

从 DailyFlora 导出：

- 普通花型、颜色、枝线、密度和摆放语义。
- 按路线事件、楼层和日期生成确定性花朵布局。
- 相同 seed 必须生成相同布局。
- 花朵在靠近时展开、呼吸或轻微摆动。
- 离开后减弱，不保存养成状态。

狐尾百合：

- 使用 DailyFlora 本地参考图：
  `dailyFlora/docs/untitled folder/有整体，有局部细节/狐尾百合✨_4_Césped_来自小红书网页版.jpg`
- 裁出左侧高耸花穗作为 img2threejs 输入。
- 生成可命名、可拆解、可点击的 `stem`、`spike`、`florets`、`leaves` 部件。
- 如果裁剪图无法支持可靠结构分析，停止并要求新的单花近景，不伪装成精确重建。

## 墙面共振板

text-to-cad 生成：

- 900 × 2100 × 80 mm 墙面模块。
- 边框、纵向浮雕通道、安装定位点。
- 狐尾百合穗形作为表面结构语法。
- STEP 为主产物。
- GLB 为网页派生预览。
- 网页按 1 unit = 1 meter 缩放。

第一人称版中，墙面板是静态空间记忆装置：

- 经过时短暂发光。
- 点击或手势观察时可局部拆解。
- 不做声音驱动。

## 资源接口

```ts
interface FloraPackManifest {
  version: 1;
  sourceProject: "dailyflora";
  sourceRevision: string;
  flowers: Array<{
    id: string;
    rarity: "common" | "rare";
    palette: string[];
    scale: number;
    placement: "landing" | "blocked-event" | "wall";
  }>;
}
```

## 验收

- 自动行走不穿楼层、不穿墙、不脱离楼梯路线。
- 第一人称镜头经过楼梯、转折平台、阻隔点和终点时连续。
- 普通花材布局由 seed 稳定复现。
- 狐尾百合通过 img2threejs 状态、质量 contract、分阶段构建和多角度浏览器检查。
- 狐尾百合可点击、可拆解、具有稳定锚点。
- STEP 通过 CAD 几何检查和 snapshot。
- GLB 可加载并与墙面锚点对齐。
- `npm test`、`npm run build`、浏览器无错误。
- 不增加花朵养成系统。

## 对话启动语

请按 `STAIRS_FLORA_WALK_SPEC.md` 开发，只修改楼梯项目的 `codex/stairs-flora-walk` 分支。
