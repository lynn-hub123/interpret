# 真人感语音（预生成音频 + 自然音色兜底）设计规格

日期：2026-10-18
状态：已批准（用户确认 A+B 组合、晓晓+Andrew 声音、全自动兜底、按需加载方案及全部设计节）

## 背景与目标

当前朗读使用浏览器自带 `speechSynthesis`（src/lib/tts.js），取系统第一个匹配语音，音色生硬。本设计引入「真人感」语音：内置题库的 300 句预生成为微软自然语音 MP3 随应用分发，实时 TTS 升级为自动优选在线自然语音作兜底。目标是在不破坏纯静态架构、不引入付费服务的前提下，让朗读有「人味儿」，全平台音色一致。

硬约束沿用主规格：纯静态 PWA、无后端、不藏 API key、免费。

## 需求澄清结论

| 决策点 | 结论 |
|--------|------|
| 路线 | A+B 组合：预生成音频为主，实时 TTS 自然音色兜底 |
| 声音 | 中文 zh-CN-XiaoxiaoNeural（晓晓，女）；英文 en-US-AndrewNeural（Andrew，男） |
| 兜底音色 | 全自动优选（Natural > Google > 第一个），不加设置项 |
| 离线策略 | 按需加载 + workbox 运行时缓存（CacheFirst），不进预缓存 |
| 截取网络真实语料 | 否决：版权/DMCA 风险 + 音质语速不一致，不做 |

## 1. 音频资产与生成脚本

- 新增 `scripts/generate-audio.mjs`（node + `msedge-tts` devDependency；微软自然语音免费 node 封装，若包不可用换 `edge-tts` node 移植，实现时验证）
- 遍历 `src/data/library/*.json`，每句 zh/en 各生成一个文件：`public/audio/{id}.zh.mp3` / `public/audio/{id}.en.mp3`，共 600 个（300 句 × 2）
- 生成参数：中文 `zh-CN-XiaoxiaoNeural`，英文 `en-US-AndrewNeural`，语速默认
- 输出格式 `audio-24khz-48kbitrate-mono-mp3`，全库约 8~12MB，MP3 直接提交入仓
- 脚本幂等：已存在文件跳过，`--force` 全量重生成；网络失败报错退出、保留已生成文件、重跑续传
- 粘贴模式自定义句（id 为 `c_*`）不入库，运行时走实时 TTS
- 脚本仅本地跑，不进 CI

## 2. 播放链路

新增 `src/lib/voice.js` 统一播放入口，UI 不再直接调 `tts.speak`：

```
playText({ id, source, text, lang })
  ├─ source === 'builtin' → 播 audio/{id}.{lang}.mp3
  │     └─ 加载失败/文件缺失 → 回退 speak(text, lang)
  └─ source === 'custom'  → 直接 speak(text, lang)
stop() → 停止当前音频 + tts.cancel()
```

- 单例管理：模块级持有当前 Audio 实例，播新停旧（与现有 tts.js 语义一致）
- 播放状态：`playText` 提供状态回调（`ended`/`failed`），供 UI 切换播放中样式
- URL 用 `import.meta.env.BASE_URL` 拼接，兼容 GitHub Pages `/interpret/` 子路径

`tts.js` 改造：`voicesFor` 按 `Natural` → `Google` → 其余第一个的优先级挑语音（纯函数，可测）。

`PracticeCard.vue` 接线：`onSpeak` / `onListenPlay` 改调 `voice.playText`（传句子 id、source、源文本、语言）；播放中 🔊 变 ⏹，再点停止；切句 watch 的 `cancel()` 改为 `voice.stop()`。

不动：PracticeView（间接受益）、PasteView、其他页面不加朗读入口。

## 3. PWA 缓存

vite.config.js workbox 新增 runtimeCaching：

```js
runtimeCaching: [{
  urlPattern: /audio\/.+\.(mp3)$/,
  handler: 'CacheFirst',
  options: { cacheName: 'audio-v1', expiration: { maxEntries: 800, purgeOnQuotaError: true } }
}]
```

听过一次即永久缓存、二次离线可用；配额告急自动清理音频，不伤主应用。

## 4. 错误处理（三层兜底，用户无感降级）

1. 预生成音频加载失败（新句未生成/断网无缓存）→ 回退实时 TTS
2. TTS 缺语音包 → 现有文案提示（`设备缺少 xx 语音包`）
3. listen 模式 TTS 也失败 → 显示原文（现有逻辑不变）

## 5. 测试策略（TDD）

- **voice.test.js（新，核心）**：builtin 有音频走音频；音频失败回退 TTS；custom 直接 TTS；播新停旧（单例互斥）；stop 清理；BASE_URL 拼接正确
- **tts.test.js（改造）**：Natural > Google > 第一个的优选矩阵；无匹配语言回退
- **PracticeCard.test.js（接线回归）**：播放中状态切换、切句停止
- 回归：现有 120 用例保持全绿

上线后真机验收：音频质感、断网兜底、离线二播。

## 6. YAGNI 边界（本次不做）

- 语速可调 / 音色选择器设置项
- 其他页面（题库、我的）朗读入口
- 音频进 SW 预缓存
- 云端实时 TTS / 付费服务
- 截取网络真实语料
