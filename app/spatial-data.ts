export type Vec3 = [number, number, number];

export type NodeKind =
  | "public"
  | "stair"
  | "elevatorHall"
  | "elevatorCabin"
  | "interconnect"
  | "residenceDoor"
  | "residence"
  | "sideDoor";

export type AccessState = "open" | "locked" | "key" | "card" | "conditional";

export interface SpatialNode {
  id: string;
  unit: 1 | 2 | 0;
  floor: number;
  label: string;
  kind: NodeKind;
  access: AccessState;
  position: Vec3;
}

export interface SpatialConnection {
  from: string;
  to: string;
  mode: "walk" | "stairs" | "elevator" | "interior";
  traversable: boolean;
  note?: string;
}

export interface RouteEvent {
  id: string;
  chapter: number;
  position: Vec3;
  title: string;
  detail: string;
  status: "move" | "wait" | "blocked" | "wrong" | "access" | "finish";
  unit: 1 | 2;
  floor: number;
}

export const FLOOR_HEIGHT = 2.35;
export const FLOORS = Array.from({ length: 10 }, (_, index) => index + 1);
export const yForFloor = (floor: number) => (floor - 1) * FLOOR_HEIGHT;
export const unitX = (unit: 1 | 2) => (unit === 1 ? -7.2 : 7.2);

const roomLetters = ["A", "B", "C"] as const;

export const SPATIAL_NODES: SpatialNode[] = FLOORS.flatMap((floor) =>
  ([1, 2] as const).flatMap((unit) => {
    const x = unitX(unit);
    const y = yForFloor(floor);
    const elevatorPointExists = !(unit === 1 && floor === 2);
    const common: SpatialNode[] = [
      {
        id: `u${unit}-f${floor}-public`,
        unit,
        floor,
        label: `${unit}单元 ${floor}F 公共区`,
        kind: "public",
        access: "open",
        position: [x, y, 0],
      },
      {
        id: `u${unit}-f${floor}-stair`,
        unit,
        floor,
        label: `${unit}单元 ${floor}F 楼梯`,
        kind: "stair",
        access: unit === 1 && floor === 10 ? "locked" : "open",
        position: [x - (unit === 1 ? 2.4 : -2.4), y, -2.25],
      },
      ...roomLetters.flatMap((room, index): SpatialNode[] => [
        {
          id: `u${unit}-f${floor}-door-${room.toLowerCase()}`,
          unit,
          floor,
          label: `${unit}单元 ${floor}F ${room}户门`,
          kind: "residenceDoor",
          access:
            unit === 1 && floor === 6 && room === "B"
              ? "key"
              : [6, 7, 8].includes(floor) && unit === 1
                ? "conditional"
                : "locked",
          position: [x + (index - 1) * 1.65, y, 1.55],
        },
        {
          id: `u${unit}-f${floor}-room-${room.toLowerCase()}`,
          unit,
          floor,
          label: `${unit}单元 ${floor}F ${room}户室内`,
          kind: "residence",
          access: "conditional",
          position: [x + (index - 1) * 2.15, y, 3.15],
        },
      ]),
    ];

    if (elevatorPointExists) {
      common.push(
        {
          id: `u${unit}-f${floor}-elevator-hall`,
          unit,
          floor,
          label: `${unit}单元 ${floor}F 电梯厅`,
          kind: "elevatorHall",
          access: unit === 1 ? "card" : "conditional",
          position: [x + (unit === 1 ? 2.15 : -2.15), y, -2.25],
        },
        {
          id: `u${unit}-f${floor}-elevator`,
          unit,
          floor,
          label: `${unit}单元 ${floor}F 电梯轿厢`,
          kind: "elevatorCabin",
          access: "conditional",
          position: [x + (unit === 1 ? 3.15 : -3.15), y, -2.25],
        },
      );
    }

    return common;
  }),
).concat(
  FLOORS.map((floor): SpatialNode => ({
    id: `f${floor}-interconnect`,
    unit: 0,
    floor,
    label: `${floor}F 两单元互通门`,
    kind: "interconnect",
    access: floor === 8 || floor === 10 ? "open" : "locked",
    position: [0, yForFloor(floor), 0],
  })),
  [
    {
      id: "u1-f1-side-door",
      unit: 1,
      floor: 1,
      label: "1单元 1F 侧门",
      kind: "sideDoor",
      access: "open",
      position: [-10.8, yForFloor(1), 0.4],
    },
  ],
);

