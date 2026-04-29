/**
 * server-runtime/index.js
 * 浏览器内运行的「假服务端」—— 复用原 app.js 的消息分发逻辑，
 * 但去掉 Express/WebSocket/SQLite，全部在内存中跑，单玩家 + 3 NPC。
 */

import { RoomManager } from './game/room.js';
import { getNPCDecision, onCardsPlayed, resetMemory } from './npc/NPCEngine.js';
import {
  startLesson, validateStep, getTutorialSession, advanceStep, clearSession, preloadLesson
} from './tutorial/TutorialEngine.js';
import { startTribute, handleTribute, handleReturnTribute } from './game/engine.js';
import { selectTributeCard } from './game/rules.js';

export class LoopbackServer {
  constructor() {
    this.roomManager = new RoomManager();
    this.connections = new Map(); // playerId -> { send: fn, roomId, nickname }
    this.outboundQueue = []; // 暂存对玩家的消息
  }

  /** 客户端注册一个 listener 接收消息 */
  attach(playerId, sendFn) {
    this.connections.set(playerId, { send: sendFn, roomId: null, nickname: null });
  }

  /** 客户端发消息进入服务端 */
  async dispatch(playerId, msg) {
    const conn = this.connections.get(playerId);
    if (!conn) return;
    const send = (m) => conn.send(m);

    try {
      switch (msg.type) {
        case 'LOGIN': {
          const nickname = msg.nickname || '玩家';
          conn.nickname = nickname;
          send({ type: 'LOGIN_OK', playerId, nickname });

          // pendingLesson（教学触发）
          if (this.pendingLesson) {
            const lessonId = this.pendingLesson;
            this.pendingLesson = null;
            await this.dispatch(playerId, { type: 'START_TUTORIAL', lessonId });
          }
          break;
        }

        case 'CREATE_ROOM': {
          const room = this.roomManager.createRoom(playerId, conn.nickname);
          conn.roomId = room.roomId;
          send({ type: 'ROOM_CREATED', roomId: room.roomId });
          this._broadcastRoomUpdate(room);
          break;
        }

        case 'JOIN_ROOM': {
          const room = this.roomManager.getRoom(msg.roomId);
          if (!room) { send({ type: 'ERROR', message: '房间不存在' }); return; }
          const result = room.join(playerId, conn.nickname);
          if (!result.success) { send({ type: 'ERROR', message: result.error }); return; }
          conn.roomId = room.roomId;
          send({ type: 'JOINED_ROOM', roomId: room.roomId, seat: result.seat });
          this._broadcastRoomUpdate(room);
          break;
        }

        case 'READY': {
          const room = this.roomManager.getRoom(conn.roomId);
          if (!room) return;
          room.toggleReady(playerId);
          this._broadcastRoomUpdate(room);
          break;
        }

        case 'ADD_NPC': {
          const room = this.roomManager.getRoom(conn.roomId);
          if (!room) return;
          const result = room.addNPC(msg.level, msg.seat);
          if (result.error) { send({ type: 'ERROR', message: result.error }); return; }
          this._broadcastRoomUpdate(room);
          break;
        }

        case 'REMOVE_NPC': {
          const room = this.roomManager.getRoom(conn.roomId);
          if (!room) return;
          if (room.kickNPC(msg.seat)) this._broadcastRoomUpdate(room);
          break;
        }

        case 'START_GAME': {
          const room = this.roomManager.getRoom(conn.roomId);
          if (!room) return;
          if (room.hostId !== playerId) {
            send({ type: 'ERROR', message: '只有房主可以开始游戏' }); return;
          }
          const result = room.startGame();
          if (result.error) { send({ type: 'ERROR', message: result.error }); return; }
          this._broadcastGameEvents(room, result.events);
          break;
        }

        case 'PLAY_CARDS': {
          const room = this.roomManager.getRoom(conn.roomId);
          if (!room) return;
          const result = room.handlePlayCards(playerId, msg.cardIds);
          if (result.error) { send({ type: 'ERROR', message: result.error }); return; }
          this._broadcastGameEvents(room, result.events);
          break;
        }

        case 'PASS': {
          const room = this.roomManager.getRoom(conn.roomId);
          if (!room) return;
          const result = room.handlePass(playerId);
          if (result.error) { send({ type: 'ERROR', message: result.error }); return; }
          this._broadcastGameEvents(room, result.events);
          break;
        }

        case 'HINT': {
          const room = this.roomManager.getRoom(conn.roomId);
          if (!room) return;
          const hints = room.getHintForPlayer(playerId);
          send({ type: 'HINT_RESULT', hints: hints.slice(0, 5) });
          break;
        }

        case 'TRIBUTE': {
          const room = this.roomManager.getRoom(conn.roomId);
          if (!room || !room.gameState) return;
          const seat = room.players.findIndex(p => p && p.id === playerId);
          const result = handleTribute(room.gameState, seat, msg.cardId);
          if (result.error) { send({ type: 'ERROR', message: result.error }); return; }
          room.gameState = result.state;
          this._broadcastGameEvents(room, result.events);
          break;
        }

        case 'RETURN_TRIBUTE': {
          const room = this.roomManager.getRoom(conn.roomId);
          if (!room || !room.gameState) return;
          const seat = room.players.findIndex(p => p && p.id === playerId);
          const result = handleReturnTribute(room.gameState, seat, msg.cardId);
          if (result.error) { send({ type: 'ERROR', message: result.error }); return; }
          room.gameState = result.state;
          this._broadcastGameEvents(room, result.events);
          const turnEvent = result.events.find(e => e.type === 'YOUR_TURN');
          if (turnEvent) {
            const nextPlayer = room.players[turnEvent.seat];
            if (nextPlayer && nextPlayer.isNPC) this._handleNPCTurn(room, turnEvent.seat);
          }
          break;
        }

        case 'NEXT_ROUND': {
          const room = this.roomManager.getRoom(conn.roomId);
          if (!room) return;
          const result = room.nextRound();
          if (result.error) { send({ type: 'ERROR', message: result.error }); return; }
          if (result.success && room.gameState.tributeNextRound) {
            const tributeInfo = room.gameState.tributeNextRound;
            room.gameState.tributeNextRound = null;
            const tributeResult = startTribute(room.gameState, tributeInfo);
            room.gameState = tributeResult.state;
            this._broadcastGameEvents(room, tributeResult.events);
          } else if (result.success) {
            this._broadcastGameEvents(room, result.events);
          }
          break;
        }

        case 'START_TUTORIAL': {
          try {
            await preloadLesson(msg.lessonId);
            const { gameState, currentStep, lessonConfig } = startLesson(playerId, msg.lessonId);
            send({
              type: 'TUTORIAL_STARTED',
              lessonId: msg.lessonId,
              lessonConfig,
              hand: gameState.hands[0],
              currentLevel: gameState.currentLevel,
              currentStep,
            });
          } catch (e) {
            send({ type: 'ERROR', message: `课程加载失败: ${e.message}` });
          }
          break;
        }

        case 'TUTORIAL_ACTION': {
          const tutSession = getTutorialSession(playerId);
          if (!tutSession) { send({ type: 'ERROR', message: '没有进行中的教学' }); return; }
          const tutAction = msg.action || {};

          if (tutAction.type === 'NEXT') {
            const nextStep = advanceStep(playerId);
            send({
              type: 'TUTORIAL_FEEDBACK',
              correct: true,
              explanation: '',
              nextStep,
              nextStepIndex: tutSession.currentStepIndex,
              completed: !nextStep,
            });
            return;
          }

          const tutResult = validateStep(playerId, tutAction);
          const response = {
            type: 'TUTORIAL_FEEDBACK',
            correct: tutResult.correct,
            explanation: tutResult.explanation || '',
            nextStep: null,
            nextStepIndex: tutSession.currentStepIndex,
            completed: false,
            playedCardIds: [],
          };

          if (tutResult.correct) {
            if (tutAction.type === 'PLAY' && tutAction.cardIds?.length > 0) {
              response.playedCardIds = tutAction.cardIds;
              tutSession.gameState.hands[0] = tutSession.gameState.hands[0]
                .filter(c => !tutAction.cardIds.includes(c.id));
            }
            const nextStep = advanceStep(playerId);
            response.nextStep = nextStep;
            response.nextStepIndex = tutSession.currentStepIndex;
            response.completed = !nextStep;
          }
          send(response);
          break;
        }

        default:
          send({ type: 'ERROR', message: `未知消息类型: ${msg.type}` });
      }
    } catch (err) {
      console.error('[Loopback] dispatch 出错', err);
      send({ type: 'ERROR', message: '服务异常: ' + err.message });
    }
  }

