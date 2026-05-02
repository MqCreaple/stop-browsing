// ============================================================
// YouTube 时间监控 - 内容脚本（运行在 YouTube 页面内）
// ============================================================

let _paused = false;
let _cleanup = null;

// ---- 监听后台消息 ----
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.action === 'force_pause') {
    triggerPause(msg.duration);
    reply({ started: true });
    return;
  }
  if (msg.action === 'is_paused') {
    reply({ paused: _paused });
    return;
  }
});

// ---- 暂停覆盖层 ----
function triggerPause(duration) {
  if (_paused) return; // 已在暂停中
  _paused = true;

  // 退出全屏（确保 overlay 可见）
  try { if (document.fullscreenElement) document.exitFullscreen(); } catch {}

  // 暂停视频
  const video = document.querySelector('video');
  let hadPlaying = false;
  if (video && !video.paused) {
    video.pause();
    hadPlaying = true;
  }

  // ---- 构建覆盖层 DOM ----
  const overlay = document.createElement('div');
  overlay.id = 'yt-monitor-overlay';

  // 用 CSSStyleDeclaration 批量设置样式
  const css = {
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
  };
  Object.assign(overlay.style, css);

  const sec = Math.ceil(duration / 1000);
  overlay.innerHTML = `
    <div style="text-align:center;padding:32px 40px;max-width:480px;">
      <div style="font-size:72px;line-height:1;margin-bottom:12px;">⏰</div>
      <div style="font-size:26px;font-weight:700;margin-bottom:6px;letter-spacing:1px;">
        YouTube 时间限制
      </div>
      <div style="font-size:14px;color:#aaa;margin-bottom:20px;line-height:1.6;">
        你已超过今日观看时限，请暂停休息一下
      </div>
      <div style="font-size:60px;font-weight:800;color:#ff4444;line-height:1;margin-bottom:8px;"
           id="yt-monitor-countdown">${sec}</div>
      <div style="font-size:14px;color:#888;">秒后自动恢复</div>
    </div>
  `;

  document.documentElement.appendChild(overlay);

  // ---- 阻止所有用户输入 ----
  const prevent = (e) => { e.preventDefault(); e.stopPropagation(); return false; };
  const preventInput = (e) => { e.preventDefault(); e.stopPropagation(); };

  // 键盘事件（捕获阶段拦截）
  document.addEventListener('keydown', preventInput, true);
  document.addEventListener('keyup', preventInput, true);
  document.addEventListener('keypress', preventInput, true);

  // 鼠标事件（覆盖层上拦截）
  overlay.addEventListener('click', prevent);
  overlay.addEventListener('mousedown', prevent);
  overlay.addEventListener('mouseup', prevent);
  overlay.addEventListener('pointerdown', prevent);
  overlay.addEventListener('pointerup', prevent);

  // 右键菜单
  document.addEventListener('contextmenu', preventInput, true);

  // 滚轮（防止通过滚动绕过）
  overlay.addEventListener('wheel', prevent, { passive: false });

  // 触摸
  overlay.addEventListener('touchstart', prevent, { passive: false });

  // ---- MutationObserver：防止被 DOM 移除 ----
  const observer = new MutationObserver(() => {
    if (!document.body.contains(overlay)) {
      // 重新添加
      document.documentElement.appendChild(overlay);
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // ---- 倒计时 ----
  const cd = document.getElementById('yt-monitor-countdown');
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

    // 移除事件监听（需与上面相同的函数引用）
    document.removeEventListener('keydown', preventInput, true);
    document.removeEventListener('keyup', preventInput, true);
    document.removeEventListener('keypress', preventInput, true);
    document.removeEventListener('contextmenu', preventInput, true);

    overlay.remove();

    // 恢复视频播放
    if (hadPlaying && video) {
      video.play().catch(() => {});
    }

    _paused = false;
  }, duration);

  _cleanup = () => {
    clearInterval(countdownTimer);
    clearTimeout(cleanupTimer);
    observer.disconnect();
    document.removeEventListener('keydown', preventInput, true);
    document.removeEventListener('keyup', preventInput, true);
    document.removeEventListener('keypress', preventInput, true);
    document.removeEventListener('contextmenu', preventInput, true);
    if (overlay.parentNode) overlay.remove();
    _paused = false;
    _cleanup = null;
  };
}
