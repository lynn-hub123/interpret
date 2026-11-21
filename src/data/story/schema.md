# 剧情数据 schema（v1）

对应文件：`src/data/story/ch01.json`、`src/data/story/speakers.json`
配套规格：`docs/superpowers/specs/2026-11-14-hard-gate-mechanics-design.md` §7（`gate` 字段）

---

## 1. 章节

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | string | 是 | `ch01` |
| `title` | string | 是 | 显示名，含章号 |
| `dir` | `zh2en` \| `en2zh` | 是 | 整章固定，章内不可切换（见 O3）。`zh2en` = 提示中文、输出英文、角色说英文 |
| `rating` | object | 是 | 四轴：`horror` / `nonhuman` / `intimacy` / `cg` |
| `warnings` | string[] | 否 | 内容标签，取自内容尺度文档 §4.1 |
| `gateBudget` | object | 是 | `{ "min": 2, "max": 3 }` |
| `place` | string | 是 | 章节地点 |
| `time` | string | 是 | 章节时间 |
| `casting` | string[] | 是 | 引用的 `speakers.json` id |
| `scenes` | Scene[] | 是 | 三场起 |

## 2. 场景

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | string | 是 | `ch01_s1` |
| `index` | number | 是 | 1 起 |
| `title` | string | 是 | 场景名 |
| `place` | string | 是 | 具体空间，写到玩家能想象出位置 |
| `time` | string | 是 | 场内时间 |
| `ambience` | object | 是 | `{ "sight": [], "sound": [], "smell": [] }`，每条一句 |
| `presentation` | `scene` \| `chat` | 是 | `scene` = 场景界面（四行台词压在画面下三分之一）；`chat` = 消息流 |
| `caption` | string[] | presentation=scene 时必填 | **恰好 4 行**旁白，压在画面下三分之一 |
| `beats` | Beat[] | 是 | 8–14 条消息（`caption` 计入该数） |

## 3. 消息（beat）

四种 `kind`，共用一个 `id` 与可选 `beatNote`（作者备注，不显示给玩家）。

### 3.1 `narration`

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `text` | string | 是 | 界面语言（中文），一段一句，竖屏不超过 3 行 |

### 3.2 `npc`

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `speaker` | string | 是 | `speakers.json` 的 id |
| `text` | object | 是 | `{ "en": "...", "zh": "..." }`，显示取 `dir` 对应语言（`zh2en` 显示 `en`） |
| `emotion` | string | 否 | 供 TTS / 立绘使用，第一版不做表现 |

### 3.3 `event`

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `event` | `clue` \| `relation` | 是 | 线索卡 / 关系事件 |
| `card.title` | string | 是 | 卡面标题 |
| `card.body` | string | 是 | 卡面正文，不超过 2 行 |
| `card.meta` | string | 否 | 右下角小字，如「线索 · 纸」「关系 · 周砚」 |

### 3.4 `player`

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `dir` | `zh2en` \| `en2zh` | 是 | 与章节一致 |
| `intent` | string | 是 | 这句话想干什么，作者用，不显示 |
| `candidates` | Candidate[] | 是 | 1–3 条，聊天回合不超过 3 条 |
| `gate` | Gate | 否 | 有即为硬门禁；无则按软门禁 |

### 3.5 Candidate

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | string | 是 | `a` / `b` / `c` |
| `zh` | string | 是 | 提示面（中文原意） |
| `en` | string | 是 | 输出面参考译文（R3 展示） |
| `required` | Slot[] | 是 | 必需信息槽，逐句标注，不默认全开 |
| `accept` | object | 否 | 非门禁句可选；门禁句以 `gate.accept` 为准 |

槽名枚举：`who` / `action` / `time` / `polarity` / `quantity`（另可选 `place` / `condition` / `modality`，只影响反馈）。

## 4. Gate

与 O1 文档 §7.1 一致，不新增字段。

| 字段 | 必填 | 说明 |
|---|---|---|
| `type` | 是 | `hard` |
| `category` | 是 | `truth_reveal` / `life_death` / `relationship_turn` / `irreversible_pledge` / `speech_act` |
| `required` | 是 | 至少 1 个，须与候选句的 `required` 一致 |
| `accept` | 是 | 每个必需槽在**输出语言**中的可接受说法 |
| `hints.r1 / r2 / r3` | 是 | r1 只点缺失类别，r2 给结构，r3 给参考译文 |
| `reference` | 是 | R3 展示的输出语言参考译文 |
| `failEffect` | 是 | `{ "flag": "...", "note": "..." }`，沉默出口的后果 |

门禁句一律只有一个候选（不给「换一句说」的余地），`candidates.length === 1`。

## 5. 校验规则（v1）

### 5.1 错误（不通过不能导出）

1. 每场 `caption.length + beats.length` 在 8–14 之间。
2. `candidates.length` 在 1–3 之间；硬门禁句必须为 1。
3. `gate.required` 与唯一候选的 `required` 相同。
4. `gate.accept` 覆盖 `gate.required` 的每个槽，且只用输出语言。
5. `hints.r1` / `r2` 不含 `accept` 中的任何词。
6. 章内 `gate.type === "hard"` 的数量在 `gateBudget` 内。
7. 同一场最多一个硬门禁。
8. 每章至少一张 `clue` 卡与一条 `relation` 事件。
9. 所有 `speaker` 与 `casting` 都能在 `speakers.json` 找到。

### 5.2 建议（不拦截）

- 相邻两场不要都放硬门禁，中间隔一场更容易把节奏拉开。旧规则「相邻硬门禁之间至少隔一场」来自按配额排节奏的做法，已作废，只作写作建议。

## 6. 说话人

`speakers.json` 的 `speakers[]`：`id` / `displayName` / `role`（`npc` \| `player`）/ `avatar`（暂为 null）/ `ttsVoice.{zh,en}`（暂为 null）/ `defaultEmotion`。
字段形态与 `2026-11-14-npc-voiceover-reserve.md` 一致，后续加配音时只补 `voice` 与 `ttsVoice`，不改剧情数据。