  // ====== 内部辅助 ======

  _broadcastRoomUpdate(room) {
    for (const player of room.players) {
      if (!player || player.isNPC) continue;
      const conn = this.connections.get(player.id);
      if (!conn) continue;
      try {
        const view = room.getViewForPlayer(player.id);
        conn.send({ type: 'ROOM_UPDATE', ...view });
      } catch (e) { /* 忽略 */ }
    }
  }

  _broadcastGameEvents(room, events) {
    for (const player of room.players) {
      if (!player || player.isNPC) continue;
      const conn = this.connections.get(player.id);
      if (!conn) continue;

      const seat = room.players.findIndex(p => p && p.id === player.id);
      for (const event of events) {
        try {
          if (event.type === 'GAME_START') {
            conn.send({
              type: 'GAME_START',
              hand: event.hands[seat],
              currentTurn: event.currentTurn,
              currentLevel: event.currentLevel,
              team1Level: event.team1Level,
              team2Level: event.team2Level,
              mySeat: seat,
            });
          } else if (event.type === 'YOUR_TURN') {
            conn.send({
              type: 'TURN_UPDATE',
              currentTurn: event.seat,
              isMyTurn: event.seat === seat,
            });
          } else if (event.type === 'CARDS_PLAYED') {
            const isMasked = event.seat !== seat && event.remainingCards > 10;
            conn.send({ ...event, remainingCards: isMasked ? -1 : event.remainingCards });
          } else {
            conn.send(event);
          }
        } catch (e) { /* ignore */ }
      }
    }

    // 更新 NPC 记牌器
    const cardsPlayedEvent = events.find(e => e.type === 'CARDS_PLAYED');
    if (cardsPlayedEvent) {
      for (let s = 0; s < 4; s++) {
        const p = room.players[s];
        if (p && p.isNPC) {
          onCardsPlayed(room.id, s, cardsPlayedEvent.seat, cardsPlayedEvent.cards || [], cardsPlayedEvent.handType);
        }
      }
    }
    const gameStartEvent = events.find(e => e.type === 'GAME_START');
    if (gameStartEvent) {
      for (let s = 0; s < 4; s++) {
        const p = room.players[s];
        if (p && p.isNPC) {
          resetMemory(room.id, s, p.level || 'expert', gameStartEvent.currentLevel);
        }
      }
    }

    // 检查是否轮到 NPC 出牌
    const turnEvent = events.find(e => e.type === 'YOUR_TURN');
    if (turnEvent) {
      const nextPlayer = room.players[turnEvent.seat];
      if (nextPlayer && nextPlayer.isNPC) this._handleNPCTurn(room, turnEvent.seat);
    }

    // 进贡阶段：让 NPC 自动选最大牌进贡
    const tributeReq = events.find(e => e.type === 'TRIBUTE_REQUEST');
    if (tributeReq) {
      for (const fromSeat of tributeReq.fromSeats) {
        const player = room.players[fromSeat];
        if (player && player.isNPC) this._handleNPCTribute(room, fromSeat);
      }
    }

    // 还贡阶段：让 NPC 自动选小牌还贡
    const returnReq = events.find(e => e.type === 'RETURN_REQUEST');
    if (returnReq) {
      for (const toSeat of returnReq.fromSeats) {
        const player = room.players[toSeat];
        if (player && player.isNPC) this._handleNPCReturn(room, toSeat);
      }
    }
  }

