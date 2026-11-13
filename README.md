> **暂停开发（2026-11-13）**：当前进度已归档，详见 [ARCHIVE.md](ARCHIVE.md)。下文保留归档时的功能与运行记录。

# AV Interactive · GitHub Pages 公开演示版

这是 `AV Interactive Building Route` 的公开演示交付面：纯 Vite + React + Three.js 网页工程，负责楼栋模型、轨迹公开演示和双手楼梯沙盘。

它与主工程 `../av-interactive/` 使用同一个 GitHub 仓库，但保留独立的 Vite/Pages 构建边界；它与 TouchDesigner 工程、Sites/Vinext 实验工程分开，避免文件和发布方式相互影响。

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

## 双手楼梯沙盘

页面已经内置 MediaPipe 浏览器手势识别。Windows、Apple Silicon Mac 和 Intel Mac 使用同一套网页，无需安装 Python、OpenCV 或系统专用插件；摄像头识别模型和 WASM 文件随站点发布。

1. 使用 Chrome、Edge 或 Safari 打开 HTTPS 部署页面（本地开发可使用 localhost）。
2. 展开右侧“手势”面板并点击“启用本机摄像头”。
3. 捏住后左右移动可拖动路线；张开手掌上下移动可剖切楼层；双手拉开可拆开楼层；在阻隔事件张开手掌可显示未发生的幽灵路线。
4. 放松手掌左右移动可旋转镜头，手掌靠近或远离摄像头可推拉镜头。
5. 👍 开始或继续播放，✊ 暂停，☝ 回到路线开头，✌ 跳到路线结尾。

如果同时运行桌面 Camera Controller，可以改点“连接桌面控制器”，页面会读取 `ws://127.0.0.1:8765` 的统一控制信号。空间图和门禁约束不会被手势改写。
