// ============================================================
// 别刷了！ - 倒计时行为
// ============================================================
// 等待指定时间后自动恢复，为默认原始行为。

(function () {
  const behaviours = window.PAUSE_BEHAVIOURS;
  if (!behaviours) return;

  behaviours.timer = {
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
})();