  /**
   * NPC 自动进贡：选手中除王外最大的非级牌
   */
  _handleNPCTribute(room, seat) {
    const delay = 600 + Math.random() * 600;
    setTimeout(() => {
      if (!room.gameState || !room.gameState.tributeState) return;
      if (room.gameState.tributeState.phase !== 'waiting_tribute') return;
      if (room.gameState.tributeState.tributeCards[seat]) return; // 已交过

      const hand = room.gameState.hands[seat];
      const card = selectTributeCard(hand);
      if (!card) return;

      const result = handleTribute(room.gameState, seat, card.id);
      if (result.error) {
        console.warn('[NPC tribute] 失败', seat, result.error);
        return;
      }
      room.gameState = result.state;
      this._broadcastGameEvents(room, result.events);
    }, delay);
  }

  /**
   * NPC 自动还贡：选最小的非级牌（保留好牌打）
   */
  _handleNPCReturn(room, seat) {
    const delay = 600 + Math.random() * 600;
    setTimeout(() => {
      if (!room.gameState || !room.gameState.tributeState) return;
      if (room.gameState.tributeState.phase !== 'waiting_return') return;
      if (room.gameState.tributeState.returnCards[seat]) return;

      const hand = room.gameState.hands[seat];
      const currentLevel = room.gameState.currentLevel;
      // 选除级牌、王外最小的牌还回去
      const candidates = hand
        .filter(c => c.rank !== currentLevel && c.rank < 15)
        .sort((a, b) => a.rank - b.rank);
      const card = candidates[0] || hand.find(c => c.rank !== currentLevel);
      if (!card) return;

      const result = handleReturnTribute(room.gameState, seat, card.id);
      if (result.error) {
        console.warn('[NPC return] 失败', seat, result.error);
        return;
      }
      room.gameState = result.state;
      this._broadcastGameEvents(room, result.events);

      // 进贡完成后，事件链里会触发 PLAYING + 第一个出牌人的 YOUR_TURN
      // 已由 _broadcastGameEvents 的 turnEvent 检测处理
    }, delay);
  }

