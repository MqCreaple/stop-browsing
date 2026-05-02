// ============================================================
// 别刷了！ - 后台 Service Worker
// ============================================================

// ---- 默认配置 ----
const DEFAULT_SITES = [
  { id: 'youtube',  label: 'YouTube',  enabled: true,
    matchUrl: '*://*.youtube.com/*',
    videoRe: /^https?:\/\/(www\.)?(youtube\.com|m\.youtube\.com)\/watch\?v=/ },
  { id: 'bilibili', label: 'B站',      enabled: true,
    matchUrl: '*://*.bilibili.com/*',
    videoRe: /^https?:\/\/(www\.)?bilibili\.com\/video\// },
  { id: 'tiktok',   label: 'TikTok',   enabled: true,
    matchUrl: '*://*.tiktok.com/*',
    videoRe: /^https?:\/\/(www\.)?tiktok\.com\/@.+\/video\// },
  { id: 'douyin',   label: '抖音',     enabled: true,
    matchUrl: '*://*.douyin.com/*',
    videoRe: /^https?:\/\/(www\.)?douyin\.com\/video\// },
];

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

// ---- 运行时状态 ----
const S = { tabId: null, siteId: null, sessStart: null, sessionMs: 0 };

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
  merged.sites = DEFAULT_SITES.map(def => {
    const existing = (saved.sites || []).find(x => x.id === def.id);
    return existing ? { ...def, enabled: existing.enabled } : { ...def };
  });
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
  for (const site of cfg.sites) {
    const ms = d[site.id] || 0;
    result[site.id] = ms;
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
  for (const site of cfg.sites) {
    if (site.enabled && site.videoRe.test(url)) return site;
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
  S.sessionMs = (S.sessionMs || 0) + elapsed;
  S.sessStart = now;

  // 持久化今日累计（仅用于统计，不用于判定暂停）
  const data = await loadData();
  const day = todayStr();
  if (!data[day]) data[day] = {};
  data[day][S.siteId] = (data[day][S.siteId] || 0) + elapsed;
  if (typeof data._lastPause !== 'number') data._lastPause = 0;
  await saveData(data);
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

  // 向所有启用的视频站发送暂停消息
  for (const site of cfg.sites) {
    if (!site.enabled) continue;
    try {
      const tabs = await chrome.tabs.query({ url: site.matchUrl });
      for (const t of tabs) {
        chrome.tabs.sendMessage(t.id, {
          action: 'force_pause',
          duration: cfg.pauseDurationSec * 1000,
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
      if (S.siteId && S.sessStart !== null) {
        sessionWatchMs += (Date.now() - S.sessStart);
      }

      // 当前正在观看的站点标签
      let currentLabel = '未在观看视频';
      if (S.siteId) {
        const site = cfg.sites.find(s => s.id === S.siteId);
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
        browsingVideo: !!S.siteId,
        currentLabel,
        lastPause: data._lastPause || 0,
      });
    })();
    return true;
  }

  // --- 获取可用暂停行为列表 ---
  if (msg.action === 'get_behaviours') {
    reply([
      { id: 'timer', name: '⏱ 倒计时', description: '等待指定时间后自动恢复' },
      { id: 'quiz', name: '🧮 四则运算', description: '完成 10 道算术题后才能恢复' },
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
        for (const site of cfg.sites) {
          if (site.enabled) total += (dayData[site.id] || 0);
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
