# AV Interactive · 楼栋路径复刻器

一个基于 Three.js 的居民楼栋空间结构与人物轨迹原型。当前版本把建筑结构、空间连接、门禁状态与人物实际行进序列分开建模，为后续音画互动与 TouchDesigner 联动保留清晰接口。

## 本地启动

项目要求 Node.js 24。使用 nvm 时：

```bash
nvm install
nvm use
npm install
npm run dev
```

`.nvmrc` 和 `.node-version` 已固定为 Node 24，避免旧版 Node 缺少 `node:fs/promises.glob`。

## 在线演示

公开演示版本发布在仓库的 `gh-pages` 分支。运行 `npm run build:pages` 可生成静态发布文件到 `dist/client`。

## 当前模型

- 1 单元、2 单元，共 10 层。
- 每层公共区、住户门、三组住户室内空间、楼梯、电梯厅与互通门。
- 1 单元 2 楼明确无电梯点位。
- 6 楼、7 楼互通门与 1 单元 10 楼楼梯门是不可穿越硬阻隔。
- 8 楼、10 楼互通门可开启。
- 电梯主动呼叫需要门禁卡，同时支持“等待其他楼层轿厢到站”的条件事件。
- 完整保留 2 楼折返、10 楼受阻、2 单元绕行、两次误入住户和三次返回 6 楼。

## 数据边界

- `app/spatial-data.ts`：空间节点、连接关系、门禁状态与严格有序轨迹。
- `app/BuildingScene.tsx`：Three.js 楼栋、网络边、轨迹、人物标记与相机。
- `app/InteractiveModel.tsx`：时间轴、章节、楼层切片、事件面板与播放控制。

后续接 AV 玩法时，建议把音频频段、OSC/MIDI、摄像头或传感器输入映射到 `progress`、相机、楼层透明度、节点亮度和事件触发器；不要直接改写基础空间图，以免破坏阻隔约束。
