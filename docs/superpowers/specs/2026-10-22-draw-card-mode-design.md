# 抽卡外壳设计

> 状态：待用户审阅 | 日期：2026-10-22 | 前置规格：`2026-10-14-interpret-practice-design.md`、`2026-10-18-voice.md`、`2026-10-19-speech-recognition.md`、`2026-10-21-retell-mode-design.md`、`2026-10-22-custom-sentence-management-design.md`（既定硬约束全部继承）

## 1. 背景与目标

现有练习流程是「抽一句 → 直接出题」，句子怎么来的完全不可见：到期的、新句、练熟了的混在一起随机出现，练习者感受不到「今天该练什么」，也拿不到任何即时反馈。长期使用后，练习变成一件没有情绪起伏的事。

本设计给练习流程套一层**抽卡外壳**：每句在出题前先以卡背呈现，点开才揭晓「抽到了什么」——难度星级、主题、以及这张卡为什么被抽到（该复习了 / 新句）。评分后自动抽下一张。

抽卡是**练习流程的外壳，不是独立模式**：它只决定「这句以什么面貌出现在你面前」，题面、录音、语音识别、评分、SRS 调度全部沿用现有链路，一行语义都不变。

**核心原则：抽卡只加观感与信息，不加限制。** 没有体力、没有次数上限、没有「今天不能再抽了」——与「不看不欠」的调性一致。

第一版只做**卡背 + 翻面 + 星级 + 角标 + 免翻卡入口**，先上真机看手感。不做的事（YAGNI）：本轮抽完界面、再来一轮、体力值、十连抽、保底、限定池、卡面立绘、星级影响抽卡概率、卡片独立存储、抽卡历史页。

## 2. 抽卡节奏与入口

三个练习模式（视译 / 听辨 / 复述）统一套抽卡外壳，方向（zh2en / en2zh）与主题限定会话不受影响。

### 2.1 单句循环

```
进入练习 → [卡背] → 点击翻开 → [卡面揭晓] → 点「开始练习」→ 题面 → 评分 → 自动 [卡背] → …
```

- 每次进入练习页的第一件事是**抽一张**（显示卡背），而不是直接出题
- 「开始练习」后卡面退场，`PracticeCard` 接管，与现在完全一致
- 评分（ok / shaky / miss）后自动抽下一张，回到卡背

### 2.2 卡背

```
┌────────────────────────┐
│                        │
│          ?             │
│       点击翻开          │
│                        │
└────────────────────────┘
     跳过揭晓，直接练
```

- 卡背不透露任何句子信息
- 整张卡可点，点击即翻面
- 卡背下方一行次要文字按钮「跳过揭晓，直接练」= 免翻卡开关

### 2.3 卡面揭晓

```
┌────────────────────────┐
│  该复习了               │
│                        │
│  ★★☆  标准             │
│                        │
│  经济                   │
└────────────────────────┘
      [ 开始练习 ]
```

只显示三样东西：

- **角标**（可缺省）：`该复习了` / `新句`
- **难度星级**（1–3 星）+ 文字档位（热身 / 标准 / 攻坚）
- **主题**（内置句显示主题名，自定义句显示「自定义」）

方向与模式**不在卡面显示**——下方切换按钮就在视线内，重复显示只会让卡片变吵。

### 2.4 免翻卡模式

- 点卡背下方「跳过揭晓，直接练」→ 当前句**立即进入题面**，并且**本轮后续所有句子都不再翻卡**
- 免翻卡状态只存在于**本次会话内存**，退出练习页即重置；下次进来重新从卡背开始
- 免翻卡模式下完全不出现卡背/卡面，流程与改动前逐帧一致

## 3. 卡池：先到底与新，再回退全池

这是本次唯一涉及调度语义的改动，分两层：

| 阶段 | 池子 | 顺序 |
|---|---|---|
| A · 优先池 | 到期句 + 从未练过的新句 | 到期句最久没练优先；新句接在其后 |
| B · 回退池 | 全池（优先池已抽完时启用） | 随机，沿用现有 `lastId` 避开上一句 |

