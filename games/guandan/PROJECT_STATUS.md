# 掼蛋项目 · 驾驶舱

> **使用规则：**  
> ✅ 任何 session 开始前的第一件事：读这份文件  
> ✅ 任何 session 结束前的最后一件事：更新"当前焦点"和"阻塞项"  
> ❌ 不在驾驶舱里"想到哪做哪"——决策只在 sprint 切换时做，不在 session 内做

---

## 当前焦点（current_focus）

| 项 | 值 |
|---|---|
| 推进的 stream | 🔵 **NPC AI**（Sprint 3 启动）|
| 项目战略定位 | **🅱️ "可演示的作品"** —— 朝着"能给非技术听众看的成品"方向推进 |
| 推进的 stream | 🛑 **无 active stream**（Sprint 3 全部封箱，3 stream 全 paused）|
| 当前 milestone | **🎉 Sprint 3 整体完成（M2 + P1 全部 DoD ✅）** |
| Sprint | 3 已封箱（5/3 当天完成，原计划 5/3-5/16）|
| 下次 session 入口 | "现在选 Sprint 4 焦点；先读 PROJECT_STATUS.md，然后我们讨论候选" |

> **Sprint 2 封箱回顾**：  
> - Sprint 1（Client Phase 3）✅ + Sprint 2（NPC M1 v1.0）✅ + Sprint 2.5（Engine E1）✅  
> - 1 天完成，远超原计划进度  
> - 详见 `design-audit/PHASE3_FINAL_REPORT.md`、`NPC_M1_REPORT.md`、`ENGINE_E1_REPORT.md`

---

## 三条 stream 的健康度

### 🟢 Engine 引擎
- 状态：**维护态（paused at v1.0）** ← 由 active 切回 paused
- 核心文件：`server-runtime/game/rules.js` / `decomp.js` / `classifier.js` / `engine.js`
- 已完成：E1（selfplay 12.7% 错误根因诊断 + 修复，错误率 0/1000）
- 报告：`ENGINE_E1_REPORT.md`
- 副产物：selfplay.mjs 增加错误分类 instrumentation，未来诊断同类问题更快
- 后续 backlog（不立即做）：P1 测试套件 / P2 性能基准 / P3 代码现代化

### 🔵 NPC AI 智能对手
- 状态：**active**（Sprint 3 焦点，由 paused 切回 active）
- 核心文件：`server-runtime/npc/PracticeNPC.js` / `SkillProfiles.js`、`server-runtime/selfplay.mjs`
- 状态：**paused（at P1 v1.0 完成，Sprint 3 封箱）**
- 已完成：R1-R15 落地 / M1 v1.0 / M2（R5 已删，14 项 expert）/ **P1 全部完成（trace + UI bubble + 3 demo 场景）**
- 报告：`NPC_M1_REPORT.md`、`NPC_M2_REPORT.md`、`NPC_P1_LOG.md`（v1.0 完整）
- 新 expert 性能：手数 39.01、让路率 99.09%、拦截 55.30%
- 可演示性已就绪：`?debug=1` 下信息泡显示 trace（含 R 技能 chip + 中文说明）
- 已识别 follow-up（M3+ 候选）：① R2 production bug 诊断 ② 精简 expert 实验 ③ NPC P2 Search 路线
- 副产物可复用：selfplay.mjs `--repeat M` + 三维度 t-test 矩阵 + NPC trace 框架 + UI 信息泡

### 🟠 Client / UX 客户端
- 状态：**paused（at Phase 3 v1.0 完成）** ← 由 active 切换为 paused
- 已完成：Phase 0 / Phase 1 v2 / Phase 2 / **Phase 3 全部 4 任务 ✅**（含 P0/P1/P2 全部解决）
- 封箱报告：`design-audit/PHASE3_FINAL_REPORT.md`
- 详细进度：见 `CLIENT_SUMMARY.md`
- 二期 backlog 已识别但不立即做（详见 FINAL_REPORT 第八节）

---

## 接下来 sprint 计划（含紧急插入）

| Sprint | 时间 | 主推 stream | 目标 milestone | 状态 |
|--------|------|-----------|--------------|------|
| 1 | 5/2 | 🟠 Client | Phase 3 动效完成 | ✅ 封箱 |
| 2（中断） | 5/2 | 🔵 NPC | M1 自战 + 消融 | 🛑 paused at v0.1（结果污染）|
| 2.5（紧急插入）| 5/2 | 🟢 Engine | E1 修复 12.7% 错误率 | ✅ 完成（错误率 0/1000）|
| 2-续 | 5/2 | 🔵 NPC | M1 v1.0（t-test + 报告升级）| ✅ 完成（DoD 4/4） |
| 3 | 5/3 | 🔵 NPC | M2（R5 + 三维度 t-test）+ P1（可解释性）| ✅ **当天封箱**（原计划 2 周）|
| **4（待启动）** | **TBD** | **待选** | **候选：① R2 production bug 诊断 ② 精简 expert 实验 ③ Client v2 polish ④ P2 Search 路线（重大研究）⑤ "项目休眠"（不做新事）** | ⏳ |

