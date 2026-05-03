/**
 * PracticeNPC.js — 陪练NPC（增强规则AI v3）
 *
 * v2 Quick Wins（已有）：
 *   ① 手牌预分解     决策前把手牌拆成最优组合
 *   ② 记牌器接入     根据已出牌推断剩余/实际最大值
 *   ③ 配合策略       队友领牌主动让；护送队友完成出牌
 *   ④ 炸弹时机       基于"出完所需手数"决定是否动炸弹
 *
 * v3 新增：
 *   ⑤ 出牌顺序优化   领牌时按"对手难跟难度"评分，优先出顺子/连对/钢板；小牌当炮灰先出
 *   ⑥ 残局解算器     全场 ≤28 张时精确规划：优先出"无敌牌型"再清场
 *   ⑦ 级牌/万能牌保护 万能牌永远不单出；级牌只在端局或多张组合里消耗
 *   ⑧ 对手手牌推断   基于记牌器判断"对手出的牌是否无人能打"，避免用大牌去顶必输的牌
 *   ⑨ 信号传递       领牌时编码强/弱信号（小单→示弱，复杂牌型→示强）；读取队友信号调整策略
 */

import { findPlayableHands } from '../game/rules.js';
import { isWildCard, classifyHand, isBomb as isBombType, HandType } from '../game/handClassifier.js';
import { getNormalizedRank } from '../game/deck.js';
import { createDecisionLog, inferPrimaryReason, logSkill } from './NPCDecisionLog.js';
import { getMemory } from '../game/llm_ai.js';
import { SKILLS, profileFromLevel } from './SkillProfiles.js';

/** 工具：判断 profile 是否包含某项技能 */
const has = (profile, skill) => profile.has(skill);

/** 判断 profile 是否包含任意一项"高级领牌"技能（R5-R9） */
function hasAnyAdvancedLead(profile) {
  return has(profile, SKILLS.R5)  || has(profile, SKILLS.R6) ||
         has(profile, SKILLS.R7)  || has(profile, SKILLS.R8) || has(profile, SKILLS.R9) ||
         has(profile, SKILLS.R10) || has(profile, SKILLS.R13);
}

export const AILevel = {
  NOOB: 'noob',
  NORMAL: 'normal',
  EXPERT: 'expert'
};

// ⑨ 信号类型
const Signal = {
  STRONG: 'strong',  // 我有控制权，队友跟随
  WEAK:   'weak',    // 我牌弱，队友接管
  NORMAL: 'normal'   // 中性
};

/* ============================================================
 * ① 手牌预分解
 *   贪心：依次找炸弹 → 钢板 → 连对 → 顺子 → 三张 → 对子 → 单张
 *   返回 { groups, tricksNeeded, bombGroups }
 * ========================================================== */
