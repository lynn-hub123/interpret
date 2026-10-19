# 语音识别转文字（跟录音绑定）设计规格

日期：2026-10-19
状态：已批准（用户逐问确认：跟录音绑定实时出字 / 语言按方向自动 / 文字展示在录音区内）

## 背景与目标

录音闭环（录音→回放→听原句→重录）已上线。用户口译后只有音频、没有文字，对照参考译文自查全靠回听。本轮用浏览器内置 Web Speech API（免费、无 key、无后端）把口译输出实时转成文字，降低自查成本。

硬约束沿用：纯静态 PWA、无后端、低饱和克制风格；**识别是增强功能，录音是主功能**——识别任何失败都不影响录音。

## 需求澄清结论

| 决策点 | 结论 |
|--------|------|
| 触发方式 | 跟录音绑定：点「🎙 录音」自动同步开识别，边说边出字 |
| 展示时机 | 实时逐字（未定稿半透明、定稿正常色），停止后保留原位 |
| 识别语言 | 按练习方向自动：中→英识别 `en-US`，英→中识别 `zh-CN` |
| 展示位置 | 录音区内、录音状态行之下（录音时紧贴按钮下方） |
| 支持面 | Chrome/Edge/Safari 可用；Firefox 不支持 → 能力检测，无痕隐藏 |

## 网络可用性（如实标注）

Web Speech API 免费，但识别引擎在浏览器厂商云端，**需联网**且各浏览器可用性不同：

- Edge（微软云）/ Safari（苹果云）：中国大陆网络可用
- Chrome（谷歌云）：中国大陆直连不可达，需代理环境
- 离线或引擎不可达时走 `network` 错误降级文案，录音不受影响

## 1. speech.js 封装（新建 `src/lib/speech.js`）

与 recorder.js 同风格的模块级单例状态机，内部自治重启，视图层只管 start/stop 和收字。

```js
// 能力检测：原生或 webkit 前缀任一存在即支持
export function speechSupported()

// 开启识别会话（continuous + interimResults），lang 为 BCP-47（'en-US'/'zh-CN'）
// handlers = { onInterim(text), onFinal(text), onError(name), 无 onEnd 需求：重启由内部处理 }
// 返回 boolean（不支持时 false）；重复 start 先静默结束旧会话（幂等）
export function start(lang, handlers)

// 手动停止：置手动标志后 recognition.stop()（优雅停，最后半句 final 仍会吐出）
// 手动停止后 onend 不再自动重启
export function stop()
```

内部规则（核心是防死循环 + 静默瞬态错误）：

- `onend` 且非手动停止 → 自动 `new SpeechRecognition()` 重启（静音超时/单句结束的断流场景）
- `onerror` 分发表：
  - `no-speech`：静默，交给 onend 自动重启（说话中途停顿）
  - `aborted`：静默（手动 stop 或系统打断的正常路径）
  - `not-allowed` / `service-not-allowed`：致命，停止重启循环，`onError('not-allowed')`
  - `network`：致命（本轮不做断网重试），`onError('network')`
  - `audio-capture`：致命，`onError('audio-capture')`
  - 其他：致命，`onError(name)` 兜底
- `onresult`：逐条 result，`isFinal` 走 `onFinal(transcript)`，否则累积最新 interim 走 `onInterim(transcript)`
- 致命错误后：内部状态复位，`stop()` 变 no-op 安全

## 2. PracticeCard 接线

- `srOK = speechSupported()`（运行期不变，同 recOK/ttsOK 模式）；`srOK && recOK` 才渲染识别区
- 状态：`recFinal`、`recInterim`、`srError`（三个 ref，字符串）
- 识别语言：`srLang = computed(() => props.direction === 'zh2en' ? 'en-US' : 'zh-CN')`
- `onRecStart` 成功后：清空 `recFinal/recInterim/srError` → 若 `srOK` 则 `start(srLang.value, handlers)`；start 失败不影响录音流程
- `onRecStop`：现有 `stopRecording()` 之外同步 `srStop()`（`speech.stop` 以 `srStop` 别名导入，避免与 voice 的 `stop` 冲突）
- 「↻ 重录」（`onRerecord`）：复用 `onRecStart`，文字随启动自然清空
- 换句 watch：清空 `recFinal/recInterim/srError`，并 `srStop()`（防止旧句识别跨句继续出字；MediaRecorder 现状行为不动）
- `onUnmounted`：追加 `srStop()`
- handlers：`onFinal` 追加到 `recFinal`（末尾补空格分隔段落）、`onInterim` 覆盖 `recInterim`、`onError` 映射为 `srError` 文案
- 声音互斥无需参与：识别只产文字不出声

## 3. 识别文字区 UI

- 位置：rec-zone 内、录音状态行（`.rec-live`）之后、`RecPlayback` 之前——录音中文字紧贴按钮下方，录完回放控件位于文字上方
- 渲染：`<p class="rec-sr">` 内两段 span——`recFinal`（正常 `--text-muted` 色）+ `recInterim`（同色 45% 透明度）；无内容时不渲染，出字时自然撑开
- 样式：13px 行高 1.6 居中纯文本，不加卡片底色，克制轻量
- `srError` 显示：复用现有 `.audio-warn`（12px 红色小字）样式，紧跟文字区
- 错误文案映射（均注明录音不受影响）：
  - `not-allowed`：语音识别权限被拒，可在地址栏允许后重试；录音不受影响
  - `network`：语音识别服务不可用（需联网）；录音不受影响
  - `audio-capture`：麦克风不可用于识别；录音不受影响
  - 其他：语音识别暂不可用；录音不受影响

## 4. 测试策略（TDD）

**speech.test.js（新）**：mock `window.SpeechRecognition` 桩类（构造实例可手动触发 `onresult`/`onend`/`onerror`）：

- 能力检测三态：原生存在 / 仅 webkit 前缀 / 都不存在
- start 传参：lang、`continuous=true`、`interimResults=true`
- final → `onFinal`、interim → `onInterim` 分发
- onend 未手动停止 → 新实例自动重启；`stop()` 后 onend 不重启
- `no-speech`/`aborted` 静默且照常重启；`not-allowed`/`network`/其他 → 停止重启并分发 onError
- 重复 start 幂等（旧会话静默结束）；未支持环境 start 返回 false、stop 安全 no-op

**PracticeCard.test.js（接线用例）**：

- 不支持识别 → 无 `.rec-sr` 区，录音流程一切照旧
- 录音启动 → `start` 以方向对应语言被调（zh2en→en-US，en2zh→zh-CN）
- interim/final 回调 → 文字渲染、interim 半透明类
- 停止录音 → 文字保留；重录 → 文字清空
- onError → `.audio-warn` 文案出现且录音区不受影响
- 换句 → 文字清空且 srStop 被调；组件卸载 → srStop 被调

happy-dom 无 SpeechRecognition：测试内定义/删除桩类，afterEach 清理。

## 5. 明确不做

- 不持久化（会话级，与录音一致，换句即清）
- 不做评分/相似度对比/差异高亮
- 不做手动语言切换、不做复制按钮
- 不做识别单独开关（跟录音绑定是既定交互）

## 6. 风险与真机验证项

- 个别 Android 机型 MediaRecorder（getUserMedia 流）与 SpeechRecognition 可能互踢麦克风 → 已有致命错误兜底文案，录音不受影响；真机验收重点确认「录 + 识别」并行稳定性
- Chrome 在中国大陆需代理才可用（见网络可用性节），验收建议用 Edge 或代理环境
