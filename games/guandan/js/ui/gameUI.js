/**
 * gameUI.js — 游戏界面控制器
 */

class GameUI {
  constructor() {
    this.currentScreen = 'lobby';
    this.selectedCardIds = new Set();
    this.myHand = [];
    this.mySeat = -1;
    this.lastPlayedCards = {};  // seat -> cards
    this.isMyTurn = false;
    this.currentLevel = 2;
    this.roundCount = 0;
    this.prevTeam1Level = null;
    this.prevTeam2Level = null;
    // Phase 3 任务 3.3：每个 quadrant 的 2500ms 自动淡出 timer
    this.quadrantFadeTimers = { bottom: null, top: null, left: null, right: null };
  }

  // ====== 画面切换 ======
  showScreen(screenName) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(`${screenName}-screen`).classList.add('active');
    this.currentScreen = screenName;
  }

  // ====== 大厅 ======
  setLobbyStatus(text) {
    document.getElementById('lobby-status').textContent = text;
  }

  // ====== 房间 ======
  showRoom(roomId) {
    this.showScreen('room');
    document.getElementById('room-id-display').textContent = roomId;
  }

  updateRoomPlayers(players, mySeat) {
    this.mySeat = mySeat;
    for (let i = 0; i < 4; i++) {
      const seatEl = document.getElementById(`seat-${i}`);
      const player = players[i];

      seatEl.className = 'seat-card';

      if (player) {
        seatEl.classList.add('occupied');
        // 如果是机器人，显示特定头像
        if (player.isNPC) {
          seatEl.querySelector('.seat-avatar').textContent = '🤖';
          seatEl.querySelector('.seat-name').textContent = `${player.nickname} (${this.getDifficultyLabel(player.level)})`;
        } else {
          seatEl.querySelector('.seat-avatar').textContent = i === mySeat ? '🙋' : '👤';
          seatEl.querySelector('.seat-name').textContent = player.nickname || `玩家${i + 1}`;
        }

        let statusHtml = '';
        if (player.ready) {
          seatEl.classList.add('ready');
          statusHtml = '✅ 已准备';
        } else {
          statusHtml = '等待准备...';
        }

        // 如果是机器人且我是房主，显示移除按钮
        const isHost = mySeat === 0;
        if (player.isNPC && isHost) {
          statusHtml += `
            <div class="npc-actions" style="margin-top: 5px;">
              <button class="btn btn-tiny btn-danger" onclick="gameUI.requestRemoveNPC(${i})">移除</button>
            </div>
          `;
        }
        seatEl.querySelector('.seat-status').innerHTML = statusHtml;

        if (i === mySeat) {
          seatEl.classList.add('me');
        }
      } else {
        seatEl.querySelector('.seat-avatar').textContent = '👤';
        seatEl.querySelector('.seat-name').textContent = '等待加入...';
        
        // 房主可以看到“添加机器人”按钮
        const isHost = players[mySeat] && mySeat === 0; // 简单协议: seat 0 是房主
        if (isHost) {
          seatEl.querySelector('.seat-status').innerHTML = `
            <div class="npc-selection">
              <div style="font-size:11px; margin-bottom:4px; color: var(--text-muted);">添加机器人</div>
              <div class="btn-group">
                <button class="btn btn-tiny btn-secondary" onclick="gameUI.confirmAddNPC('noob', ${i})">小白</button>
                <button class="btn btn-tiny btn-secondary" onclick="gameUI.confirmAddNPC('normal', ${i})">普通</button>
                <button class="btn btn-tiny btn-secondary" onclick="gameUI.confirmAddNPC('expert', ${i})">专家</button>
              </div>
            </div>
          `;
        } else {
          seatEl.querySelector('.seat-status').textContent = '';
        }
      }
    }
  }

  confirmAddNPC(level, seatIndex) {
    window.gameSocket.addNPC(level, seatIndex);
  }

  getDifficultyLabel(level) {
    const labels = { noob: '小白', normal: '普通', expert: '专家' };
    return labels[level] || '普通';
  }

  requestRemoveNPC(seatIndex) {
    if (confirm('确定要移除这个机器人吗？')) {
      window.gameSocket.removeNPC(seatIndex);
    }
  }

  showStartButton(isHost) {
    const btn = document.getElementById('start-game-btn');
    btn.style.display = isHost ? 'inline-flex' : 'none';
  }

  // ====== 游戏界面 ======
  startGame(hand, mySeat, currentLevel, team1Level, team2Level) {
    this.showScreen('game');
    this.myHand = hand;
    this.mySeat = mySeat;
    this.selectedCardIds.clear();
    this.lastPlayedCards = {};
    if (currentLevel !== undefined) this.currentLevel = currentLevel;

    this.updateLevelDisplay(currentLevel, team1Level, team2Level);
    this.renderMyHand();
    this.clearAllPlayed();
  }

  updateLevelDisplay(currentLevel, team1Level, team2Level) {
    const rankNames = { 2:'2', 3:'3', 4:'4', 5:'5', 6:'6', 7:'7', 8:'8', 9:'9', 10:'10', 11:'J', 12:'Q', 13:'K', 14:'A' };
    document.getElementById('team1-level').textContent = `🔴 ${rankNames[team1Level] || team1Level}`;
    document.getElementById('team2-level').textContent = `🔵 ${rankNames[team2Level] || team2Level}`;
    document.getElementById('current-level-badge').textContent = `级牌: ${rankNames[currentLevel] || currentLevel}`;
  }

  renderMyHand() {
    const container = document.getElementById('hand-area');
    window.CardRenderer.renderHand(container, this.myHand, this.selectedCardIds);
  }

  toggleCardSelection(cardId) {
    if (this.selectedCardIds.has(cardId)) {
      this.selectedCardIds.delete(cardId);
    } else {
      this.selectedCardIds.add(cardId);
    }
    this.renderMyHand();
  }

  getSelectedCardIds() {
    return [...this.selectedCardIds];
  }

  clearSelection() {
    this.selectedCardIds.clear();
    this.renderMyHand();
  }

  // 理牌：按点数排序（小到大），同点数按花色排，大小王排最后
  sortHand() {
    this.myHand.sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return a.suit - b.suit;
    });
    this.selectedCardIds.clear();
    this.renderMyHand();
  }

  // 从手牌中移除已出的牌
  removeCardsFromHand(cardIds) {
    this.myHand = this.myHand.filter(c => !cardIds.includes(c.id));
    this.selectedCardIds.clear();
    this.renderMyHand();
  }

  // 显示某个玩家出的牌
  // Phase 3 任务 3.2：改造为飞入中央舞台对应象限，每张牌错开 40ms
  // Phase 3 任务 3.3：新出牌时其他 quadrant 立即淡出；本 quadrant 排 2500ms 自动淡出
  showPlayedCards(seat, cards, handType) {
    this.lastPlayedCards[seat] = { cards, handType };
    const position = this.getPlayerPosition(seat);  // 'bottom' | 'top' | 'left' | 'right'

    // 任务 3.3：新出牌触发其他 quadrant 立即淡出（"下家出牌后，前一手立即淡出"）
    ['bottom', 'top', 'left', 'right'].forEach(pos => {
      if (pos !== position) this.fadeOutQuadrant(pos);
    });

    // 渲染目标改为中央舞台的对应 quadrant
    const stageContainer = document.getElementById(`stage-${position}`);
    if (stageContainer) {
      // 任务 3.3：取消当前 quadrant 的旧 fade timer + 移除 fading-out class（重置）
      if (this.quadrantFadeTimers[position]) {
        clearTimeout(this.quadrantFadeTimers[position]);
        this.quadrantFadeTimers[position] = null;
      }
      stageContainer.classList.remove('fading-out');

      window.CardRenderer.renderPlayedCards(stageContainer, cards);

      // 给每张牌加 fly-from-${position} class + 错开 40ms 的 animation-delay
      const cardEls = stageContainer.querySelectorAll('.card');
      cardEls.forEach((cardEl, i) => {
        cardEl.classList.add(`flying-from-${position}`);
        cardEl.style.animationDelay = `${i * 40}ms`;
      });

      // 任务 3.3：2500ms 后自动淡出（duration-linger）
      this.quadrantFadeTimers[position] = setTimeout(() => {
        this.fadeOutQuadrant(position);
      }, 2500);
    }

    // 中央 play-info 仍显示文字（保持 task 3.3 之前的兼容性）
    const centerInfo = document.getElementById('play-info');
    const playerName = this.getPlayerName(seat);
    centerInfo.textContent = `${playerName}: ${handType}`;

    // 炸弹特效
    if (handType.includes('炸') || handType.includes('同花顺')) {
      this.triggerBombEffect();
    }
  }

  // Phase 3 任务 3.3：淡出指定象限（duration-normal 250ms 后清空容器）
  fadeOutQuadrant(position) {
    const stageContainer = document.getElementById(`stage-${position}`);
    if (!stageContainer || stageContainer.children.length === 0) return;

    // 取消该 quadrant 的待执行 timer（如果有）
    if (this.quadrantFadeTimers[position]) {
      clearTimeout(this.quadrantFadeTimers[position]);
      this.quadrantFadeTimers[position] = null;
    }

    // 触发 CSS opacity transition 淡出
    stageContainer.classList.add('fading-out');

    // duration-normal (250ms) 后清空容器并复原状态
    setTimeout(() => {
      stageContainer.innerHTML = '';
      stageContainer.classList.remove('fading-out');
    }, 250);
  }

  triggerBombEffect() {
    const el = document.getElementById('bomb-effect');
    if (!el) return;

    el.classList.remove('animate');
    void el.offsetWidth; // 触发重绘
    el.classList.add('animate');

    // 可以在这里添加震屏效果
    const gameScreen = document.getElementById('game-screen');
    gameScreen.classList.add('shake');
    setTimeout(() => gameScreen.classList.remove('shake'), 500);
  }

  showPass(seat) {
    const position = this.getPlayerPosition(seat);
    const container = document.getElementById(`played-${position}`);
    if (container) {
      container.innerHTML = '<span style="color: var(--text-muted); font-size: 14px;">不出</span>';
    }
  }

  clearAllPlayed() {
    ['top', 'left', 'right'].forEach(pos => {
      const el = document.getElementById(`played-${pos}`);
      if (el) el.innerHTML = '';
    });
    // Phase 3 任务 3.2：同时清掉新的中央舞台 4 quadrant（跨局/重新发牌时）
    // Phase 3 任务 3.3：同时清掉所有自动淡出 timer，避免跨局残留
    ['bottom', 'top', 'left', 'right'].forEach(pos => {
      if (this.quadrantFadeTimers[pos]) {
        clearTimeout(this.quadrantFadeTimers[pos]);
        this.quadrantFadeTimers[pos] = null;
      }
      const el = document.getElementById(`stage-${pos}`);
      if (el) {
        el.innerHTML = '';
        el.classList.remove('fading-out');
      }
    });
    document.getElementById('play-info').textContent = '';
  }

  // 更新其他玩家的手牌数量
  updateOtherPlayerCount(seat, count) {
    const position = this.getPlayerPosition(seat);
    const countEl = document.getElementById(`player-${position}-count`);
    if (countEl) {
      countEl.textContent = count === -1 ? '10+' : count;
    }
  }

  // 更新轮次高亮
  updateTurnHighlight(currentTurn) {
    // Phase 3 任务 3.1：检测"非我 → 我"切换瞬间，用于触发出牌按钮涌现
    const wasMyTurn = this.isMyTurn;
    this.isMyTurn = currentTurn === this.mySeat;

    // 移除所有高亮
    document.querySelectorAll('.player-info').forEach(el => el.classList.remove('active-turn'));

    if (currentTurn === this.mySeat) {
      // 高亮自己
      this.showMessage('轮到你出牌！');
    } else {
      const position = this.getPlayerPosition(currentTurn);
      const infoEl = document.querySelector(`#player-${position} .player-info`);
      if (infoEl) infoEl.classList.add('active-turn');
    }

    // 更新按钮状态
    const actionBtns = document.getElementById('action-buttons');
    actionBtns.style.opacity = this.isMyTurn ? '1' : '0.4';
    actionBtns.style.pointerEvents = this.isMyTurn ? 'auto' : 'none';

    // Phase 3 任务 3.1：我的回合刚开始时，出牌按钮一次性涌现（scale 1.04→1.0 spring）
    if (this.isMyTurn && !wasMyTurn) {
      const playBtn = document.getElementById('play-btn');
      if (playBtn) {
        playBtn.classList.remove('summon');
        // 强制 reflow，确保即使连续两次"非我→我"也能重启动画（仿照 triggerBombEffect 的模式）
        void playBtn.offsetWidth;
        playBtn.classList.add('summon');
      }
    }
  }

  // 更新玩家名称
  updatePlayerNames(players) {
    for (let i = 0; i < 4; i++) {
      if (i === this.mySeat || !players[i]) continue;
      const position = this.getPlayerPosition(i);
      const nameEl = document.getElementById(`player-${position}-name`);
      if (nameEl) {
        nameEl.textContent = players[i].nickname || `玩家${i + 1}`;
      }
    }
  }

  // 获取座位相对于自己的位置
  getPlayerPosition(seat) {
    const relative = (seat - this.mySeat + 4) % 4;
    const posMap = { 0: 'bottom', 1: 'right', 2: 'top', 3: 'left' };
    return posMap[relative];
  }

  getPlayerName(seat) {
    const position = this.getPlayerPosition(seat);
    if (position === 'bottom') return '我';
    const nameEl = document.getElementById(`player-${position}-name`);
    return nameEl ? nameEl.textContent : `玩家${seat + 1}`;
  }

  // 显示消息
  showMessage(text, duration = 2000) {
    const el = document.getElementById('game-message');
    el.textContent = text;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), duration);
  }

  // ====== 结算弹窗 ======
  showRoundResult(data) {
    const rankNames = { 2:'2',3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'J',12:'Q',13:'K',14:'A' };
    const medals = ['🥇','🥈','🥉','4️⃣'];
    const teamOf = seat => (seat === 0 || seat === 2) ? 'team1' : 'team2';

    // 描述行
    document.getElementById('result-desc').textContent = data.description || '';

    // 名次列表
    const ranksEl = document.getElementById('result-ranks');
    ranksEl.innerHTML = data.finishOrder.map((seat, idx) => {
      const name = seat === this.mySeat ? '你' : this.getPlayerName(seat);
      const team = teamOf(seat);
      return `<div class="result-rank-item rank-${idx + 1}">
        <span class="rank-medal">${medals[idx]}</span>
        <span class="rank-team-dot ${team}"></span>
        <span class="rank-name">${name}</span>
      </div>`;
    }).join('');

    // 等级变化
    const levelsEl = document.getElementById('result-levels');
    const makeBlock = (label, oldLv, newLv, upgrade) => {
      const oldStr = oldLv !== null ? `<span class="level-old">${rankNames[oldLv]||oldLv}</span><span class="level-arrow">→</span>` : '';
      const newStr = `<span class="level-new">${rankNames[newLv]||newLv}</span>`;
      const badge = upgrade > 0
        ? `<span class="upgrade-badge up">+${upgrade}级</span>`
        : `<span class="upgrade-badge same">持平</span>`;
      return `<div class="level-change-block">
        <div class="level-change-label">${label}</div>
        <div class="level-change-value">${oldStr}${newStr}</div>
        ${badge}
      </div>`;
    };
    levelsEl.innerHTML =
      makeBlock('🔴 队伍A', this.prevTeam1Level, data.team1Level, data.team1Upgrade || 0) +
      makeBlock('🔵 队伍B', this.prevTeam2Level, data.team2Level, data.team2Upgrade || 0);

    // 炸弹数
    document.getElementById('result-bombs').textContent = `💣 本局炸弹：${data.bombCount || 0}`;

    document.getElementById('result-overlay').style.display = 'flex';
  }

  hideRoundResult() {
    document.getElementById('result-overlay').style.display = 'none';
  }

  // 更新顶部积分面板（每局结束时调用）
  updateScorePanel(data) {
    this.prevTeam1Level = data.team1Level - (data.team1Upgrade || 0);
    this.prevTeam2Level = data.team2Level - (data.team2Upgrade || 0);
    const rankNames = { 2:'2',3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'J',12:'Q',13:'K',14:'A' };
    document.getElementById('team1-level').textContent = `🔴 ${rankNames[data.team1Level] || data.team1Level}`;
    document.getElementById('team2-level').textContent = `🔵 ${rankNames[data.team2Level] || data.team2Level}`;
  }

  // 开始新一局时递增局数
  incrementRound() {
    this.roundCount++;
    const badge = document.getElementById('round-badge');
    if (badge) badge.textContent = `第${this.roundCount}局`;
  }

  // 显示还贡 UI（赢家选一张牌还给输家）
  showReturnTributeUI(data) {
    const overlay = document.getElementById('tribute-overlay');
    const title = document.getElementById('tribute-title');
    const desc = document.getElementById('tribute-desc');
    const hint = document.getElementById('tribute-hint-text');
    const receivedArea = document.getElementById('tribute-received');
    const receivedCards = document.getElementById('tribute-received-cards');
    const handArea = document.getElementById('tribute-hand');
    if (!overlay) return;

    const isReturner = data.fromSeats?.includes(this.mySeat);
    if (!isReturner) {
      title.textContent = '等待还贡...';
      desc.textContent = '赢家正在选择还贡的牌';
      hint.textContent = '';
      handArea.innerHTML = '';
      receivedArea.style.display = 'none';
      overlay.style.display = 'flex';
      return;
    }

    title.textContent = '还贡：选一张牌还给输家';
    desc.textContent = '请从手牌中选一张（不能是级牌）还给对方';
    hint.textContent = '还贡规则：不能用级牌还贡';

    // 展示收到的进贡牌（informational）
    if (data.tributeCards && data.tributeCards.length > 0) {
      receivedArea.style.display = 'flex';
      receivedCards.innerHTML = '';
      data.tributeCards.forEach(card => {
        const el = window.CardRenderer.createCardElement(card, { played: true });
        receivedCards.appendChild(el);
      });
    } else {
      receivedArea.style.display = 'none';
    }

    // 渲染自己的手牌供还贡选择（过滤级牌）
    handArea.innerHTML = '';
    const currentLevel = this.currentLevel;
    this.myHand.forEach(card => {
      const el = window.CardRenderer.createCardElement(card);
      if (card.rank === currentLevel) {
        el.style.opacity = '0.35';
        el.title = '级牌不能用于还贡';
      } else {
        el.style.cursor = 'pointer';
        el.addEventListener('click', () => {
          overlay.style.display = 'none';
          window.gameSocket.send({ type: 'RETURN_TRIBUTE', cardId: card.id });
        });
      }
      handArea.appendChild(el);
    });

    overlay.style.display = 'flex';
  }

  // 关闭进贡弹窗
  hideTributeUI() {
    const overlay = document.getElementById('tribute-overlay');
    if (overlay) overlay.style.display = 'none';
    const receivedArea = document.getElementById('tribute-received');
    if (receivedArea) receivedArea.style.display = 'none';
  }

  showGameOver(winner, finalLevel) {
    const overlay = document.getElementById('gameover-overlay');
    const title = document.getElementById('gameover-title');
    const details = document.getElementById('gameover-details');

    const myTeam = (this.mySeat === 0 || this.mySeat === 2) ? 'team1' : 'team2';
    const isWinner = winner === myTeam;

    title.textContent = isWinner ? '🎉 胜利！' : '😢 失败...';
    details.textContent = `${winner === 'team1' ? '🔴 队伍A' : '🔵 队伍B'} 率先打到 A，获得胜利！`;

    overlay.style.display = 'flex';
  }

  hideGameOver() {
    document.getElementById('gameover-overlay').style.display = 'none';
  }
}

window.gameUI = new GameUI();