const connections: SpatialConnection[] = [];

for (const floor of FLOORS) {
  for (const unit of [1, 2] as const) {
    for (const room of roomLetters) {
      const letter = room.toLowerCase();
      const access = SPATIAL_NODES.find((node) => node.id === `u${unit}-f${floor}-door-${letter}`)?.access;
      connections.push(
        {
          from: `u${unit}-f${floor}-public`,
          to: `u${unit}-f${floor}-door-${letter}`,
          mode: "walk",
          traversable: access !== "locked",
          note: access === "key" ? "钥匙开启" : access === "locked" ? "住户门锁闭" : undefined,
        },
        {
          from: `u${unit}-f${floor}-door-${letter}`,
          to: `u${unit}-f${floor}-room-${letter}`,
          mode: "walk",
          traversable: access !== "locked",
        },
      );
    }

    connections.push({
      from: `u${unit}-f${floor}-public`,
      to: `u${unit}-f${floor}-stair`,
      mode: "walk",
      traversable: !(unit === 1 && floor === 10),
      note: unit === 1 && floor === 10 ? "楼梯通道门上锁" : undefined,
    });

    if (!(unit === 1 && floor === 2)) {
      connections.push(
        {
          from: `u${unit}-f${floor}-public`,
          to: `u${unit}-f${floor}-elevator-hall`,
          mode: "walk",
          traversable: true,
        },
        {
          from: `u${unit}-f${floor}-elevator-hall`,
          to: `u${unit}-f${floor}-elevator`,
          mode: "elevator",
          traversable: true,
          note: unit === 1 ? "主动呼叫需门禁卡；可等待轿厢到站" : undefined,
        },
      );
    }

    const bridgeOpen = floor === 8 || floor === 10;
    connections.push({
      from: `u${unit}-f${floor}-public`,
      to: `f${floor}-interconnect`,
      mode: "walk",
      traversable: bridgeOpen,
      note: bridgeOpen ? "互通门可开启" : "互通门锁闭",
    });

    if (floor < 10) {
      connections.push({
        from: `u${unit}-f${floor}-stair`,
        to: `u${unit}-f${floor + 1}-stair`,
        mode: "stairs",
        traversable: !(unit === 1 && floor + 1 === 10),
      });
    }
  }
}

connections.push(
  { from: "u1-f1-side-door", to: "u1-f1-public", mode: "walk", traversable: true },
  { from: "u1-f8-room-a", to: "u1-f7-room-a", mode: "interior", traversable: true, note: "住户室内跨层通道" },
  { from: "u1-f6-room-a", to: "u1-f7-room-b", mode: "interior", traversable: true, note: "错误住户室内跨层通道" },
  { from: "u1-f6-room-c", to: "u1-f7-room-c", mode: "interior", traversable: true, note: "住户室内跨层通道" },
);

export const SPATIAL_CONNECTIONS = connections;

const p = (unit: 1 | 2, floor: number, dx: number, z: number): Vec3 => [
  unitX(unit) + dx,
  yForFloor(floor) + 0.38,
  z,
];

const event = (
  id: string,
  chapter: number,
  position: Vec3,
  title: string,
  detail: string,
  status: RouteEvent["status"],
  unit: 1 | 2,
  floor: number,
): RouteEvent => ({ id, chapter, position, title, detail, status, unit, floor });

