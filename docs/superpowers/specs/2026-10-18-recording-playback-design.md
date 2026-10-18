# 录音回放升级（自定义回放控件 + 录后引导）设计规格

日期：2026-10-18
状态：已批准（用户确认方案 B：自定义回放控件 + 「听原句」「重录」引导按钮，逐节确认设计后批准）

## 背景与目标

录音区上一轮已交付计时器与脉冲动画。本轮解决两件事：

1. **回放粗糙**：录音停止后显示的是浏览器原生 `<audio controls>`，各平台长相不一、与应用整体风格脱节
2. **录后引导缺失**：录完后没有明确的「对照原句」「重录」入口，用户不知道可以形成对照练习的闭环（「再点 🎙 录音就是重录」无任何提示）

硬约束沿用：纯静态 PWA、无后端、交互全部手动触发、不自动播放、低饱和 iOS 风格。

## 需求澄清结论

| 决策点 | 结论 |
|--------|------|
| 回放控件 | 自定义控件：播放/暂停圆钮 + 细进度条 + 时长显示，iOS 风格低饱和 |
| 录后引导 | 「🔊 听原句」+「↻ 重录」两个按钮，形成 录音→听原句→听自己→重录 小闭环 |
| 声音互斥 | 任何时刻只允许一路声音：播原句时自动暂停自己的回放；播自己的回放时停止原句 |
| 触发方式 | 全部手动触发，无自动播放、无催促 |

## 1. RecPlayback 子组件（新建）

- 新建 `src/components/RecPlayback.vue`：props 接收 `src`（blob URL），组件内自管播放状态
- UI 一行：圆形播放/暂停按钮（▶/⏸）+ 细进度条 + `0:02 / 0:07` 时间显示
- 进度条基于原生 `input[type=range]` 定制样式：可点击/拖动 seek，键盘可访问性免费获得
- 播放结束（ended）自动回位到起点、按钮变 ▶
- 时间格式 `m:ss`（当前 / 总时长），格式化抽纯函数 `formatTime` 便于单测
- 内部清理：`src` 变化或组件卸载时暂停并重置进度
- 对外：`defineExpose({ pause })`，供父级做互斥；播放开始时 `emit('playing')`，供父级停原句

## 2. 录后引导按钮

- **「🔊 听原句」**：复用现有 `voice.playText` 链路（内置句播预生成音频、自定义句走 TTS），与卡片上方源句旁的 🔊 完全共用同一播放状态（同一个 `playing` ref、同一单例播新停旧），播放中按钮变「⏹」再点停止
- **「↻ 重录」**：暂停回放 → revoke 旧 URL → 直接开始新录音（复用现有 `onRecStart` 的清理与启动逻辑）
- 布局：回放控件行下方一行两个小按钮，居中，样式沿用现有 `.btn-skip` 级别的克制文字按钮

## 3. 声音互斥

- 播原句（`onSpeak` / `onListenPlay` 入口）启动前：通过 ref 调 `recPlayback.pause()` 暂停自己的回放
- 自己的回放开始播放（RecPlayback emit `playing`）时：调 `voice.stop()` 停掉原句，`playing` 置 false
- 结果：任何时刻最多一路声音，不打架

## 4. PracticeCard 接线改造

- rec-zone 停止录音后的区域：`<RecPlayback :src="recUrl" ref="recPlayback" @playing="onRecPlaying" />` + 「🔊 听原句」「↻ 重录」按钮行
- 移除原生 `<audio class="rec-playback">` 元素
- 现有语义保持：点「🎙 录音」（重录的另一入口）仍 revoke 旧 URL 并开始新录音；录音失败路径与错误文案不动
- 句子切换 watch、组件卸载清理保持现状，RecPlayback 内部自清理

## 5. 测试策略（TDD）

- **RecPlayback.test.js（新）**：
  - `formatTime` 纯函数矩阵（0、59、61、125、600 秒等边界）
  - 播放/暂停切换（mock audio 元素 play/pause）
  - ended 事件回位、进度与时间显示联动
  - src 变化重置、seek 双向绑定
- **PracticeCard.test.js（改造）**：
  - 录完后出现 RecPlayback 自定义控件、不再有带 controls 的原生 audio
  - 「听原句」调 playText 且传参正确、播放中变「⏹」
  - 「重录」触发 startRecording 且 revoke 旧 URL
  - 互斥：播原句时 RecPlayback 的 pause 被调用；自己回放播放时 voice.stop 被调用
- 现有全量用例保持绿（PracticeCard 相关断言按新 UI 调整，不计入无关改动）

## 6. 改动边界

- 新建：`src/components/RecPlayback.vue`、`src/components/RecPlayback.test.js`
- 修改：`src/components/PracticeCard.vue`、`src/components/PracticeCard.test.js`
- 不动：`src/lib/recorder.js`、`src/lib/voice.js`、PracticeView、其他页面

## 7. YAGNI 边界（本次不做）

- 波形显示、倍速播放、删除录音按钮、自动播放、重录确认弹窗、录音下载
- 原句与自己的录音连续对比播放
