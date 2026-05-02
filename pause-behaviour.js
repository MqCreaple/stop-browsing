// ============================================================
// 别刷了！ - 暂停行为定义
// ============================================================
// 每个行为是一个函数 (cleanUp, params) → HTMLElement
// cleanUp() 移除覆盖层、恢复视频
// params: { siteLabel, duration, behaviourId }

const PAUSE_BEHAVIOURS = {};

// ──────────────────────────────────────────────
// 工具：生成 [min, max) 的随机整数
// ──────────────────────────────────────────────
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min)) + min;
}

// ──────────────────────────────────────────────
// 1. 倒计时行为（原始行为）
// ──────────────────────────────────────────────
PAUSE_BEHAVIOURS.timer = {
  id: 'timer',
  name: '⏱ 倒计时',
  description: '等待指定时间后自动恢复',
  create: function (cleanUp, params) {
    const { duration, siteLabel } = params;
    const sec = Math.ceil(duration / 1000);

    const el = document.createElement('div');
    el.style.cssText = 'text-align:center;padding:32px 40px;max-width:520px;';
    el.innerHTML = `
      <div style="font-size:72px;line-height:1;margin-bottom:12px;">🦞</div>
      <div style="font-size:24px;font-weight:700;margin-bottom:4px;letter-spacing:1px;">
        别刷了！
      </div>
      <div style="font-size:14px;color:#aaa;margin-bottom:4px;line-height:1.6;">
        你在 <span style="color:#fff;font-weight:600;">${siteLabel}</span> 上的时间已超过今日限制
      </div>
      <div style="font-size:13px;color:#888;margin-bottom:20px;">
        请暂停休息一下
      </div>
      <div style="font-size:60px;font-weight:800;color:#ff4444;line-height:1;margin-bottom:8px;"
           class="pause-countdown-value">${sec}</div>
      <div style="font-size:14px;color:#888;">秒后自动恢复</div>
    `;

    const cdEl = el.querySelector('.pause-countdown-value');
    let remaining = sec;
    const countdownTimer = setInterval(() => {
      remaining--;
      if (cdEl) cdEl.textContent = Math.max(0, remaining);
      if (remaining <= 0) {
        clearInterval(countdownTimer);
        cleanUp();
      }
    }, 1000);

    el._pauseTimer = countdownTimer;
    el._pauseAbort = () => { clearInterval(countdownTimer); };

    return el;
  },
};

// ──────────────────────────────────────────────
// 2. 四则运算行为
// ──────────────────────────────────────────────

function genProblem() {
  const ops = ['+', '-', '×', '÷'];
  const op = ops[randInt(0, 4)];

  let a, b, answer;
  switch (op) {
    case '+':
      a = randInt(1, 500);
      b = randInt(1, 1000 - a);
      answer = a + b;
      break;
    case '-':
      a = randInt(2, 999);
      b = randInt(1, a - 1);
      answer = a - b;
      break;
    case '×':
      a = randInt(2, 100);
      b = randInt(2, Math.floor(1000 / a));
      answer = a * b;
      break;
    case '÷':
      b = randInt(2, 50);
      answer = randInt(1, Math.floor(1000 / b));
      a = b * answer;
      break;
  }
  return { text: `${a} ${op} ${b}`, answer };
}

function genQuiz() {
  const set = new Set();
  const problems = [];
  while (problems.length < 10) {
    const p = genProblem();
    const key = `${p.text}=${p.answer}`;
    if (set.has(key)) continue;
    set.add(key);
    problems.push(p);
  }
  return problems;
}

