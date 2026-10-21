# 口译随手练 · 复述模式设计

> 状态：待用户审阅 | 日期：2026-10-21 | 前置规格：`2026-10-14-interpret-practice-design.md`、`2026-10-16-audio-features-design.md`（既定硬约束全部继承） | 交互原型：`docs/superpowers/prototypes/2026-10-21-retell-mode-prototype.html`（已验证）

## 1. 背景与目标

听辨模式已落地「听原句 → 口头翻译 → 对照自评」，训练的是译语转换。本设计新增**源语复述**练习：听到什么语言就复述什么语言，训练短时记忆、听辨注意力与逻辑重组——口译训练的经典前置练习。同时吸收三项听辨增强：语速控制、不限次重听、盲听自评。

核心原则不变：零准备、零压力、纯前端、不打断练习流、手动触发不自动打扰。

## 2. 范围

| 功能 | 说明 |
|---|---|
| A 复述模式 | 第三种练习模式（视译/听辨/复述并列）：听原句 → 源语复述（可录音）→ 对照原文或直接盲听自评 → 评分换句，评分走现有 SRS 调度 |
| B 语速切换 | 0.75x / 1x / 1.25x 三档，仅复述模式提供，默认 1x；会话内跟句保持，不跨会话持久化 |
| C 盲听自评 | 停止复述录音后评分按钮即可出现，不强制对照原文；想对照再点「对照原文」 |
| D 不限次重听 | 播放按钮播完自动变「重听」，次数不限；与自己的录音回放互斥（沿用现有互斥机制） |

**明确不做（YAGNI，后续迭代）**：分段连续播放（需题库支持段落型素材，现有题库均为单句）、复述统计按模式区分、影子跟读。

## 3. 架构与模块改动

新增零个 lib 模块，全部为现有模块的定向扩展；视图层仅做接线，与现有代码风格一致。

### 3.1 `src/stores/settings.js`

`setMode` 合法值从 `'sight' | 'listen'` 扩为 `'sight' | 'listen' | 'retell'`。`DEFAULTS.mode` 保持 `'sight'`（旧数据无 `mode` 字段由现有合并逻辑补默认，行为不变）。

### 3.2 `src/lib/tts.js`

`speak(text, lang, onend, rate = 1)` 增加第 4 个可选参数：`u.rate = rate`。默认值 1 保证既有调用（`voice.js` 兜底、喇叭朗读）零改动。不做 clamp，由调用方保证合法值（0.75/1/1.25 均在引擎允许范围内）。

### 3.3 `src/lib/voice.js`

`playText({ id, source, text, lang, rate = 1 })` 增加可选 `rate`：

- 预生成 MP3 路径：`audio.playbackRate = rate`（现代浏览器 `preservesPitch` 默认 true，变速不变调）
- TTS 兜底路径：`speak(text, lang, onend, rate)` 透传

单例语义（播新停旧、`stop()` 幂等）不变。

### 3.4 `src/components/PracticeCard.vue`

新增 `mode === 'retell'` 分支（未揭晓正面），与听辨分支互斥：

- **播放区**：「▶ 播放原句」大按钮（播放中变「⏹ 停止」，播完变「↻ 重听」）+ 语速分段控件（三个 `speed-btn`，激活态 `box-shadow: var(--shadow-in)`）。语速为组件内 `ref`，`watch(() => props.sentence)` 重置列表**不含**语速（调一次多句沿用）；切模式离开复述再回来不保留（组件重挂载自然回默认）
- **录音区**：沿用现有 `rec-zone` 全套（录音、计时、呼吸脉冲、识别文字、回放控件、听原句/重录），仅识别语言变化（见下）
- **揭晓按钮**：文案「对照原文」（区别于视译/听辨的「看参考译文」）
- **揭晓后**：一次性显示原文大字（`.source`）+ 参考译文次级块（`.neu-inset`，带「参考译文」小标签），一步到位，不再像听辨那样二次翻面
- **评分提前出现**：停止录音时 `emit('recStopped')`，供父级提前显示评分按钮
- **识别语言**：`srLang` 由现在的「按 direction 取目标语」改为 `mode === 'retell' ? 源语 : 目标语`；源语复用现有 `sourceLang` computed（按实际文本判定中英文，正确处理自定义句缺字段的情况）。复述模式识别源语、翻译模式识别目标语，两者方向相反
- 换句重置逻辑（revealed/listenTextShown/错误提示/识别文字/录音 URL）照旧；语速不重置
- `mode` watch 清空音频提示照旧；`playCurrent` 头部停自己的回放互斥照旧

