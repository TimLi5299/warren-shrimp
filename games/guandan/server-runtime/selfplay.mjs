#!/usr/bin/env node
/**
 * selfplay.mjs — 掼蛋 NPC 自战模拟
 *
 * 用法:
 *   node server-runtime/selfplay.mjs [局数=10] [级别=expert|normal|noob]
 *   node server-runtime/selfplay.mjs --ablation [局数=20]
 *
 * 输出统计：胜率、PASS率、队友让路合规率、炸弹拦截率、进贡正确率、异常行为
 * --ablation 模式：逐项去掉 R1-R9，与基准（全技能）对比，量化每项技能的贡献
 */

import {
  createGameState, startRound, playCards, pass,
  initTribute, startTribute, handleTribute, handleReturnTribute
} from './game/engine.js';
import { getPracticeNPCDecision, AILevel } from './npc/PracticeNPC.js';
import { SKILLS, NPC_PRESETS } from './npc/SkillProfiles.js';
import { isBomb as isBombType } from './game/handClassifier.js';

// ─────────── 参数解析 ───────────
const args = process.argv.slice(2);
const ABLATION_MODE = args.includes('--ablation');
const numArgs = args.filter(a => !a.startsWith('--'));

let N_GAMES, levelStr, LEVEL, PROFILE;

if (ABLATION_MODE) {
  N_GAMES  = parseInt(numArgs[0]) || 20;
  LEVEL    = AILevel.EXPERT;
  PROFILE  = NPC_PRESETS.expert;
} else {
  N_GAMES  = parseInt(numArgs[0]) || 10;
  levelStr = (numArgs[1] || 'expert').toLowerCase();
  LEVEL    = levelStr === 'normal' ? AILevel.NORMAL
           : levelStr === 'noob'   ? AILevel.NOOB
           :                         AILevel.EXPERT;
  PROFILE  = NPC_PRESETS[levelStr] ?? NPC_PRESETS.expert;
}

// ─────────── 统计累积（每次 runNGames 独立） ───────────
function makeStats() {
  return {
    roundsPlayed: 0,
    team1Wins: 0,
    team2Wins: 0,
    totalDecisions: 0,
    totalPasses: 0,
    shouldYield: 0,
    didYield: 0,
    bombOpportunities: 0,
    bombsUsed: 0,
    tributeTotal: 0,
    tributeMaxCard: 0,
    returnTotal: 0,
    returnSmall: 0,
    totalTricks: 0,
    totalBombs: 0,
    anomalies: [],
    errors: 0,
  };
}

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
  const valid = hand.filter(c => c.rank <= 14 && c.rank !== 2 && c.rank !== currentLevel);
  if (valid.length === 0) return hand.sort((a, b) => a.rank - b.rank)[0];
  return valid.sort((a, b) => b.rank - a.rank)[0];
}

function pickReturnCard(hand, currentLevel) {
  const valid = hand.filter(c => c.rank !== currentLevel);
  if (valid.length === 0) return hand[0];
  return valid.sort((a, b) => a.rank - b.rank)[0];
}