function decomposeHand(hand, currentLevel) {
  if (!hand || hand.length === 0) {
    return { groups: [], tricksNeeded: 0, bombGroups: [] };
  }
  let pool = hand.map(c => ({ ...c }));
  const groups = [];
  const bombGroups = [];

  const rankCount = (cards) => {
    const m = {};
    for (const c of cards) m[c.rank] = (m[c.rank] || 0) + 1;
    return m;
  };

  // 1) 找原生炸弹（4+ 张同 rank）
  while (true) {
    const counts = rankCount(pool);
    let bombRank = -1, bombSize = 0;
    for (const [r, n] of Object.entries(counts)) {
      if (n >= 4 && (n > bombSize || (n === bombSize && +r > bombRank))) {
        bombRank = +r; bombSize = n;
      }
    }
    if (bombRank < 0) break;
    const taken = pool.filter(c => c.rank === bombRank);
    pool = pool.filter(c => c.rank !== bombRank);
    groups.push({ kind: 'bomb', rank: bombRank, cards: taken });
    bombGroups.push({ rank: bombRank, size: bombSize });
  }

  // 2) 找天王炸（4 王）
  const jokers = pool.filter(c => c.rank === 15 || c.rank === 16);
  if (jokers.length === 4) {
    pool = pool.filter(c => c.rank !== 15 && c.rank !== 16);
    groups.push({ kind: 'rocket', rank: 99, cards: jokers });
    bombGroups.push({ rank: 99, size: 4 });
  }

  // 3) 找钢板（连续 2 组三张）
  while (true) {
    const counts = rankCount(pool);
    let bestStart = -1, bestLen = 0;
    for (let r = 2; r <= 13; r++) {
      let len = 0;
      while (r + len <= 14 && (counts[r + len] || 0) >= 3) len++;
      if (len >= 2 && len > bestLen) { bestStart = r; bestLen = len; }
    }
    if (bestStart < 0) break;
    const taken = [];
    for (let r = bestStart; r < bestStart + bestLen; r++) {
      const cards = pool.filter(c => c.rank === r).slice(0, 3);
      taken.push(...cards);
    }
    const ids = new Set(taken.map(c => c.id));
    pool = pool.filter(c => !ids.has(c.id));
    groups.push({ kind: 'triple_straight', rank: bestStart, cards: taken });
  }

  // 4) 找连对（连续 3 对及以上）
  while (true) {
    const counts = rankCount(pool);
    let bestStart = -1, bestLen = 0;
    for (let r = 2; r <= 13; r++) {
      let len = 0;
      while (r + len <= 14 && (counts[r + len] || 0) >= 2) len++;
      if (len >= 3 && len > bestLen) { bestStart = r; bestLen = len; }
    }
    if (bestStart < 0) break;
    const taken = [];
    for (let r = bestStart; r < bestStart + bestLen; r++) {
      const cards = pool.filter(c => c.rank === r).slice(0, 2);
      taken.push(...cards);
    }
    const ids = new Set(taken.map(c => c.id));
    pool = pool.filter(c => !ids.has(c.id));
    groups.push({ kind: 'double_straight', rank: bestStart, cards: taken });
  }

  // 5) 找顺子（连续 5 张）
  while (true) {
    const counts = rankCount(pool);
    let bestStart = -1, bestLen = 0;
    for (let r = 2; r <= 10; r++) {
      let len = 0;
      while (r + len <= 14 && (counts[r + len] || 0) >= 1) len++;
      if (len >= 5 && len > bestLen) { bestStart = r; bestLen = Math.min(len, 8); }
    }
    if (bestStart < 0) break;
    const len = Math.min(bestLen, 5);
    const taken = [];
    for (let r = bestStart; r < bestStart + len; r++) {
      const card = pool.find(c => c.rank === r);
      if (card) taken.push(card);
    }
    const ids = new Set(taken.map(c => c.id));
    pool = pool.filter(c => !ids.has(c.id));
    groups.push({ kind: 'straight', rank: bestStart, cards: taken });
  }

  // 6) 找三张
  {
    const counts = rankCount(pool);
    for (let r = 2; r <= 14; r++) {
      while ((counts[r] || 0) >= 3) {
        const taken = pool.filter(c => c.rank === r).slice(0, 3);
        const ids = new Set(taken.map(c => c.id));
        pool = pool.filter(c => !ids.has(c.id));
        counts[r] -= 3;
        groups.push({ kind: 'triple', rank: r, cards: taken });
      }
    }
  }

  // 7) 找对子
  {
    const counts = rankCount(pool);
    for (let r = 2; r <= 16; r++) {
      while ((counts[r] || 0) >= 2) {
        const taken = pool.filter(c => c.rank === r).slice(0, 2);
        const ids = new Set(taken.map(c => c.id));
        pool = pool.filter(c => !ids.has(c.id));
        counts[r] -= 2;
        groups.push({ kind: 'pair', rank: r, cards: taken });
      }
    }
  }

  // 8) 剩余单张
  for (const c of pool) {
    groups.push({ kind: 'single', rank: c.rank, cards: [c] });
  }

  // 三带二：把孤立三张和孤立对子合并
  const triples = groups.filter(g => g.kind === 'triple');
  const pairs = groups.filter(g => g.kind === 'pair');
  const merged = [];
  const used = new Set();
  for (const t of triples) {
    if (pairs.length === 0) break;
    const p = pairs.find(x => !used.has(x));
    if (!p) break;
    used.add(t); used.add(p);
    merged.push({ kind: 'triple_pair', rank: t.rank, cards: [...t.cards, ...p.cards] });
  }
  const finalGroups = groups.filter(g => !used.has(g)).concat(merged);

  return {
    groups: finalGroups,
    tricksNeeded: finalGroups.length,
    bombGroups
  };
}

/* ============================================================
 * ② 记牌器接入
 * ========================================================== */
function getPlayedCount(memory, rank) {
  if (!memory || !memory.playedCount) return 0;
  return memory.playedCount[rank] || 0;
}

function isEffectivelyMax(rank, kind, memory, currentLevel) {
  if (!memory) return false;
  if (rank === 16) return true;
  const totalOf = (r) => (r === 15 || r === 16) ? 2 : 8;
  const minNeeded = kind === 'pair' ? 2 : (kind === 'triple' ? 3 : 1);

  for (let r = rank + 1; r <= 16; r++) {
    if (r === 14 + 1) continue;
    const remaining = totalOf(r) - getPlayedCount(memory, r);
    if (remaining >= minNeeded) return false;
  }
  return true;
}

/* ============================================================
 * ⑧ 对手手牌推断
 * ========================================================== */

/** 判断"我们的出牌"是否无人能打过（基于记牌推断） */
function isMyPlayUnbeatable(play, memory, currentLevel, includeSequences = false) {
  if (!memory || !play || play.length === 0) return false;
  // 炸弹/同花顺：简化为"当前最强"（不考虑更大炸弹）
  if (looksLikeBomb(play)) return true;

  const ranks = play.map(c => c.rank);
  const maxRank = Math.max(...ranks);
  const len = play.length;
  // 单/对/三：检查是否还有更高同型牌
  const needed = len === 1 ? 1 : len === 2 ? 2 : len === 3 ? 3 : 0;
  if (needed > 0) {
    const totalOf = (r) => (r === 15 || r === 16) ? 4 : 8;
    for (let r = maxRank + 1; r <= 16; r++) {
      const played = memory.playedCount[r] || 0;
      const remaining = Math.max(0, totalOf(r) - played);
      if (remaining >= needed) return false;
    }
    return true;
  }

  // R10 增强：顺子序列无敌推断
  if (includeSequences) return isSequenceUnbeatable(play, memory, currentLevel);
  return false;
}

/**
 * R10 增强推断：纯顺子（无万能牌）是否已是场上最高、无人能跟
 * 思路：遍历所有可能"比我高"的同长度顺子，若每条都因某 rank 无牌而不可能，则我的顺子无敌。
 */
