// ============================================================
// YouTube 时间监控 - 后台 Service Worker
// ============================================================

const CFG = {
  // YouTube 视频页面正则
  VIDEO_REGEX: /^https?:\/\/(www\.)?(youtube\.com|m\.youtube\.com)\/watch\?v=/,

  // 存储 key
  STORAGE_KEY: 'yt_monitor_v2',

  // 时间限制（毫秒）
  DAY_LIMIT_MS:   60 * 60 * 1000,   // 1 小时（白天）
  NIGHT_LIMIT_MS: 20 * 60 * 1000,   // 20 分钟（夜间）

  // 夜间时段
  NIGHT_START: 23,  // 23:00
  NIGHT_END:   6,   // 06:00

  // 暂停设置
  PAUSE_DURATION_MS: 30 * 1000,      // 强制暂停 30 秒
  PAUSE_COOLDOWN_MS: 5 * 60 * 1000,  // 两次暂停最小间隔 5 分钟
};

// ============================================================
// 运行时状态（内存中，service worker 重启后重置）
// ============================================================
const _state = { tabId: null, onYt: false, sessStart: null };

// ============================================================
// 工具函数
// ============================================================

/** 获取今日日期字符串 (YYYY-MM-DD, 本地时区) */
function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 判断当前是否为夜间时段 */
function isNight() {
  const h = new Date().getHours();
  return h >= CFG.NIGHT_START || h < CFG.NIGHT_END;
}

/** 获取当前限制（毫秒） */
function currentLimit() {
  return isNight() ? CFG.NIGHT_LIMIT_MS : CFG.DAY_LIMIT_MS;
}

