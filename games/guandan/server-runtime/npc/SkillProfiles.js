/**
 * SkillProfiles.js — 掼蛋 NPC 技能树
 *
 * 将 PracticeNPC v3 的 9 项规则技能拆解为可独立开关的 SkillProfile（Set<string>），
 * 便于消融测试量化每项技能的贡献，也为 Search / RL 路线提供扩展槽位。
 *
 * 技能 ID 命名规范：路线前缀_简写
 *   R = Rule-based（规则路线）
 *   S = Search（搜索/MCTS，待实现）
 *   L = Learned（监督/RL，待实现）
 */

export const SKILLS = {
  // ─── 规则路线 R1-R9 ───────────────────────────────────────────
  /** ③ 队友领牌主动让路 + 护送清场 */
  R1: 'r1_yield',
  /** ④ 炸弹时机增强（残局/对手快赢时使用炸弹） */
  R2: 'r2_bomb_timing',
  /** ① 拆牌质量优化（跟牌时选破坏性最低的候选） */
  R3: 'r3_decomp_quality',
  /** ② 记牌推断——isEffectivelyMax（桌面牌是否已是最大） */
  R4: 'r4_memory',
  /** ⑦ 级牌 / 万能牌保护（不轻易在低价值场合消耗） */
  R5: 'r5_level_guard',
  /** ⑧ 对手手牌推断——isLastPlayUnbeatable（无人能打过则省大牌） */
  R6: 'r6_opponent_infer',
  /** ⑨ 信号传递（领牌编码强/弱信号；读队友信号调整让路策略） */
  R7: 'r7_signal',
  /** ⑥ 残局解算器（全场 ≤28 张时优先出"无敌牌型"） */
  R8: 'r8_endgame',
  /** ⑤ 领牌评分（综合难度 + 记牌 + 破坏性 + 级牌扣分） */
  R9: 'r9_lead_score',
};

/**
 * 内置预设
 *   noob   — 无任何高级技能，纯随机/贪心
 *   normal — 基础配合 + 炸弹时机 + 拆牌 + 记牌（≈ 旧 full=false）
 *   expert — 全部 9 项技能（≈ 旧 full=true）
 */
export const NPC_PRESETS = {
  noob:   new Set([]),
  normal: new Set([SKILLS.R1, SKILLS.R2, SKILLS.R3, SKILLS.R4]),
  expert: new Set(Object.values(SKILLS)),
};

/**
 * 根据 level 字符串返回对应的默认 SkillProfile
 * @param {string} level - 'noob' | 'normal' | 'expert'
 * @returns {Set<string>}
 */
export function profileFromLevel(level) {
  return NPC_PRESETS[level] ?? NPC_PRESETS.normal;
}
