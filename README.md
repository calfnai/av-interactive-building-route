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

## 双手楼梯沙盘

页面已经内置 MediaPipe 浏览器手势识别。Windows、Apple Silicon Mac 和 Intel Mac 使用同一套网页，无需安装 Python、OpenCV 或系统专用插件；摄像头识别模型和 WASM 文件随站点发布。

1. 使用 Chrome、Edge 或 Safari 打开 HTTPS 部署页面（本地开发可使用 localhost）。
2. 展开右侧“手势”面板并点击“启用本机摄像头”。
3. 捏住后左右移动可拖动路线；张开手掌上下移动可剖切楼层；双手拉开可拆开楼层；在阻隔事件张开手掌可显示未发生的幽灵路线。

如果同时运行桌面 Camera Controller，可以改点“连接桌面控制器”，页面会读取 `ws://127.0.0.1:8765` 的统一控制信号。空间图和门禁约束不会被手势改写。