function isSequenceUnbeatable(play, memory, currentLevel) {
  if (!memory) return false;
  // 只处理纯顺子（不含万能牌，避免复杂情况）
  const wilds = play.filter(c => isWildCard(c, currentLevel));
  if (wilds.length > 0) return false;

  const sorted = [...play.map(c => c.rank)].sort((a, b) => a - b);
  const len = sorted.length;
  if (len < 5) return false; // 顺子至少 5 张

  // 验证是否连续
  for (let i = 1; i < len; i++) {
    if (sorted[i] !== sorted[i - 1] + 1) return false;
  }

  const startRank = sorted[0];

  // 枚举所有能打过我顺子的"更高起点"顺子
  for (let s = startRank + 1; s <= 14 - len + 1; s++) {
    let counterPossible = true;
    for (let r = s; r < s + len; r++) {
      const played = memory.playedCount[r] || 0;
      const remaining = 8 - played; // 每个普通 rank 共 8 张
      if (remaining <= 0) { counterPossible = false; break; }
    }
    if (counterPossible) return false; // 该反制顺子仍可能存在
  }
  return true; // 所有反制路径均已封死
}

/** 判断"桌面上对手出的牌"是否无人能打过（应该 PASS 省大牌） */
function isLastPlayUnbeatable(lastPlay, memory, currentLevel) {
  if (!memory || !lastPlay) return false;
  const kind = inferKind(lastPlay);
  // 只处理 single/pair/triple
  if (kind === 'other') return false;
  return isEffectivelyMax(lastPlay.mainRank, kind, memory, currentLevel);
}

/* ============================================================
 * ⑨ 信号传递
 * ========================================================== */

/** 根据自己的手牌强度，计算应该发出的信号 */
function computeMySignal(hand, decomp, currentLevel) {
  if (!hand || hand.length === 0) return Signal.NORMAL;
  const bombCount = decomp.bombGroups.length;
  const bigCards = hand.filter(c =>
    c.rank >= 13 || c.rank === currentLevel ||
    c.rank === 15 || c.rank === 16
  ).length;
  const ratio = bigCards / hand.length;
  const hasComplexGroup = decomp.groups.some(g =>
    g.kind === 'straight' || g.kind === 'double_straight' || g.kind === 'triple_straight'
  );

  if (bombCount >= 2 || ratio >= 0.4 || hasComplexGroup) return Signal.STRONG;
  if (ratio <= 0.1 && hand.length >= 10 && bombCount === 0) return Signal.WEAK;
  return Signal.NORMAL;
}

/** 读取队友最近出牌，解码其信号 */
function readTeammateSignal(gameState) {
  const { seat, roundHistory = [] } = gameState;
  if (!roundHistory.length) return Signal.NORMAL;
  const teammateSeat = (seat + 2) % 4;

  for (let i = roundHistory.length - 1; i >= 0; i--) {
    const record = roundHistory[i];
    if (record.seat !== teammateSeat) continue;
    const cards = record.cards || [];
    if (cards.length === 0) continue; // PASS 不计

    const maxRank = Math.max(...cards.map(c => c.rank));
    const isBombPlay = looksLikeBomb(cards);

    if (isBombPlay) return Signal.STRONG;                             // 炸弹 → 强
    if (cards.length >= 4) return Signal.STRONG;                      // 复杂牌型 → 强
    if (cards.length === 1 && maxRank <= 7) return Signal.WEAK;       // 小单张 → 弱
    if (cards.length === 1 && maxRank >= 14) return Signal.STRONG;    // 大单张(A) → 强
    return Signal.NORMAL;
  }
  return Signal.NORMAL;
}

/* ============================================================
 * ⑦ 级牌/万能牌工具函数
 * ========================================================== */
function hasWildCard(play, currentLevel) {
  return play.some(c => isWildCard(c, currentLevel));
}

function hasLevelCard(play, currentLevel) {
  return play.some(c => c.rank === currentLevel && !isWildCard(c, currentLevel));
}

/**
 * 过滤不必要使用级牌/万能牌的选项。
 * 仅在有替代方案时过滤；如果只有含级牌的选项，则不过滤。
 */
function filterLevelCardAbuse(plays, currentLevel, context = 'lead') {
  if (!plays || plays.length === 0) return plays;

  const withoutWild = plays.filter(p => !hasWildCard(p, currentLevel));
  // 万能牌：始终优先避免（除非只有含万能的选项）
  const candidates = withoutWild.length > 0 ? withoutWild : plays;

  if (context === 'lead') {
    // 领牌时：对子/单张不出级牌，除非无他选
    const withoutLevelSingle = candidates.filter(p =>
      !(p.length <= 2 && hasLevelCard(p, currentLevel))
    );
    return withoutLevelSingle.length > 0 ? withoutLevelSingle : candidates;
  }
  return candidates;
}

/* ============================================================
 * ③ 配合策略：判断是否应"主动让"
 * ========================================================== */
function shouldYieldToTeammate(gameState, hand, currentLevel) {
  const { isTeammateWinning, playersHandCounts = [], seat, lastPlay } = gameState;
  if (!isTeammateWinning) return false;
  if (!lastPlay) return false;

  const leftCount  = playersHandCounts[(seat + 3) % 4] || 27;
  const rightCount = playersHandCounts[(seat + 1) % 4] || 27;
  const opponentNearWin = (leftCount > 0 && leftCount <= 4) || (rightCount > 0 && rightCount <= 4);

  if (opponentNearWin) return false;    // 对手快赢 → 必须顶
  if (hand.length <= 5) return false;   // 自己也快赢 → 直接出

  // ⑨ 信号：队友示弱时，判断是否需要支援
  const tmSignal = readTeammateSignal(gameState);
  if (tmSignal === Signal.WEAK && hand.length <= 10) {
    // 队友示弱，自己手牌还行 → 不完全让路，保留一定主动权
    return false;
  }

  return true; // 其他场景：让出主动权
}

