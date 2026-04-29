/**
 * PracticeNPC.js — 陪练NPC（规则AI）
 * 基于 ai.js 逻辑，包含所有原有函数并新增 getPracticeNPCDecision 包装函数
 */

import { findPlayableHands } from '../game/rules.js';
import { isWildCard } from '../game/handClassifier.js';
import { getNormalizedRank } from '../game/deck.js';
import { createDecisionLog, inferPrimaryReason } from './NPCDecisionLog.js';

export const AILevel = {
  NOOB: 'noob',
  NORMAL: 'normal',
  EXPERT: 'expert'
};

/**
 * AI 决策函数
 * @param {Array} hand - AI 当前手牌
 * @param {Object} gameState - 游戏状态 (lastPlay, currentLevel, isTeammateWinning 等)
 * @param {string} level - AI 等级
 * @returns {Array|null} - 返回要出的牌数组，为 null 则过牌
 */
export function getAIDecision(hand, gameState, level = AILevel.NORMAL) {
  const { lastPlay, currentLevel, isTeammateWinning } = gameState;

  // 1. 获取所有合法出牌组合
  const hints = findPlayableHands(hand, lastPlay, currentLevel);

  if (hints.length === 0) return null; // 没牌管得上，过牌

  // 【掼蛋规则守卫】领牌阶段（lastPlay === null）必须出牌，禁止返回 null
  const mustPlay = !lastPlay;

  // 2. 根据等级采取不同策略
  let decision;
  switch (level) {
    case AILevel.NOOB:
      decision = decideNoob(hints, mustPlay); break;
    case AILevel.EXPERT:
      decision = decideExpert(hints, isTeammateWinning, hand, gameState, mustPlay); break;
    case AILevel.NORMAL:
    default:
      decision = decideNormal(hints, currentLevel); break;
  }

  // 终极兜底：领牌时无论如何不能返回 null
  if (mustPlay && !decision) {
    return hints[0];
  }
  return decision;
}

/**
 * 小白等级：随机性高，有时明明有牌也不出
 */
function decideNoob(hints, mustPlay = false) {
  // 30% 概率即使有牌也过牌（领牌时强制出牌）
  if (!mustPlay && Math.random() < 0.3) return null;

  // 随机选一个提示
  const randomIndex = Math.floor(Math.random() * hints.length);
  return hints[randomIndex];
}

/**
 * 普通等级：贪心算法，管最小的牌
 */
function decideNormal(hints, currentLevel) {
  // 普通 AI 也学会不随意浪费高级牌
  if (hints.length === 0) return null;
  const sorted = [...hints].sort((a, b) => evaluateHandValue(a, currentLevel) - evaluateHandValue(b, currentLevel));
  return sorted[0];
}


/**
 * 评估牌组的"成本"价值
 * 级牌和万能牌拥有极高的保留价值
 */
function evaluateHandValue(cards, currentLevel) {
  let totalValue = 0;
  for (const card of cards) {
    if (isWildCard(card, currentLevel)) {
      totalValue += 100; // 万能牌价值最高
    } else if (card.rank === currentLevel) {
      totalValue += 25;  // 级牌
    } else if (card.rank === 16) {
      totalValue += 40;  // 大王
    } else if (card.rank === 15) {
      totalValue += 35;  // 小王
    } else {
      totalValue += getNormalizedRank(card.rank, currentLevel);
    }
  }
  return totalValue;
}

/**
 * 专家等级：有基本的配合和保留炸弹意识
 */
