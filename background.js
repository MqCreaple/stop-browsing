// ============================================================
// 别刷了！ - 后台 Service Worker
// ============================================================

// ---- 默认配置 ----
const DEFAULT_SITES = {
  youtube:     { label: 'YouTube',  enabled: true,
                  matchUrl: '*://*.youtube.com/*',
                  videoRe: /^https?:\/\/(www\.)?(youtube\.com|m\.youtube\.com)\/watch\?v=/ },
  bilibili:    { label: 'B站',      enabled: true,
                  matchUrl: '*://*.bilibili.com/*',
                  videoRe: /^https?:\/\/(www\.)?bilibili\.com\/video\// },
  tiktok:      { label: 'TikTok',   enabled: true,
                  matchUrl: '*://*.tiktok.com/*',
                  videoRe: /^https?:\/\/(www\.)?tiktok\.com\/@.+\/video\// },
  douyin:      { label: '抖音',     enabled: true,
                  matchUrl: '*://*.douyin.com/*',
                  videoRe: /^https?:\/\/(www\.)?douyin\.com\/video\// },
  xiaohongshu: { label: '小红书',   enabled: true,
                  matchUrl: '*://*.xiaohongshu.com/*',
                  videoRe: /^https?:\/\/(www\.)?xiaohongshu\.com\// },
  zhihu:       { label: '知乎',     enabled: true,
                  matchUrl: '*://*.zhihu.com/*',
                  videoRe: /^https?:\/\/(www\.)?zhihu\.com\// },
  weibo:       { label: '微博',     enabled: true,
                  matchUrl: '*://*.weibo.com/*',
                  videoRe: /^https?:\/\/(www\.)?weibo\.com\// },
  tieba:       { label: '百度贴吧', enabled: true,
                  matchUrl: '*://*.tieba.baidu.com/*',
                  videoRe: /^https?:\/\/(www\.)?tieba\.baidu\.com\// },
  twitter:     { label: 'Twitter/X', enabled: true,
                  matchUrl: '*://*.x.com/*',
                  videoRe: /^https?:\/\/(www\.)?(x\.com|twitter\.com)\// },
};

const DEFAULT_CONFIG = {
  sites: DEFAULT_SITES,
  nightStart: 23,
  nightEnd: 6,
  dayLimitMin: 60,
  nightLimitMin: 20,
  pauseDurationSec: 30,
  pauseCooldownMin: 5,
  pauseBehaviourId: 'timer',
};

const CFG_KEY = 'stop_browsing_config';
const DATA_KEY = 'stop_browsing_data';
const STATE_KEY = 'stop_browsing_state';

// ---- 运行时状态 ----
const S = {
  tabId: null,          // 当前播放的tab ID
  siteId: null,         // 当前播放的网站ID
  sessStart: null,      // 当前播放的session开始时间
  sessionMs: 0,         // 当前的使用时间
  pausingStatus: null,  // 暂停状态，null表示未暂停。一旦触发暂停只能在接收到 pause_finished 之后解除
};

// ============================================================
// 工具函数
// ============================================================

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

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
// 配置管理
// ============================================================

/** 从存储加载配置，与默认值合并（确保新增站点自动出现） */
async function loadConfig() {
  const r = await chrome.storage.local.get(CFG_KEY);
  const saved = r[CFG_KEY] || {};
  const merged = { ...DEFAULT_CONFIG, ...saved };
  // 合并站点列表
  // 合并站点列表（兼容旧版数组格式的存储）
  const savedSites = saved.sites || {};
  const savedMap = Array.isArray(savedSites)
    ? Object.fromEntries(savedSites.map(s => [s.id, s]))
    : savedSites;
  merged.sites = {};
  for (const [id, def] of Object.entries(DEFAULT_SITES)) {
    const savedSite = savedMap[id];
    merged.sites[id] = savedSite ? { ...def, enabled: savedSite.enabled } : { ...def };
  }
  return merged;
}

async function saveConfig(cfg) {
  await chrome.storage.local.set({ [CFG_KEY]: cfg });
}

/** 获取默认配置（仅用于重置） */
function getDefaultConfig() {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

// ============================================================
// 时间数据管理
// ============================================================

/** 存储格式: { "2026-05-02": { youtube: 1000, bilibili: 2000, ... }, _lastPause: ts } */
async function loadData() {
  const r = await chrome.storage.local.get(DATA_KEY);
  return r[DATA_KEY] || {};
}

async function saveData(data) {
  await chrome.storage.local.set({ [DATA_KEY]: data });
}

/** 获取某个站点今天的累计时间 */
async function getTodayTime(data, siteId, day) {
  const d = data[day] || {};
  return d[siteId] || 0;
}

/** 获取今天所有站点的累计时间 */
async function getTodayAllTimes(data, day) {
  const d = data[day] || {};
  const cfg = await loadConfig();
  const result = {};
  let total = 0;
  for (const [id, site] of Object.entries(cfg.sites)) {
    const ms = d[id] || 0;
    result[id] = ms;
    if (site.enabled) total += ms;
  }
  return { perSite: result, total };
}

// ============================================================
// 核心逻辑
// ============================================================

function isNight(cfg) {
  const h = new Date().getHours();
  return h >= cfg.nightStart || h < cfg.nightEnd;
}

function currentLimitMs(cfg) {
  const min = isNight(cfg) ? cfg.nightLimitMin : cfg.dayLimitMin;
  return min * 60 * 1000;
}

/** 检测 URL 匹配哪个站点，返回站点配置或 null */
function matchSite(url, cfg) {
  if (!url) return null;
  for (const [id, site] of Object.entries(cfg.sites)) {
    if (site.enabled && site.videoRe.test(url)) return { ...site, id };
  }
  return null;
}

/** 将当前会话时长刷入持久存储 */
async function flushSession() {
  if (!S.siteId || S.sessStart === null) return;
  const now = Date.now();
  const elapsed = now - S.sessStart;
  if (elapsed < 1000) return;

  // 累加 session 计时器（暂停后清零）
  if(S.pausingStatus === null) {
    // 只有当不在暂停状态时才增加计时器
    S.sessionMs = (S.sessionMs || 0) + elapsed;
  }
  S.sessStart = now;

  // 持久化今日累计（仅用于统计，不用于判定暂停）
  if(S.pausingStatus === null) {
    const data = await loadData();
    const day = todayStr();
    if (!data[day]) data[day] = {};
    data[day][S.siteId] = (data[day][S.siteId] || 0) + elapsed;
    if (typeof data._lastPause !== 'number') data._lastPause = 0;
    await saveData(data);
  }

  // 保存运行时状态（仅保留 sessionMs 和 pausingStatus，其余让正常流程接管）
  await chrome.storage.local.set({ [STATE_KEY]: {
    sessionMs: S.sessionMs,
    pausingStatus: S.pausingStatus,
  } });
}

/** 检查是否超限，触发强制暂停 */
async function checkAndTriggerPause(cfg) {
  const data = await loadData();
  const limit = currentLimitMs(cfg);
  const sessionMs = S.sessionMs || 0;

  if (sessionMs < limit) return;

  const now = Date.now();
  const cd = cfg.pauseCooldownMin * 60 * 1000;
  if (now - (data._lastPause || 0) < cd) return;

  const pauseDurationMs = cfg.pauseDurationSec * 1000;

  // 向所有启用的视频站发送暂停消息
  for (const [, site] of Object.entries(cfg.sites)) {
    if (!site.enabled) continue;
    try {
      const tabs = await chrome.tabs.query({ url: site.matchUrl });
      for (const t of tabs) {
        S.pausingStatus = {
          siteLabel: site.label,
          behaviourId: cfg.pauseBehaviourId || 'timer',
          duration: pauseDurationMs,
        };
        chrome.tabs.sendMessage(t.id, {
          action: 'force_pause',
          duration: pauseDurationMs,
          siteLabel: site.label,
          behaviourId: cfg.pauseBehaviourId || 'timer',
        }).catch(() => {});
      }
    } catch { /* 静默 */ }
  }

  data._lastPause = now;
  await saveData(data);
  S.sessionMs = 0;  // 暂停后清零 session 计时器
  console.log(`[别刷了] Pause triggered (session=${fmtTime(sessionMs)}, limit=${fmtTime(limit)})`);
}

/** 将当前标签页设为新的目标并开始计时 */
async function switchToTab(tabId) {
  await flushSession();
  S.tabId = tabId;
  S.siteId = null;
  S.sessStart = null;

  try {
    const tab = await chrome.tabs.get(tabId);
    console.log(`[别刷了] Switch to tab ${tab.title} (${tab.url})`)
    const cfg = await loadConfig();
    const matched = matchSite(tab.url, cfg);
    if (matched) {
      S.siteId = matched.id;
      S.sessStart = Date.now();
      await checkAndTriggerPause(cfg);
    }
  } catch { /* 标签页可能已关闭 */ }
}

async function stopSession() {
  await flushSession();
  S.siteId = null;
  S.sessStart = null;
}

// ============================================================
// 事件监听
// ============================================================

/** 浏览器完全退出时（所有窗口关闭），刷入缓存数据 */
chrome.windows.onRemoved.addListener(async () => {
  const windows = await chrome.windows.getAll();
  if (windows.length === 0) {
    console.log('[别刷了] Browser quitting, flushing session...');
    await flushSession();
  }
});

chrome.tabs.onActivated.addListener(async (info) => {
  await switchToTab(info.tabId);
});

chrome.tabs.onUpdated.addListener(async (tabId, change, tab) => {
  if (tabId !== S.tabId || !change.url) return;
  await stopSession();
  const cfg = await loadConfig();
  const matched = matchSite(change.url, cfg);
  if (matched) {
    S.siteId = matched.id;
    S.sessStart = Date.now();
    await checkAndTriggerPause(cfg);
  }
});

// ============================================================
// 周期检查（每分钟）
// ============================================================

chrome.alarms.create('periodic-check', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'periodic-check') return;

  const cfg = await loadConfig();
  if (S.siteId && S.sessStart !== null) {
    const elapsed = Date.now() - S.sessStart;
    if (elapsed >= 60_000) await flushSession();
  }
  await checkAndTriggerPause(cfg);
});

// ============================================================
// 消息 API
// ============================================================

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  // --- 获取状态 ---
  if (msg.action === 'get_status') {
    (async () => {
      const cfg = await loadConfig();
      const data = await loadData();
      const day = todayStr();
      const { perSite } = await getTodayAllTimes(data, day);

      // session 计时器（暂停后清零）+ 当前会话进行中时长
      let sessionWatchMs = S.sessionMs || 0;
      if (S.pausingStatus === null && S.siteId && S.sessStart !== null) {
        sessionWatchMs += (Date.now() - S.sessStart);
      }
      console.log("Session time: ", sessionWatchMs / 1000, "seconds");

      // 当前正在观看的站点标签
      let currentLabel = '未在观看视频';
      if (S.siteId) {
        const site = cfg.sites[S.siteId];
        // 设置页也需要站点列表
        currentLabel = site ? `正在观看 ${site.label}` : '正在观看视频';
      }

      reply({
        today: day,
        perSite,
        sessionWatchMs,
        sessionFormatted: fmtTime(sessionWatchMs),
        limit: currentLimitMs(cfg),
        limitFormatted: fmtTime(currentLimitMs(cfg)),
        isNight: isNight(cfg),
        nightStart: cfg.nightStart,
        nightEnd: cfg.nightEnd,
        sites: cfg.sites,
        browsingVideo: !!S.siteId,
        isPausing: !!S.pausingStatus,
        currentLabel,
        lastPause: data._lastPause || 0,
      });
    })();
    return true;
  }

  // --- 检查内容页面是否需要进入暂停状态（防刷新绕过） ---
  if (msg.action === 'check_pause_state') {
    if (S.pausingStatus) {
      reply({
        shouldPause: true,
        duration: S.pausingStatus.duration,
        siteLabel: S.pausingStatus.siteLabel,
        behaviourId: S.pausingStatus.behaviourId,
      });
    } else {
      reply({ shouldPause: false });
    }
    return true;
  }

  // --- 内容页面暂停结束通知 ---
  if (msg.action === 'pause_finished') {
    console.log("[别刷了] Pause finished.")
    S.pausingStatus = null;
    reply({ ok: true });
    return;
  }

  // --- 获取可用暂停行为列表 ---
  if (msg.action === 'get_behaviours') {
    reply([
      { id: 'timer', name: '⏱ 倒计时', description: '等待指定时间后自动恢复' },
      { id: 'quiz', name: '🧮 四则运算', description: '完成 10 道算术题后才能恢复' },
      { id: 'tripos', name: '📐 Tripos 数学真题', description: '看一道历年数学真题，倒计时结束后确认完成' },
    ]);
    return;
  }

  // --- 获取配置 ---
  if (msg.action === 'load_config') {
    (async () => {
      const cfg = await loadConfig();
      reply(cfg);
    })();
    return true;
  }

  // --- 保存配置 ---
  if (msg.action === 'save_config') {
    (async () => {
      await saveConfig(msg.config);
      reply({ ok: true });
    })();
    return true;
  }

  // --- 重置今日数据 ---
  if (msg.action === 'reset_today') {
    (async () => {
      const data = await loadData();
      delete data[todayStr()];
      await saveData(data);
      reply({ ok: true });
    })();
    return true;
  }

  // --- 获取最近 7 天日志 ---
  if (msg.action === 'get_log') {
    (async () => {
      const cfg = await loadConfig();
      const data = await loadData();
      const now = new Date();
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        const dayData = data[key] || {};
        let total = 0;
        for (const [id, site] of Object.entries(cfg.sites)) {
          if (site.enabled) total += (dayData[id] || 0);
        }
        days.push({ date: key, total, totalFormatted: fmtTime(total) });
      }
      reply({ days });
    })();
    return true;
  }
});

// ============================================================
// 初始化
// ============================================================

(async function init() {
  try {
    // 尝试恢复上次保存的运行时状态（service worker 可能因休眠被回收）
    const saved = await chrome.storage.local.get(STATE_KEY);
    if (saved[STATE_KEY]) {
      S.sessionMs = saved[STATE_KEY].sessionMs || 0;
      S.pausingStatus = saved[STATE_KEY].pausingStatus || null;
      console.log('[别刷了] Restored state:', {
        sessionMs: S.sessionMs,
        pausingStatus: S.pausingStatus,
      });
    }

    // 检查当前激活标签页（不做状态继承，防止误判）
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length > 0) {
      const cfg = await loadConfig();
      const matched = matchSite(tabs[0].url, cfg);
      if (matched) {
        S.tabId = tabs[0].id;
        S.siteId = matched.id;
        S.sessStart = Date.now();
      }
    }
  } catch { /* 静默 */ }
})();