- **阶段 A 内不重复抽同一张**：本轮已抽过的优先池句子不再出队，保证一轮里把到期句与新句走一遍
- **阶段 B 不做严格去重**：否则池子必然枯竭。回退后按现有随机逻辑，只避开上一句——重复出现是合理的，那说明优先池确实空了
- 因此**不需要「本轮抽完」界面**：回退池兜底保证只要有句子就永远能抽到下一张
- 每日到期配额（`DAILY_CAP = 10`）仍然是硬约束：配额用完后阶段 A 只出「新句」，不再出到期句

阶段 A 的语义说明：**练过但没到期的句子不进优先池**。这类句子只会在阶段 B 被随机抽到——这正是抽卡想传达的「该复习了 vs 随便练练」的区别。

## 4. 难度星级

星级表示**「这张卡对你现在有多难」**，不是句子本身的客观属性。界面上不叫「稀有度」——稀有在抽卡语境里意味着「好东西」，而这里三星意味着「要费劲」，沿用稀有度会造成心理反转。

| 星级 | 档位文案 | 含义 |
|---|---|---|
| ★☆☆ | 热身 | 已巩固，快速过一遍 |
| ★★☆ | 标准 | 常规难度 |
| ★★★ | 攻坚 | 现在最容易卡壳的句子 |

### 4.1 计算规则

`cardTier` 是纯函数，三路信号相加后夹在 1–3：

1. **SRS 档位**（主要信号）
   - 无 SRS 记录（`box` 缺省或 0）→ 基准 2：新句没见过，先按标准对待
   - `box` 1–2 → 基准 3：刚练过一两遍、记忆最不稳，最容易 miss
   - `box` 3–4 → 基准 2
   - `box` 5–6 → 基准 1：已稳固
2. **句长负担**：`burden > 30` → +1
3. **失误史**：该句最近 5 次评分里 `miss` ≥ 2 → +1

夹取后 `stars ∈ [1, 3]`；`label` 由 `stars` 映射（1 热身 / 2 标准 / 3 攻坚）。

**口译负担换算**（中英可比）：

```js
// 中文字数 + 英文词数 × 3 ≈ 口译负担，英文一个词约等于三个中文字的产出量
function sentenceBurden(text) {
  const zh = (text.match(/[\u4e00-\u9fff]/g) || []).length
  const en = (text.match(/[A-Za-z]+/g) || []).length
  return zh + en * 3
}
```

阈值 30 的直觉：中文 25 字约 25，不算长；英文 12 词约 36，算长。

**取哪一侧文本算长度**：与题面一致，即 `direction === 'zh2en' ? zh : en`（与 `PracticeCard` 的 `sourceText` 同一套取值与兜底规则）。

### 4.2 角标判定

按优先级取第一个命中的，无命中则角标区留空：

| 角标 | 条件 |
|---|---|
| 该复习了 | `isDue(id)` 为 true |
| 新句 | `srs.v1` 中无该句条目 |

第一版不做「重温」角标——免去「多久算重温」的阈值调参，也让角标语义更干脆：要么该复习，要么没见过。

## 5. 模块改动

### 5.1 新增 `src/lib/card.js`（纯函数，零存储依赖）