/* ============================================================
 * ④ 炸弹时机
 * ========================================================== */
function shouldUseBomb(gameState, hand, decomp, opponentNearWin, isResponding) {
  if (hand.length <= 6) return true;
  if (opponentNearWin) return true;
  if (decomp.tricksNeeded > 4) return false;
  if (decomp.tricksNeeded <= 3) return true;
  if (isResponding) return Math.random() < 0.15;
  return false;
}

/* ============================================================
 * ⑥ 残局解算器
 *   全场剩余 ≤28 张时启用：优先出"无敌牌型"，其次出张数最多的
 * ========================================================== */
function endgameSolve(hand, hints, gameState, currentLevel, memory) {
  const { playersHandCounts = [], seat } = gameState;
  const otherCount = playersHandCounts.reduce((s, c, i) => i === seat ? s : s + (c || 0), 0);
  const totalCards = otherCount + hand.length;
  if (totalCards > 28) return null; // 非残局

  if (!hints || hints.length === 0) return null;
  const normalHints = hints.filter(p => !looksLikeBomb(p));
  if (normalHints.length === 0) return null;

  // 优先：记牌推断的"无敌牌型"
  if (memory) {
    const unbeatable = normalHints.filter(p => isMyPlayUnbeatable(p, memory, currentLevel));
    if (unbeatable.length > 0) {
      // 选张数最多的无敌牌（一次清场更多）
      return unbeatable.sort((a, b) => b.length - a.length)[0];
    }
  }

  // 次优：张数最多，rank 最高（快速清场）
  return normalHints.sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;
    const rA = Math.max(...a.map(c => c.rank));
    const rB = Math.max(...b.map(c => c.rank));
    return rB - rA;
  })[0];
}

/* ============================================================
 * ⑤ 领牌评分
 *   综合考虑牌型难度 + 记牌推断 + 分组损失 + 级牌浪费 + rank
 * ========================================================== */
function scoreLeadPlay(play, hand, gameState, memory, decomp, currentLevel, fullUnbeatable = false, wildAware = false) {
  if (!play || play.length === 0) return -Infinity;
  let score = 0;
  const len = play.length;

  // 1. 牌型复杂度：对手越难跟，得分越高
  if (len >= 6) score += 45;        // 长钢板/长连对
  else if (len >= 5) score += 35;   // 顺子/连对
  else if (len === 4) score += 22;  // 三带一等
  else if (len === 3) score += 15;  // 三张
  else if (len === 2) score += 8;   // 对子
  // 单张 = 0

  // 2. 记牌推断：无敌牌优先打出，早出早占便宜（R10 开启时扩展至顺子推断）
  if (memory && isMyPlayUnbeatable(play, memory, currentLevel, fullUnbeatable)) {
    score += 55;
  }

  // 3. 不破坏分组：破坏越少越好
  const breakLoss = breakageLoss(hand, play, currentLevel, decomp);
  score -= breakLoss * 18;

  // 4. 万能牌扣分（R11启用时顺子中扣分较少，其他场合严格保护）
  const wildCount = play.filter(c => isWildCard(c, currentLevel)).length;
  const penaltyPerWild = (len >= 5 && wildAware) ? 35 : 90;
  score -= wildCount * penaltyPerWild;

  // 5. 普通级牌扣分（中等保护）
  const levelCount = play.filter(c => c.rank === currentLevel && !isWildCard(c, currentLevel)).length;
  score -= levelCount * 20;

  // 6. 平均 rank 越低越好（留大牌后手）
  const avgRank = play.reduce((s, c) => s + c.rank, 0) / len;
  score -= avgRank * 1.2;

  // 7. 出的张数越多越好（一次减少更多手数）
  score += len * 4;

  return score;
}

/* ============================================================
 * R11 万能牌感知拆牌
 * ========================================================== */

/**
 * 尝试利用万能牌填补顺子缺口，返回比贪心分组更优的结果（手数更少），
 * 或原始贪心结果（若无改善）。
 */
function decomposeHandWildAware(hand, currentLevel) {
  const wilds = hand.filter(c => isWildCard(c, currentLevel));
  if (wilds.length === 0) return decomposeHand(hand, currentLevel);

  const baseline = decomposeHand(hand, currentLevel);
  const improved = tryFormStraightWithWilds(hand, wilds, currentLevel);
  if (improved && improved.tricksNeeded < baseline.tricksNeeded) return improved;
  return baseline;
}

/**
 * 在手牌中找最有潜力的 5 张顺子窗口，用万能牌填补缺口后形成顺子，
 * 返回新的完整分组；若无有效改善则返回 null。
 */
function tryFormStraightWithWilds(hand, wilds, currentLevel) {
  const wildCount = wilds.length;
  const regulars  = hand.filter(c => !isWildCard(c, currentLevel));

  // rank → 可用非万能牌列表
  const rankMap = {};
  for (const c of regulars) {
    if (!rankMap[c.rank]) rankMap[c.rank] = [];
    rankMap[c.rank].push(c);
  }

  // 找缺口最少（且 ≤ wildCount）的 5 连区间
  let bestStart = -1, bestGaps = wildCount + 1;
  for (let r = 2; r <= 10; r++) {
    let gaps = 0, hasAny = false;
    for (let i = 0; i < 5; i++) {
      if ((rankMap[r + i] || []).length > 0) hasAny = true;
      else gaps++;
    }
    if (hasAny && gaps > 0 && gaps <= wildCount && gaps < bestGaps) {
      bestGaps = gaps; bestStart = r;
    }
  }
  if (bestStart < 0) return null;

  // 组成顺子：有牌用牌，缺口用万能
  const straightCards = [];
  let wildIdx = 0;
  for (let i = 0; i < 5; i++) {
    const rank = bestStart + i;
    const pool = rankMap[rank] || [];
    if (pool.length > 0) {
      straightCards.push(pool.shift());
    } else {
      straightCards.push(wilds[wildIdx++]);
    }
  }

  // 剩余牌 → 继续贪心分组
  const usedIds = new Set(straightCards.map(c => c.id));
  const remaining = hand.filter(c => !usedIds.has(c.id));
  const restDecomp = decomposeHand(remaining, currentLevel);

  return {
    groups: [{ kind: 'straight', rank: bestStart, cards: straightCards }, ...restDecomp.groups],
    tricksNeeded: 1 + restDecomp.tricksNeeded,
    bombGroups: restDecomp.bombGroups,
  };
}

