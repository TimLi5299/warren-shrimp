/**
 * PracticeNPC.js — 陪练NPC（增强规则AI v2）
 *
 * 在原贪心算法基础上引入 4 个改进（路径 A · Quick Wins）：
 *   ① 手牌预分解：决策前先把手牌拆成最优组合，从"少分组"角度选择出牌
 *   ② 记牌器接入：根据已出牌推断每个 rank 的实际剩余 / 实际最大值
 *   ③ 配合策略升级：队友领牌主动让；队友手牌少时用大牌护送；上家是队友的小牌不顶
 *   ④ 炸弹时机重做：基于"出完所需手数"决定是否动用炸弹，端局不留炸弹
 */

import { findPlayableHands } from '../game/rules.js';
import { isWildCard, classifyHand, isBomb as isBombType, HandType } from '../game/handClassifier.js';
import { getNormalizedRank } from '../game/deck.js';
import { createDecisionLog, inferPrimaryReason } from './NPCDecisionLog.js';
import { getMemory } from '../game/llm_ai.js';

export const AILevel = {
  NOOB: 'noob',
  NORMAL: 'normal',
  EXPERT: 'expert'
};

/* ============================================================
 * Quick Win ① 手牌预分解
 *   贪心：依次找最大的炸弹/同花顺 → 钢板 → 顺子/连对 → 三带二 → 三 → 对 → 单
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

  // 2) 找天王炸（4 王）— 实际由两副牌的两小王 + 两大王组成
  const jokers = pool.filter(c => c.rank === 15 || c.rank === 16);
  if (jokers.length === 4) {
    pool = pool.filter(c => c.rank !== 15 && c.rank !== 16);
    groups.push({ kind: 'rocket', rank: 99, cards: jokers });
    bombGroups.push({ rank: 99, size: 4 });
  }

  // 3) 找钢板（连续 2 个三张）
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
    const len = Math.min(bestLen, 5); // 一次取 5 张顺子
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

  // 三带二组合：把孤立三张和孤立对子合并为 triple_pair（出 5 张一手）
  // 简化：仅当存在 1 个三张 + 1 个对子时合并为一手
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
 * Quick Win ② 记牌器接入
 *   countPlayed: 已出该 rank 的张数（双副牌每个 rank 共 8 张）
 *   isMaxRank: rank 是否实际最大（所有更大的牌都打掉了）
 * ========================================================== */
function getPlayedCount(memory, rank) {
  if (!memory || !memory.playedCount) return 0;
  return memory.playedCount[rank] || 0;
}

/**
 * 根据记牌器，判断 rank 是否在剩下的牌里是"实际最大"
 * 对于 single/pair/triple，需要更大的同型牌都不存在
 */
function isEffectivelyMax(rank, kind, memory, currentLevel) {
  if (!memory) return false;
  // 大王（rank=16）永远封顶
  if (rank === 16) return true;
  // 总池：2 副牌每个 rank 共 8 张（王每副只有 1 张，王共 4 张）
  const totalOf = (r) => (r === 15 || r === 16) ? 2 : 8;
  const minNeeded = kind === 'pair' ? 2 : (kind === 'triple' ? 3 : 1);

  // 检查比 rank 高的所有 rank（包括级牌、大小王）是否还能凑出对应张数
  // 在掼蛋里 rank 顺序：2..A(14) -> 小王(15) -> 大王(16)，级牌逻辑略复杂这里简化
  for (let r = rank + 1; r <= 16; r++) {
    if (r === 14 + 1) continue; // 跳过 15 等（实际是小王）
    const remaining = totalOf(r) - getPlayedCount(memory, r);
    if (remaining >= minNeeded) return false;
  }
  return true;
}

/* ============================================================
 * Quick Win ③ 配合策略：判断是否应"主动让"
 *
 * 策略：队友是 lastPlaySeat 时，几乎总是让。
 * 唯一例外：自己也快赢（≤5 张可以一手出完）或对手快赢（必须顶）。
 * ========================================================== */
function shouldYieldToTeammate(gameState, hand, currentLevel) {
  const { isTeammateWinning, playersHandCounts = [], seat, lastPlay } = gameState;
  if (!isTeammateWinning) return false;
  if (!lastPlay) return false; // 自己领牌不可让

  const leftCount  = playersHandCounts[(seat + 3) % 4] || 27;
  const rightCount = playersHandCounts[(seat + 1) % 4] || 27;
  const opponentNearWin = (leftCount > 0 && leftCount <= 4) || (rightCount > 0 && rightCount <= 4);

  // 对手快赢（≤4 张）→ 必须顶，不能让
  if (opponentNearWin) return false;
  // 自己手牌 ≤5 且能一手出完 → 自己赢比让队友更直接
  if (hand.length <= 5) return false;
  // 其他场景：队友打牌就让，不要去顶
  return true;
}