```js
// 口译负担：中文字数 + 英文词数 × 3，用于句长加成判定
export function sentenceBurden(text) { /* 见 4.1 */ }

// 星级：SRS 档位基准 + 句长加成 + 失误史加成，夹在 1–3
export function cardTier({ box = 0, burden = 0, recentRatings = [] }) {
  const base = box >= 5 ? 1 : box >= 3 ? 2 : box >= 1 ? 3 : 2
  const long = burden > 30 ? 1 : 0
  const shaky = recentRatings.slice(-5).filter(r => r === 'miss').length >= 2 ? 1 : 0
  const stars = Math.min(3, Math.max(1, base + long + shaky))
  return { stars, label: ['', '热身', '标准', '攻坚'][stars] }
}

// 阶段 A 优先队列：到期句（最久没练优先）在前，新句（无 SRS 记录）在后
export function priorityQueue({ pool, boxes = {}, now, intervals }) {
  const due = []
  const fresh = []
  for (const s of pool) {
    const e = boxes[s.id]
    if (!e || typeof e.box !== 'number') fresh.push(s.id)
    else if (now >= e.lastTs + intervals[e.box - 1] * 86400000) due.push({ id: s.id, lastTs: e.lastTs })
  }
  due.sort((a, b) => a.lastTs - b.lastTs)
  return [...due.map(d => d.id), ...fresh]
}

// 角标语义 key：'due' | 'new' | ''
export function cardState({ entry, due }) {
  if (due) return 'due'
  if (!entry) return 'new'
  return ''
}
```

- `now` 与 `intervals` 由调用方传入（`intervals` 取 `srs.INTERVALS`），`card.js` 不 import 任何存储模块，保证纯函数、易测
- 角标文案映射（`due → 该复习了`、`new → 新句`）放组件里，lib 只出语义 key
- `priorityQueue` 与 `srs.dueQueue` 的区别：`dueQueue` 只排到期句，`priorityQueue` 额外把新句接在后面

### 5.2 新增 `src/components/DrawCard.vue`

```js
props: { tier: Object, state: String, topicLabel: String }
emits: ['start']
```

- 内部 `flipped` 状态：卡背 → 卡面
- 卡背点击 → `flipped = true` 并播放 0.8s 翻面动画（`rotateY`）
- 翻面动画进行中再次点击 → 动画立即结束（直接落在卡面），不重复触发
- `prefers-reduced-motion: reduce` → 不做动画，直接切换
- 卡面下方「开始练习」按钮 → `emit('start')`
- 卡背下方「跳过揭晓，直接练」→ `emit('start')`（父组件据此同时打开免翻卡开关）

样式沿用现有 neumorphic 变量（`--surface` / `--shadow-out` / `--radius-card`），卡背不加任何插画。

### 5.3 修改 `src/views/PracticeView.vue`

新增状态（**全部放在视图顶层，不塞进 `current`**，避免污染 `history` 里 push 的会话对象）：

```js
const stage = ref('back')        // 'back' | 'front' | 'practice'
const tier = ref(null)           // cardTier 结果
const badge = ref('')            // 'due' | 'new' | ''
const noFlip = ref(false)        // 免翻卡模式（仅本次会话内存）
const drawnPrior = ref([])       // 本轮阶段 A 已抽过的 id（只记优先池）
```

抽句函数改为：

```js
// 阶段 A：优先池里还没抽过的，取队首
// 阶段 B：全池随机，沿用 drawSentence 的 lastId 避重
function pickNext() {
  const boxes = getSrs().boxes
  const prio = priorityQueue({ pool: pool.value, boxes, now: Date.now(), intervals: INTERVALS })
  const left = quotaAvailable() ? prio : prio.filter(id => !boxes[id]) // 配额用完只出新句
  const nextId = left.find(id => !drawnPrior.value.includes(id))
  if (nextId) return sentenceById(nextId)
  return drawSentence({ pool: pool.value, lastId: current.value?.sentence.id ?? null })
}
```

- 抽到阶段 A 的句子时把 id 推进 `drawnPrior`；阶段 B 不记录
- `next()` 落位规则：`noFlip` 为真 → `stage = 'practice'`；否则 `stage = 'back'` 并计算 `tier` / `badge`
- 翻卡：`stage = 'front'`；「开始练习」：`stage = 'practice'`
- 「跳过揭晓，直接练」：`noFlip = true` 且 `stage = 'practice'`
- 模板：`stage !== 'practice'` 时用 `DrawCard` 取代 `PracticeCard` 的位置；`rating-zone` 与 `toggles`（方向、模式切换）在抽卡阶段**一并隐藏**，只在 `stage === 'practice'` 显示
- 方向与模式切换仍作用于 `settings`，切完不打断抽卡阶段，下一张卡面按新设置计算