  _handleNPCTurn(room, seat) {
    const npc = room.players[seat];
    const thinkDelay = 800 + Math.random() * 600;

    setTimeout(async () => {
      if (!room.gameState || room.gameState.currentTurn !== seat) return;
      const hand = room.gameState.hands[seat];

      let play = null, decisionLog = null;
      try {
        const result = await getNPCDecision(npc, seat, hand, room.gameState, room.id);
        play = result.play;
        decisionLog = result.decisionLog;
      } catch (err) {
        console.warn('[NPC] 决策失败', err);
      }

      if (!room.gameState || room.gameState.currentTurn !== seat) return;

      const result = play
        ? room.handlePlayCards(npc.id, play.map(c => c.id))
        : room.handlePass(npc.id);

      if (result?.events) {
        if (decisionLog && room.gameState.roundHistory?.length > 0) {
          const lastRecord = room.gameState.roundHistory[room.gameState.roundHistory.length - 1];
          if (lastRecord) lastRecord.npcReason = decisionLog.explanation;
        }
        this._broadcastGameEvents(room, result.events);

        // 教学 NPC 解释
        if (npc.npcType === 'teaching' && decisionLog?.explanation && play) {
          for (const player of room.players) {
            if (!player || player.isNPC) continue;
            const conn = this.connections.get(player.id);
            if (conn) {
              conn.send({
                type: 'NPC_EXPLAIN',
                seat,
                explanation: decisionLog.explanation,
                primaryReason: decisionLog.primaryReason,
              });
            }
          }
        }
      }
    }, thinkDelay);
  }
}
