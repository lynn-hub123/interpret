# 抽卡外壳设计

> 状态：待用户审阅 | 日期：2026-10-22 | 前置规格：`2026-10-14-interpret-practice-design.md`、`2026-10-18-voice.md`、`2026-10-19-speech-recognition.md`、`2026-10-21-retell-mode-design.md`、`2026-10-22-custom-sentence-management-design.md`（既定硬约束全部继承）

## 1. 背景与目标

现有练习流程是「抽一句 → 直接出题」，句子怎么来的完全不可见：到期的、新句、强烈薄弱句混在一起随机出现，练习者感受不到「今天该练什么」，也拿不到任何即时反馈。长期使用后，练习变成一件没有情绪起伏的事。

本设计给练习流程套一层**抽卡外壳**：每句在出题前先以卡背呈现，点开才揭晓「抽到了什么」——难度星级、主题、以及这张卡为什么被抽到（该复习了 / 新句 / 重温）。评分后自动抽下一张。

抽卡是**练习流程的外壳，不是独立模式**：它只决定「这句以什么面貌出现在你面前」，题面、录音、语音识别、评分、SRS 调度全部沿用现有链路，一行语义都不变。

**核心原则：抽卡只加观感与信息，不加限制。** 没有体力、没有次数上限、没有「今天不能再抽了」——与「不看不欠」的调性保持一致。

不做的事（YAGNI）：体力值/抽卡次数限制、十连抽、保底机制、限定池与活动、卡面立绘与稀有度数值、星级影响抽卡概率、卡片独立存储、抽卡历史记录页。

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
│      点击翻开           │
│                        │
└────────────────────────┘
     跳过揭晓，直接练
```

- 卡背不透露任何句子信息（模式、方向、主题都不显示）
- 整张卡可点，点击即翻面
- 卡背下方一行次要文字按钮「跳过揭晓，直接练」= 免翻卡开关

### 2.3 卡面揭晓

```
┌────────────────────────┐
│  该复习了               │
│                        │
│  ★★☆  标准             │
│                        │
│  主题 · 经济            │
│  中 → 英 · 视译         │
└────────────────────────┘
      [ 开始练习 ]
```

- 顶部角标（可缺省）：`该复习了` / `新句` / `重温`
- 中部：难度星级（1–3 星）+ 文字档位（热身 / 标准 / 攻坚）
- 底部：主题标签（内置句显示主题名，自定义句显示「自定义」）、方向、模式
- 「开始练习」按钮固定在卡片下方，是进入题面的唯一入口

### 2.4 免翻卡模式

- 点卡背下方「跳过揭晓，直接练」→ 当前句**立即进入题面**，并且**本轮后续所有句子都不再翻卡**，评分后直接出下一题
- 免翻卡状态只存在于**本次会话内存**，退出练习页即重置；下次进来重新从卡背开始
- 免翻卡模式下不显示任何卡背/卡面元素，流程与现在完全一致

### 2.5 本轮抽完

同一轮练习内不重复抽同一张卡。当练习池里的句子都已在本轮出现过：

```
┌────────────────────────┐
│     本轮抽完了          │
│     共 12 张            │
│  [ 再来一轮 ]  [ 历史 ]  │
└────────────────────────┘
```

- 「再来一轮」清空本轮已抽集合，重新从卡背开始
- 池子本身为空（无主题句也无自定义句）时，沿用现有「这里空空的」空态，不显示抽卡界面

## 3. 难度星级

星级表示**「这张卡对你现在有多难」**，不是句子本身的客观属性。界面上不叫「稀有度」——稀有在抽卡语境里意味着「好东西」，而这里三星意味着「要费劲」，沿用稀有度会造成心理反转。

| 星级 | 档位文案 | 含义 |
|---|---|---|
| ★☆☆ | 热身 | 已巩固，快速过一遍 |
| ★★☆ | 标准 | 常规难度 |
| ★★★ | 攻坚 | 现在最容易卡壳的句子 |

### 3.1 计算规则

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

**取哪一侧文本算长度**：与题面一致，即 `direction === 'zh2en' ? zh : en`（与该句 `PracticeCard` 的 `sourceText` 同一套取值与兜底规则）。

### 3.2 角标判定

按优先级取第一个命中的，无命中则角标区留空：

| 角标 | 条件 |
|---|---|
| 该复习了 | `isDue(id)` 为 true |
| 新句 | `srs.v1` 中无该句条目 |
| 重温 | 有 SRS 条目、未到期，且 `lastTs` 距今 ≤ 3 天 |

「重温」的存在是为了让重复出现的句子看起来是**有意的**，而不是抽卡系统失灵。

## 4. 模块改动

### 4.1 新增 `src/lib/card.js`（纯函数）

```js
// 口译负担：中文字数 + 英文词数 × 3，用于句长加成判定
export function sentenceBurden(text) { /* 见 3.1 */ }