### 5.4 零改动

`picker.js`（阶段 B 仍复用 `drawSentence`）、`srs.js`、`records.js`、`sentences.js`、`PracticeCard.vue`、`RatingButtons.vue`、`RecPlayback.vue`、`storage.js` 全部不动。**不新增 storage key，不写入任何新数据。**

## 6. 边界与错误处理

| 情形 | 行为 |
|---|---|
| 池子本身为空 | 沿用现有「这里空空的」空态，不显示抽卡界面 |
| 池子只有 1 句 | 优先池抽完即回退全池，同一句继续出，不报错 |
| 优先池抽完 | 静默回退阶段 B，不做任何提示（无「本轮抽完」概念） |
| 每日配额用完 | 阶段 A 只出新句；新句也抽完则回退全池 |
| 抽卡过程中切模式/方向 | 卡面不显示方向与模式，无需处理；下一张按新设置计算星级 |
| 播放/录音等能力不支持 | 与现有行为一致（卡面不依赖任何播放能力） |
| 免翻卡模式下进入练习 | 完全不出现卡背/卡面，流程与改动前逐帧一致 |
| 存储不可用 | 星级走「无 SRS 记录」路径（基准 2 + 句长），不报错；角标按 `new` 显示 |
| 动画偏好 reduced-motion | 翻面不做动画，直接切换 |

## 7. 测试策略

单测（Vitest + happy-dom）：

- `card.test.js`（新建）
  - `sentenceBurden`：中文按字数、英文按词数 ×3、中英混排相加、空串为 0
  - `cardTier`：无记录 → 2 星；box 1–2 → 3 星；box 3–4 → 2 星；box 5+ → 1 星
  - 句长加成：burden ≤ 30 不加、> 30 加 1
  - 失误加成：最近 5 次中 miss ≥ 2 加 1，miss = 1 不加
  - 夹取边界：box 1 + 长句 + 高失误 → 仍为 3 星；box 6 + 短句 → 仍为 1 星
  - `priorityQueue`：到期句按 `lastTs` 升序在前、新句在后、非到期非新句被排除
  - `cardState`：due 优先于 new；无 entry → `new`；已练未到期 → `''`
- `DrawCard.test.js`（新建）
  - 初始渲染卡背，不含星级与主题文字
  - 点击卡背 → 出现星级与档位文案、角标、主题
  - 角标为空字符串时不渲染角标元素
  - 卡面「开始练习」与卡背「跳过揭晓，直接练」都 emit `start`
- `PracticeView.test.js`（扩展，沿用现有 mock 与 mount 写法）
  - 进入练习首先渲染的是卡背，而非题面
  - 点卡背 → 揭晓 → 点「开始练习」→ 出现题面
  - 评分后回到卡背（自动抽下一张）
  - 「跳过揭晓，直接练」→ 立即出题，且后续评分后不再出现卡背
  - 优先池内不重复：构造带 `boxes` 的存储，验证同会话内不重复抽到同一条到期句
  - 优先池抽完 → 回退全池仍能抽到句子（不出现空态）

手工验收（真机）：翻卡手感与 0.8s 时长是否拖沓、动画中点按能否立即跳过、连续练习十几张是否腻、三星句出现时是否有「想拿下它」的感觉、免翻卡入口是否好找。

## 8. 兼容性

- 不新增 storage key，不改任何已有数据结构，旧备份导入导出完全不受影响
- `srs.v1` / `records.v1` / `custom.v1` 读写路径零改动，星级与角标都是**实时读取 + 现算**，不落库
- `drawnPrior` 与免翻卡状态都是内存态，刷新页面即回到干净的抽卡流程
- 配额语义不变：`onRated` 的 `wasDue` 判定仍用 `isDue(id) && quotaAvailable()`，抽卡不改变任何记账行为
