/**
 * app.js — 掼蛋客户端入口
 *
 * 连接 WebSocket，绑定事件处理，协调 UI 和网络。
 */

(function () {
  let socket; // 延迟绑定，因为 loopback 是 ES module 异步加载
  const ui = window.gameUI;
  const isStaticHost = !!window.__GUANDAN_STATIC_HOST__;

  // 等 gameSocket 就绪（loopback 是 ES module，异步注册到 window）
  async function waitForSocket() {
    if (window.gameSocket) return window.gameSocket;
    return new Promise((resolve) => {
      const tryGet = () => {
        if (window.gameSocket) resolve(window.gameSocket);
        else setTimeout(tryGet, 50);
      };
      window.addEventListener('gameSocketReady', () => resolve(window.gameSocket), { once: true });
      tryGet();
    });
  }

  // ====== 初始化 ======
  async function init() {
    socket = await waitForSocket();
    bindSocketEvents();
    bindUIEvents();

    if (isStaticHost) {
      // 静态模式：本地 loopback 服务器
      try {
        await socket.connect('loopback');
        ui.setLobbyStatus('🦞 演示模式 · 与 3 个 AI 机器人对战（输入昵称 → 创建房间）');
      } catch (e) {
        ui.setLobbyStatus('本地引擎初始化失败');
      }
    } else {
      // 真服务器
      try {
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${proto}//${window.location.host}`;
        await socket.connect(wsUrl);
        ui.setLobbyStatus('已连接到服务器 ✅');
      } catch (e) {
        ui.setLobbyStatus('连接服务器失败 ❌ 请刷新重试');
      }
    }
  }

  // ====== WebSocket 事件 ======
  function bindSocketEvents() {
    socket.on('LOGIN_OK', (msg) => {
      socket.playerId = msg.playerId;
      socket.nickname = msg.nickname;
      ui.setLobbyStatus(`欢迎, ${msg.nickname}! 创建或加入房间吧`);
      // 如果是点击教程按钮触发的登录，自动开始对应课程
      if (socket.pendingLesson) {
        const lessonId = socket.pendingLesson;
        socket.pendingLesson = null;
        socket.send({ type: 'START_TUTORIAL', lessonId });
      }
    });

    socket.on('ROOM_CREATED', (msg) => {
      ui.showRoom(msg.roomId);
      ui.showStartButton(true);
      // 静态模式：自动添加 3 个 NPC + 自己 ready，免去用户手动操作
      if (isStaticHost) {
        setTimeout(() => {
          socket.addNPC('normal', 1);
          socket.addNPC('normal', 2);
          socket.addNPC('normal', 3);
          socket.ready(); // 自动标记自己已准备
        }, 200);
      }
    });

    socket.on('JOINED_ROOM', (msg) => {
      ui.showRoom(msg.roomId);
      ui.showStartButton(false);
    });

    socket.on('ROOM_UPDATE', (msg) => {
      ui.updateRoomPlayers(msg.players, msg.seat);

      // 在房间页面时检查是否是房主
      if (ui.currentScreen === 'room') {
        // 简单处理: 第一个进来的是房主
        const allReady = msg.players.every(p => p !== null && p.ready);
        const allJoined = msg.players.every(p => p !== null);
        if (allReady && allJoined) {
          ui.showStartButton(true);
        }
      }

      // 如果在游戏中，更新玩家名称
      if (ui.currentScreen === 'game') {
        ui.updatePlayerNames(msg.players);
      }
    });

    socket.on('GAME_START', (msg) => {
      ui.incrementRound();
      ui.startGame(msg.hand, msg.mySeat, msg.currentLevel, msg.team1Level, msg.team2Level);
    });

    socket.on('TURN_UPDATE', (msg) => {
      ui.updateTurnHighlight(msg.currentTurn);
    });

    socket.on('CARDS_PLAYED', (msg) => {
      ui.showPlayedCards(msg.seat, msg.cards, msg.handType);

      // 更新其他玩家手牌数
      if (msg.seat !== ui.mySeat) {
        ui.updateOtherPlayerCount(msg.seat, msg.remainingCards);
      } else {
        // 自己出的牌, 更新手牌
        const playedIds = msg.cards.map(c => c.id);
        ui.removeCardsFromHand(playedIds);
      }
    });

    socket.on('PLAYER_PASS', (msg) => {
      ui.showPass(msg.seat);
    });

    socket.on('PLAYER_FINISHED', (msg) => {
      const name = msg.seat === ui.mySeat ? '你' : ui.getPlayerName(msg.seat);
      ui.showMessage(`${name} 出完了！第${msg.position}名 🎉`, 3000);
    });

    socket.on('ROUND_END', (msg) => {
      ui.updateScorePanel(msg);
      ui.showRoundResult(msg);
    });

    socket.on('GAME_OVER', (msg) => {
      setTimeout(() => {
        ui.hideRoundResult();
        ui.showGameOver(msg.winner, msg.finalLevel);
      }, 1000);
    });

    socket.on('HINT_RESULT', (msg) => {
      if (msg.hints && msg.hints.length > 0) {
        // 选中第一个提示的牌
        ui.selectedCardIds.clear();
        for (const card of msg.hints[0]) {
          ui.selectedCardIds.add(card.id);
        }
        ui.renderMyHand();
        ui.showMessage(`找到 ${msg.hints.length} 种出法`, 1500);
      } else {
        ui.showMessage('没有能管住的牌 😅', 1500);
      }
    });

    socket.on('TUTORIAL_STARTED', (msg) => {
      handleTutorialStarted(msg);
    });

    socket.on('TUTORIAL_FEEDBACK', (msg) => {
      handleTutorialFeedback(msg);
    });

    socket.on('NPC_EXPLAIN', (msg) => {
      showNPCExplain(msg.seat, msg.explanation);
    });

    socket.on('TRIBUTE_REQUEST', (msg) => {
      showTributeUI(msg);
    });

    socket.on('TRIBUTE_DONE', (msg) => {
      ui.showMessage(`座位${msg.seat}已完成进贡`);
    });

    socket.on('RETURN_REQUEST', (msg) => {
      ui.showReturnTributeUI(msg);
    });

    socket.on('RETURN_DONE', (msg) => {
      ui.showMessage(`座位${msg.seat}已还贡`);
    });

    socket.on('TRIBUTE_COMPLETED', () => {
      ui.hideTributeUI();
    });

    socket.on('ERROR', (msg) => {
      ui.showMessage(msg.message, 2000);
      console.error('服务端错误:', msg.message);
    });

    socket.on('disconnected', () => {
      ui.showMessage('与服务器断开连接 😢', 5000);
    });
  }

  // ====== UI 事件绑定 ======
  function bindUIEvents() {
    // 大厅 - 创建房间
    document.getElementById('create-room-btn').addEventListener('click', () => {
      const nickname = document.getElementById('nickname-input').value.trim() || '匿名玩家';
      socket.login(nickname);
      setTimeout(() => socket.createRoom(), 200);
    });

    // 大厅 - 加入房间
    document.getElementById('join-room-btn').addEventListener('click', () => {
      const nickname = document.getElementById('nickname-input').value.trim() || '匿名玩家';
      const roomId = document.getElementById('room-id-input').value.trim();
      if (!roomId) {
        ui.setLobbyStatus('请输入房间号');
        return;
      }
      socket.login(nickname);
      setTimeout(() => socket.joinRoom(roomId), 200);
    });

    // 房间 - 复制房间号
    document.getElementById('copy-room-id-btn').addEventListener('click', () => {
      const roomId = document.getElementById('room-id-display').textContent;
      navigator.clipboard.writeText(roomId).then(() => {
        ui.showMessage('房间号已复制 📋');
      }).catch(() => {
        // 降级方案
        prompt('请复制房间号:', roomId);
      });
    });

    // 房间 - 准备
    document.getElementById('ready-btn').addEventListener('click', () => {
      socket.ready();
    });

    // 房间 - 开始游戏
    document.getElementById('start-game-btn').addEventListener('click', () => {
      socket.startGame();
    });

    // 游戏 - 出牌
    document.getElementById('play-btn').addEventListener('click', () => {
      const cardIds = ui.getSelectedCardIds();
      if (cardIds.length === 0) {
        ui.showMessage('请先选择要出的牌');
        return;
      }
      // 教学模式走 TUTORIAL_ACTION 通道
      if (ui.isTutorialMode) {
        socket.send({ type: 'TUTORIAL_ACTION', action: { type: 'PLAY', cardIds } });
      } else {
        socket.playCards(cardIds);
      }
    });

    // 游戏 - 不出
    document.getElementById('pass-btn').addEventListener('click', () => {
      if (ui.isTutorialMode) {
        socket.send({ type: 'TUTORIAL_ACTION', action: { type: 'PASS' } });
      } else {
        socket.pass();
      }
    });

    // 游戏 - 提示
    document.getElementById('hint-btn').addEventListener('click', () => {
      if (ui.isTutorialMode) {
        ui.showMessage('教学模式：按提示选牌后点出牌');
      } else {
        socket.hint();
      }
    });

    // 结算 - 下一局
    document.getElementById('next-round-btn').addEventListener('click', () => {
      ui.hideRoundResult();
      socket.nextRound();
    });

    // 游戏结束 - 回大厅
    document.getElementById('back-to-lobby-btn').addEventListener('click', () => {
      ui.hideGameOver();
      ui.showScreen('lobby');
    });
  }

  // ====== 教学模式处理 ======

  // 大厅页教学课程按钮
  document.querySelectorAll('.btn-tutorial').forEach(btn => {
    btn.addEventListener('click', () => {
      const lessonId = btn.dataset.lesson;
      // 如果还没登录，先自动登录（pendingLesson 在 LOGIN_OK 里处理）
      if (!socket.playerId) {
        const nickname = document.getElementById('nickname-input').value.trim() || '新手玩家';
        socket.pendingLesson = lessonId;   // 暂存，LOGIN_OK 后自动发送
        socket.login(nickname);
      } else {
        socket.send({ type: 'START_TUTORIAL', lessonId });
      }
    });
  });

  // 教学"继续"按钮
  document.getElementById('tutorial-next-btn')?.addEventListener('click', () => {
    socket.send({ type: 'TUTORIAL_ACTION', action: { type: 'NEXT' } });
  });

  // 当前教学课程元信息（跨步骤保留 totalSteps）
  let _tutorialMeta = { title: '教学', totalSteps: 3 };

  // 处理服务端推送的教学消息
  function handleTutorialStarted(data) {
    // 标记进入教学模式（影响出牌/不出按钮的消息路由）
    ui.isTutorialMode = true;
    // 保存课程元信息，供后续步骤使用
    _tutorialMeta = {
      title: data.lessonConfig?.title || '教学',
      totalSteps: data.lessonConfig?.totalSteps || 3,
    };
    // 用 startGame 初始化游戏界面（切屏 + 渲染手牌）
    ui.startGame(data.hand || [], 0, data.currentLevel || 2, 2, 2);
    // 教学模式：玩家始终是 seat 0 的回合，开启出牌按钮
    ui.updateTurnHighlight(0);
    // 显示教学引导浮层
    showTutorialStep(data.currentStep, data.lessonConfig);
  }

  function showTutorialStep(step, lessonConfig) {
    if (!step) {
      hideTutorialOverlay();
      return;
    }
    const overlay = document.getElementById('tutorial-overlay');
    const progress = document.getElementById('tutorial-progress');
    const prompt = document.getElementById('tutorial-prompt');
    const nextBtn = document.getElementById('tutorial-next-btn');

    const title = lessonConfig?.title || _tutorialMeta.title;
    const total = lessonConfig?.totalSteps || _tutorialMeta.totalSteps;
    const idx = lessonConfig?.currentStepIndex ?? 0;

    overlay.style.display = 'block';
    progress.textContent = `${title} · 步骤 ${idx + 1}/${total}`;
    prompt.textContent = step.prompt || '';

    // NEXT类型步骤显示"继续"按钮，其他类型（需要出牌）隐藏
    nextBtn.style.display = (step.expectedAction === 'NEXT') ? 'inline-block' : 'none';
  }

  function hideTutorialOverlay() {
    document.getElementById('tutorial-overlay').style.display = 'none';
  }

  function handleTutorialFeedback(data) {
    if (data.completed) {
      ui.isTutorialMode = false;  // 退出教学模式
      hideTutorialOverlay();
      const prompt = document.getElementById('tutorial-prompt');
      const overlay = document.getElementById('tutorial-overlay');
      if (prompt) prompt.textContent = '🎉 课程完成！你已掌握这一关的内容。';
      if (overlay) overlay.style.display = 'block';
      setTimeout(() => {
        hideTutorialOverlay();
        // 回到大厅
        ui.showScreen('lobby');
      }, 3000);
      return;
    }
    if (data.correct) {
      // 出牌成功：从手牌中移除已出的牌
      if (data.playedCardIds && data.playedCardIds.length > 0) {
        ui.removeCardsFromHand(data.playedCardIds);
      }
      if (data.nextStep) {
        showTutorialStep(data.nextStep, {
          title: _tutorialMeta.title,
          currentStepIndex: data.nextStepIndex,
          totalSteps: _tutorialMeta.totalSteps,
        });
      }
      if (data.explanation) {
        ui.showMessage(data.explanation, 1500);
      }
    } else {
      // 操作错误：在浮层内显示提示，2秒后恢复
      const prompt = document.getElementById('tutorial-prompt');
      if (prompt) {
        const original = prompt.textContent;
        prompt.textContent = '💡 ' + (data.explanation || '请按提示操作');
        setTimeout(() => { prompt.textContent = original; }, 2500);
      }
    }
  }

  function showNPCExplain(seat, explanation) {
    const bubble = document.getElementById('npc-explain-bubble');
    if (!bubble) return;
    bubble.textContent = `🤖 ${explanation}`;
    bubble.style.display = 'block';
    clearTimeout(window._npcBubbleTimer);
    window._npcBubbleTimer = setTimeout(() => { bubble.style.display = 'none'; }, 4000);
  }

  function showTributeUI(data) {
    const overlay = document.getElementById('tribute-overlay');
    const title = document.getElementById('tribute-title');
    const desc = document.getElementById('tribute-desc');
    const hint = document.getElementById('tribute-hint-text');

    if (!overlay) return;
    // 进贡阶段始终隐藏"收到进贡"区域（还贡阶段才显示）
    const receivedArea = document.getElementById('tribute-received');
    if (receivedArea) receivedArea.style.display = 'none';

    const isSender = data.fromSeats?.includes(ui.mySeat);
    title.textContent = isSender ? '进贡：选一张最大的牌' : '等待进贡...';
    desc.textContent = isSender ? '请选择你手中最大的牌进贡给赢家' : '等待其他玩家进贡';
    hint.textContent = '进贡规则：输方需要把手中最大的牌送给上局赢家';
    overlay.style.display = 'flex';

    if (isSender) {
      // 渲染手牌供选择
      const handArea = document.getElementById('tribute-hand');
      if (handArea && ui.myHand) {
        handArea.innerHTML = '';
        ui.myHand.forEach(card => {
          const div = document.createElement('div');
          div.className = 'card';
          div.textContent = `${card.rank}`;
          div.onclick = () => {
            document.getElementById('tribute-overlay').style.display = 'none';
            socket.send({ type: 'TRIBUTE', cardId: card.id });
          };
          handArea.appendChild(div);
        });
      }
    }
  }

  // 页面加载完后初始化
  window.addEventListener('DOMContentLoaded', init);
})();
