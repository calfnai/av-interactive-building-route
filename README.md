> **暂停开发（2026-11-13）**：当前进度已归档，详见 [ARCHIVE.md](ARCHIVE.md)。下文保留归档时的功能与运行记录。

# AV Interactive · GitHub Pages 版

这是独立的纯 Vite + React + Three.js 网页工程，只负责楼栋模型和轨迹的公开演示。

它与原来的 TouchDesigner 工程、Sites/Vinext 实验工程完全分开，避免文件和发布方式相互影响。

## 本地运行

```bash
nvm install
nvm use
npm install
npm run dev
```

## 构建

```bash
npm test
npm run build
```

构建结果位于 `dist/`，可以直接部署到 GitHub Pages。

## 走楼梯双版本

开发服务器固定使用 `5180` 端口，避免误打开 DailyFlora 的 `5173`：

```text
http://localhost:5180/?mode=flora
http://localhost:5180/?mode=sound
```

- `?mode=flora`：超现实彩色花梯。用 WASD/方向键自由行走，在 6 个平台寻找不同花束。
- `?mode=sound`：声流楼梯。楼梯、光柱和频率形体使用另一套蓝色声场编排，花束继续跟随声音变化。

第一次打开时点击“开始 SAMPLE 体验”，网页会实时合成声音；也可以切换本机麦克风或 BlackHole。麦克风权限失败时会自动回到 SAMPLE，不会依赖 RangeEcho 进程。

操作方式：点击画面锁定鼠标，WASD/方向键行走，鼠标观看，ESC 释放鼠标，R 或“重新开始”重置位置；点击附近花束会显示轻量发现提示。

自由行走版本不加载手势控制，也不需要摄像头；输入只使用键盘、鼠标和可选麦克风。旧 MediaPipe WASM 与手势模型已移出发布目录。

两个模式不运行时 import DailyFlora 或 RangeEcho。DailyFlora 只通过资源包 manifest 提供来源、版本和花材参数。墙面 CAD 暂不进入当前运行时，保留在 `models/cad/` 供后续迭代。

狐尾百合运行时保留 `stem`、`spike`、`florets`、`leaves`、`halo` 命名节点，并额外生成 pollen 动态层；低频驱动茎秆摆动，中频驱动花序开合，高频驱动 halo、光点和花粉。
