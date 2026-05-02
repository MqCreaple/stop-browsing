// ============================================================
// 别刷了！ - 内容脚本
// ============================================================

let _paused = false;

// ---- 自动检测当前站点 ----
function detectSiteLabel() {
  const h = location.hostname;
  if (h.includes('youtube')) return 'YouTube';
  if (h.includes('bilibili')) return 'B站';
  if (h.includes('tiktok'))  return 'TikTok';
  if (h.includes('douyin'))  return '抖音';
  return '视频';
}

// ---- 消息监听 ----
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.action === 'force_pause') {
    triggerPause(msg.duration, msg.siteLabel || detectSiteLabel(), msg.behaviourId || 'timer');
    reply({ started: true });
    return;
  }
  if (msg.action === 'is_paused') {
    reply({ paused: _paused });
    return;
  }
});

// ---- 页面初始化：检查是否需要恢复暂停（防刷新绕过） ----
(function initPauseCheck() {
  chrome.runtime.sendMessage({ action: 'check_pause_state' }, (res) => {
    if (res && res.shouldPause) {
      triggerPause(res.duration, res.siteLabel, res.behaviourId || 'timer');
    }
  });
})();

// ---- 强制暂停覆盖层 ----
function triggerPause(duration, siteLabel, behaviourId) {
  if (_paused) return;
  _paused = true;

  // 退出全屏
  try { if (document.fullscreenElement) document.exitFullscreen(); } catch {}

  // 暂停视频
  const video = document.querySelector('video');
  let hadPlaying = false;
  if (video && !video.paused) { video.pause(); hadPlaying = true; }

  // ---- 查找行为 ----
  const behaviourDef = window.PAUSE_BEHAVIOURS[behaviourId] || window.PAUSE_BEHAVIOURS["timer"];
  if (!behaviourDef) {
    _paused = false;
    return;
  }

  // ---- 构建覆盖层 ----
  const overlay = document.createElement('div');
  overlay.id = 'stop-browsing-overlay';
  Object.assign(overlay.style, {
    position: 'fixed',
    top: '0', left: '0', right: '0', bottom: '0',
    width: '100vw', height: '100vh',
    background: 'rgba(0, 0, 0, 0.93)',
    zIndex: '2147483647',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: '"Segoe UI","Microsoft YaHei","PingFang SC",Arial,sans-serif',
    color: '#fff',
    cursor: 'default',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    boxSizing: 'border-box',
    margin: '0',
    padding: '0',
  });

  // ---- 构建清理函数 ----
  let aborted = false;
  let cleanupCallbacks = [];

  const cleanUp = () => {
    if (aborted) return;
    aborted = true;
    _paused = false;

    for (const cb of cleanupCallbacks) cb();

    document.removeEventListener('keydown', preventAllCapture, true);
    document.removeEventListener('keyup', preventAllCapture, true);
    document.removeEventListener('keypress', preventAllCapture, true);
    document.removeEventListener('contextmenu', preventAllCapture, true);

    observer.disconnect();
    if (overlay.parentNode) overlay.remove();

    if (hadPlaying && video) video.play().catch(() => {});

    // 通知后台暂停结束
    chrome.runtime.sendMessage({ action: 'pause_finished' }).catch(() => {});
  };

  // ---- 由行为生成内部内容 ----
  const contentEl = behaviourDef.create(cleanUp, { duration, siteLabel, behaviourId });
  if (contentEl) overlay.appendChild(contentEl);

  document.body.appendChild(overlay);

  // ---- 阻止所有输入（但放行 data-pause-interactive 元素） ----
  const preventAllCapture = (e) => {
    if (e.target && e.target.closest && e.target.closest('[data-pause-interactive]')) return;
    e.preventDefault();
    e.stopPropagation();
  };

  document.addEventListener('keydown', preventAllCapture, true);
  document.addEventListener('keyup', preventAllCapture, true);
  document.addEventListener('keypress', preventAllCapture, true);
  document.addEventListener('contextmenu', preventAllCapture, true);

  overlay.addEventListener('click', preventAllCapture);
  overlay.addEventListener('mousedown', preventAllCapture);
  overlay.addEventListener('mouseup', preventAllCapture);
  overlay.addEventListener('pointerdown', preventAllCapture);
  overlay.addEventListener('pointerup', preventAllCapture);
  overlay.addEventListener('wheel', preventAllCapture, { passive: false });
  overlay.addEventListener('touchstart', preventAllCapture, { passive: false });

  // ---- MutationObserver：防止覆盖层被移除 ----
  const observer = new MutationObserver(() => {
    if (!document.body.contains(overlay)) {
      document.body.appendChild(overlay);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // ---- 保存行为的清理函数 ----
  if (contentEl._pauseAbort) {
    cleanupCallbacks.push(() => contentEl._pauseAbort());
  }
  if (contentEl._pauseTimer) {
    cleanupCallbacks.push(() => clearInterval(contentEl._pauseTimer));
  }
}