export const ROUTE_EVENTS: RouteEvent[] = [
  event("start", 1, p(1, 1, -2.4, -2.25), "起点 · 1F 楼梯口", "从 1 单元 1 楼楼梯口出发。", "move", 1, 1),
  event("f2-no-lift", 1, p(1, 2, -2.4, -2.25), "上至 2F", "2 楼没有可用电梯点位。", "blocked", 1, 2),
  event("return-f1", 1, p(1, 1, -2.4, -2.25), "原路折返 1F", "保留第一次无效上楼和完整回撤。", "wrong", 1, 1),
  event("side-door", 2, [-10.8, 0.38, 0.4], "打开 1F 侧门", "由侧门进入楼栋内部。", "access", 1, 1),
  event("u1-stair-f2", 2, p(1, 2, -2.4, -2.25), "楼梯上行 · 2F", "沿内部竖向楼梯上行。", "move", 1, 2),
  event("u1-stair-f3", 2, p(1, 3, -2.4, -2.25), "楼梯上行 · 3F", "经过 3 楼。", "move", 1, 3),
  event("u1-stair-f4", 2, p(1, 4, -2.4, -2.25), "楼梯上行 · 4F", "经过 4 楼。", "move", 1, 4),
  event("u1-stair-f5", 2, p(1, 5, -2.4, -2.25), "楼梯上行 · 5F", "经过 5 楼。", "move", 1, 5),
  event("u1-stair-f6", 2, p(1, 6, -2.4, -2.25), "抵达 6F", "进入 1 单元 6 楼公共区域。", "move", 1, 6),
  event("wait-lift", 2, p(1, 6, 2.15, -2.25), "无卡等待电梯", "无法主动召唤，只能等待其他楼层轿厢下行到站。", "wait", 1, 6),
  event("lift-arrives", 2, p(1, 6, 3.15, -2.25), "电梯到站", "被动等到轿厢后进入。", "access", 1, 6),
  event("lift-f10", 3, p(1, 10, 3.15, -2.25), "电梯运行至 10F", "完整保留垂直电梯位移。", "move", 1, 10),
  event("u1-f10-public", 3, p(1, 10, 0, 0), "进入 10F 公共区", "走出电梯。", "move", 1, 10),
  event("u1-f10-locked-stair", 3, p(1, 10, -1.85, -1.7), "楼梯门上锁", "尝试由公共楼梯下到 6 楼，门锁闭，不可穿越。", "blocked", 1, 10),
  event("u1-f10-retreat", 3, p(1, 10, 0, 0), "退回公共区", "没有穿过上锁楼梯门，改向 2 单元。", "wrong", 1, 10),
  event("bridge-f10", 3, [0, yForFloor(10) + 0.38, 0], "转向 2 单元", "经 10 楼可通行互通区进入 2 单元。", "move", 2, 10),
  event("u2-f10-stair", 4, p(2, 10, 2.4, -2.25), "2 单元 10F 楼梯", "开始沿 2 单元楼梯下行。", "move", 2, 10),
  event("u2-f9-stair", 4, p(2, 9, 2.4, -2.25), "下行 · 9F", "经过 9 楼。", "move", 2, 9),
  event("u2-f8-stair-down", 4, p(2, 8, 2.4, -2.25), "下行 · 8F", "继续向 6 楼。", "move", 2, 8),
  event("u2-f7-stair-down", 4, p(2, 7, 2.4, -2.25), "下行 · 7F", "继续向 6 楼。", "move", 2, 7),
  event("u2-f6-stair", 4, p(2, 6, 2.4, -2.25), "抵达 2 单元 6F", "前往两单元互通门。", "move", 2, 6),
  event("bridge-f6-locked", 4, [0.7, yForFloor(6) + 0.38, 0], "6F 互通门上锁", "无法返回 1 单元 6 楼；在门前停止。", "blocked", 2, 6),
  event("u2-f6-retreat", 5, p(2, 6, 0.5, 0), "退回 2 单元 6F", "折返回楼梯。", "wrong", 2, 6),
  event("u2-f7-stair-up", 5, p(2, 7, 2.4, -2.25), "上行至 7F", "尝试下一处互通门。", "move", 2, 7),
  event("bridge-f7-locked", 5, [0.7, yForFloor(7) + 0.38, 0], "7F 互通门仍上锁", "门前停止，未穿越。", "blocked", 2, 7),
  event("u2-f7-retreat", 5, p(2, 7, 0.5, 0), "退回 2 单元 7F", "再次折返楼梯。", "wrong", 2, 7),
  event("u2-f8-stair-up", 5, p(2, 8, 2.4, -2.25), "上行至 8F", "8 楼互通门可开启。", "move", 2, 8),
  event("bridge-f8-open", 5, [0, yForFloor(8) + 0.38, 0], "通过 8F 互通门", "由 2 单元进入 1 单元 8 楼公共区。", "access", 1, 8),
  event("u1-f8-public", 5, p(1, 8, 0, 0), "1 单元 8F 公共区", "完成跨单元绕行。", "move", 1, 8),
  event("u1-f8-lift-hall", 6, p(1, 8, 2.15, -2.25), "8F 电梯厅", "进入电梯厅并完成电梯事件。", "access", 1, 8),
  event("u1-f8-lift", 6, p(1, 8, 3.15, -2.25), "进入电梯轿厢", "保留原始叙述中的乘梯动作，不压缩。", "move", 1, 8),
  event("u1-f8-room-a", 6, p(1, 8, -2.15, 3.15), "进入 8F 住户室内", "由 8 楼住户室内通道穿行。", "move", 1, 8),
  event("u1-f7-room-a", 6, p(1, 7, -2.15, 3.15), "室内通达 7F", "经住户内部跨层连接抵达 7 楼。", "move", 1, 7),
  event("u1-f7-public-a", 6, p(1, 7, 0, 0), "回到 7F 公共区", "离开第一段住户室内通道。", "move", 1, 7),
  event("u1-f6-stair-return", 7, p(1, 6, -2.4, -2.25), "楼梯下行至 6F", "由 1 单元 7 楼下到 6 楼。", "move", 1, 6),
  event("u1-f6-wrong-room", 7, p(1, 6, -2.15, 3.15), "误入 6F A 户", "错误房间完整保留。", "wrong", 1, 6),
  event("u1-f7-room-b", 7, p(1, 7, 0, 3.15), "穿行至 7F B 户", "经屋内隔断和跨层空间进入另一户。", "move", 1, 7),
  event("u1-f7-public-b", 8, p(1, 7, 0, 0), "离开 7F 住户", "回到 1 单元 7 楼公共区。", "move", 1, 7),
  event("u1-f6-public-again", 8, p(1, 6, 0, 0), "再次下行至 6F", "第二次返回 6 楼公共区域。", "move", 1, 6),
  event("u1-f6-room-c", 8, p(1, 6, 2.15, 3.15), "进入 6F C 户", "此户室内通道连接到 7 楼。", "wrong", 1, 6),
  event("u1-f7-room-c", 8, p(1, 7, 2.15, 3.15), "室内再次通达 7F", "保留第二次错误跨层穿行。", "move", 1, 7),
  event("u1-f6-public-third", 9, p(1, 6, 0, 0), "退出并回到 6F", "从 7 楼住户空间退出，第三次到达 6 楼公共区。", "move", 1, 6),
  event("u1-f6-correct-door", 9, p(1, 6, 0, 1.55), "找到正确房门", "1 单元 6 楼 B 户；使用钥匙开门。", "access", 1, 6),
  event("finish", 9, p(1, 6, 0, 3.15), "路线终点", "进入正确房间，完整轨迹结束。", "finish", 1, 6),
];

export const CHAPTERS = [
  "2F 无电梯点位 · 原路折返",
  "侧门进入 · 楼梯至 6F · 等待电梯",
  "电梯至 10F · 楼梯门受阻 · 转向 2 单元",
  "2 单元下至 6F · 互通门受阻",
  "7F 再受阻 · 8F 成功互通",
  "8F 电梯厅 · 住户室内通达 7F",
  "下至 6F · 误入住户 · 穿行至 7F",
  "再下 6F · 再次经室内通达 7F",
  "返回 6F · 钥匙开门 · 终点",
];

export const BLOCKED_EVENTS = ROUTE_EVENTS.filter((item) => item.status === "blocked");

