# NPC 语音配音技术预留（v1）

状态：预留方案，不实现 ｜ 日期：2026-11-14
目的：后续给 NPC 加配音时，不改数据结构、不重排资源目录、不返工双向练习。
范围：台词字段形态、双语语音、播放优先级、资源命名与分包、缺失降级。
**不含**：选角、录音、混音、具体台词录制。

---

## 0. 结论

1. 每条台词在 `lines[]` 里增加 `speakerId` 与 `voice.{zh,en}` 两个可选字段；无字段的旧台词视为「无配音」，不报错。
2. **同一句需要两条语音**：`zh2en` 用英文语音，`en2zh` 用中文语音；按方向取对应文件，不跨语言播放。
3. 播放优先级：**录制配音 → 预生成 TTS 音频 → 浏览器实时 TTS → 纯文本**；任何一级缺失都不阻塞流程。
4. 资源按 `speaker / chapter` 分包，每章一个 `manifest.json`，只加载当前章与当前场景下几条。

---

## 1. 台词数据结构

### 1.1 文件位置

- 章节脚本：`src/data/story/<chapterId>/<sceneId>.json`
- 说话人注册表：`src/data/story/speakers.json`
- 语音资源：`public/audio/npc/<speakerId>/<chapterId>/...`

### 1.2 单条台词字段

```json
{
  "id": "ch01_s02_l006",
  "chapterId": "ch01",
  "sceneId": "s02",
  "speakerId": "ling",
  "role": "npc",
  "dirs": ["zh2en", "en2zh"],
  "text": {
    "zh": "你刚才听见了吗？",
    "en": "Did you hear that just now?"
  },
  "voice": {
    "zh": {
      "src": "/audio/npc/ling/ch01/ch01_s02_l006.zh.mp3",
      "durationMs": 2800,
      "bytes": 17200,
      "source": "recorded",
      "voiceId": "ling_cn_v1",
      "emotion": "uneasy",
      "ver": 1
    },
    "en": {
      "src": "/audio/npc/ling/ch01/ch01_s02_l006.en.mp3",
      "durationMs": 2400,
      "bytes": 14800,
      "source": "recorded",
      "voiceId": "ling_en_v1",
      "emotion": "uneasy",
      "ver": 1
    }
  }
}
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | 是 | 台词级稳定 ID；同一句双语共用一个 ID，不随语言变化 |
| `speakerId` | 是 | 关联 `speakers.json`；旁白用 `narrator` |
| `role` | 是 | `npc` / `narration` / `system` |
| `text.zh` / `text.en` | 是 | 双语文本，双向练习共用 |
| `dirs` | 是 | 该句在哪些方向出现，如 `["zh2en"]` |
| `voice.zh` / `voice.en` | 否 | 两个语言各一份；缺失即走回落 |
| `voice.<lang>.src` | 否 | 站内绝对路径，以 `/audio/` 开头 |
| `voice.<lang>.durationMs` | 否 | 毫秒；用于进度与预加载判断 |
| `voice.<lang>.bytes` | 否 | 字节数；用于分包体积统计 |
| `voice.<lang>.source` | 否 | `recorded`（正式配音）或 `tts-batch`（预生成 TTS） |
| `voice.<lang>.voiceId` | 否 | 选角版本，如 `ling_cn_v1` |
| `voice.<lang>.emotion` | 否 | 情绪标签，供后续多版本试听 |
| `voice.<lang>.ver` | 否 | 资源版本；变更时递增，用于绕过旧缓存 |

### 1.3 说话人注册表

```json
{
  "ling": {
    "displayName": { "zh": "铃", "en": "Ling" },
    "avatar": "/img/npc/ling.png",
    "ttsVoice": { "zh": "zh-CN-XiaoxiaoNeural", "en": "en-US-AndrewNeural" },
    "defaultEmotion": "neutral"
  },
  "narrator": {
    "displayName": { "zh": "旁白", "en": "Narrator" },
    "ttsVoice": { "zh": "zh-CN-YunxiNeural", "en": "en-US-GuyNeural" }
  }
}
```

`srv` 只存 ID；显示名、头像、TTS 音色都从这里取，避免台词里重复。

---

## 2. 双向练习：同一句两条语音

| 方向 | 提示语言 | 玩家输出 / NPC 语言 | 播放哪条 |
|---|---|---|---|
| `zh2en` | 中文 | 英文 | `voice.en` |
| `en2zh` | 英文 | 中文 | `voice.zh` |

规则：

1. 只播放与当前**输出语言**一致的语音，不跨语言回退（英文方向不播中文音频）。
2. 同一 `id` 下两条语音应同时存在；只有一条时，另一方向按 §3 回落。
3. 提示面那句「你想表达什么」不配语音；语音只属于 NPC 的台词。
4. 语音与门禁判定无关：没听清、没播放、跳过播放，都不影响作答与通过。

---

## 3. 播放优先级与回落

按顺序尝试，任一级成功即停止：

1. `voice.<lang>.source = "recorded"` 且文件可加载；
2. `voice.<lang>.source = "tts-batch"` 且文件可加载；
3. 浏览器 `speechSynthesis`，音色取 `speakers.json` 的 `ttsVoice[lang]`；
4. 纯文本：正常显示台词，旁侧给一个不打断的「语音不可用」小标。

约束：

- 任一级失败都不弹窗、不阻塞发送、不改变判定。
- 同一 URL 在一次会话内失败后不再重试，直接降级。
- 离线时：已缓存的正式配音可播；未缓存则尝试实时 TTS；TTS 不可用则纯文本。
- 缺 `voice` 字段的旧台词等同第 4 级。

---

## 4. 资源命名与目录

### 4.1 目录结构

```
public/audio/npc/
├── ling/
│   ├── ch01/
│   │   ├── manifest.json
│   │   ├── ch01_s01_l003.en.mp3
│   │   ├── ch01_s01_l003.zh.mp3
│   │   └── ...
│   └── ch02/
│       ├── manifest.json
│       └── ...
└── narrator/
    └── ch01/
        ├── manifest.json
        └── ch01_s01_l001.zh.mp3