PAUSE_BEHAVIOURS.quiz = {
  id: 'quiz',
  name: '🧮 四则运算',
  description: '完成 10 道算术题后才能恢复',
  create: function (cleanUp, params) {
    const { siteLabel } = params;
    const problems = genQuiz();

    let currentIdx = 0;
    let wrongFeedback = false;
    let giveUpRemaining = 0;

    const container = document.createElement('div');
    container.style.cssText = 'text-align:center;padding:24px 32px;max-width:420px;';

    container.innerHTML = `
      <div style="font-size:60px;line-height:1;margin-bottom:6px;">🧮</div>
      <div style="font-size:20px;font-weight:700;margin-bottom:2px;">
        先做几道题冷静一下
      </div>
      <div style="font-size:13px;color:#888;margin-bottom:6px;">
        你在 <span style="color:#fff;font-weight:600;">${siteLabel}</span> 上花太多时间了
      </div>
      <div style="font-size:13px;color:#666;margin-bottom:16px;">
        全部答对即可继续
      </div>

      <!-- 进度条 -->
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;font-size:12px;color:#aaa;">
        <div id="quiz-progress-bar" style="flex:1;height:4px;background:#333;border-radius:2px;overflow:hidden;">
          <div id="quiz-progress-fill" style="height:100%;width:0%;background:#4ecdc4;border-radius:2px;transition:width 0.3s;"></div>
        </div>
        <span id="quiz-progress-text">0 / 10</span>
      </div>

      <!-- 题目区域 -->
      <div id="quiz-problem" style="font-size:32px;font-weight:700;margin-bottom:20px;letter-spacing:1px;">
        ${problems[0].text} =
      </div>

      <!-- 输入 & 提交 -->
      <div style="display:flex;gap:10px;justify-content:center;align-items:center;margin-bottom:6px;">
        <input id="quiz-input" type="number"
          data-pause-interactive
          style="width:140px;padding:10px 14px;font-size:22px;text-align:center;
                 background:#222;color:#fff;border:2px solid #444;border-radius:8px;
                 outline:none;"
          autofocus>
        <button id="quiz-submit" data-pause-interactive
          style="padding:10px 20px;font-size:16px;font-weight:600;
                 background:#4ecdc4;color:#111;border:none;border-radius:8px;
                 cursor:pointer;">
          提交
        </button>
      </div>

      <!-- 反馈 -->
      <div id="quiz-feedback" style="font-size:14px;min-height:22px;margin-bottom:4px;"></div>

      <!-- 放弃入口 -->
      <div id="quiz-giveup-wrap">
        <button id="quiz-giveup" data-pause-interactive
          style="padding:6px 14px;font-size:12px;background:transparent;color:#555;
                 border:1px solid #444;border-radius:6px;cursor:pointer;">
          实在做不出来 🙋
        </button>
      </div>
    `;

    const input = container.querySelector('#quiz-input');
    const submit = container.querySelector('#quiz-submit');
    const feedback = container.querySelector('#quiz-feedback');
    const probEl = container.querySelector('#quiz-problem');
    const progressFill = container.querySelector('#quiz-progress-fill');
    const progressText = container.querySelector('#quiz-progress-text');
    const giveupBtn = container.querySelector('#quiz-giveup');
    const giveupWrap = container.querySelector('#quiz-giveup-wrap');

    function updateProgress() {
      const done = currentIdx;
      progressFill.style.width = `${(done / 10) * 100}%`;
      progressText.textContent = `${done} / 10`;
    }

    function renderProblem() {
      if (currentIdx >= 10) {
        cleanUp();
        return;
      }
      const p = problems[currentIdx];
      probEl.textContent = `${p.text} = `;
      input.value = '';
      input.disabled = false;
      input.focus();
      feedback.textContent = '';
      feedback.style.color = '#888';
      wrongFeedback = false;
      updateProgress();
    }

    let giveUpInterval = null;

    function enterGiveUpMode() {
      giveUpRemaining = 120;
      container.querySelector('#quiz-problem').style.display = 'none';
      input.style.display = 'none';
      submit.style.display = 'none';
      giveupBtn.style.display = 'none';

      const giveupEl = document.createElement('div');
      giveupEl.id = 'quiz-giveup-countdown';
      giveupEl.style.cssText = 'font-size:16px;color:#888;margin:20px 0;';

      const updateGiveup = () => {
        giveupEl.innerHTML = `
          <div style="font-size:14px;color:#666;margin-bottom:8px;">
            承认自己做不出来也是一种勇气 🫡
          </div>
          <div style="font-size:36px;font-weight:800;color:#ff8800;line-height:1.2;">
            ${giveUpRemaining}
          </div>
          <div style="font-size:13px;color:#888;">秒后可跳过</div>
        `;
      };
      updateGiveup();

      feedback.innerHTML = `<div style="color:#ff8800;font-size:13px;margin:12px 0;">已放弃答题，等待倒计时结束后恢复…</div>`;

      giveupWrap.appendChild(giveupEl);

      giveUpInterval = setInterval(() => {
        giveUpRemaining--;
        const el = giveupWrap.querySelector('#quiz-giveup-countdown');
        if (el) el.querySelector('div:nth-child(2)').textContent = String(giveUpRemaining);
        if (giveUpRemaining <= 0) {
          clearInterval(giveUpInterval);
          cleanUp();
        }
      }, 1000);
    }

    function handleSubmit() {
      if (currentIdx >= 10 || giveUpRemaining > 0) return;

      const val = parseInt(input.value, 10);
      if (isNaN(val)) {
        feedback.textContent = '请输入数字！';
        feedback.style.color = '#ff8800';
        return;
      }

      const p = problems[currentIdx];
      if (val === p.answer) {
        currentIdx++;
        feedback.textContent = '✅ 正确！';
        feedback.style.color = '#4ecdc4';
        wrongFeedback = false;
        setTimeout(renderProblem, 500);
      } else {
        feedback.textContent = `❌ 不对，再试试 (${p.text} = ?)`;
        feedback.style.color = '#ff4444';
        wrongFeedback = true;
        input.value = '';
        input.focus();
      }
    }

    submit.addEventListener('click', handleSubmit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleSubmit();
    });

    giveupBtn.addEventListener('click', () => {
      if (giveUpRemaining > 0) return;
      enterGiveUpMode();
    });

    setTimeout(() => input.focus(), 200);

    container._pauseAbort = () => {
      if (giveUpInterval) clearInterval(giveUpInterval);
    };

    updateProgress();

    return container;
  },
};