> **规则：每个 sprint 只动一条 stream。其它 stream 严格保持当前状态。**

---

## 阻塞 / 等待项

无（2026-05-02）

---

## 历史决策日志

| 日期 | 决策 |
|------|------|
| 2026-05-03 | **🎉🎉🎉 Sprint 3 整体封箱（M2 + P1 全部完成 · 当天交付，原计划 2 周）**：①  P1.2 完成——server 端移除 teaching 限制 + 加 activatedSkills/skillNotes payload；客户端加 `?debug=1` 模式 + 3 个对手位卡的 trace bubble + 阵营色融合左边框 + duration-linger (2500ms) 自动隐藏 ② P1.3 完成——10 回合实测 26 个 NPC_EXPLAIN 事件，3 种独立场景（R3 拆牌优化 PLAY、R8 残局解算 PLAY、R12 忍牌保型 PASS）全部在 demo 模式下可见。P1 DoD 3/3 ✅。3 stream 全部 paused，Sprint 4 待选焦点。详见 `NPC_P1_LOG.md` v1.0 |
| 2026-05-03 | **NPC P1.1 完成（trace 框架 + 9 处核心 R instrumentation）**：发现项目已有 NPCDecisionLog.js 含 PrimaryReason 枚举和 8 种中文解释模板——P1 是把"事后推断"升级为"实时追踪"，不是从零搭。改动：① NPCDecisionLog.js 加 logSkill helper + activatedSkills/skillNotes 字段 ② PracticeNPC.js 用 _trace 字段携带，在 R1/R3/R4/R6/R7/R8/R9/R12/R2 等 9 处核心触发点加 logSkill。1 局测试输出"R9 + R7 联合决策"等可读 trace |
| 2026-05-03 | **🎉 NPC M2 完成（1 个 session，原计划半 sprint）**：① R5 删除决策——三维度 t-test 全部显示负贡献（手数 -0.64、让路 +0.2%、拦截 +2.0%），无对冲；② 修改 SkillProfiles.js，新 expert = 14 项（去 R5）；③ A/B 验证：1000 场 baseline 手数 39.0、让路 99.2%、拦截 55.1%，与 t-test 预测全部吻合；④ 新 expert 三维度 ablation 完成（28k 局），发现 R1 是配合 vs 速度 trade-off、R11 emergent 拦截率贡献、**R2 三维度都不显著（production bug 嫌疑）**；⑤ NPC_M2_REPORT.md v1.0 完成。selfplay.mjs M2 阶段扩展为三维度 t-test 矩阵。M2 DoD 5/5 ✅ |
| 2026-05-03 | **Sprint 3 启动 · 项目战略定位锁定为 🅱️"可演示的作品"**：在 4 个候选（P2 Search/P1 可解释性/Client v2 polish/M2 R5 修复）中选定"先 M2 后 P1"的两段式串行计划。Sprint 3 时间盒：5/3-5/16（2 周） |
| 2026-05-02 | **🎉🎉🎉 NPC M1 v1.0 终版完成 · Sprint 2 整体封箱**：selfplay.mjs 加 `--repeat M` + Welch's t-test 工具函数；跑 200×10=2000 局/技能 × 16 条件 = 32k 局（用时 32s）→ **15 项全部 t-test**（远超 DoD "≥3 项"）→ 关键发现：R9 支柱（Δ+37.74, p<.001）、4 项小正贡献（R3/R10/R11/R12）、**R5 反向效应实锤（Δ-0.63, p<.001，是 production bug）**、9 项手数维度不显著但部分在让路率维度仍可能有效（如 R1）。M1 DoD 4/4 ✅。NPC stream 切回 paused（at M1 v1.0）。3 stream 全部 paused，Sprint 3 待选焦点 |
| 2026-05-02 | **🟢 Engine E1 完成（耗时半个 session）**：selfplay.mjs 错误分类 instrumentation + 跑 100 局收样本 → 100% 错误集中在进贡阶段（E2/E9）→ 定位根因为 selfplay::pickTributeCard 多了一个级牌过滤条件，与 engine 的 line 525 不一致 → 1 行修复（删过滤条件）→ 1000 局 A/B 验证错误率 127→0，所有其他指标完全一致 → ablation 重跑确认 R 技能 ranking 稳定（R9 +37.8 vs +38.0）。**Engine 本身完全没问题，只是测试工具 bug**。详见 `ENGINE_E1_REPORT.md`。Engine stream 切回维护态，NPC stream 切回 active 继续 t-test 收尾 M1 |
| 2026-05-02 | **🛑 紧急 Pivot：NPC stream 暂停，Engine stream 启动**。理由：M1 baseline 跑出 127/1000 = 12.7% 引擎错误，可能让 ablation 数据失真——某些 R 技能"微弱"可能是"被错误吃掉"。在确认 Engine 稳定前继续 NPC 是浪费 effort。Sprint 2.5（紧急插入）目标：E1 把错误率压到 <0.5%，然后 NPC 重跑 baseline + ablation。WIP=1 守住，本质是按发现做出的优先级调整 |
| 2026-05-02 | **NPC M1 v0.1 初版完成（结果待 Engine 修复后验证）**：baseline 1000 局（10s）+ ablation 200×16 组（36s）跑完。R9 领牌评分是支柱（去掉手数翻倍 39.7 → 77.6）；R1 是让路率支柱（去掉 99% → 84.8%）；13 项技能单独消融均 <1.0 手数差，待 t-test 区分"冗余/小效应"vs"真没用"。报告 `NPC_M1_REPORT.md` v0.1，DoD 3/4 ✅，但暴露 12.7% 引擎错误率 |
| 2026-05-02 | **🎉🎉 Sprint 1 封箱 · Phase 3 100% 完成**：Task 4（AI 思考省略号）落地，零 JS 改动纯 CSS 实现。波浪动画 3 个 dot opacity 实测 0.685/0.949/0.2 处于不同相位。**Client stream 进入 paused 状态。Sprint 2 启动，焦点切换到 NPC stream M1**。封箱报告 `design-audit/PHASE3_FINAL_REPORT.md` 含 P0/P1/P2 解决对照、5 维度对比、技术质量分析 |
| 2026-05-02 | **🎉 Phase 3 任务 3 整体完成**：3.3（牌组 2500ms dwell + 250ms fade-out）落地。隔离测试探针实测状态机精确：t=2550ms 时 fading-out class 加上 + timer 已清；t=2850ms 时 innerHTML 清空。新出牌触发"立即淡出"也验证通过。任务 3 4 个子任务全部 ✅，仅剩任务 4（AI 思考省略号） |
| 2026-05-02 | **Phase 3 任务 3.2 + 3.4 完成（顺手解决 4 象限分布）**：index.html 加 4 个 stage-quadrant 容器；style.css 加 4 个 fly-from-* keyframes；gameUI.js::showPlayedCards 改造为飞向中央 + animation-delay 错开 40ms；探针实测 +50ms 卡牌 transform=translateY(236px) opacity=0.156，证明动画在跑；4 quadrant 实测 {bottom:1, top:1, right:1} 同时占用。详见 `design-audit/PHASE3_TASK3_LOG.md` |
| 2026-05-02 | **Phase 3 任务 3.1 完成 + 任务 3 调查完成**：style.css 追加 `Phase 3 Task 3 Override Block`（含 `play-btn-summon` keyframe）；gameUI.js::updateTurnHighlight 加 9 行 hook（首次改 JS）；computed style 探针实测 spring 过冲到 0.999；MutationObserver 在 t=8089ms 捕获到真实游戏路径中 summon class 自动触发。任务 3 整体调查报告同时完成（出牌事件链 5 个 hook、3.2 实施入口已识别）。详见 `design-audit/PHASE3_TASK3_LOG.md` |
| 2026-05-02 | **Phase 3 任务 2（回合脉冲光晕）完成 · P0 已解决**：style.css 追加 `Phase 3 Task 2 Override Block`，2 个 @keyframes（队友琥珀 / 对手钢蓝）+ 涌现 transition；computed style 探针验证 alpha 实测 0.384~0.545 与 spec 100% 吻合。详见 `design-audit/PHASE3_TASK2_DIFF.md` |
| 2026-05-02 | **Phase 3 任务 1（基础过渡动效）完成**：style.css 末尾追加 `Phase 3 Task 1 Override Block`，5 处 transition 落地，详见 `design-audit/PHASE3_TASK1_DIFF.md` |
| 2026-05-02 | 项目升级为 3-stream 模式，WIP=1，建立驾驶舱 |
| 2026-05-02 | Client Phase 0/1/2 完成，进入 Phase 3 |
| 2026-04-30 | NPC R1-R15 落地，进入 paused（待稳定性测试达 DoD） |
| 2026-04-15 | Engine 进入维护态 |