```

### 4.2 命名规则

- 文件名：`<chapterId>_<sceneId>_<lineId>.<lang>.mp3`
- 全部小写，无空格、无中文；`lang` 只取 `zh` / `en`。
- 一句一文件，不拼接、不做长音频切片；同一句改稿只替换对应文件。
- 音频规格沿用现有约定：单声道、24 kHz、48 kbps MP3。

### 4.3 章节清单

`manifest.json` 只列本章文件，供按章加载与体积统计：

```json
{
  "chapterId": "ch01",
  "speakerId": "ling",
  "generatedAt": "2026-11-14T00:00:00Z",
  "lines": {
    "ch01_s01_l003": {
      "zh": { "file": "ch01_s01_l003.zh.mp3", "durationMs": 2100, "bytes": 12600, "ver": 1 },
      "en": { "file": "ch01_s01_l003.en.mp3", "durationMs": 1900, "bytes": 11400, "ver": 1 }
    }
  }
}
```

---

## 5. 按章分包与按需加载

- 启动只加载**当前章**的 `manifest.json`，不加载全量索引。
- 进入场景时预取当前场景接下来 3 条 NPC 台词的语音；不预取整章。
- 首次播放后按 CacheFirst 缓存；缓存键包含 `ver`，升版自动失效。
- 章节切换时释放旧章的预取队列与解码资源，不保留全章音频。
- 资源体积预算按章统计：`sum(manifest.lines[*].<lang>.bytes)`，超预算先降为 `tts-batch`。

---

## 6. 缺失与异常降级

| 情况 | 表现 |
|---|---|
| `voice` 字段缺失 | 走 TTS；TTS 不可用则纯文本 |
| 文件 404 / 解码失败 | 标记该 URL 本次会话不可用，降级到下一级 |
| 文件语言与当前方向不符 | 视为缺失，不播放 |
| `durationMs = 0` 或文件为空 | 视为缺失 |
| 网络断开 | 已缓存可播；否则 TTS/纯文本 |
| TTS 被系统禁用 | 纯文本 + 「语音不可用」小标 |

任何降级都不影响：台词显示、玩家作答、门禁判定、记录与存档。

---

## 7. 接入边界（后续实现时）

- 视图层只调用一个统一入口：`resolveVoice(lineId, lang) → { url } | { tts } | { textOnly }`。
- 播放、缓存、降级都在该入口内部完成；聊天流组件不关心文件从哪来。
- 现有「回放 / 重听」控件复用同一入口，不新增第二套播放逻辑。
- 数据校验：`voice.<lang>.src` 必须匹配命名规则，否则视为配置错误并在构建期报出。

---

## 8. 验收清单

- [ ] 每条台词可用 `speakerId` 找到显示名与 TTS 音色。
- [ ] `zh2en` 只播英文语音，`en2zh` 只播中文语音。
- [ ] 同一句两条语音可独立替换、独立升版。
- [ ] 录制配音缺失时能落到预生成 TTS、再落到实时 TTS、最后纯文本。
- [ ] 只加载当前章 manifest，不预取全量音频。
- [ ] 任一音频异常都不阻塞对话与判定。
