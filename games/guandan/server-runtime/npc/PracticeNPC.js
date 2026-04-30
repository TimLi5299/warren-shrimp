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
import { createDecisionLog, inferPrimaryReason } from './NPCDecisionLog.js';
import { getMemory } from '../game/llm_ai.js';
import { SKILLS, profileFromLevel } from './SkillProfiles.js';

/** 工具：判断 profile 是否包含某项技能 */
const has = (profile, skill) => profile.has(skill);

/** 判断 profile 是否包含任意一项"高级领牌"技能（R5-R9） */
function hasAnyAdvancedLead(profile) {
  return has(profile, SKILLS.R5) || has(profile, SKILLS.R6) ||
         has(profile, SKILLS.R7) || has(profile, SKILLS.R8) || has(profile, SKILLS.R9);
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
function isMyPlayUnbeatable(play, memory, currentLevel) {
  if (!memory || !play || play.length === 0) return false;
  // 炸弹/同花顺：简化为"当前最强"（不考虑更大炸弹）
  if (looksLikeBomb(play)) return true;

  const ranks = play.map(c => c.rank);
  const maxRank = Math.max(...ranks);
  const len = play.length;
  // 只对简单牌型做推断（单/对/三），复杂牌型略过
  const needed = len === 1 ? 1 : len === 2 ? 2 : len === 3 ? 3 : 0;
  if (needed === 0) return false;

  const totalOf = (r) => (r === 15 || r === 16) ? 4 : 8;
  for (let r = maxRank + 1; r <= 16; r++) {
    const played = memory.playedCount[r] || 0;
    const remaining = Math.max(0, totalOf(r) - played);
    if (remaining >= needed) return false; // 还有人可能跟上
  }
  return true; // 没有更高 rank 的同型牌了
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
function scoreLeadPlay(play, hand, gameState, memory, decomp, currentLevel) {
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

  // 2. 记牌推断：无敌牌优先打出，早出早占便宜
  if (memory && isMyPlayUnbeatable(play, memory, currentLevel)) {
    score += 55;
  }

  // 3. 不破坏分组：破坏越少越好
  const breakLoss = breakageLoss(hand, play, currentLevel, decomp);
  score -= breakLoss * 18;

  // 4. 万能牌扣分（永远不轻易出）
  const wildCount = play.filter(c => isWildCard(c, currentLevel)).length;
  score -= wildCount * 90;

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
  const ctx = { ...gameState, _memory: memory, _decomp: decomposeHand(hand, currentLevel) };

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
        if (cost >= 50 || avgCost >= 15) return null;
      }
    }

    // ② R4 记牌推断：lastPlay 是实际最大
    if (has(profile, SKILLS.R4) && memory && lastPlay && !opponentNearWin) {
      const lastKind = inferKind(lastPlay);
      if (isEffectivelyMax(lastPlay.mainRank, lastKind, memory, currentLevel)) {
        const cost = evalCardsCost(candidate, currentLevel);
        if (cost >= 100) return null;
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
          break;
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
    if (has(profile, SKILLS.R2) || Math.random() < 0.2) return bombs[0];
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
    return bombs[0];
  }

  // ③ R1 队友只剩 ≤5 张：清场护送，出最难跟的牌压住对手
  if (has(profile, SKILLS.R1) && teammateCount > 0 && teammateCount <= 5 && normalPlays.length > 0) {
    const difficult = [...normalPlays].sort((a, b) => {
      if (b.length !== a.length) return b.length - a.length;
      return Math.max(...b.map(c => c.rank)) - Math.max(...a.map(c => c.rank));
    });
    return difficult[0];
  }

  // 对手快赢：出"无敌牌"或"最大张数"
  if (opponentNearWin && normalPlays.length > 0) {
    // R6：记牌推断无敌牌
    if (has(profile, SKILLS.R6) && memory) {
      const unbeatable = normalPlays.filter(p => isMyPlayUnbeatable(p, memory, currentLevel));
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
    if (endgamePlay) return endgamePlay;
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
        // R9 评分排序
        const scored = filteredPlays.map(p => ({
          play: p,
          score: scoreLeadPlay(p, hand, gameState, memory, decomp, currentLevel)
        })).sort((a, b) => b.score - a.score);

        // R7 强势信号：前3中有复杂牌型优先
        if (signal === Signal.STRONG) {
          const top3 = scored.slice(0, 3);
          const complex = top3.find(s => s.play.length >= 4);
          if (complex) return complex.play;
        }
        return scored[0].play;
      }
    }

    // 只有 R9（无 R7）：纯评分排序
    if (has(profile, SKILLS.R9)) {
      const scored = filteredPlays.map(p => ({
        play: p,
        score: scoreLeadPlay(p, hand, gameState, memory, decomp, currentLevel)
      })).sort((a, b) => b.score - a.score);
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
  const play = getAIDecision(hand, gameState, level, skillProfile);
  const action = play ? 'PLAY' : 'PASS';
  const primaryReason = inferPrimaryReason(action, play, gameState, seat);
  const decisionLog = createDecisionLog(action, play, primaryReason);
  return { play, decisionLog };
}