/* ============================================================
 * Quick Win ④ 炸弹时机：是否值得动用炸弹
 * ========================================================== */
function shouldUseBomb(gameState, hand, decomp, opponentNearWin, isResponding) {
  // 端局：手牌很少 + 还有炸弹，倾向直接打出去结束
  if (hand.length <= 6) return true;
  // 对手快赢 → 必须打
  if (opponentNearWin) return true;
  // 出完所需手数还多 (>4)，留炸弹做控制权
  if (decomp.tricksNeeded > 4) return false;
  // 自己 endgame，剩 2-3 手能出完，炸弹可上
  if (decomp.tricksNeeded <= 3) return true;
  // 中段：跟牌时不轻易上炸（领牌时本来就不会触发这个分支）
  if (isResponding) return Math.random() < 0.15;
  return false;
}

/* ============================================================
 * 主决策入口
 * ========================================================== */
export function getAIDecision(hand, gameState, level = AILevel.NORMAL) {
  const { lastPlay, currentLevel, roomId, seat } = gameState;
  const hints = findPlayableHands(hand, lastPlay, currentLevel);
  if (hints.length === 0) return null;

  const mustPlay = !lastPlay;

  // 取记牌器（仅 normal/expert 启用）
  let memory = null;
  if (roomId !== undefined && (level === AILevel.NORMAL || level === AILevel.EXPERT)) {
    try { memory = getMemory(roomId, seat, level, currentLevel); } catch (e) { memory = null; }
  }
  const ctx = { ...gameState, _memory: memory, _decomp: decomposeHand(hand, currentLevel) };

  let decision;
  switch (level) {
    case AILevel.NOOB:    decision = decideNoob(hints, mustPlay); break;
    case AILevel.EXPERT:  decision = decideStrategic(hints, hand, ctx, mustPlay, true); break;
    case AILevel.NORMAL:
    default:              decision = decideStrategic(hints, hand, ctx, mustPlay, false); break;
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
 * 核心：策略型决策（NORMAL 与 EXPERT 共用，差别只在是否启用记牌+合作高级特性）
 * ========================================================== */
function decideStrategic(hints, hand, gameState, mustPlay, full) {
  const { lastPlay, currentLevel, seat, playersHandCounts = [], _memory: memory, _decomp: myDecomp } = gameState;

  const teammateSeat = (seat + 2) % 4;
  const leftSeat = (seat + 3) % 4;
  const rightSeat = (seat + 1) % 4;
  const teammateCount = playersHandCounts[teammateSeat] || 27;
  const leftCount  = playersHandCounts[leftSeat]  || 27;
  const rightCount = playersHandCounts[rightSeat] || 27;
  const opponentNearWin = (leftCount > 0 && leftCount <= 5) || (rightCount > 0 && rightCount <= 5);

  // ============= ③ 配合：让出主动权 =============
  if (full && shouldYieldToTeammate(gameState, hand, currentLevel) && !mustPlay) {
    return null;
  }
  // 简单版：normal 也有基础让 (50%)
  if (!full && gameState.isTeammateWinning && !mustPlay && Math.random() < 0.5) return null;

  // 候选按"成本"排序（成本低 = 优先打）
  const sorted = [...hints].sort((a, b) =>
    evalCardsCost(a, currentLevel) - evalCardsCost(b, currentLevel)
  );
  const normalPlays = sorted.filter(p => !looksLikeBomb(p));
  const bombs = sorted.filter(p => looksLikeBomb(p));

  // ============= 领牌（lastPlay === null）=============
  if (!lastPlay) {
    return chooseLeading(normalPlays, bombs, hand, myDecomp, gameState, full, opponentNearWin);
  }

  // ============= 跟牌 =============
  // 双重保险：即使 yield 通过了也再过一遍——队友领出绝不用炸弹
  // （shouldYieldToTeammate 已在上面 return null，但防御性编程）
  const teammateLeading = full && gameState.isTeammateWinning;

  // 生死关头：对手快赢
  if (opponentNearWin && !teammateLeading) {
    if (bombs.length > 0 && shouldUseBomb(gameState, hand, myDecomp, true, true)) {
      return bombs[0];
    }
    if (normalPlays.length > 0) return normalPlays[normalPlays.length - 1]; // 出最大普通牌
  }

  if (normalPlays.length > 0) {
    const candidate = normalPlays[0];

    // ② 记牌：如果 lastPlay 已经是"实际最大"，没必要顶（除非生死关头）
    if (full && memory && lastPlay && !opponentNearWin) {
      const lastKind = inferKind(lastPlay);
      if (isEffectivelyMax(lastPlay.mainRank, lastKind, memory, currentLevel)) {
        // lastPlay 已是绝对压制，没人能更大；自己跟也只是浪费大牌
        const cost = evalCardsCost(candidate, currentLevel);
        if (cost >= 100) return null; // 候选还要用万能牌，太亏
      }
    }

    const value = evalCardsCost(candidate, currentLevel);
    const avgVal = value / candidate.length;

    // ① 拆牌质量评估：选不破坏分组的候选
    if (full && hand.length > 8) {
      const breakLoss = breakageLoss(hand, candidate, currentLevel, myDecomp);
      // 找一个 breakage 更低的替代
      for (const alt of normalPlays.slice(0, 5)) {
        const altLoss = breakageLoss(hand, alt, currentLevel, myDecomp);
        if (altLoss < breakLoss && evalCardsCost(alt, currentLevel) <= value * 1.3) {
          return alt;
        }
      }
    }

    // 保护：浪费百搭/级牌去管小牌时，且手牌还多 → 跳过
    if (value >= 100 && !opponentNearWin && hand.length > 5) return null;
    if (lastPlay.mainRank < 10 && avgVal >= 20 && !opponentNearWin && hand.length > 10) return null;

    return candidate;
  }

  // ④ 炸弹时机：队友是当前最大牌时永远不动炸弹
  if (bombs.length > 0 && !teammateLeading && shouldUseBomb(gameState, hand, myDecomp, opponentNearWin, true)) {
    return bombs[0];
  }
  return null;
}

/* ============= 领牌策略 ============= */
function chooseLeading(normalPlays, bombs, hand, decomp, gameState, full, opponentNearWin) {
  const { currentLevel, seat, playersHandCounts = [], isTeammateWinning } = gameState;
  const teammateSeat = (seat + 2) % 4;
  const teammateCount = playersHandCounts[teammateSeat] || 27;
  const rightCount = playersHandCounts[(seat + 1) % 4] || 27;

  // ④ 炸弹结束：自己只剩 1 手且这手是炸弹
  if (full && hand.length <= 6 && decomp.tricksNeeded <= 1 && bombs.length > 0) {
    return bombs[0];
  }

  // ③ 队友只剩 ≤5 张：领出"最大牌"清场，让队友有自由出牌空间
  if (full && teammateCount <= 5 && normalPlays.length > 0) {
    const big = normalPlays[normalPlays.length - 1];
    return big;
  }

  // 顶下家：下家 ≤10 张 → 出中等以上的牌压一压
  if (full && rightCount > 0 && rightCount <= 10) {
    const better = normalPlays.filter(p => evalCardsCost(p, currentLevel) > 10);
    if (better.length > 0) return better[0];
  }

  // ① 优先出"分组里的小牌"——遵循拆牌结果
  if (full && decomp.groups.length > 0) {
    // 找一组最小 rank 的非炸弹组
    const sortedGroups = [...decomp.groups]
      .filter(g => g.kind !== 'bomb' && g.kind !== 'rocket')
      .sort((a, b) => a.rank - b.rank);
    for (const grp of sortedGroups) {
      // 在 hints 中找匹配该组的候选
      const ids = new Set(grp.cards.map(c => c.id));
      const matched = normalPlays.find(p =>
        p.length === grp.cards.length && p.every(c => ids.has(c.id))
      );
      if (matched) return matched;
    }
  }

  return normalPlays[0] || bombs[0];
}

/* ============= 工具函数 ============= */
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
  if (ranks.every(r => r === ranks[0])) return true;
  // 同花顺
  if (cards.length === 5) {
    const suits = cards.map(c => c.suit);
    if (suits.every(s => s === suits[0])) {
      const sr = [...ranks].sort((a, b) => a - b);
      for (let i = 1; i < sr.length; i++) if (sr[i] !== sr[i - 1] + 1) return false;
      return true;
    }
  }
  return false;
}

function inferKind(lastPlay) {
  if (!lastPlay || !lastPlay.type) return 'single';
  switch (lastPlay.type) {
    case HandType.SINGLE: return 'single';
    case HandType.PAIR: return 'pair';
    case HandType.TRIPLE: return 'triple';
    default: return 'other';
  }
}

/**
 * 评估"出 candidate 后，剩余手牌的拆牌质量损失"
 * 损失 = 出牌后剩余分组数 - (原分组数 - 1)
 * 完美打出某组：损失 0；如果出了破坏分组的牌：损失 > 0
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
export function getPracticeNPCDecision(hand, gameState, level = AILevel.NORMAL, seat = 0) {
  const play = getAIDecision(hand, gameState, level);
  const action = play ? 'PLAY' : 'PASS';
  const primaryReason = inferPrimaryReason(action, play, gameState, seat);
  const decisionLog = createDecisionLog(action, play, primaryReason);
  return { play, decisionLog };
}
