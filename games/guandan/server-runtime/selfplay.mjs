#!/usr/bin/env node
/**
 * selfplay.mjs — 掼蛋 NPC 自战模拟
 *
 * 用法: node server-runtime/selfplay.mjs [局数=50] [级别=expert|normal|noob]
 *
 * 输出统计：胜率、PASS率、队友让路合规率、炸弹拦截率、进贡正确率、异常行为
 */

import {
  createGameState, startRound, playCards, pass,
  initTribute, startTribute, handleTribute, handleReturnTribute
} from './game/engine.js';
import { getPracticeNPCDecision, AILevel } from './npc/PracticeNPC.js';
import { isBomb as isBombType } from './game/handClassifier.js';

const N_GAMES    = parseInt(process.argv[2]) || 10;  // 完整游戏场数
const levelStr   = (process.argv[3] || 'expert').toLowerCase();
const LEVEL      = levelStr === 'normal' ? AILevel.NORMAL
                 : levelStr === 'noob'   ? AILevel.NOOB
                 :                         AILevel.EXPERT;

// ─────────── 统计累积 ───────────
const S = {
  roundsPlayed: 0,
  team1Wins: 0,           // team 0&2
  team2Wins: 0,           // team 1&3
  totalDecisions: 0,
  totalPasses: 0,

  // ③ 队友让路合规
  shouldYield: 0,         // 应该让的场合
  didYield: 0,            // 实际让了

  // ⑦ 万能牌/大牌节约
  levelCardOpportunities: 0, // 可以出但不该出级牌/万能的场合
  levelCardSaved: 0,

  // ④ 炸弹拦截
  bombOpportunities: 0,   // 对手≤5张 + 我有炸弹 + 跟牌
  bombsUsed: 0,

  // 进贡
  tributeTotal: 0,
  tributeMaxCard: 0,      // 进贡了正确最大牌
  returnTotal: 0,
  returnSmall: 0,         // 还了较小牌 (rank ≤ 8)

  // 杂项
  totalTricks: 0,
  totalBombs: 0,
  anomalies: [],
  errors: 0,
};

// ─────────── 工具 ───────────
function looksLikeBomb(cards) {
  if (!cards || cards.length < 4) return false;
  const ranks = cards.map(c => c.rank);
  if (ranks.every(r => r === ranks[0])) return true;
  if (cards.length === 4 && cards.every(c => c.rank === 15 || c.rank === 16)) return true;
  if (cards.length >= 5) {
    const suits = cards.map(c => c.suit);
    if (suits.every(s => s === suits[0])) {
      const sr = [...ranks].sort((a, b) => a - b);
      for (let i = 1; i < sr.length; i++) if (sr[i] !== sr[i - 1] + 1) return false;
      return true;
    }
  }
  return false;
}

function hasBombInHand(hand) {
  const rc = {};
  for (const c of hand) rc[c.rank] = (rc[c.rank] || 0) + 1;
  if (Object.values(rc).some(n => n >= 4)) return true;
  const jokers = hand.filter(c => c.rank === 15 || c.rank === 16);
  if (jokers.length >= 4) return true;
  // 同花顺：同花色5+张连续（简化：只检查5张）
  const bySuit = {};
  for (const c of hand) (bySuit[c.suit] = bySuit[c.suit] || []).push(c.rank);
  for (const ranks of Object.values(bySuit)) {
    if (ranks.length < 5) continue;
    const sorted = [...ranks].sort((a, b) => a - b);
    for (let i = 0; i <= sorted.length - 5; i++) {
      if (sorted[i + 4] - sorted[i] === 4) return true;
    }
  }
  return false;
}

// ─────────── 进贡选牌 ───────────
function pickTributeCard(hand, currentLevel) {
  // 进贡：最大的非2非王牌（引擎规则强制）
  const valid = hand.filter(c => c.rank <= 14 && c.rank !== 2 && c.rank !== currentLevel);
  if (valid.length === 0) return hand.sort((a, b) => a.rank - b.rank)[0]; // fallback
  return valid.sort((a, b) => b.rank - a.rank)[0];
}

function pickReturnCard(hand, currentLevel) {
  // 还贡：最小的非级牌
  const valid = hand.filter(c => c.rank !== currentLevel);
  if (valid.length === 0) return hand[0];
  return valid.sort((a, b) => a.rank - b.rank)[0];
}

