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