/* ============================================================
 * R10 形势感知领牌加成
 * ========================================================== */

/**
 * 在 R9 基础评分之上叠加局势动态因子：
 *   · 游戏阶段（终局时鼓励多张组合快速清场）
 *   · 对手快赢（仅出"无敌牌"；弱牌则扣分）
 *   · 护送队友（队友手牌少时，出多张复杂牌拦截对手跟牌）
 */
function adaptiveLeadBonus(play, hand, gameState, memory, currentLevel, opponentNearWin) {
  let delta = 0;
  const { playersHandCounts = [], seat } = gameState;
  const teammateSeat  = (seat + 2) % 4;
  const teammateCount = playersHandCounts[teammateSeat] || 27;

  // 全场剩余牌数 → 游戏进度（0=开局，1=终局）
  const totalLeft    = playersHandCounts.reduce((s, c) => s + (c || 0), 0) + hand.length;
  const gameProgress = Math.max(0, 1 - totalLeft / 108);

  // 终局加速：每多打一张额外得分
  delta += gameProgress * play.length * 4;

  // 对手快赢：无敌牌 +50，弱牌 -35
  if (opponentNearWin) {
    const unbeatable = memory && isMyPlayUnbeatable(play, memory, currentLevel);
    delta += unbeatable ? 50 : -35;
  }

  // 护送队友：队友手牌 ≤8 时，多张牌型更难跟，加分
  if (teammateCount > 0 && teammateCount <= 8) {
    delta += (play.length - 1) * 6;
  }

  return delta;
}

/* ============================================================
 * 主决策入口
 * ========================================================== */
export function getAIDecision(hand, gameState, level = AILevel.NORMAL, skillProfile = null) {
  const { lastPlay, currentLevel, roomId, seat } = gameState;
  const hints = findPlayableHands(hand, lastPlay, currentLevel);
  if (hints.length === 0) return null;

  const mustPlay = !lastPlay;

  // 若未显式传入 skillProfile，则从 level 推导（向后兼容）
  const profile = skillProfile ?? profileFromLevel(level);

  let memory = null;
  if (roomId !== undefined && (level === AILevel.NORMAL || level === AILevel.EXPERT)) {
    try { memory = getMemory(roomId, seat, level, currentLevel); } catch (e) { memory = null; }
  }
  // R11：万能牌感知拆牌（比贪心更优；R11 未启用时退回标准分组）
  const decompFn = has(profile, SKILLS.R11) ? decomposeHandWildAware : decomposeHand;
  const ctx = { ...gameState, _memory: memory, _decomp: decompFn(hand, currentLevel) };

  let decision;
  if (level === AILevel.NOOB && profile.size === 0) {
    decision = decideNoob(hints, mustPlay);
  } else {
    decision = decideStrategic(hints, hand, ctx, mustPlay, profile);
  }
  if (mustPlay && !decision) return hints[0];
  return decision;
}

/* ============================================================
 * NOOB：保持简单，30% 故意不出
 * ========================================================== */
function decideNoob(hints, mustPlay = false) {
  if (!mustPlay && Math.random() < 0.3) return null;
  return hints[Math.floor(Math.random() * hints.length)];
}

/* ============================================================
 * 核心：策略型决策（NORMAL 与 EXPERT 共用）
 * ========================================================== */
