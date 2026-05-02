// ============================================================
// 别刷了！ - 内容脚本
// ============================================================

let _paused = false;
let _cleanup = null;

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
    triggerPause(msg.duration, msg.siteLabel || detectSiteLabel());
    reply({ started: true });
    return;
  }
  if (msg.action === 'is_paused') {
    reply({ paused: _paused });
    return;
  }
});

// ---- 强制暂停覆盖层 ----
function triggerPause(duration, siteLabel) {
  if (_paused) return;
  _paused = true;

  // 退出全屏
  try { if (document.fullscreenElement) document.exitFullscreen(); } catch {}

  // 暂停视频
  const video = document.querySelector('video');
  let hadPlaying = false;
  if (video && !video.paused) { video.pause(); hadPlaying = true; }

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
    fontFamily: '"Segoe UI", "Microsoft YaHei", "PingFang SC", Arial, sans-serif',
    color: '#ffffff',
    cursor: 'default',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    boxSizing: 'border-box',
    margin: '0',
    padding: '0',
  });

  const sec = Math.ceil(duration / 1000);
  overlay.innerHTML = `
    <div style="text-align:center;padding:32px 40px;max-width:520px;">
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
           id="stop-browsing-countdown">${sec}</div>
      <div style="font-size:14px;color:#888;">秒后自动恢复</div>
    </div>
  `;

  document.body.appendChild(overlay);

  // ---- 阻止所有输入 ----
  const preventAll = (e) => { e.preventDefault(); e.stopPropagation(); };
  const preventAllCapture = (e) => { e.preventDefault(); e.stopPropagation(); };

  document.addEventListener('keydown', preventAllCapture, true);
  document.addEventListener('keyup', preventAllCapture, true);
  document.addEventListener('keypress', preventAllCapture, true);
  document.addEventListener('contextmenu', preventAllCapture, true);

  overlay.addEventListener('click', preventAll);
  overlay.addEventListener('mousedown', preventAll);
  overlay.addEventListener('mouseup', preventAll);
  overlay.addEventListener('pointerdown', preventAll);
  overlay.addEventListener('pointerup', preventAll);
  overlay.addEventListener('wheel', preventAll, { passive: false });
  overlay.addEventListener('touchstart', preventAll, { passive: false });

  // ---- MutationObserver：防止被 DOM 移除 ----
  const observer = new MutationObserver(() => {
    if (!document.body.contains(overlay)) {
      document.body.appendChild(overlay);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // ---- 倒计时 ----
  const cd = document.getElementById('stop-browsing-countdown');
  let remaining = sec;
  const countdownTimer = setInterval(() => {
    remaining--;
    if (cd) cd.textContent = Math.max(0, remaining);
    if (remaining <= 0) clearInterval(countdownTimer);
  }, 1000);

  // ---- 到期清理 ----
  const cleanupTimer = setTimeout(() => {
    clearInterval(countdownTimer);
    observer.disconnect();

    document.removeEventListener('keydown', preventAllCapture, true);
    document.removeEventListener('keyup', preventAllCapture, true);
    document.removeEventListener('keypress', preventAllCapture, true);
    document.removeEventListener('contextmenu', preventAllCapture, true);

    overlay.remove();
    if (hadPlaying && video) video.play().catch(() => {});
    _paused = false;
  }, duration);

  _cleanup = () => {
    clearInterval(countdownTimer);
    clearTimeout(cleanupTimer);
    observer.disconnect();
    document.removeEventListener('keydown', preventAllCapture, true);
    document.removeEventListener('keyup', preventAllCapture, true);
    document.removeEventListener('keypress', preventAllCapture, true);
    document.removeEventListener('contextmenu', preventAllCapture, true);
    if (overlay.parentNode) overlay.remove();
    _paused = false;
    _cleanup = null;
  };
}