// ─────────── 驱动进贡阶段 ───────────
function driveTribute(state, S) {
  const ts = state.tributeState;
  if (!ts || ts.phase === 'completed') return;

  for (const fromSeat of ts.fromSeats) {
    if (ts.tributeCards[fromSeat]) continue;
    const card = pickTributeCard(state.hands[fromSeat], state.currentLevel);
    if (!card) { S.errors++; continue; }
    const r = handleTribute(state, fromSeat, card.id);
    if (r.error) { S.errors++; continue; }
    S.tributeTotal++;
    const maxCard = pickTributeCard(state.hands[fromSeat].concat([card]), state.currentLevel);
    if (!maxCard || card.rank >= maxCard.rank) S.tributeMaxCard++;
  }

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
function drivePlay(state, S, profile) {
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

    const shouldYield = !isFreePlay && isTeammateWinning && hand.length > 5 && !opponentNearWin;
    const canBomb = !isFreePlay && opponentNearWin && hasBombInHand(hand);

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

    const { play } = getPracticeNPCDecision(hand, gameState, LEVEL, seat, profile);
    S.totalDecisions++;

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

    const canBombReal = canBomb && !isTeammateWinning;
    if (canBombReal) {
      S.bombOpportunities++;
      if (play && looksLikeBomb(play)) S.bombsUsed++;
    }

    if (play === null) {
      S.totalPasses++;
      const r = pass(state, seat);
      if (r.error) {
        const fr = playCards(state, seat, [hand[0].id]);
        if (fr.error) { S.errors++; break; }
      }
    } else {
      const r = playCards(state, seat, play.map(c => c.id));
      if (r.error) {
        const fr = playCards(state, seat, [hand[0].id]);
        if (fr.error) { S.errors++; break; }
      }
    }
  }

  if (moves >= MAX_MOVES) S.errors++;

  S.totalTricks += state.roundHistory.length;
  S.totalBombs  += state.bombCount;
  S.roundsPlayed++;

  if (state.finishOrder.length >= 2) {
    const [f1, f2] = state.finishOrder;
    const t1 = [0, 2], t2 = [1, 3];
    if (t1.includes(f1) && t1.includes(f2)) S.team1Wins++;
    else if (t2.includes(f1) && t2.includes(f2)) S.team2Wins++;
    else if (t1.includes(f1)) S.team1Wins++;
    else S.team2Wins++;
  }
}

// ─────────── 运行单场完整游戏 ───────────
function runOneGame(S, profile) {
  const state = createGameState();
  startRound(state);
  drivePlay(state, S, profile);

  const MAX_ROUNDS = 60;
  let roundsThisGame = 1;

  while (state.phase !== 'game_over' && roundsThisGame < MAX_ROUNDS) {
    if (state.tributeNextRound) {
      const tributeInfo = state.tributeNextRound;
      state.tributeNextRound = null;
      startTribute(state, tributeInfo);
      driveTribute(state, S);
      state.finishOrder  = [];
      state.roundHistory = [];
      state.bombCount    = 0;
    } else {
      startRound(state);
    }

    if (state.phase !== 'playing') { S.errors++; break; }
    drivePlay(state, S, profile);
    roundsThisGame++;
  }
}

// ─────────── 运行 N 场并返回统计 ───────────
function runNGames(n, profile) {
  const S = makeStats();
  for (let g = 0; g < n; g++) {
    runOneGame(S, profile);
  }
  return S;
}

// ─────────── 统计 → 指标 ───────────
function calcMetrics(S) {
  const avgTricks = S.roundsPlayed > 0 ? S.totalTricks / S.roundsPlayed : 0;
  const yieldRate = S.shouldYield > 0 ? S.didYield / S.shouldYield * 100 : null;
  const blockRate = S.bombOpportunities > 0 ? S.bombsUsed / S.bombOpportunities * 100 : null;
  const passRate  = S.totalDecisions > 0 ? S.totalPasses / S.totalDecisions * 100 : 0;
  return { avgTricks, yieldRate, blockRate, passRate };
}

// ─────────── 普通模式报告 ───────────
function printReport(S, n, label, elapsed) {
  const { avgTricks, yieldRate, blockRate, passRate } = calcMetrics(S);
  const total  = S.team1Wins + S.team2Wins;
  const t1Rate = total > 0 ? (S.team1Wins / total * 100).toFixed(1) : '?';
  const t2Rate = total > 0 ? (S.team2Wins / total * 100).toFixed(1) : '?';

  const bar = '='.repeat(54);
  console.log(`\n${bar}`);
  console.log(` 掼蛋 NPC 自战结果  (${n}场 / ${S.roundsPlayed}局 · ${label} · ${elapsed}s)`);
  console.log(bar);
  console.log(` 胜率   Team 0/2 = ${t1Rate}%   Team 1/3 = ${t2Rate}%`);
  console.log(` 平均手数/局: ${avgTricks.toFixed(1)}   平均炸弹/局: ${(S.totalBombs/S.roundsPlayed).toFixed(2)}`);
  console.log(` PASS率: ${passRate.toFixed(1)}%   总决策: ${S.totalDecisions}`);
  console.log('');
  console.log(' 行为指标:');

  const yr = yieldRate !== null ? yieldRate.toFixed(1) + '%' : 'N/A';
  const br = blockRate !== null ? blockRate.toFixed(1) + '%' : 'N/A';
  const ym = yieldRate === null ? '' : yieldRate >= 85 ? '✅' : yieldRate >= 70 ? '⚠ ' : '❌';
  const bm = blockRate === null ? '' : blockRate >= 60 ? '✅' : blockRate >= 40 ? '⚠ ' : '❌';

  console.log(`   队友领先让路率:  ${String(yr).padStart(7)}  ${ym}  (目标>85%, 样本${S.shouldYield})`);
  console.log(`   对手快完炸弹拦:  ${String(br).padStart(7)}  ${bm}  (目标>60%, 样本${S.bombOpportunities})`);

  if (S.anomalies.length > 0) {
    const show = S.anomalies.slice(0, 5);
    console.log(`\n 异常行为（共${S.anomalies.length}条，前5条）:`);
    show.forEach(a => console.log(`   ⚠  ${a}`));
  }
  if (S.errors > 0) console.log(`\n ❌ 引擎/逻辑错误: ${S.errors} 次`);
  console.log('');
}