// ─────────── 驱动进贡阶段 ───────────
function driveTribute(state) {
  const ts = state.tributeState;
  if (!ts || ts.phase === 'completed') return;

  // 进贡
  for (const fromSeat of ts.fromSeats) {
    if (ts.tributeCards[fromSeat]) continue;
    const card = pickTributeCard(state.hands[fromSeat], state.currentLevel);
    if (!card) { S.errors++; continue; }
    const r = handleTribute(state, fromSeat, card.id);
    if (r.error) { S.errors++; continue; }
    S.tributeTotal++;
    // 验证是否是最大非2非王牌
    const maxCard = pickTributeCard(state.hands[fromSeat].concat([card]), state.currentLevel);
    if (!maxCard || card.rank >= maxCard.rank) S.tributeMaxCard++;
  }

  // 还贡
  if (ts.phase !== 'waiting_return') return;
  for (const toSeat of ts.toSeats) {
    if (ts.returnCards[toSeat]) continue;
    const card = pickReturnCard(state.hands[toSeat], state.currentLevel);
    if (!card) { S.errors++; continue; }
    const r = handleReturnTribute(state, toSeat, card.id);
    if (r.error) { S.errors++; continue; }
    S.returnTotal++;
    if (card.rank <= 8) S.returnSmall++;
  }
}

// ─────────── 驱动出牌（一局） ───────────
function drivePlay(state) {
  const MAX_MOVES = 400;
  let moves = 0;

  while (state.phase === 'playing' && moves++ < MAX_MOVES) {
    const seat = state.currentTurn;
    const hand = state.hands[seat];

    if (!hand || hand.length === 0) { S.errors++; break; }

    const isFreePlay = !state.lastPlay || state.lastPlaySeat === seat;
    const teammateSeat = (seat + 2) % 4;
    const isTeammateWinning = !isFreePlay && state.lastPlaySeat === teammateSeat;
    const lCount = state.hands[(seat + 3) % 4].length;
    const rCount = state.hands[(seat + 1) % 4].length;
    const opponentNearWin = (lCount > 0 && lCount <= 5) || (rCount > 0 && rCount <= 5);

    // ─ 合规统计条件 ─
    const shouldYield = !isFreePlay && isTeammateWinning && hand.length > 5 && !opponentNearWin;
    const canBomb = !isFreePlay && opponentNearWin && hasBombInHand(hand);

    // ─ gameState for NPC ─
    const gameState = {
      lastPlay: isFreePlay ? null : state.lastPlay,
      lastPlaySeat: state.lastPlaySeat,
      currentLevel: state.currentLevel,
      seat,
      isTeammateWinning,
      playersHandCounts: state.hands.map(h => h.length),
      hands: state.hands,
      roundHistory: state.roundHistory,
    };

    // ─ 决策 ─
    const { play } = getPracticeNPCDecision(hand, gameState, LEVEL, seat);
    S.totalDecisions++;

    // 让路合规统计
    if (shouldYield) {
      S.shouldYield++;
      if (play === null) {
        S.didYield++;
      } else if (S.anomalies.length < 30) {
        S.anomalies.push(
          `未让路 seat=${seat}(${hand.length}张) tmSeat=${teammateSeat} → rank=${play.map(c=>c.rank).join(',')}`
        );
      }
    }

    // 炸弹拦截统计（排除队友领先时不该炸的情况）
    const canBombReal = canBomb && !isTeammateWinning;
    if (canBombReal) {
      S.bombOpportunities++;
      if (play && looksLikeBomb(play)) S.bombsUsed++;
    }

    // ─ 执行决策 ─
    if (play === null) {
      S.totalPasses++;
      const r = pass(state, seat);
      if (r.error) {
        // 自由出牌不能PASS，兜底出第一张
        const fr = playCards(state, seat, [hand[0].id]);
        if (fr.error) { S.errors++; break; }
      }
    } else {
      const r = playCards(state, seat, play.map(c => c.id));
      if (r.error) {
        // 出牌不合法，兜底出第一张
        const fr = playCards(state, seat, [hand[0].id]);
        if (fr.error) { S.errors++; break; }
      }
    }
  }

  if (moves >= MAX_MOVES) S.errors++;

  // 收集本局统计
  S.totalTricks += state.roundHistory.length;
  S.totalBombs  += state.bombCount;
  S.roundsPlayed++;

  // 胜负判断
  if (state.finishOrder.length >= 2) {
    const [f1, f2] = state.finishOrder;
    const t1 = [0, 2], t2 = [1, 3];
    if (t1.includes(f1) && t1.includes(f2)) S.team1Wins++;
    else if (t2.includes(f1) && t2.includes(f2)) S.team2Wins++;
    else if (t1.includes(f1)) S.team1Wins++;
    else S.team2Wins++;
  }
}

