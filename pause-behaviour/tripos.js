// ============================================================
// 别刷了！ - Tripos 数学真题行为
// ============================================================
// 显示距 Tripos 考试的天数，加载历年数学真题，倒计时后确认完成。

(function () {
  const behaviours = window.PAUSE_BEHAVIOURS;
  if (!behaviours) return;

  // ── 工具：计算到目标日期的天数 ──
  function daysUntil(targetDate) {
    const now = new Date();
    const target = new Date(targetDate);
    const diff = target - now;
    return Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  // ── 注册行为 ──
  behaviours.tripos = {
    id: 'tripos',
    name: '📐 Tripos 数学真题',
    description: '看一道历年数学真题，倒计时结束后确认完成',
    create: function (cleanUp, params) {
      const { siteLabel, duration } = params;
      const totalSec = duration ? Math.ceil(duration / 1000) : 600; // default 10 min
      let remaining = totalSec;

      // 随机选择年份 (2001~2025) 和场次 (1 or 2)
      const year = Math.floor(Math.random() * (2025 - 2001 + 1)) + 2001;
      const session = (year == 2020) ? 1 : (Math.random() < 0.5 ? 1 : 2);  // 2020年只有一张卷
      let pdfUrl;
      // 处理不同年份命名格式不同的问题
      if (year >= 2018) {
        pdfUrl = `https://www.maths.cam.ac.uk/undergradnst/files/${year}/papernst_ia_${session}_${year}.pdf`;
      } else if (year == 2017) {
        pdfUrl = `https://www.maths.cam.ac.uk/undergradnst/files/${year}/papernst_ia_${session}_0.pdf`;
      } else if (year == 2016) {
        pdfUrl = `https://www.maths.cam.ac.uk/undergradnst/files/${year}/papernst_ia_${session}.pdf`
      } else {
        pdfUrl = `https://www.maths.cam.ac.uk/undergradnst/files/${year}/PaperNST_IA_${session}.pdf`;
      }

      const days = daysUntil('2026-06-04');

      // ── 构建容器 ──
      const container = document.createElement('div');
      container.style.cssText =
        'text-align:center;padding:20px 24px;max-width:960px;width:100%;box-sizing:border-box;';

      container.innerHTML = `
        <!-- 标题 -->
        <div style="font-size:40px;line-height:1;margin-bottom:4px;">📐</div>
        <div style="font-size:20px;font-weight:700;margin-bottom:2px;color:#fff;line-height:1.4;">
          还有 <span style="color:#ff8800;font-size:26px;">${days}</span> 天就要考tripos了，你还在这刷视频？
        </div>
        <div style="font-size:13px;color:#888;margin-bottom:12px;">
          你在 <span style="color:#fff;font-weight:600;">${siteLabel}</span> 上花太多时间了
        </div>

        <!-- 试卷 iframe -->
        <div style="width:100%;height:600px;border:2px solid #444;border-radius:8px;overflow:hidden;margin-bottom:8px;background:#fff;">
          <iframe src="https://docs.google.com/viewer?url=${encodeURI(pdfUrl)}&embedded=true"
            style="width:100%;height:100%;border:none;"
            sandbox="allow-scripts allow-same-origin allow-top-navigation"
            loading="lazy">
          </iframe>
        </div>

        <!-- 试卷说明 -->
        <div style="font-size:13px;color:#ccc;margin-bottom:12px;line-height:1.5;">
          这是 <span style="color:#fff;font-weight:600;">${year}</span> 年的数学
          <span style="color:#fff;font-weight:600;">${session}</span> 卷真题
          <br><span style="color:#666;font-size:12px;">看看自己能做出来多少？</span>
        </div>

        <!-- 倒计时区域（结束后被绿色按钮替换） -->
        <div id="tripos-timer-area" style="margin-bottom:2px;">
          <div style="font-size:13px;color:#888;margin-bottom:4px;">
            认真做题，倒计时结束后点"做完了"离开
          </div>
          <div id="tripos-countdown"
               style="font-size:48px;font-weight:800;color:#ff4444;line-height:1.2;">
            ${totalSec}
          </div>
        </div>

        <!-- 绿色"做完了"按钮（初始隐藏） -->
        <div id="tripos-done-area" style="display:none;margin-bottom:2px;">
          <div style="font-size:13px;color:#888;margin-bottom:8px;">
            时间到了，你做完这道题了吗？
          </div>
          <button id="tripos-done-btn" data-pause-interactive
            style="padding:14px 48px;font-size:20px;font-weight:700;
                   background:#2ecc71;color:#fff;border:none;border-radius:10px;
                   cursor:pointer;box-shadow:0 4px 14px rgba(46,204,113,0.4);
                   transition:transform 0.15s;">
            做完了 ✅
          </button>
        </div>
      `;

      // ── 倒计时逻辑 ──
      const cdEl = container.querySelector('#tripos-countdown');
      const timerArea = container.querySelector('#tripos-timer-area');
      const doneArea = container.querySelector('#tripos-done-area');
      const doneBtn = container.querySelector('#tripos-done-btn');

      const countdownTimer = setInterval(() => {
        remaining--;
        if (cdEl) cdEl.textContent = Math.max(0, remaining);
        if (remaining <= 0) {
          clearInterval(countdownTimer);
          timerArea.style.display = 'none';
          doneArea.style.display = 'block';
        }
      }, 1000);

      doneBtn.addEventListener('click', cleanUp);

      container._pauseTimer = countdownTimer;
      container._pauseAbort = () => { clearInterval(countdownTimer); };

      return container;
    },
  };
})();
