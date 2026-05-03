# Engine 引擎 Stream · Backlog

> 截至 2026-05-02。  
> **铁律：Engine 的稳定性影响所有上层 stream（NPC + Client），改动需极保守，必须有数据证明。**
>
> ## ✅ 当前状态：维护态（paused at v1.0）
>
> Sprint 2.5 的 E1 已完成（错误率 127/1000 → 0/1000），Engine stream 回到维护态。  
> 详细报告：`ENGINE_E1_REPORT.md`。

---

## 🗄️ E1: 诊断 + 修复 12.7% 引擎错误率 [完成 ✅]

**触发**：Sprint 2 NPC M1 跑 1000 局 baseline 时统计出 127 次 "引擎/逻辑错误"——`selfplay.mjs` 的 `S.errors` 计数器 +1，但具体错误内容被吞掉。

**严重性**：12.7% 错误率可能让 NPC 消融测试失真。例如某些 R 技能"看起来微弱"可能是因为这些技能触发的边界 case 被错误吃掉，没真正参与决策。在 Engine 稳定前继续 NPC 是浪费 effort。

**当前状态**：✅ 完成（2026-05-02，单 session 收口）

**DoD 完成情况**：
- [x] 错误根因清楚 — 不是 engine/NPC bug，是 selfplay::pickTributeCard 多了一个级牌过滤条件，与 engine line 525 不一致
- [x] 错误分类 — 100 局样本仅触发 E2/E9 两类（E9 是 E2 下游），实际 1 个根因
- [x] 错误率压到 < 0.5% — 实测 0/1000 = **0%**
- [x] 重跑 NPC baseline + ablation 验证数据可信 — 修复后核心结论与修复前一致（R9 +37.8 vs +38.0）

**单点修复**：`selfplay.mjs::pickTributeCard` 删 1 个过滤条件
**副产物**：selfplay 现在有错误分类 instrumentation 框架（logError + errorDetails）

**入口操作**：
1. 找到 selfplay.mjs 中 `errors` 计数器递增的位置（grep `S.errors++`）
2. 在那个 catch 块里把错误**栈 + 上下文**打印出来（暂时改 selfplay.mjs，是测试工具不是引擎本身）
3. 跑 50-100 局收集真实错误样本
4. 按错误模式分类（前 3 类应该覆盖 80% 的错误）
5. 修对应的根因（可能在 PracticeNPC.js 或 game/*.js）
6. 重跑验证错误率下降

**预计工时**：2-3 个 session

**约束**：
- ✅ 可改 `selfplay.mjs`（测试工具）
- ✅ 可改 `server-runtime/game/*.js`（如果是 engine bug）
- ✅ 可改 `server-runtime/npc/PracticeNPC.js`（如果是决策 bug）
- ❌ **不动游戏规则语义**（不能为了"消错"修改了掼蛋玩法）—— 任何规则变化必须先在本文档提案
- ❌ **不动现有 Engine 测试覆盖**（如果有的话）

**回滚**：每次修改单点（一个 try/catch 里改一处），用 baseline 1000 局 A/B 对比错误率。如果改动让某项指标变差，立即回退。

---

## 📋 后续 backlog（按优先级）

### P1: Engine API 稳定性测试套件
- 当前没有针对 rules.js / classifier.js / decomp.js 的单元测试
- 从 selfplay 跑出的"错误样本"反向构造测试用例，固化到测试套件
- DoD：测试套件覆盖现有"错误模式"，未来回归时能及时发现
- 预计工时：1-2 周
- 依赖：E1 完成（先有错误模式才能写测试）

### P2: Engine 性能基准
- selfplay 现在 1.6ms/局，看似快——但如果未来加 search/RL，会大幅放大
- 建立 microbenchmark：classify 一个手牌、分解一手牌、计算可出牌列表 等核心操作的耗时
- DoD：每个核心操作有 baseline 性能数据，未来改动可对比
- 预计工时：2-3 天
- 依赖：E1 + P1

### P3: 代码现代化（可选）
- `server-runtime/` 没有 `package.json` 的 `"type": "module"`，每次运行都有 warning
- 加上后消除 warning + 可能轻微提速
- 预计工时：1 小时
- 风险：低（仅模块系统声明）
- 何时做：跟 P1/P2 顺手做即可

---

## 🗄️ 已完成 milestone（参考）

| 日期 | milestone | 备注 |
|------|----------|------|
| 2026-04 | 万能牌填补顺子缺口修复 | rules.js findPlayableHands 增加 wildcard gap-filling |
| 2026-04 之前 | engine v1.0（rules + classifier + decomp） | R 路线 NPC 的基础设施 |

---

## 设计原则备忘（每次推 Engine 都用得上）

1. **修复根因，不打补丁**——发现某个错误模式时，问"它为什么发生"而不是"怎么让它不出现"
2. **任何 Engine 改动跑 baseline 1000 局 A/B 对比**——错误率、平均手数、胜率分布都要看
3. **不为 NPC 改 Engine 行为**——Engine 是规则真理来源，NPC 适应 Engine，反之不行
4. **错误吞掉 = 错误**——`try { ... } catch (e) {}` 本身就是 bug，至少要 log