// ─────────── 运行单场完整游戏（直到 game_over）───────────
function runOneGame() {
  const state = createGameState();

  // 第一局直接开始
  startRound(state);
  drivePlay(state);

  const MAX_ROUNDS = 60; // 单场最多 60 局防死循环
  let roundsThisGame = 1;

  while (state.phase !== 'game_over' && roundsThisGame < MAX_ROUNDS) {
    if (state.tributeNextRound) {
      const tributeInfo = state.tributeNextRound;
      state.tributeNextRound = null;
      startTribute(state, tributeInfo);
      driveTribute(state);
      state.finishOrder  = [];
      state.roundHistory = [];
      state.bombCount    = 0;
    } else {
      startRound(state);
    }

    if (state.phase !== 'playing') { S.errors++; break; }
    drivePlay(state);
    roundsThisGame++;
  }
}

// ─────────── 主循环 ───────────
function main() {
  const t0 = Date.now();

  for (let g = 0; g < N_GAMES; g++) {
    runOneGame();
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(2);

  // ─────────── 报告 ───────────
  const total  = S.team1Wins + S.team2Wins;
  const t1Rate = total > 0 ? (S.team1Wins / total * 100).toFixed(1) : '?';
  const t2Rate = total > 0 ? (S.team2Wins / total * 100).toFixed(1) : '?';
  const passRate = S.totalDecisions > 0
    ? (S.totalPasses / S.totalDecisions * 100).toFixed(1) : '?';
  const yieldRate = S.shouldYield > 0
    ? (S.didYield / S.shouldYield * 100).toFixed(1) : 'N/A';
  const blockRate = S.bombOpportunities > 0
    ? (S.bombsUsed / S.bombOpportunities * 100).toFixed(1) : 'N/A';
  const avgTricks = S.roundsPlayed > 0
    ? (S.totalTricks / S.roundsPlayed).toFixed(1) : '?';
  const avgBombs  = S.roundsPlayed > 0
    ? (S.totalBombs / S.roundsPlayed).toFixed(2) : '?';
  const tributeRate = S.tributeTotal > 0
    ? (S.tributeMaxCard / S.tributeTotal * 100).toFixed(0) : 'N/A';

  const fy  = S.shouldYield > 0  ? parseFloat(yieldRate) : 100;
  const fb  = S.bombOpportunities > 0 ? parseFloat(blockRate) : 100;

  const bar = '='.repeat(52);
  console.log(`\n${bar}`);
  console.log(` 掼蛋 NPC 自战结果  (${N_GAMES}场 / ${S.roundsPlayed}局 · ${LEVEL} · ${elapsed}s)`);
  console.log(bar);
  console.log(` 胜率   Team 0/2 = ${t1Rate}%   Team 1/3 = ${t2Rate}%`);
  console.log(` 平均手数/局: ${avgTricks}   平均炸弹/局: ${avgBombs}`);
  console.log(` PASS率: ${passRate}%   总决策: ${S.totalDecisions}`);
  console.log('');
  console.log(' 行为指标:');

  const yieldMark  = fy >= 85 ? '✅' : fy >= 70 ? '⚠ ' : '❌';
  const blockMark  = fb >= 60 ? '✅' : fb >= 40 ? '⚠ ' : '❌';
  const tributeMark = S.tributeTotal > 0 && parseInt(tributeRate) >= 95 ? '✅' : '⚠ ';

  console.log(`   队友领先让路率:  ${String(yieldRate + '%').padStart(7)}  ${yieldMark}  (目标>85%, 样本${S.shouldYield})`);
  console.log(`   对手快完炸弹拦:  ${String(blockRate + '%').padStart(7)}  ${blockMark}  (目标>60%, 样本${S.bombOpportunities})`);
  if (S.tributeTotal > 0) {
    console.log(`   进贡最大牌率:    ${String(tributeRate + '%').padStart(7)}  ${tributeMark}  (样本${S.tributeTotal})`);
  }

  if (S.anomalies.length > 0) {
    const show = S.anomalies.slice(0, 5);
    console.log(`\n 异常行为（共${S.anomalies.length}条，前5条）:`);
    show.forEach(a => console.log(`   ⚠  ${a}`));
  }

  if (S.errors > 0) {
    console.log(`\n ❌ 引擎/逻辑错误: ${S.errors} 次`);
  }

  console.log('');
}

main();