// ─────────── 消融测试报告 ───────────
function printAblationReport(baseline, ablationResults, n) {
  const bm = calcMetrics(baseline);
  const bar = '='.repeat(60);

  console.log(`\n${bar}`);
  console.log(` 掼蛋 NPC 技能消融测试  (每组 ${n} 场)`);
  console.log(bar);
  console.log(` 基准 (全技能 expert):`);
  console.log(`   平均手数=${bm.avgTricks.toFixed(1)}  让路率=${bm.yieldRate !== null ? bm.yieldRate.toFixed(1)+'%' : 'N/A'}  炸弹拦=${bm.blockRate !== null ? bm.blockRate.toFixed(1)+'%' : 'N/A'}`);
  console.log('');
  console.log(' 各技能贡献（去掉后 vs 基准）:');
  console.log(' ' + '-'.repeat(58));

  const skillNames = {
    [SKILLS.R1]: 'R1 队友让路     ',
    [SKILLS.R2]: 'R2 炸弹时机     ',
    [SKILLS.R3]: 'R3 拆牌优化     ',
    [SKILLS.R4]: 'R4 记牌推断     ',
    [SKILLS.R5]: 'R5 级牌保护     ',
    [SKILLS.R6]: 'R6 对手推断     ',
    [SKILLS.R7]: 'R7 信号传递     ',
    [SKILLS.R8]: 'R8 残局解算     ',
    [SKILLS.R9]: 'R9 领牌评分     ',
  };

  for (const { skill, S } of ablationResults) {
    const m = calcMetrics(S);
    const dTricks = m.avgTricks - bm.avgTricks;
    const sign = dTricks >= 0 ? '+' : '';
    const impact = Math.abs(dTricks) >= 3 ? '⬆ 显著' : Math.abs(dTricks) >= 1 ? '△ 有效' : '~ 微弱';
    const yr = m.yieldRate !== null ? m.yieldRate.toFixed(1) + '%' : 'N/A';
    console.log(
      ` 去掉 ${skillNames[skill] ?? skill.padEnd(16)} ` +
      `手数=${m.avgTricks.toFixed(1)} (Δ${sign}${dTricks.toFixed(1)})  ` +
      `让路=${yr}  ${impact}`
    );
  }
  console.log(' ' + '-'.repeat(58));
  console.log('');
}

// ─────────── 主循环 ───────────
function main() {
  const t0 = Date.now();

  if (ABLATION_MODE) {
    console.log(`\n运行消融测试，每组 ${N_GAMES} 场...`);
    const baseline = runNGames(N_GAMES, NPC_PRESETS.expert);

    const ablationResults = [];
    for (const [id, skill] of Object.entries(SKILLS)) {
      const withoutSkill = new Set([...NPC_PRESETS.expert].filter(s => s !== skill));
      const S = runNGames(N_GAMES, withoutSkill);
      ablationResults.push({ skill, S });
    }

    const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
    console.log(`(用时 ${elapsed}s)`);
    printAblationReport(baseline, ablationResults, N_GAMES);
  } else {
    const S = runNGames(N_GAMES, PROFILE);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
    const label = `${levelStr || 'expert'}`;
    printReport(S, N_GAMES, label, elapsed);
  }
}

main();
