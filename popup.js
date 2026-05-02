// ============================================================
// 别刷了！ - 弹窗交互
// ============================================================

(function () {
  function $(id) { return document.getElementById(id); }

  let _timer = null;          // 刷新定时器
  let _intervalMs = 5000;     // 当前刷新间隔

  // ---- Toast 提示 ----
  let toastTimer = null;
  function showToast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2000);
  }

  // ---- 标签页切换 ----
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      $(`tab-${btn.dataset.tab}`).classList.add('active');
      if (btn.dataset.tab === 'settings') loadSettings();
    });
  });

  // ============================================================
  // 动态刷新调度
  // ============================================================

  /** 设置刷新间隔：看视频时 1 秒，否则 5 秒 */
  function adjustInterval(onVideo) {
    const desired = onVideo ? 1000 : 5000;
    if (_intervalMs === desired) return;  // 无需切换
    _intervalMs = desired;
    clearInterval(_timer);
    _timer = setInterval(refreshMonitor, _intervalMs);

    // 更新提示文字
    const hint = $('refresh-hint');
    hint.textContent = onVideo ? '实时更新中' : '每 5 秒刷新';
  }

  // ============================================================
  // 监控页：刷新状态
  // ============================================================
  function refreshMonitor() {
    chrome.runtime.sendMessage({ action: 'get_status' }, (status) => {
      if (!status) {
        $('time-spent').textContent = '连接失败';
        $('footer-text').textContent = '后台服务未响应';
        return;
      }

      // ---- 动态调整刷新间隔 ----
      adjustInterval(status.browsingVideo);

      // ---- 使用实时总时长（含当前会话进行中） ----
      const liveMs = status.currentSessionMs;
      $('time-spent').textContent = status.sessionFormatted;
      $('time-limit').textContent = status.limitFormatted;

      const pct = Math.min((liveMs / status.limit) * 100, 100);
      const bar = $('progress-fill');
      bar.style.width = pct.toFixed(1) + '%';
      bar.className = 'progress-fill';
      if (pct >= 100) bar.classList.add('danger');
      else if (pct >= 80) bar.classList.add('warning');

      const spentEl = $('time-spent');
      spentEl.className = 'stat-value' + (pct >= 100 ? ' over-limit' : '');

      const tag = $('mode-tag');
      tag.innerHTML = status.isNight
        ? `<span class="tag tag-night">🌙 夜间模式</span>`
        : `<span class="tag tag-day">☀️ 日间模式</span>`;

      const label = $('status-label');
      if (status.browsingVideo) {
        label.innerHTML = `<span class="status-dot active"></span>${status.currentLabel}`;
      } else {
        label.innerHTML = `<span class="status-dot inactive"></span>${status.currentLabel}`;
      }

      const now = new Date();
      const ts = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      $('footer-text').textContent = `${ts} · ${status.today}`;

      // ---- 各站点明细 ----
      const sb = $('site-breakdown');
      if (status.perSite) {
        sb.innerHTML = Object.entries(status.perSite)
          .filter(([, ms]) => ms > 0)
          .sort((a, b) => b[1] - a[1])
          .map(([id, ms]) => {
            const p = Math.min((ms / status.limit) * 100, 100);
            return `<div class="stat-row">
              <span class="stat-label">${siteLabel(id)}</span>
              <span class="stat-value" style="font-size:13px;">${formatMs(ms)}</span>
            </div>
            <div class="progress-bar" style="height:3px;margin:0 0 4px;">
              <div class="progress-fill" style="width:${p.toFixed(1)}%;background:rgba(78,205,196,0.5);"></div>
            </div>`;
          }).join('') || '<div style="color:#555;font-size:12px;">今日暂无使用记录</div>';
      }
    });

    // ---- 日志 ----
    chrome.runtime.sendMessage({ action: 'get_log' }, (log) => {
      if (!log || !log.days) return;
      const container = $('log-container');
      container.innerHTML = log.days.map(d => {
        const isToday = d.date === log.days[log.days.length - 1].date;
        const dateLabel = isToday ? '今天' : d.date.slice(5);
        return `<div class="stat-row" style="padding:3px 0;font-size:12px;">
          <span style="color:#888;">${dateLabel}</span>
          <span style="color:#aaa;">${d.totalFormatted || '0秒'}</span>
        </div>`;
      }).join('');
    });
  }

  function siteLabel(id) {
    const map = { youtube: 'YouTube', bilibili: 'B站', tiktok: 'TikTok', douyin: '抖音' };
    return map[id] || id;
  }

  function formatMs(ms) {
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return `${h}时${m}分`;
    if (m > 0) return `${m}分${s}秒`;
    return `${s}秒`;
  }

  // ---- 重置 ----
  $('btn-reset').addEventListener('click', () => {
    if (!confirm('确认重置今日的所有使用数据？')) return;
    chrome.runtime.sendMessage({ action: 'reset_today' }, (res) => {
      if (res && res.ok) { refreshMonitor(); showToast('已重置今日数据'); }
    });
  });

  // ============================================================
  // 设置页：加载 & 保存
  // ============================================================
  function loadSettings() {
    chrome.runtime.sendMessage({ action: 'load_config' }, (cfg) => {
      if (!cfg) return;

      const list = $('site-list');
      list.innerHTML = cfg.sites.map(s => `
        <div class="site-toggle">
          <span class="site-label">${s.label}</span>
          <label class="switch">
            <input type="checkbox" data-site-id="${s.id}" ${s.enabled ? 'checked' : ''}>
            <span class="slider"></span>
          </label>
        </div>
      `).join('');

      $('night-start').value = cfg.nightStart;
      $('night-end').value   = cfg.nightEnd;
      $('day-limit').value   = cfg.dayLimitMin;
      $('night-limit').value = cfg.nightLimitMin;
      $('pause-duration').value = cfg.pauseDurationSec;
      $('pause-cooldown').value = cfg.pauseCooldownMin;
    });
  }

  function collectSettings() {
    const sites = [];
    document.querySelectorAll('#site-list input[type="checkbox"]').forEach(cb => {
      sites.push({ id: cb.dataset.siteId, enabled: cb.checked });
    });
    return {
      sites,
      nightStart:     parseInt($('night-start').value) || 23,
      nightEnd:       parseInt($('night-end').value) || 6,
      dayLimitMin:    parseInt($('day-limit').value) || 60,
      nightLimitMin:  parseInt($('night-limit').value) || 20,
      pauseDurationSec: parseInt($('pause-duration').value) || 30,
      pauseCooldownMin: parseInt($('pause-cooldown').value) || 5,
    };
  }

  $('btn-save-cfg').addEventListener('click', () => {
    const cfg = collectSettings();
    chrome.runtime.sendMessage({ action: 'save_config', config: cfg }, (res) => {
      if (res && res.ok) showToast('✓ 设置已保存');
      refreshMonitor();
    });
  });

  $('btn-default-cfg').addEventListener('click', () => {
    if (!confirm('恢复所有设置为默认值？')) return;
    const def = getDefaultCfg();
    chrome.runtime.sendMessage({ action: 'save_config', config: def }, (res) => {
      if (res && res.ok) {
        loadSettings();
        refreshMonitor();
        showToast('已恢复默认设置');
      }
    });
  });

  function getDefaultCfg() {
    return {
      sites: [
        { id: 'youtube',  enabled: true },
        { id: 'bilibili', enabled: true },
        { id: 'tiktok',   enabled: true },
        { id: 'douyin',   enabled: true },
      ],
      nightStart: 23,
      nightEnd: 6,
      dayLimitMin: 60,
      nightLimitMin: 20,
      pauseDurationSec: 30,
      pauseCooldownMin: 5,
    };
  }

  // ============================================================
  // 初始化
  // ============================================================
  refreshMonitor();
  _timer = setInterval(refreshMonitor, _intervalMs);

  // 弹窗关闭时清理定时器（好习惯）
  window.addEventListener('unload', () => clearInterval(_timer));
})();
