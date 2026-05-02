// ============================================================
// YouTube 时间监控 - 弹窗交互
// ============================================================

(function () {
  function $(id) { return document.getElementById(id); }

  function updateStatus() {
    chrome.runtime.sendMessage({ action: 'get_status' }, (status) => {
      if (!status) {
        $('time-spent').textContent = '连接失败';
        $('footer-text').textContent = '后台服务未响应';
        return;
      }

      // 今日时间
      $('time-spent').textContent = status.accumulatedFormatted;
      $('time-limit').textContent = status.limitFormatted;

      // 进度条
      const pct = Math.min((status.accumulated / status.limit) * 100, 100);
      const bar = $('progress-fill');
      bar.style.width = pct.toFixed(1) + '%';
      bar.className = 'progress-fill';
      if (pct >= 100) bar.classList.add('danger');
      else if (pct >= 80) bar.classList.add('warning');

      // 超限状态
      const spentEl = $('time-spent');
      spentEl.className = 'stat-value' + (pct >= 100 ? ' over-limit' : '');

      // 模式标签
      const tag = $('mode-tag');
      if (status.isNight) {
        tag.innerHTML = '<span class="tag tag-night">🌙 夜间模式（20分钟限制）</span>';
      } else {
        tag.innerHTML = '<span class="tag tag-day">☀️ 日间模式（60分钟限制）</span>';
      }

      // 当前标签页状态
      const label = $('status-label');
      if (status.onYt) {
        label.innerHTML = '<span class="status-dot active"></span>正在观看 YouTube';
      } else {
        label.innerHTML = '<span class="status-dot inactive"></span>未在观看视频';
      }

      // 脚注
      const now = new Date();
      const timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      $('footer-text').textContent = `更新于 ${timeStr} · ${status.today}`;
    });

    // 获取历史记录
    chrome.runtime.sendMessage({ action: 'get_log' }, (log) => {
      if (!log || !log.days) return;
      const container = $('log-container');
      container.innerHTML = log.days.map(d => {
        const isToday = d.date === log.days[log.days.length - 1].date;
        const dateLabel = isToday ? '今天' : d.date.slice(5);
        return `<div class="log-entry">
          <span>${dateLabel}</span>
          <span class="log-val">${d.fmt || '0秒'}</span>
        </div>`;
      }).join('');
    });
  }

  // 重置按钮
  $('btn-reset').addEventListener('click', () => {
    if (!confirm('确认重置今日的 YouTube 使用数据？')) return;
    chrome.runtime.sendMessage({ action: 'reset_today' }, (res) => {
      if (res && res.ok) updateStatus();
    });
  });

  // 初始加载
  updateStatus();

  // 每 5 秒自动刷新
  setInterval(updateStatus, 5000);
})();
