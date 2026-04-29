/**
 * loopback.js — 静态托管下用于替代 WebSocket 的本地"假服务器"适配器
 *
 * 与 GameSocket 完全相同的 API（connect / send / on），但消息走的是
 * 本地 LoopbackServer，单玩家 + 3 个 NPC 直接在浏览器跑。
 */

import { LoopbackServer } from '../../server-runtime/index.js';

class LoopbackSocket {
  constructor() {
    this.handlers = {};
    this.playerId = null;
    this.nickname = null;
    this.server = new LoopbackServer();
    this._connected = false;
  }

  async connect(_url) {
    this.playerId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    this.server.attach(this.playerId, (msg) => this._dispatchToClient(msg));
    this._connected = true;
    console.log('🦞 Loopback 连接已建立 (单机演示模式)');
    return Promise.resolve();
  }

  send(msg) {
    if (!this._connected) return;
    console.log('📤 [Loopback] →', msg.type, msg);
    // 异步分发，避免同步调用栈
    Promise.resolve().then(() => this.server.dispatch(this.playerId, msg));
  }

  on(type, handler) {
    this.handlers[type] = handler;
  }

  _dispatchToClient(msg) {
    console.log('📩 [Loopback] ←', msg.type, msg);
    if (this.handlers[msg.type]) this.handlers[msg.type](msg);
    if (this.handlers['*']) this.handlers['*'](msg);
  }

  // 与 GameSocket 一致的便捷方法
  login(nickname) { this.nickname = nickname; this.send({ type: 'LOGIN', nickname }); }
  createRoom() { this.send({ type: 'CREATE_ROOM' }); }
  joinRoom(roomId) { this.send({ type: 'JOIN_ROOM', roomId }); }
  ready() { this.send({ type: 'READY' }); }
  startGame() { this.send({ type: 'START_GAME' }); }
  playCards(cardIds) { this.send({ type: 'PLAY_CARDS', cardIds }); }
  pass() { this.send({ type: 'PASS' }); }
  hint() { this.send({ type: 'HINT' }); }
  addNPC(level, seat) { this.send({ type: 'ADD_NPC', level, seat }); }
  removeNPC(seat) { this.send({ type: 'REMOVE_NPC', seat }); }
  nextRound() { this.send({ type: 'NEXT_ROUND' }); }
}

window.gameSocket = new LoopbackSocket();