function decideStrategic(hints, hand, gameState, mustPlay, profile) {
  const {
    lastPlay, currentLevel, seat,
    playersHandCounts = [],
    _memory: memory,
    _decomp: myDecomp
  } = gameState;

  const teammateSeat = (seat + 2) % 4;
  const leftSeat  = (seat + 3) % 4;
  const rightSeat = (seat + 1) % 4;
  const teammateCount = playersHandCounts[teammateSeat] || 27;
  const leftCount  = playersHandCounts[leftSeat]  || 27;
  const rightCount = playersHandCounts[rightSeat] || 27;
  const opponentNearWin = (leftCount > 0 && leftCount <= 5) || (rightCount > 0 && rightCount <= 5);

  // ③ R1 配合：让出主动权（全量）
  if (has(profile, SKILLS.R1) && shouldYieldToTeammate(gameState, hand, currentLevel) && !mustPlay) {
    logSkill(gameState._trace, 'R1', '队友领牌且强势，主动让路（PASS）');
    return null;
  }
  // R1 缺失时：退化为概率让路
  if (!has(profile, SKILLS.R1) && gameState.isTeammateWinning && !mustPlay && Math.random() < 0.5) return null;

  const sorted = [...hints].sort((a, b) =>
    evalCardsCost(a, currentLevel) - evalCardsCost(b, currentLevel)
  );
  const normalPlays = sorted.filter(p => !looksLikeBomb(p));
  const bombs = sorted.filter(p => looksLikeBomb(p));

  // ============= 领牌 =============
  if (!lastPlay) {
    return chooseLeading(normalPlays, bombs, hand, myDecomp, gameState, profile, opponentNearWin, memory);
  }

  // ============= 跟牌 =============
  // R1：精确判断队友是否在领牌（没有 R1 时不认为队友领牌，不会主动让）
  const teammateLeading = has(profile, SKILLS.R1) && gameState.isTeammateWinning;

  // 生死关头：对手快赢
  if (opponentNearWin && !teammateLeading) {
    if (bombs.length > 0 && shouldUseBomb(gameState, hand, myDecomp, true, true)) {
      return bombs[0];
    }
    if (normalPlays.length > 0) return normalPlays[normalPlays.length - 1];
  }

  if (normalPlays.length > 0) {
    let candidate = normalPlays[0];

    // ⑧ R6 对手推断（增强版）：桌面牌无敌 → 更主动地 PASS
    if (has(profile, SKILLS.R6) && memory && lastPlay && !opponentNearWin && !teammateLeading) {
      if (isLastPlayUnbeatable(lastPlay, memory, currentLevel)) {
        const cost = evalCardsCost(candidate, currentLevel);
        const avgCost = cost / candidate.length;
        if (cost >= 50 || avgCost >= 15) {
          logSkill(gameState._trace, 'R6', '推断桌面牌已无敌（无人能压），跟牌成本高 → PASS');
          return null;
        }
      }
    }

    // ② R4 记牌推断：lastPlay 是实际最大
    if (has(profile, SKILLS.R4) && memory && lastPlay && !opponentNearWin) {
      const lastKind = inferKind(lastPlay);
      if (isEffectivelyMax(lastPlay.mainRank, lastKind, memory, currentLevel)) {
        const cost = evalCardsCost(candidate, currentLevel);
        if (cost >= 100) {
          logSkill(gameState._trace, 'R4', '记牌推断桌面已是最大，跟牌成本太高 → PASS');
          return null;
        }
      }
    }

    // ⑦ R5 万能牌 / 级牌保护
    if (has(profile, SKILLS.R5) && !opponentNearWin && hand.length > 5) {
      if (hasWildCard(candidate, currentLevel) && lastPlay && lastPlay.mainRank < 11) {
        const nonWild = normalPlays.filter(p => !hasWildCard(p, currentLevel));
        if (nonWild.length > 0) return nonWild[0];
        return null;
      }
      if (hasLevelCard(candidate, currentLevel) && lastPlay && lastPlay.mainRank < 8) {
        const nonLevel = normalPlays.filter(p => !hasLevelCard(p, currentLevel));
        if (nonLevel.length > 0) {
          candidate = nonLevel[0];
        } else {
          return null;
        }
      }
    }

    // ① R3 拆牌质量：尝试找破坏性更低的替代
    if (has(profile, SKILLS.R3) && hand.length > 8) {
      const breakLoss = breakageLoss(hand, candidate, currentLevel, myDecomp);
      for (const alt of normalPlays.slice(0, 5)) {
        const altLoss = breakageLoss(hand, alt, currentLevel, myDecomp);
        if (altLoss < breakLoss && evalCardsCost(alt, currentLevel) <= evalCardsCost(candidate, currentLevel) * 1.3) {
          candidate = alt;
          logSkill(gameState._trace, 'R3', `拆牌优化：换成破坏性更低的替代选项（loss ${breakLoss}→${altLoss}）`);
          break;
        }
      }
    }

    // R12 忍牌保型：R3 优化后仍高破坏且场面不紧急 → 不出（保留手型等好机会）
    if (has(profile, SKILLS.R12) && !mustPlay && !opponentNearWin && !teammateLeading && hand.length > 8) {
      if (lastPlay && lastPlay.mainRank < 10) {
        const loss = breakageLoss(hand, candidate, currentLevel, myDecomp);
        if (loss >= 2) {
          logSkill(gameState._trace, 'R12', `忍牌保型：跟牌会破坏 ${loss} 个手型组合且场面不紧急 → PASS`);
          return null;
        }
      }
    }

    // R14 顺子保护：跟牌出顺子/连对时，只要有破坏（loss≥1）且场面不紧急，选择不出
    // （顺子比对子难重建，容忍度更低）
    if (has(profile, SKILLS.R14) && !mustPlay && !opponentNearWin && !teammateLeading && hand.length > 8) {
      if (candidate.length >= 5) {
        const cType = classifyHand(candidate, currentLevel).type;
        if (cType === HandType.STRAIGHT || cType === HandType.DOUBLE_STRAIGHT) {
          const loss = breakageLoss(hand, candidate, currentLevel, myDecomp);
          if (loss >= 1) return null;
        }
      }
    }

    // R15 三张保护：跟牌出三张会破坏三带二组合时，选择不出
    if (has(profile, SKILLS.R15) && !mustPlay && !opponentNearWin && !teammateLeading && hand.length > 8) {
      if (candidate.length === 3) {
        const cType = classifyHand(candidate, currentLevel).type;
        if (cType === HandType.TRIPLE) {
          const loss = breakageLoss(hand, candidate, currentLevel, myDecomp);
          if (loss >= 1) return null;
        }
      }
    }

    const value = evalCardsCost(candidate, currentLevel);
    const avgVal = value / candidate.length;
    if (value >= 100 && !opponentNearWin && hand.length > 5) return null;
    if (lastPlay && lastPlay.mainRank < 10 && avgVal >= 20 && !opponentNearWin && hand.length > 10) return null;

    return candidate;
  }

  // ④ R2 炸弹时机：队友领牌时永远不动炸弹
  if (bombs.length > 0 && !teammateLeading && shouldUseBomb(gameState, hand, myDecomp, opponentNearWin, true)) {
    // R2 缺失时：随机用炸弹（退化行为）
    if (has(profile, SKILLS.R2)) {
      logSkill(gameState._trace, 'R2', `炸弹时机：${opponentNearWin ? '对手快赢，紧急拦截' : '残局优势'} → 出炸弹`);
      return bombs[0];
    }
    if (Math.random() < 0.2) return bombs[0];
  }
  return null;
}

