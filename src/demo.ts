import type { Activity, AquariumSnapshot } from "../shared/protocol";

const examples: Omit<Activity, "id" | "startedAt">[] = [
  { kind: "agent", category: "agent", label: "界面设计子 Agent", status: "running" },
  { kind: "tool", category: "read", label: "阅读项目代码", status: "running" },
  { kind: "tool", category: "write", label: "修改组件", status: "running" },
  { kind: "tool", category: "terminal", label: "运行测试", status: "running" },
  { kind: "tool", category: "web", label: "检索开发文档", status: "running" },
  { kind: "tool", category: "tool", label: "调用 MCP 工具", status: "running" },
];

export function demoSnapshot(tick: number): AquariumSnapshot {
  const now = Date.now();
  const phase = Math.floor(tick / 3) % examples.length;
  return {
    version: 1,
    source: "hooks",
    updatedAt: now,
    lastEventAt: now,
    sessions: [
      { id: "demo-interface", label: "打磨购物车界面", status: "working", activities: [0, 1, 2].map((offset) => ({ ...examples[(phase + offset) % examples.length], id: `demo-a-${offset}`, startedAt: now - 14000 })), startedAt: now - 360000, updatedAt: now },
      { id: "demo-service", label: "检查库存服务", status: tick % 8 < 6 ? "working" : "thinking", activities: tick % 8 < 6 ? [1, 3].map((offset) => ({ ...examples[(phase + offset) % examples.length], id: `demo-b-${offset}`, startedAt: now - 8000 })) : [], startedAt: now - 220000, updatedAt: now },
      { id: "demo-review", label: "审阅新的变更", status: tick % 10 < 7 ? "waiting" : "working", activities: tick % 10 < 7 ? [] : [{ ...examples[4], id: "demo-c-1", startedAt: now }], startedAt: now - 130000, updatedAt: now },
      { id: "demo-blacktail-1", label: "整理任务边界", status: "thinking", activities: [], startedAt: now - 120000, updatedAt: now },
      { id: "demo-cardinal-7", label: "设计新的交互", status: "thinking", activities: [], startedAt: now - 110000, updatedAt: now },
      { id: "demo-tiger-1", label: "核对测试结果", status: "thinking", activities: [], startedAt: now - 100000, updatedAt: now },
      { id: "demo-zebra-1", label: "梳理代码结构", status: "thinking", activities: [], startedAt: now - 90000, updatedAt: now },
    ],
  };
}
