/**
 * app.js — 掼蛋客户端入口
 *
 * 连接 WebSocket，绑定事件处理，协调 UI 和网络。
 */

(function () {
  let socket; // 延迟绑定，因为 loopback 是 ES module 异步加载
  const ui = window.gameUI;
  const isStaticHost = !!window.__GUANDAN_STATIC_HOST__;

  // P1.2：?debug=1 模式开关——通过 body class 让 CSS 控制信息泡显隐
  const isDebugMode = location.search.includes('debug=1');
  if (isDebugMode) {
    document.body.classList.add('debug-mode');
    console.log('[NPC] 调试模式已开启（?debug=1），NPC 决策信息泡将在每次出牌时显示');
  }

  // ====== 单人模式配置 ======
  let appMode = 'solo';   // 'solo' | 'multi'
  let isSoloLaunch = false;

  // 技能 ID 列表（与 SkillProfiles.js 对应）
  const ALL_SKILL_IDS = [
    'r1_yield', 'r2_bomb_timing', 'r3_decomp_quality', 'r4_memory',
    'r5_level_guard', 'r6_opponent_infer', 'r7_signal', 'r8_endgame', 'r9_lead_score',
    'r10_adaptive_lead', 'r11_wild_decomp', 'r12_hold_back', 'r13_exit_plan', 'r14_seq_guard', 'r15_triple_guard',
  ];
  const PROFILE_SKILLS = {
    noob:   [],
    normal: ['r1_yield', 'r2_bomb_timing', 'r3_decomp_quality', 'r4_memory'],
    expert: ALL_SKILL_IDS.slice(),
  };
  const PROFILE_LABELS = { noob: '小白', normal: '普通', expert: '专家', custom: '定制' };
  const SKILL_INFO = [
    { id: 'r1_yield',          label: '让队友',   desc: '队友领牌时主动让路' },
    { id: 'r2_bomb_timing',    label: '炸弹时机', desc: '对手快赢时精准用炸' },
    { id: 'r3_decomp_quality', label: '拆牌优化', desc: '跟牌选破坏最小方案' },
    { id: 'r4_memory',         label: '记牌',     desc: '记住场上已出的牌' },
    { id: 'r5_level_guard',    label: '护大牌',   desc: '不轻易消耗级牌/万能牌' },
    { id: 'r6_opponent_infer', label: '读对手',   desc: '推断对手无法应对的牌' },
    { id: 'r7_signal',         label: '传信号',   desc: '出牌时向队友暗示强弱' },
    { id: 'r8_endgame',        label: '残局',     desc: '少牌时精确规划出牌' },
    { id: 'r9_lead_score',     label: '出牌评分', desc: '评分挑选最优领牌' },
    { id: 'r10_adaptive_lead', label: '形势感知', desc: '按局势动态调整领牌策略' },
    { id: 'r11_wild_decomp',   label: '万能拆牌', desc: '利用万能牌填补顺子缺口' },
    { id: 'r12_hold_back',     label: '忍牌保型', desc: '避免破坏关键组合，适时不出' },
    { id: 'r13_exit_plan',     label: '出口规划', desc: '快要赢时优先留下无敌后手，加速清手' },
    { id: 'r14_seq_guard',     label: '顺子保护', desc: '跟牌时避免用顺子破坏手型，留作主动领牌' },
    { id: 'r15_triple_guard',  label: '三张保护', desc: '跟牌时避免拆散三带二组合，保留复合牌型' },
  ];

  // 每个 NPC 座位的当前配置（seat → { profile, customSkills }）
  const soloConfig = {
    2: { profile: 'normal', customSkills: [...PROFILE_SKILLS.normal] },  // 队友
    1: { profile: 'expert', customSkills: [...PROFILE_SKILLS.expert] },  // 对手一
    3: { profile: 'expert', customSkills: [...PROFILE_SKILLS.expert] },  // 对手二
  };

  /** 返回某座位的 skillProfile 数组（null = 用 level 默认） */
  function getSeatSkillArray(seat) {
    const cfg = soloConfig[seat];
    if (cfg.profile === 'noob')   return [];
    if (cfg.profile === 'normal') return [...PROFILE_SKILLS.normal];
    if (cfg.profile === 'expert') return [...PROFILE_SKILLS.expert];
    if (cfg.profile === 'custom') return [...cfg.customSkills];
    return null;
  }

  /** 返回某座位的 level 字符串 */
  function getSeatLevel(seat) {
    const cfg = soloConfig[seat];
    if (cfg.profile === 'custom') {
      const n = cfg.customSkills.length;
      return n === 0 ? 'noob' : n >= ALL_SKILL_IDS.length ? 'expert' : 'normal';
    }
    return cfg.profile; // noob/normal/expert
  }

  /** 初始化技能面板 DOM（在 bindUIEvents 之后调用一次） */
  function initSkillPanels() {
    for (const seat of [1, 2, 3]) {
      const panel = document.getElementById(`skill-panel-${seat}`);
      if (!panel) continue;
      panel.innerHTML = `<div class="skill-panel-title">⚙️ 自选技能</div>
        <div class="skill-grid">${SKILL_INFO.map(s => `
          <label class="skill-item">
            <input type="checkbox" class="skill-checkbox" data-seat="${seat}" data-skill="${s.id}">
            <span><span class="skill-item-label">${s.label}</span><span class="skill-item-desc">${s.desc}</span></span>
          </label>`).join('')}
        </div>`;
      // 绑定 checkbox 变化
      panel.querySelectorAll('.skill-checkbox').forEach(cb => {
        cb.addEventListener('change', () => {
          const s = parseInt(cb.dataset.seat);
          const skill = cb.dataset.skill;
          const skills = soloConfig[s].customSkills;
          if (cb.checked) { if (!skills.includes(skill)) skills.push(skill); }
          else { const idx = skills.indexOf(skill); if (idx >= 0) skills.splice(idx, 1); }
        });
      });
    }
  }

  /** 切换某座位的 profile（更新 UI + 状态） */
  function selectProfile(seat, profile, prevProfile) {
    soloConfig[seat].profile = profile;
    // 切换到 custom 时，用上一个 preset 初始化 checkboxes
    if (profile === 'custom') {
      const base = PROFILE_SKILLS[prevProfile] || PROFILE_SKILLS.expert;
      soloConfig[seat].customSkills = [...base];
      const panel = document.getElementById(`skill-panel-${seat}`);
      if (panel) {
        panel.querySelectorAll('.skill-checkbox').forEach(cb => {
          cb.checked = soloConfig[seat].customSkills.includes(cb.dataset.skill);
        });
        panel.style.display = 'block';
      }
    } else {
      const panel = document.getElementById(`skill-panel-${seat}`);
      if (panel) panel.style.display = 'none';
    }
    // 更新右上角 profile 名
    const nameEl = document.getElementById(`slot-name-${seat}`);
    if (nameEl) nameEl.textContent = PROFILE_LABELS[profile] || profile;
  }

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
    initSkillPanels();  // 生成定制技能面板 DOM

    if (isStaticHost) {
      // 静态模式：本地 loopback 服务器
      try {
        await socket.connect('loopback');
        ui.setLobbyStatus('🦞 本地模式 · 选择 NPC 配置后点击「开始对战」');
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
      // 单人模式：跳过房间等待页，直接配置 NPC 并开始
      if (isSoloLaunch) {
        isSoloLaunch = false;
        setTimeout(() => {
          for (const seat of [1, 2, 3]) {
            const level = getSeatLevel(seat);
            const skills = getSeatSkillArray(seat);
            socket.addNPC(level, seat, skills);
          }
          socket.ready();
          setTimeout(() => socket.startGame(), 400);
        }, 150);
        return; // 不跳转到房间页
      }
      // 多人模式：正常进入房间等待页
      ui.showRoom(msg.roomId);
      ui.showStartButton(true);
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
      // Fix：直接用 GAME_START 里的 currentTurn 激活按钮，不依赖后续 TURN_UPDATE
      if (msg.currentTurn !== undefined) {
        ui.updateTurnHighlight(msg.currentTurn);
      }
    });

    socket.on('TURN_UPDATE', (msg) => {
      // 新 trick 开始时先清空上一手的出牌记录，再高亮当前玩家
      if (msg.isNewTrick) {
        ui.clearAllPlayed();
      }
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
      // P1.2：debug 模式 → 每个 NPC 位卡旁的 trace bubble；非 debug → 原全局 explanation
      if (isDebugMode && msg.activatedSkills && msg.activatedSkills.length > 0) {
        showNPCTraceBubble(msg);
      } else if (msg.explanation) {
        showNPCExplain(msg.seat, msg.explanation);
      }
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

    // ── 模式切换 ──
    document.getElementById('solo-mode-btn').addEventListener('click', () => {
      appMode = 'solo';
      document.getElementById('solo-mode-btn').classList.add('active');
      document.getElementById('multi-mode-btn').classList.remove('active');
      document.getElementById('solo-panel').style.display = 'block';
      document.getElementById('multi-panel').style.display = 'none';
    });
    document.getElementById('multi-mode-btn').addEventListener('click', () => {
      appMode = 'multi';
      document.getElementById('multi-mode-btn').classList.add('active');
      document.getElementById('solo-mode-btn').classList.remove('active');
      document.getElementById('multi-panel').style.display = 'block';
      document.getElementById('solo-panel').style.display = 'none';
    });

    // ── 单人模式：profile tab 切换 ──
    document.querySelectorAll('.profile-tabs').forEach(tabGroup => {
      const seat = parseInt(tabGroup.dataset.seat);
      tabGroup.querySelectorAll('.profile-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          const newProfile = tab.dataset.profile;
          const prevProfile = soloConfig[seat].profile;
          // 更新 active 样式
          tabGroup.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          selectProfile(seat, newProfile, prevProfile);
        });
      });
    });

    // ── 单人模式：开始对战 ──
    document.getElementById('solo-start-btn').addEventListener('click', () => {
      const nickname = document.getElementById('nickname-input').value.trim() || '玩家';
      isSoloLaunch = true;
      socket.login(nickname);
      setTimeout(() => socket.createRoom(), 150);
    });

    // 大厅 - 创建房间（多人模式）
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

    // 游戏 - 理牌
    document.getElementById('sort-btn').addEventListener('click', () => {
      ui.sortHand();
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

  // P1.2：debug 模式下，把 NPC trace 显示在对应位卡旁的信息泡
  // 内容：主因（PrimaryReason 中文解释）+ 技能 chip 列表 + skillNotes 详细
  // 显示时长：duration-linger (2500ms)，与 stage-quadrant 出牌停留同步
  const npcBubbleTimers = { top: null, left: null, right: null };
  function showNPCTraceBubble(msg) {
    // 把 absolute seat 映射到相对位置（与 gameUI.getPlayerPosition 同逻辑）
    const position = ui.getPlayerPosition(msg.seat);
    if (position === 'bottom') return;  // 自己不显示 trace（自己不是 NPC）
    const bubble = document.getElementById(`npc-trace-${position}`);
    if (!bubble) return;

    const skillsHtml = msg.activatedSkills.map(s =>
      `<span class="npc-trace-skill-chip">${s.toUpperCase()}</span>`
    ).join('');
    const notesHtml = (msg.skillNotes || []).map(note =>
      `<li><b>${note.skill}</b>: ${escapeHtml(note.note)}</li>`
    ).join('');
    const action = msg.action === 'PASS' ? '不出' : '出牌';

    bubble.innerHTML = `
      <div class="npc-trace-header">${action}：${escapeHtml(msg.explanation || '')}</div>
      <div class="npc-trace-skills">${skillsHtml}</div>
      <ul class="npc-trace-notes">${notesHtml}</ul>
    `;
    bubble.classList.add('visible');

    // 清掉该位置的旧 timer，避免快速 NPC 决策时 timer 互相打架
    if (npcBubbleTimers[position]) clearTimeout(npcBubbleTimers[position]);
    npcBubbleTimers[position] = setTimeout(() => {
      bubble.classList.remove('visible');
    }, 2500);
  }

  // 基础 HTML 转义，避免 trace 中的 < > 符号破坏 innerHTML（虽然技能 note 都是受控字符串）
  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