/* ============================================================
 * ⑤⑥⑦⑨ 领牌策略（全面重写）
 * ========================================================== */
function chooseLeading(normalPlays, bombs, hand, decomp, gameState, profile, opponentNearWin, memory) {
  const { currentLevel, seat, playersHandCounts = [] } = gameState;
  const teammateSeat = (seat + 2) % 4;
  const teammateCount = playersHandCounts[teammateSeat] || 27;
  const rightCount = playersHandCounts[(seat + 1) % 4] || 27;
  const leftCount  = playersHandCounts[(seat + 3) % 4] || 27;

  // ④ R2 炸弹结束：手牌 ≤6 且剩1手就是炸弹
  if (has(profile, SKILLS.R2) && hand.length <= 6 && decomp.tricksNeeded <= 1 && bombs.length > 0) {
    logSkill(gameState._trace, 'R2', '残局炸弹结束：手牌≤6 且剩1手即可清光，直接出炸弹');
    return bombs[0];
  }

  // ③ R1 队友只剩 ≤5 张：清场护送，出最难跟的牌压住对手
  if (has(profile, SKILLS.R1) && teammateCount > 0 && teammateCount <= 5 && normalPlays.length > 0) {
    const difficult = [...normalPlays].sort((a, b) => {
      if (b.length !== a.length) return b.length - a.length;
      return Math.max(...b.map(c => c.rank)) - Math.max(...a.map(c => c.rank));
    });
    logSkill(gameState._trace, 'R1', `护送清场：队友只剩 ${teammateCount} 张，出最难跟的牌压住对手`);
    return difficult[0];
  }

  // 对手快赢：出"无敌牌"或"最大张数"
  // R10 在此路径下也启用扩展序列推断
  const fullUnbeatable = has(profile, SKILLS.R10);
  if (opponentNearWin && normalPlays.length > 0) {
    // R6 / R10：记牌推断无敌牌（R10 额外覆盖顺子）
    if ((has(profile, SKILLS.R6) || fullUnbeatable) && memory) {
      const unbeatable = normalPlays.filter(p => isMyPlayUnbeatable(p, memory, currentLevel, fullUnbeatable));
      if (unbeatable.length > 0) return unbeatable.sort((a, b) => b.length - a.length)[0];
    }
    return normalPlays[normalPlays.length - 1];
  }

  // 没有任何高级领牌技能：退化为简单按成本出最低的
  if (!hasAnyAdvancedLead(profile)) {
    return normalPlays[0] || bombs[0];
  }

  // ⑦ R5 级牌/万能牌保护：过滤不必要使用级牌的选项
  const filteredPlays = has(profile, SKILLS.R5)
    ? filterLevelCardAbuse(normalPlays, currentLevel, 'lead')
    : normalPlays;

  // ⑥ R8 残局解算器优先
  if (has(profile, SKILLS.R8)) {
    const endgamePlay = endgameSolve(hand, filteredPlays, gameState, currentLevel, memory);
    if (endgamePlay) {
      logSkill(gameState._trace, 'R8', '残局解算：全场剩牌少，找到一个无敌牌型');
      return endgamePlay;
    }
  }

  // ⑤⑨ R9 + R7 出牌评分 + 信号编码
  if (filteredPlays.length > 0) {
    // R7 信号：弱势信号 → 出最小单张告知队友"我很弱"
    if (has(profile, SKILLS.R7)) {
      const signal = computeMySignal(hand, decomp, currentLevel);
      if (signal === Signal.WEAK) {
        const singles = filteredPlays.filter(p => p.length === 1);
        if (singles.length > 0) {
          return singles.sort((a, b) => a[0].rank - b[0].rank)[0];
        }
      }

      if (has(profile, SKILLS.R9)) {
        // R9 + R10 评分排序（R10: 扩展无敌推断 + 形势感知加成）
        const wildAware = has(profile, SKILLS.R11);
        const exitPlan = has(profile, SKILLS.R13) && decomp.tricksNeeded <= 3 && memory;
        const scored = filteredPlays.map(p => {
          let score = scoreLeadPlay(p, hand, gameState, memory, decomp, currentLevel, fullUnbeatable, wildAware);
          if (fullUnbeatable) {
            score += adaptiveLeadBonus(p, hand, gameState, memory, currentLevel, opponentNearWin);
          }
          // R13 出口规划：快要赢时，偏好能留下无敌下一手的出法
          if (exitPlan) {
            const remaining = hand.filter(c => !p.includes(c));
            if (remaining.length === 0) {
              score += 80; // 此牌打出即清手
            } else {
              const nxtHints = findPlayableHands(remaining, null, currentLevel)
                .filter(np => !looksLikeBomb(np));
              if (nxtHints.some(np => isMyPlayUnbeatable(np, memory, currentLevel, true))) {
                score += 30; // 下一步有无敌牌型 → 优先走此路
              }
            }
          }
          return { play: p, score };
        }).sort((a, b) => b.score - a.score);

        // R7 强势信号：前3中有复杂牌型优先
        if (signal === Signal.STRONG) {
          const top3 = scored.slice(0, 3);
          const complex = top3.find(s => s.play.length >= 4);
          if (complex) {
            logSkill(gameState._trace, 'R9', `领牌评分：${scored.length} 个候选评分排序后选最高分`);
            logSkill(gameState._trace, 'R7', '强势信号：top3 中有复杂牌型 → 优先打复杂牌');
            return complex.play;
          }
        }
        logSkill(gameState._trace, 'R9', `领牌评分：${scored.length} 个候选评分排序后选最高分（top: ${scored[0].score.toFixed(0)}）`);
        if (exitPlan) logSkill(gameState._trace, 'R13', '出口规划：剩 ≤3 手，加权偏好能留无敌后手的出法');
        return scored[0].play;
      }
    }

    // 只有 R9（±R10，无 R7）：纯评分排序
    if (has(profile, SKILLS.R9)) {
      const wildAware = has(profile, SKILLS.R11);
      const exitPlan = has(profile, SKILLS.R13) && decomp.tricksNeeded <= 3 && memory;
      const scored = filteredPlays.map(p => {
        let score = scoreLeadPlay(p, hand, gameState, memory, decomp, currentLevel, fullUnbeatable, wildAware);
        if (fullUnbeatable) {
          score += adaptiveLeadBonus(p, hand, gameState, memory, currentLevel, opponentNearWin);
        }
        // R13 出口规划
        if (exitPlan) {
          const remaining = hand.filter(c => !p.includes(c));
          if (remaining.length === 0) {
            score += 80;
          } else {
            const nxtHints = findPlayableHands(remaining, null, currentLevel)
              .filter(np => !looksLikeBomb(np));
            if (nxtHints.some(np => isMyPlayUnbeatable(np, memory, currentLevel, true))) {
              score += 30;
            }
          }
        }
        return { play: p, score };
      }).sort((a, b) => b.score - a.score);
      logSkill(gameState._trace, 'R9', `领牌评分（无 R7 信号）：${scored.length} 个候选选最高分（top: ${scored[0].score.toFixed(0)}）`);
      if (exitPlan) logSkill(gameState._trace, 'R13', '出口规划：剩 ≤3 手，加权偏好能留无敌后手的出法');
      return scored[0].play;
    }

    // 只有 R5/R6/R8 但无评分：用过滤后的结果按成本最低
    return filteredPlays[0];
  }

  // 兜底
  return normalPlays[0] || bombs[0];
}