// 星级：SRS 档位基准 + 句长加成 + 失误史加成，夹在 1–3
export function cardTier({ box = 0, burden = 0, recentRatings = [] }) {
  const base = box >= 5 ? 1 : box >= 3 ? 2 : box >= 1 ? 3 : 2
  const long = burden > 30 ? 1 : 0
  const shaky = recentRatings.slice(-5).filter(r => r === 'miss').length >= 2 ? 1 : 0
  const stars = Math.min(3, Math.max(1, base + long + shaky))
  return { stars, label: ['', '热身', '标准', '攻坚'][stars] }
}

// 角标：'due' | 'new' | 'review' | ''
export function cardState({ entry, due, now }) {
  if (due) return 'due'
  if (!entry) return 'new'
  if (now - entry.lastTs <= 3 * 86400000) return 'review'
  return ''
}
```

- `due` 由调用方用既有 `isDue(id)` 判定后传入，`card.js` 不读存储，保证纯函数可测
- 角标文案映射（`due → 该复习了`、`new → 新句`、`review → 重温`）放组件里，lib 只出语义 key

### 4.2 新增 `src/components/DrawCard.vue`

```js
props: { tier: Object, state: String, topicLabel: String, direction: String, mode: String }
emits: ['start']
```

- 内部 `flipped` 状态：卡背 → 卡面
- 卡背点击 → `flipped = true` 并播放 0.8s 翻面动画（`rotateY`）
- 翻面动画进行中再次点击 → 动画立即结束（直接落在卡面），不重复触发
- `prefers-reduced-motion: reduce` → 不做动画，直接切换
- 卡面下方「开始练习」按钮 → `emit('start')`
- 卡背下方「跳过揭晓，直接练」→ `emit('start')`（父组件据此同时打开免翻卡开关）

### 4.3 修改 `src/views/PracticeView.vue`

新增状态（**全部放在视图顶层，不塞进 `current`**，避免污染 `history` 里 push 的会话对象）：

```js
const stage = ref('back')        // 'back' | 'front' | 'practice'
const tier = ref(null)           // cardTier 结果
const cardState = ref('')        // 'due' | 'new' | 'review' | ''
const noFlip = ref(false)        // 免翻卡模式（仅本次会话内存）
const drawnIds = ref([])         // 本轮已抽过的句子 id
const roundDone = ref(false)     // 本轮抽完
```

- `activePool` computed = `pool.value.filter(s => !drawnIds.value.includes(s.id))`
- `next()` 内的抽句改用 `activePool.value`（`dueQueue(activePool.value)` 同步跟着改），抽到后把 id 推进 `drawnIds`，并计算 `tier` / `cardState`
- `next()` 落位规则：`noFlip` 为真 → `stage = 'practice'`；否则 `stage = 'back'`
- `activePool` 为空且 `pool` 非空 → `current = null` 且 `roundDone = true`
- 翻卡：`stage = 'front'`；「开始练习」：`stage = 'practice'`
- 「跳过揭晓，直接练」：`noFlip = true` 且 `stage = 'practice'`
- 「再来一轮」：清空 `drawnIds`、`roundDone = false`，重新 `next(false)`
- 模板：`stage !== 'practice'` 时用 `DrawCard` 取代 `PracticeCard` 的位置；`rating-zone` / `toggles`（方向与模式切换）在抽卡阶段**一并隐藏**，只在 `stage === 'practice'` 显示
- 方向与模式的切换按钮仍作用于 `settings`，切完不打断抽卡阶段，下一张卡面按新设置显示

### 4.4 零改动

`picker.js`、`srs.js`、`records.js`、`sentences.js`、`PracticeCard.vue`、`RatingButtons.vue`、`RecPlayback.vue`、`storage.js` 全部不动。**不新增 storage key，不写入任何新数据。**

## 5. 边界与错误处理

| 情形 | 行为 |
|---|---|
| 池子本身为空 | 沿用现有「这里空空的」空态，不显示抽卡界面 |
| 本轮全部抽完 | 「本轮抽完了 · 共 N 张」+ 再来一轮 + 历史 |
| 池子只有 1 句 | 抽完 1 张即本轮结束，不硬凑 |
| 抽卡过程中切模式/方向 | 卡面信息在下一张体现；当前卡若已翻开，按新设置进入题面 |
| 播放/录音等能力不支持 | 与现有行为一致（卡面不依赖任何播放能力） |
| 免翻卡模式下进入练习 | 完全不出现卡背/卡面，流程与改动前逐帧一致 |
| 存储不可用 | 星级降级为「无 SRS 记录」路径（基准 2 + 句长），不报错 |
| 动画偏好 reduced-motion | 翻面不做动画，直接切换 |

## 6. 测试策略

单测（Vitest + happy-dom）：

- `card.test.js`（新建）
  - `sentenceBurden`：中文按字数、英文按词数 ×3、中英混排相加
  - `cardTier`：无记录 → 2 星；box 1–2 → 3 星；box 3–4 → 2 星；box 5+ → 1 星
  - 句长加成：短句不加、burden > 30 加 1
  - 失误加成：最近 5 次中 miss ≥ 2 加 1，miss = 1 不加
  - 夹取边界：box 1 + 长句 + 高失误 → 仍为 3 星；box 6 + 短句 → 仍为 1 星
  - `cardState`：due 优先于一切；无 entry → `new`；3 天内 → `review`；更早且未到期 → `''`
- `DrawCard.test.js`（新建）
  - 初始渲染卡背，不含星级与主题文字
  - 点击卡背 → 出现星级与档位文案、角标、主题、方向与模式
  - 角标为空字符串时不渲染角标元素
  - 卡背与卡面的「直接练 / 开始练习」都 emit `start`
- `PracticeView.test.js`（扩展，沿用现有 mock 与 mount 写法）
  - 进入练习首先渲染的是卡背，而非题面
  - 点卡背 → 揭晓 → 点「开始练习」→ 出现题面
  - 评分后回到卡背（自动抽下一张）
  - 「跳过揭晓，直接练」→ 立即出题，且后续评分后不再出现卡背
  - 同一会话内不重复抽同一句；池子抽空 → 显示「本轮抽完了」
  - 「再来一轮」→ 清空后重新从卡背开始

手工验收（真机）：翻卡手感与 0.8s 时长是否拖沓、动画中点按能否立即跳过、连续练习十几张是否腻、三星句出现时是否有「想拿下它」的感觉、免翻卡入口是否好找。

## 7. 兼容性

- 不新增 storage key，不改任何已有数据结构，旧备份导入导出完全不受影响
- `srs.v1` / `records.v1` / `custom.v1` 读写路径零改动，星级与角标都是**实时读取 + 现算**，不落库
- `drawnIds` 与免翻卡状态都是内存态，刷新页面即回到干净的抽卡流程
- 抽卡外壳对三个练习模式与两个方向的行为差异为零——它们只影响卡面上显示的文字