### 3.5 `src/components/RatingButtons.vue`

新增可选 prop `variant`（`'translate'` 默认 | `'retell'`），查表切换文案：

| value | translate（现有） | retell |
|---|---|---|
| ok | 能译 | 流畅 |
| shaky | 磕绊 | 磕绊 |
| miss | 不会 | 没记住 |

### 3.6 `src/views/PracticeView.vue`

- 模式切换按钮组增加「复述」（三段：视译/听辨/复述），`applyMode` 现有停止播放逻辑直接复用
- `current` 会话项增加 `recDone` 字段（`next()` 里初始化为 `false`）；收到 `@rec-stopped` 时置 true（与 `onRevealed` 同型的单行处理）
- 评分按钮显示条件从 `current.revealed` 扩为 `current.revealed || (settings.mode === 'retell' && current.recDone)`；提示行文案（rating-zone 下的 hint）同步按模式切换：复述模式未评时显示「听完 → 开口复述 → 对照原文后自评」
- `RatingButtons` 在复述模式传 `variant="retell"`

### 3.7 零改动模块

`picker.js`、`srs.js`、`records.js`、`speech.js`、`recorder.js`、`RecPlayback.vue`、`sentences.js`、备份导出/导入——评分、调度、记录、识别、录音全部走现有通道，`rating` 值语义复用不区分模式。

## 4. 界面与交互（复述模式正面）

```
┌─ dir-pill：复述 · 中文原声 / 复述 · 英文原声 ─┐
│                                              │
│         [ ▶ 播放原句 ]（大按钮）              │
│         [0.75x] [1x] [1.25x]                 │
│                                              │
│         [ 🎙 复述录音 ]                       │
│         （录音中：⏹ 停止 + mm:ss + 脉冲）     │
│         （识别文字逐句显示，源语）             │
│         （停止后：回放控件 + 听原句/重录）     │
│                                              │
│         [ 对照原文 ]（停止录音后出现）         │
│         [ 跳过 ]                             │
└──────────────────────────────────────────────┘

揭晓后：原文大字 + 参考译文次级块 + 评分按钮（提前出现的不撤）
```

播放中即可开始录音（不强制听完再录）；录音中可再点播放重听（互斥机制自动停回放/停播放）。

## 5. 错误处理（沿用「提示但不打断」风格）

| 情形 | 行为 |
|---|---|
| 设备无语音引擎 | 播放失败提示「当前设备无语音引擎，已显示原文」并自动揭晓（同听辨降级路径） |
| 缺对应语言语音包 | 预生成音频不受影响；自定义句兜底 TTS 失败提示「设备缺少中文/英文语音包」 |
| 录音/麦克风/识别失败 | 完全沿用现有提示与「不影响主流程」机制，复述模式零新逻辑 |
| 旧备份无 mode 字段 | 现有合并逻辑补默认 sight，导入不失败 |

## 6. 测试策略

单测（Vitest + happy-dom，浏览器 API mock 注入，与现有约定一致）：

- `settings.test.js`：`setMode('retell')` 合法且持久化；非法值仍拒绝
- `tts.test.js`：`speak` 第 4 参 rate 透传到 `utterance.rate`；缺省仍为 1
- `voice.test.js`：`playText` 传 rate 时 MP3 路径置 `audio.playbackRate`、TTS 回退透传；缺省不触碰 playbackRate
- `PracticeCard.test.js`：retell 分支显隐（语速控件/录音区/对照原文按钮）、`srLang` 复述模式取源语（zh2en 句识别 zh-CN）、停止录音 emit `recStopped`、揭晓后原文+译文同屏、换句重置但语速保留、播放失败自动揭晓降级
- `PracticeView.test.js`：复述模式下停止录音后评分出现（未揭晓）、对照原文后评分仍在、视译/听辨模式评分仍需翻面、`variant` 传参正确
- `RatingButtons.test.js`：variant 查表文案

真机手工验收（无法自动化）：0.75x/1.25x 变速听感（MP3 与 TTS 两条路径）、复述识别出字方向、盲听自评流程顺滑度。

## 7. 兼容性说明

- 导出/导入 JSON 格式不变（settings 的 mode 值域扩一项，旧版本应用导入含 `retell` 的备份会落到「非法值拒绝」路径回到 sight，可接受）
- `speak`/`playText` 新参数全部带默认值，既有调用点零改动
- 音频预缓存不受影响（复述模式复用同一批 MP3，无新增资源）