/** 格式化毫秒为 时:分:秒 */
function fmtTime(ms) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}小时${m}分${s}秒`;
  if (m > 0) return `${m}分${s}秒`;
  return `${s}秒`;
}

// ============================================================
// 持久化存储
// ============================================================

async function loadData() {
  const r = await chrome.storage.local.get(CFG.STORAGE_KEY);
  return r[CFG.STORAGE_KEY] || {};
}

async function saveData(data) {
  await chrome.storage.local.set({ [CFG.STORAGE_KEY]: data });
}

// ============================================================
// 核心逻辑
// ============================================================

/**
 * 将当前会话时长刷入持久存储，重置会话计时器。
 * 仅在 onYt = true 且 sessStart 有效时执行。
 */
async function flushSession() {
  if (!_state.onYt || _state.sessStart === null) return;
  const elapsed = Date.now() - _state.sessStart;
  if (elapsed < 1000) return; // 忽略 < 1s 的抖动

  const data = await loadData();
  const d = todayStr();
  data[d] = (data[d] || 0) + elapsed;
  data._lastPause = data._lastPause || 0;
  await saveData(data);

  _state.sessStart = Date.now(); // 重置会话起点
}

/**
 * 检查是否达到限制，需要触发强制暂停。
 * 若满足条件，向所有 YouTube 标签页发送暂停消息。
 */
async function checkAndTriggerPause() {
  const data = await loadData();
  const d = todayStr();
  const acc = data[d] || 0;
  const limit = currentLimit();

  if (acc < limit) return; // 未超限

  const now = Date.now();
  if (now - (data._lastPause || 0) < CFG.PAUSE_COOLDOWN_MS) return; // 冷却中

  // 向所有 YouTube 标签页发送暂停消息
  const tabs = await chrome.tabs.query({ url: '*://*.youtube.com/*' });
  let sent = 0;
  for (const t of tabs) {
    try {
      await chrome.tabs.sendMessage(t.id, {
        action: 'force_pause',
        duration: CFG.PAUSE_DURATION_MS,
      });
      sent++;
    } catch {
      // 内容脚本可能还未加载
    }
  }

  data._lastPause = now;
  await saveData(data);

  if (sent > 0) {
    console.log(`[YT Monitor] Pause triggered (acc=${fmtTime(acc)}, limit=${fmtTime(limit)})`);
  }
}

/**
 * 更新当前激活标签页的状态。
 * 如果新标签页是 YouTube 视频，开始计时；否则停止。
 */
async function updateActiveTab(tabId) {
  await flushSession();
  _state.tabId = tabId;
  _state.onYt = false;
  _state.sessStart = null;

  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.url && CFG.VIDEO_REGEX.test(tab.url)) {
      _state.onYt = true;
      _state.sessStart = Date.now();
      // 切换到 YouTube 时立即检查是否需要暂停
      await checkAndTriggerPause();
    }
  } catch {
    // 标签页可能已关闭
  }
}

/**
 * 停止当前会话（窗口失焦、URL 变更等）。
 */
async function stopSession() {
  await flushSession();
  _state.onYt = false;
  _state.sessStart = null;
}

// ============================================================
// 事件监听
// ============================================================

// 标签页激活切换
chrome.tabs.onActivated.addListener(async (info) => {
  await updateActiveTab(info.tabId);
});

// 标签页 URL 变更
chrome.tabs.onUpdated.addListener(async (tabId, change, tab) => {
  if (tabId !== _state.tabId || !change.url) return;
  await stopSession();
  if (CFG.VIDEO_REGEX.test(change.url)) {
    _state.onYt = true;
    _state.sessStart = Date.now();
    await checkAndTriggerPause();
  }
});

// 窗口聚焦变化（窗口失焦时停止计时）
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    // 浏览器完全失焦
    await stopSession();
    return;
  }
  // 窗口获得焦点 → 重查激活标签页
  try {
    const tabs = await chrome.tabs.query({ active: true, windowId });
    if (tabs.length > 0) {
      await updateActiveTab(tabs[0].id);
    }
  } catch {
    await stopSession();
  }
});

// ============================================================
// 周期检查（每分钟唤醒一次，即使 service worker 被休眠）
// ============================================================

chrome.alarms.create('yt-periodic-check', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'yt-periodic-check') {
    // 刷新当前会话时间（防止标签页切换事件丢失）
    if (_state.onYt && _state.sessStart !== null) {
      const elapsed = Date.now() - _state.sessStart;
      if (elapsed >= 60_000) {
        // 如果持续观看超过 1 分钟，确保时间被记录
        await flushSession();
      }
    }
    await checkAndTriggerPause();
  }
});

// ============================================================
// 消息 API（供 popup 调用）
// ============================================================

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.action === 'get_status') {
    (async () => {
      const data = await loadData();
      const d = todayStr();
      reply({
        today: d,
        limit: currentLimit(),
        limitFormatted: fmtTime(currentLimit()),
        isNight: isNight(),
        accumulated: data[d] || 0,
        accumulatedFormatted: fmtTime(data[d] || 0),
        onYt: _state.onYt,
        lastPause: data._lastPause || 0,
      });
    })();
    return true; // 保持通道开放以支持异步 reply
  }

  if (msg.action === 'reset_today') {
    (async () => {
      const data = await loadData();
      delete data[todayStr()];
      await saveData(data);
      reply({ ok: true });
    })();
    return true;
  }

  if (msg.action === 'get_log') {
    (async () => {
      const data = await loadData();
      // 返回最近 7 天的日志
      const days = [];
      const now = new Date();
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        days.push({ date: key, ms: data[key] || 0, fmt: fmtTime(data[key] || 0) });
      }
      reply({ days });
    })();
    return true;
  }
});

// ============================================================
// 初始化：启动时检查当前状态
// ============================================================

(async function init() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length > 0) {
      _state.tabId = tabs[0].id;
      if (tabs[0].url && CFG.VIDEO_REGEX.test(tabs[0].url)) {
        _state.onYt = true;
        _state.sessStart = Date.now();
      }
    }
  } catch {
    // 静默失败
  }
})();