/* ============================================================
 * 工具函数
 * ========================================================== */
function evalCardsCost(cards, currentLevel) {
  let total = 0;
  for (const card of cards) {
    if (isWildCard(card, currentLevel)) total += 100;
    else if (card.rank === currentLevel) total += 25;
    else if (card.rank === 16) total += 40;
    else if (card.rank === 15) total += 35;
    else total += getNormalizedRank(card.rank, currentLevel);
  }
  return total;
}

function looksLikeBomb(cards) {
  if (cards.length < 4) return false;
  const ranks = cards.map(c => c.rank);
  // 同 rank 炸弹
  if (ranks.every(r => r === ranks[0])) return true;
  // 天王炸（4 王）
  if (cards.length === 4 && cards.every(c => c.rank === 15 || c.rank === 16)) return true;
  // 同花顺（5 张相同花色连续）
  if (cards.length >= 5) {
    const suits = cards.map(c => c.suit);
    if (suits.every(s => s === suits[0])) {
      const sr = [...ranks].sort((a, b) => a - b);
      let isStraight = true;
      for (let i = 1; i < sr.length; i++) {
        if (sr[i] !== sr[i - 1] + 1) { isStraight = false; break; }
      }
      if (isStraight) return true;
    }
  }
  return false;
}

function inferKind(lastPlay) {
  if (!lastPlay || !lastPlay.type) return 'single';
  switch (lastPlay.type) {
    case HandType.SINGLE: return 'single';
    case HandType.PAIR:   return 'pair';
    case HandType.TRIPLE: return 'triple';
    default: return 'other';
  }
}

/**
 * 评估"出 candidate 后，剩余手牌的拆牌质量损失"
 */
function breakageLoss(hand, candidate, currentLevel, baseDecomp) {
  if (!candidate || candidate.length === 0) return 0;
  const removeIds = new Set(candidate.map(c => c.id));
  const remaining = hand.filter(c => !removeIds.has(c.id));
  const newDecomp = decomposeHand(remaining, currentLevel);
  const expected = baseDecomp.tricksNeeded - 1;
  return Math.max(0, newDecomp.tricksNeeded - expected);
}

/* ============================================================
 * 包装：Practice NPC 决策
 * ========================================================== */
export function getPracticeNPCDecision(hand, gameState, level = AILevel.NORMAL, seat = 0, skillProfile = null) {
  // P1 任务：创建 trace 数组，通过 _trace 字段传入决策路径
  // 内部函数（decideStrategic / chooseLeading 等）可通过 ctx._trace 直接 push 技能记录
  const trace = [];
  const augmentedGameState = { ...gameState, _trace: trace };
  const play = getAIDecision(hand, augmentedGameState, level, skillProfile);
  const action = play ? 'PLAY' : 'PASS';
  const primaryReason = inferPrimaryReason(action, play, gameState, seat);
  const decisionLog = createDecisionLog(action, play, primaryReason, [], trace);
  return { play, decisionLog };
}
