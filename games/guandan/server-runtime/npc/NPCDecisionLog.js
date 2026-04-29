/**
 * NPCDecisionLog.js — NPC决策透明度日志
 * 每次NPC出牌时生成结构化决策摘要，供教学模式和复盘使用
 */

// 主因分类枚举
export const PrimaryReason = {
  TEAMMATE_WINNING:  'teammate_winning',   // 队友快赢，让路
  BLOCK_OPPONENT:    'block_opponent',     // 阻截对手
  CONSERVE_BOMB:     'conserve_bomb',      // 保留炸弹
  USE_BOMB_CRITICAL: 'use_bomb_critical',  // 关键时刻用炸弹
  LEAD_STRONG:       'lead_strong',        // 强势领牌
  DISPOSE_WEAK:      'dispose_weak',       // 处理废牌
  FREE_PLAY_MIN:     'free_play_min',      // 领牌兜底
  PASS_DEFER:        'pass_defer',         // 过牌让权
};

// 主因对应的中文解释模板（教学NPC会用到）
export const ReasonText = {
  [PrimaryReason.TEAMMATE_WINNING]:  '队友牌快出完了，我让路给他',
  [PrimaryReason.BLOCK_OPPONENT]:    '对手牌不多了，我必须管上阻截',
  [PrimaryReason.CONSERVE_BOMB]:     '局面不紧张，炸弹留到关键时刻用',
  [PrimaryReason.USE_BOMB_CRITICAL]: '对手快赢了，必须用炸弹打断',
  [PrimaryReason.LEAD_STRONG]:       '领牌阶段，出对手难跟的牌型压制',
  [PrimaryReason.DISPOSE_WEAK]:      '用最便宜的牌管上，保留好牌',
  [PrimaryReason.FREE_PLAY_MIN]:     '我来领牌，先出小牌试探',
  [PrimaryReason.PASS_DEFER]:        '队友正在掌控局面，我不出干扰',
};

/**
 * 创建决策日志对象
 */
export function createDecisionLog(action, cards, primaryReason, alternativesConsidered = []) {
  return {
    action,                    // 'PLAY' | 'PASS'
    cards: cards || [],        // 出的牌（PASS时为空）
    primaryReason,             // PrimaryReason枚举值
    explanation: ReasonText[primaryReason] || '',  // 面向玩家的中文解释
    alternativesConsidered,    // [{ cards, rejectedReason }]
    confidence: 0.8,           // 决策置信度（规则AI固定0.8，LLM可覆盖）
    timestamp: Date.now(),
  };
}

/**
 * 推断主因（供规则AI使用，LLM决策时主因由Prompt解析）
 */
export function inferPrimaryReason(action, cards, gameState, seat) {
  const { lastPlay, lastPlaySeat, hands, currentLevel } = gameState;
  const isFreePlay = !lastPlay || lastPlaySeat === seat;
  const teammateSeat = (seat + 2) % 4;
  const leftSeat = (seat + 3) % 4;
  const rightSeat = (seat + 1) % 4;
  const teammateCount = (hands[teammateSeat] || []).length;
  const leftCount = (hands[leftSeat] || []).length;
  const rightCount = (hands[rightSeat] || []).length;
  const opponentNearWin = (leftCount > 0 && leftCount <= 5) || (rightCount > 0 && rightCount <= 5);
  const isTeammateWinning = !isFreePlay && lastPlaySeat === teammateSeat;

  if (action === 'PASS') {
    if (isTeammateWinning) return PrimaryReason.TEAMMATE_WINNING;
    return PrimaryReason.PASS_DEFER;
  }

  // 出牌场景
  const isBombPlay = cards && cards.length >= 4;
  if (isBombPlay && opponentNearWin) return PrimaryReason.USE_BOMB_CRITICAL;
  if (isBombPlay && !opponentNearWin) return PrimaryReason.CONSERVE_BOMB; // 实际用了但不是关键——下游可修正
  if (opponentNearWin) return PrimaryReason.BLOCK_OPPONENT;
  if (isFreePlay && cards && cards.length > 1) return PrimaryReason.LEAD_STRONG;
  if (isFreePlay) return PrimaryReason.FREE_PLAY_MIN;
  return PrimaryReason.DISPOSE_WEAK;
}
