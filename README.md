# YouTube 时间监控 🦞

Edge 浏览器扩展，监控 YouTube 视频观看时长，超限后强制暂停。

## 功能

- ⏱ **自动计时**：检测当前标签页是否为 YouTube 视频页面，自动累计停留时间
- 🔄 **跨会话**：关闭标签页后时间不会丢失，每日重置
- 🚨 **强制暂停**：超限后弹出全屏覆盖层，30 秒内无法关闭
- 🌙 **夜间加速**：23:00~06:00 限制缩短为 20 分钟
- 📊 **历史记录**：弹窗中查看最近 7 天使用情况
- 🧊 **防作弊**：输入拦截 + MutationObserver 防止移除

## 安装

### Edge (Chromium 内核)

1. 打开 `edge://extensions`
2. 开启 **"开发人员模式"** (左下角开关)
3. 点击 **"加载解压缩的扩展"**
4. 选择本项目文件夹（`youtube-time-monitor/`）
5. 完成 🎉

### Chrome

同 Edge 操作，打开 `chrome://extensions` 加载即可。

## 使用方法

安装后扩展自动运行，无需额外配置。

- 点击工具栏图标查看今日使用统计
- 点击 **"重置今日数据"** 清零当前统计
- 达到时间限制时，视频页面会自动弹出 30 秒暂停覆盖层

## 技术细节

- 使用 `chrome.tabs.onActivated` / `onUpdated` / `windows.onFocusChanged` 准确追踪活跃标签页
- 时间数据通过 `chrome.storage.local` 持久化
- `chrome.alarms` 每分钟唤醒 service worker 检查超限
- 覆盖层通过 `MutationObserver` + 事件拦截实现防关闭

## 文件结构

```
youtube-time-monitor/
├── manifest.json   # 扩展清单 (MV3)
├── background.js   # 后台 service worker (计时、存储、检查)
├── content.js      # 内容脚本 (暂停覆盖层)
├── popup.html      # 弹窗界面
├── popup.js        # 弹窗交互逻辑
└── README.md       # 本文件
```