function decideExpert(hints, isTeammateWinning, hand, gameState, mustPlay = false) {
  const { playersHandCounts = [], seat, lastPlay, currentLevel } = gameState;
  const mySeat = seat;
  const leftSeat = (mySeat + 3) % 4;
  const rightSeat = (mySeat + 1) % 4;
  const teammateSeat = (mySeat + 2) % 4;

  const leftCount = playersHandCounts[leftSeat] || 27;
  const rightCount = playersHandCounts[rightSeat] || 27;
  const teammateCount = playersHandCounts[teammateSeat] || 27;

  // 1. 如果队友目前最大，且自己不是领牌（领牌时不能过）
  if (isTeammateWinning && !mustPlay) {
    if (teammateCount > 0 && teammateCount <= 5) return null;
    if (Math.random() < 0.7) return null;
  }

  // 2. 将所有合法出牌按"成本价值"排序，优先用垃圾牌管
  const sortedHints = [...hints].sort((a, b) => {
    return evaluateHandValue(a, currentLevel) - evaluateHandValue(b, currentLevel);
  });

  const normalPlays = sortedHints.filter(h => h.length < 4 || !isBomb(h));
  const bombs = sortedHints.filter(h => !normalPlays.includes(h));

  // 3. 拦截意识 (顶牌)
  const opponentNearWin = (leftCount > 0 && leftCount <= 5) || (rightCount > 0 && rightCount <= 5);

  if (!lastPlay) {
    // 领牌阶段
    if (rightCount > 0 && rightCount <= 10) {
      // 顶牌：如果下家牌少，不出单张/对子中小牌
      const betterPlays = normalPlays.filter(p => evaluateHandValue(p, currentLevel) > 10);
      if (betterPlays.length > 0) return betterPlays[0];
    }
    return normalPlays[0] || bombs[0];
  }

  // 4. 生死关头 (对手快赢了)
  if (opponentNearWin && !isTeammateWinning) {
    // 即使动用炸弹也要管，但要选最"便宜"的炸弹
    if (bombs.length > 0) return bombs[0];
    if (normalPlays.length > 0) return normalPlays[normalPlays.length - 1]; // 出最大的普通牌
  }

  // 5. 正常跟牌：选最便宜的能管上的牌
  if (normalPlays.length > 0) {
    const play = normalPlays[0];
    const value = evaluateHandValue(play, currentLevel);
    const avgCardValue = value / play.length;

    // 保护限制：
    // 1. 如果为了管一个普通牌要浪费"百搭牌"(价值>=100)，且不是生死关头且手牌还多，则跳过
    if (value >= 100 && !opponentNearWin && hand.length > 5) {
      return null;
    }
    // 2. 如果为了管一个小牌 (mainRank < 10) 要动用级牌或王 (avgValue > 20)，且手牌多，则跳过
    if (lastPlay && lastPlay.mainRank < 10 && avgCardValue >= 20 && !opponentNearWin && hand.length > 10) {
      return null;
    }

    return play;
  }

  // 6. 炸弹处理
  if (bombs.length > 0) {
    // 自己牌不多了，或者生死关头
    if (hand.length < 8 || opponentNearWin) {
      return bombs[0];
    }
    // 否则非常谨慎使用炸弹
    const useBomb = Math.random() < 0.2 ? bombs[0] : null;
    if (useBomb || !mustPlay) return useBomb;
  }

  // 兜底：领牌阶段必须出牌，随便出一张最小的
  if (mustPlay) {
    return sortedHints[0] || hints[0];
  }

  return null;
}

// 简单的炸弹判定（AI内部使用，不依赖分类器以免循环引用）
function isBomb(cards) {
  if (cards.length < 4) return false;
  const ranks = cards.map(c => c.rank);
  const first = ranks[0];
  return ranks.every(r => r === first) || (cards.length === 5 && isStraightFlush(cards));
}

function isStraightFlush(cards) {
  if (cards.length !== 5) return false;
  const suits = cards.map(c => c.suit);
  if (!suits.every(s => s === suits[0])) return false;
  const ranks = cards.map(c => c.rank).sort((a,b) => a-b);
  for (let i = 1; i < ranks.length; i++) {
    if (ranks[i] !== ranks[i-1] + 1) return false;
  }
  return true;
}

/**
 * 陪练NPC决策包装函数
 * 返回 { play, decisionLog } 结构
 */
export function getPracticeNPCDecision(hand, gameState, level = AILevel.NORMAL, seat = 0) {
  const play = getAIDecision(hand, gameState, level);
  const action = play ? 'PLAY' : 'PASS';
  const primaryReason = inferPrimaryReason(action, play, gameState, seat);
  const decisionLog = createDecisionLog(action, play, primaryReason);
  return { play, decisionLog };
}
