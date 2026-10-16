# 口译随手练 · 音频功能设计

> 状态：待用户审阅 | 日期：2026-10-16 | 前置规格：`2026-10-14-interpret-practice-design.md`（既定硬约束全部继承）

## 1. 背景与目标

主规格将音频/连续传译列为预留方向。本设计落地第一期音频能力，让练习从"视译"扩展到"听辨"，并补上发音参考与自录回放两个轻量工具。核心原则不变：零准备、零压力、纯前端、不打断练习流。

## 2. 范围

| 功能 | 说明 | 技术 |
|---|---|---|
| A 听辨模式 | 先听原句（TTS 朗读）→ 口头翻译 → 可随时"显示原文"降级 → 翻面自评，流程与视译一致 | Web Speech API（speechSynthesis） |
| B 发音参考 | 原句旁小喇叭，按句子语言朗读；视译/听辨模式均可用 | 同上 |
| C 录音回放 | 说译文阶段可录自己口译并回放；换句丢弃，仅当次会话有效 | MediaRecorder + getUserMedia |

**明确不做（YAGNI，后续可加）**：语速调节、录音持久化/历史、按模式区分的统计与弱句、连续传译（分段长文）。

## 3. 架构与新增模块

新增两个独立 lib 模块，均采用依赖可注入设计（happy-dom 无这两个浏览器 API，单测靠 mock 注入）。

### 3.1 `src/lib/tts.js`

```js
ttsSupported()               // 'speechSynthesis' in window
speak(text, lang)            // lang: 'zh' | 'en'；返回 boolean
cancel()                     // 停止当前朗读
```

行为细则：
- `speak` 返回 `false` 仅当引擎存在但语音列表非空且无该语言语音（提示"设备缺少 XX 语音包"）；列表为空时仍返回 `true` 交给引擎默认语音（兼容 Chrome 首次异步加载语音列表）。
- 同一时刻只播一句：播新句前自动 `cancel` 旧句。
- `utterance.lang` 映射 `zh→zh-CN`、`en→en-US`；rate 固定 1（第一版不暴露）。

### 3.2 `src/lib/recorder.js`

```js
recorderSupported()          // MediaRecorder 与 getUserMedia 均存在
startRecording()             // Promise<boolean>；false = 不支持或权限被拒
stopRecording()              // 返回 ObjectURL（string）或 null（未在录）
isRecording()
revoke(url)                  // 用毕释放，防内存泄漏
```

行为细则：`stopRecording` 成功后必须停止全部 track（熄灭麦克风指示灯）；模块内持有一套 stream/recorder 状态机。

### 3.3 settings 扩展

`DEFAULTS` 增加 `mode: 'sight'`；新增 `setMode(mode)`（仅接受 `'sight' | 'listen'`，透传 `saveSettings` 布尔返回值）。旧数据缺 `mode` 字段时由现有合并逻辑补默认值（实现阶段核对 Task 9 的合并行为，确保 `mode` 出现在保存结果中）。

## 4. 界面与交互

### 4.1 模式切换（PracticeView）

方向切换旁新增"视译 | 听辨"分段小切换，点选即存 settings。切换模式时：`tts.cancel()`、丢弃未回放的录音资源。

### 4.2 PracticeCard 变化

新增 prop `mode`（默认 `'sight'`）。内部 `listenTextShown` ref，随 `sentence` 变化重置（与现有 `revealed` 同一 watch）。

**听辨模式正面**（`listenTextShown=false`）：
- 卡片中央"🎧 播放原句"按钮 → 调 `speak`；返回 `false` 时卡片内提示"当前设备无语音引擎，已显示原文"并自动置 `listenTextShown=true`
- 次级文字按钮"显示原文"→ 置 `listenTextShown=true`（听辨降级，训练强度自调）

**听辨显示原文后 / 视译模式正面**：
- 原文旁 🔊 小喇叭（`ttsSupported()` 为 false 时整体隐藏）；点击 `speak`，失败提示"设备缺少 XX 语音包"

**录音区**（两种模式的正面均显示，`recorderSupported()` 为 false 时隐藏）：
- "🎙 录音"→ 录音中（按钮变为"停止"）→ 停止后出现回放控件
- 翻面后录音区整体隐藏（录了没听就翻面属用户自弃）；换句时旧录音 URL 自动 revoke

**翻面/自评/历史/跳过**：完全不变。

### 4.3 生命周期清理

PracticeView 在组件卸载与路由离开时 `tts.cancel()`；PracticeCard 卸载/换句时 revoke 录音 URL。PWA 切后台由浏览器自行处理，不做额外挂起逻辑。

## 5. 错误处理（沿用 §9 风格：提示但不打断）

| 情形 | 行为 |
|---|---|
| 设备无语音引擎 | 喇叭隐藏；听辨点播放提示并自动显示原文 |
| 缺对应语言语音包 | 提示"设备缺少中文/英文语音包"，练习不中断 |
| 录音不支持 | 录音区隐藏 |
| 麦克风权限被拒 | 点击录音后提示"无法访问麦克风"，可重试 |
| 导入旧备份 JSON | 无 `mode` 字段自动补默认，导入不失败 |

## 6. 测试策略

单测（Vitest + happy-dom，浏览器 API 全部注入 mock）：
- `tts.test.js`：语言→语音匹配、列表为空仍可播、列表非空无匹配返回 false、播新先停旧、cancel
- `recorder.test.js`：支持检测、start/stop 状态机、未录时 stop 返回 null、revoke 调用
- `settings.test.js`：mode 默认 `'sight'`、setMode 合法值持久化、非法值拒绝
- `PracticeCard.test.js`：听辨两态切换、喇叭/录音区显隐条件、降级提示、换句重置与 revoke

真机手工验收（无法自动化）：听感与语速、麦克风权限流程、iOS Safari/PWA 窗口下 TTS 可用性（异常时降级路径必须生效）。

## 7. 兼容性说明

- Web Speech API：Windows Chrome/Edge 自带本地语音包，离线可用；iOS Safari 可用但 PWA 独立窗口存在历史兼容问题，接受"降级为视译"的兜底体验
- MediaRecorder：现代浏览器全支持；录音 Blob 不写入 localStorage（会话级），与主规格"数据全在 localStorage"不冲突
- 导出 JSON 格式不变（settings 多一个可选字段）；旧备份（无 `mode`）导入新版本应用自动补默认，新备份导入旧版本应用时多余字段被忽略，双向兼容
