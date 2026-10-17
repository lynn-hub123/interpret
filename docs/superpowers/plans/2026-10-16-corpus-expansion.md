# 真实语料扩容（政府文件 + 新闻时事）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task（每任务独立子代理实现 + 双重审查：规格审查、代码审查，全绿后进入下一任务，任务间不停顿）。Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为口译随手练新增真实语料题库：govreport（政府文件）、news（新闻时事）两个新主题，各 50-80 句起步。新增构建期抓取管线（本地 Node 脚本），应用保持纯静态、零运行时网络依赖。

**Architecture:** 纯函数库 `scripts/corpus-lib.mjs`（拆句/过滤/语言检测/哈希 id/去重/对齐/组装校验，Vitest 直测）+ 编排脚本 `scripts/fetch-corpus.mjs`（网络抓取 + cheerio 解析 + 多源备选）。前端仅改 `src/lib/sentences.js`（TOPICS +2、import 两个 JSON），题库页/抽题/弱句复习/练习记录全部 id 驱动自动兼容。

**Tech Stack:** Node 24 内置 fetch + crypto、cheerio（新增 devDependency，不进应用产物）、Vitest。

**规格文档:** `docs/superpowers/specs/2026-10-16-corpus-expansion-design.md`（commit 771abfa）

**环境备忘（本机实测）：**
- Node v24.18.1 / npm 11.16.0 / Git 2.55.0，均已在 PATH（git 直接可用）
- npm.ps1 被 ExecutionPolicy 拦截 → **一律 `npm.cmd` / `npx.cmd`**；PowerShell profile 报错是噪音，忽略
- PowerShell 5 不支持 `&&`，命令用 `;` 连接；**提交信息用中文，多个 `-m`，不用 heredoc，文本内不得含英文双引号**
- 若 build 报 esbuild 相关错误：`node node_modules\esbuild\install.js` 后重试
- 不要 push（最后 Task 4 统一 push）

**现状基准（截至 771abfa）:** 74/74 测试通过（12 文件）、`vite build` 基线正常、无 scripts/ 目录、无 cheerio 依赖。TOPICS 8 项，`sentences.test.js` 第 8 行硬编码断言 8 个主题 id，`library.test.js` 断言 id 以 `{topic}_` 开头、zh 5-120 字、en 5-200 字符、每主题 ≥ 20 句。

**对设计稿的两处澄清（不改变行为意图）：**
1. **id 前缀用 `govreport_` / `news_`**（设计稿写 `gov_`）：现有 `library.test.js` 断言 id 必须以 `{topic}_` 开头，`govreport_` 与既有 8 主题命名（`daily_` 等）一致，零测试改动；哈希部分（sha256 前 8 位）不变。
2. **过滤规则补两条下限**：zh ≥ 5 字、en ≤ 200 字符（设计稿只定了上限）——这是与 `library.test.js` 现有断言（zh 5-120、en 5-200）对齐，只收紧不放宽，符合宁缺毋滥。

---

### Task 1: corpus-lib 纯函数库（TDD）

**Files:**
- Create: `scripts/corpus-lib.mjs`
- Test: `scripts/corpus-lib.test.js`
- Commit 计划文档本身

- [ ] **Step 0: 提交计划文档**

```powershell
git add docs/superpowers/plans/2026-10-16-corpus-expansion.md; git commit -m 'docs: 真实语料扩容实现计划'
```

- [ ] **Step 1: 写失败测试** — `scripts/corpus-lib.test.js`

```js
import { describe, it, expect } from 'vitest'
import {
  isZh, isEn, splitZh, splitEn, isValidPair, dedupePairs, hashId,
  alignPairs, buildTopicSentences, assertTopicValid, MIN_SENTENCES, MAX_SENTENCES
} from './corpus-lib.mjs'

describe('language detection', () => {
  it('isZh: Chinese text passes, English fails, empty fails', () => {
    expect(isZh('今天天气不错，我们去公园走走吧。')).toBe(true)
    expect(isZh('2023年国务院发布了新的政策文件')).toBe(true)
    expect(isZh('Hello world, this is English.')).toBe(false)
    expect(isZh('')).toBe(false)
    expect(isZh('12345')).toBe(false)
  })
  it('isEn: English passes, Chinese fails, mixed fails', () => {
    expect(isEn('The weather is nice today.')).toBe(true)
    expect(isEn('The U.S. economy grew by 3.2 percent in 2024.')).toBe(true)
    expect(isEn('这是中文句子。')).toBe(false)
    expect(isEn('中国政府发布了 white paper')).toBe(false)
    expect(isEn('')).toBe(false)
  })
})

describe('sentence splitting', () => {
  it('splitZh splits on Chinese terminal punctuation', () => {
    expect(splitZh('第一句。第二句！第三句')).toEqual(['第一句。', '第二句！', '第三句'])
  })
  it('splitEn splits on terminal punctuation before capital letter', () => {
    expect(splitEn('He went home. She stayed.')).toEqual(['He went home.', 'She stayed.'])
    expect(splitEn('It costs $3.50. Buy it.')).toEqual(['It costs $3.50.', 'Buy it.'])
  })
  it('splitEn keeps abbreviations attached (Mr., U.S.)', () => {
    expect(splitEn('Mr. Smith lives in the U.S. He is nice.'))
      .toEqual(['Mr. Smith lives in the U.S. He is nice.'])
  })
})

describe('pair filtering (宁缺毋滥)', () => {
  const GOOD = {
    zh: '今天天气不错，我们去公园走走吧。',
    en: "The weather is nice today. Let's take a walk in the park."
  }
  it('accepts a clean pair', () => {
    expect(isValidPair(GOOD)).toBe(true)
  })
  it('rejects zh longer than 60 chars', () => {
    expect(isValidPair({ ...GOOD, zh: '长'.repeat(61) })).toBe(false)
  })
  it('rejects zh shorter than 5 chars', () => {
    expect(isValidPair({ ...GOOD, zh: '你好。' })).toBe(false)
  })
  it('rejects en longer than 50 words', () => {
    expect(isValidPair({ ...GOOD, en: 'word '.repeat(51).trim() })).toBe(false)
  })
  it('rejects en longer than 200 chars', () => {
    expect(isValidPair({ ...GOOD, en: 'Supercalifragilisticexpialidocious '.repeat(6).trim() })).toBe(false)
  })
  it('rejects en shorter than 5 chars', () => {
    expect(isValidPair({ ...GOOD, en: 'Hi!' })).toBe(false)
  })
  it('rejects pure numbers or symbols', () => {
    expect(isValidPair({ zh: '12345', en: '12345' })).toBe(false)
    expect(isValidPair({ zh: '！！！？？？', en: '!??!' })).toBe(false)
  })
  it('rejects URLs and emails', () => {
    expect(isValidPair({ ...GOOD, zh: '详情见 https://example.com 新闻。' })).toBe(false)
    expect(isValidPair({ ...GOOD, en: 'Send mail to a@example.com now.' })).toBe(false)
  })
  it('rejects when zh field is not Chinese', () => {
    expect(isValidPair({ ...GOOD, zh: 'This is English text.' })).toBe(false)
  })
  it('rejects when en field is not English', () => {
    expect(isValidPair({ ...GOOD, en: '这是中文翻译。' })).toBe(false)
  })
  it('rejects missing or non-string fields', () => {
    expect(isValidPair(null)).toBe(false)
    expect(isValidPair({})).toBe(false)
    expect(isValidPair({ zh: 123, en: 'hello world' })).toBe(false)
  })
})

describe('dedupe and hash id', () => {
  it('dedupePairs keeps first occurrence by normalized zh', () => {
    const out = dedupePairs([
      { zh: '同一句话。', en: 'Same sentence one.' },
      { zh: '同一  句话。', en: 'Same sentence two.' },
      { zh: '另一句话。', en: 'Another sentence.' }
    ])
    expect(out).toHaveLength(2)
    expect(out[0].en).toBe('Same sentence one.')
  })
  it('hashId is sha256 first 8 hex chars with prefix, stable across calls', () => {
    const a = hashId('news_', '今天天气不错')
    const b = hashId('news_', '今天天气不错')
    expect(a).toBe(b)
    expect(a).toMatch(/^news_[0-9a-f]{8}$/)
    expect(hashId('govreport_', '今天天气不错')).toMatch(/^govreport_[0-9a-f]{8}$/)
    expect(hashId('news_', '另一句话')).not.toBe(a)
  })
})

describe('alignment and assembly', () => {
  it('alignPairs zips by index, takes the shorter side', () => {
    expect(alignPairs(['中一', '中二'], ['en one', 'en two', 'en three'])).toEqual([
      { zh: '中一', en: 'en one' },
      { zh: '中二', en: 'en two' }
    ])
    expect(alignPairs([], ['en one'])).toEqual([])
  })
  it('buildTopicSentences filters, dedupes, hashes ids, caps at MAX', () => {
    const pairs = [
      { zh: '今天天气不错，我们去公园走走吧。', en: 'The weather is nice today.' },
      { zh: '今天天气不错，我们去公园走走吧。', en: 'Duplicate zh, dropped.' },
      { zh: '12345', en: 'not a real sentence' },
      { zh: '医生建议少熬夜，每天保证七个小时的睡眠。', en: 'The doctor advised me to stop staying up late.' }
    ]
    const out = buildTopicSentences(pairs, 'news_')
    expect(out).toHaveLength(2)
    expect(out[0].id).toMatch(/^news_[0-9a-f]{8}$/)
    expect(out[0].zh).toContain('天气')
    expect(new Set(out.map(s => s.id)).size).toBe(2)
  })
  it('buildTopicSentences caps output at 80', () => {
    const pairs = Array.from({ length: 90 }, (_, i) => ({
      zh: `这是用于测试的第${i}号句子，内容各不相同。`,
      en: `This is test sentence number ${i} for capping.`
    }))
    expect(buildTopicSentences(pairs, 'news_')).toHaveLength(MAX_SENTENCES)
  })
  it('assertTopicValid passes at threshold and throws below', () => {
    const mk = n => Array.from({ length: n }, (_, i) => ({
      id: `news_t${i}`, zh: `中文句子第${i}号`, en: `English sentence ${i}`
    }))
    expect(assertTopicValid(mk(MIN_SENTENCES), 'news')).toBe(true)
    expect(() => assertTopicValid(mk(MIN_SENTENCES - 1), 'news')).toThrow(/句数不足/)
  })
  it('assertTopicValid rejects empty fields, bad prefix, duplicate ids', () => {
    expect(() => assertTopicValid([{ id: 'news_a', zh: '', en: 'hello there' }], 'news')).toThrow(/空句子/)
    expect(() => assertTopicValid([{ id: 'daily_a', zh: '中文五个字', en: 'hello there' }], 'news')).toThrow(/前缀/)
    const dup = [{ id: 'news_a', zh: '中文五个字', en: 'hello there' }, { id: 'news_a', zh: '中文五个字', en: 'hello there' }]
    expect(() => assertTopicValid(dup, 'news')).toThrow(/重复/)
  })
  it('exports thresholds 40/80', () => {
    expect(MIN_SENTENCES).toBe(40)
    expect(MAX_SENTENCES).toBe(80)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx.cmd vitest run scripts/corpus-lib.test.js`
Expected: FAIL（Cannot find module './corpus-lib.mjs'）

- [ ] **Step 3: 写实现** — `scripts/corpus-lib.mjs`

```js
// 语料处理纯函数库：语言检测、拆句、过滤、去重、哈希 id、对齐、组装校验。
// 供 fetch-corpus.mjs 编排调用；无网络无 IO，Vitest 直接单测。
import { createHash } from 'node:crypto'

export const MIN_SENTENCES = 40 // 低于此数视为抓取失败，不写入
export const MAX_SENTENCES = 80 // 每主题截取上限
export const ZH_MAX = 60        // 中文长度上限（字）
export const EN_MAX_WORDS = 50  // 英文长度上限（词）
export const EN_MAX_CHARS = 200 // 与 library.test.js 的 en ≤ 200 断言对齐

// ---------- 语言检测 ----------
export function isZh(text) {
  if (typeof text !== 'string' || !text.trim()) return false
  const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length
  return cjk / text.replace(/\s/g, '').length > 0.3
}

export function isEn(text) {
  if (typeof text !== 'string' || !text.trim()) return false
  if (/[\u4e00-\u9fff]/.test(text)) return false
  const latin = (text.match(/[A-Za-z]/g) || []).length
  return latin / text.replace(/\s/g, '').length > 0.6
}

// ---------- 拆句 ----------
export function splitZh(text) {
  return (text || '')
    .split(/(?<=[。！？；!?;])/)
    .map(s => s.trim())
    .filter(Boolean)
}

// 句尾缩写（Mr. / U.S. 等）后不拆句：常见缩写词表 + 单个大写字母加句点
const EN_ABBREV = /(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|Inc|Ltd|Corp|Co|e\.g|i\.e|U\.S|U\.K)\.$|[A-Z]\.$/

export function splitEn(text) {
  const raw = (text || '')
    .split(/(?<=[.!?]["”)]?)\s+/)
    .map(s => s.trim())
    .filter(Boolean)
  const out = []
  for (const part of raw) {
    const prev = out[out.length - 1]
    if (prev && EN_ABBREV.test(prev)) out[out.length - 1] = `${prev} ${part}`
    else out.push(part)
  }
  return out
}

// ---------- 过滤（宁缺毋滥，全部硬编码，无人工审核） ----------
const hasLinkOrEmail = s => /https?:\/\/|www\.|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(s)
// 去掉数字、空白、标点、符号后剩余实质内容，用于剔除纯数字/符号句
const substantive = s => s.replace(/[\d\s\p{P}\p{S}]/gu, '')

export function isValidPair(pair) {
  if (!pair || typeof pair.zh !== 'string' || typeof pair.en !== 'string') return false
  const zh = pair.zh.trim()
  const en = pair.en.trim()
  if (zh.length < 5 || zh.length > ZH_MAX) return false
  if (en.length < 5 || en.length > EN_MAX_CHARS) return false
  if (en.split(/\s+/).length > EN_MAX_WORDS) return false
  if (!substantive(zh) || !substantive(en)) return false
  if (hasLinkOrEmail(zh) || hasLinkOrEmail(en)) return false
  if (!isZh(zh) || !isEn(en)) return false
  return true
}

// ---------- 去重（按中文文本，空白归一） ----------
export function dedupePairs(pairs) {
  const seen = new Set()
  const out = []
  for (const p of pairs) {
    const key = p.zh.replace(/\s/g, '')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(p)
  }
  return out
}

// ---------- 哈希 id：中文文本 sha256 前 8 位，重抓后 id 稳定，练习记录延续 ----------
export function hashId(prefix, zhText) {
  const hex = createHash('sha256').update(zhText, 'utf8').digest('hex')
  return `${prefix}${hex.slice(0, 8)}`
}

// ---------- 段落对齐：中英段落按序一一配对，取较小侧，差额由调用方告警 ----------
export function alignPairs(zhParas, enParas) {
  const n = Math.min(zhParas.length, enParas.length)
  const out = []
  for (let i = 0; i < n; i++) out.push({ zh: zhParas[i], en: enParas[i] })
  return out
}

// ---------- 组装：过滤 → 去重 → 哈希 id → 截取上限 ----------
export function buildTopicSentences(pairs, prefix) {
  return dedupePairs(pairs.filter(isValidPair))
    .map(p => ({ id: hashId(prefix, p.zh), zh: p.zh, en: p.en }))
    .slice(0, MAX_SENTENCES)
}

// ---------- 写入前校验：非空、前缀、唯一、数量下限；不过即抛错（调用方退出，不写文件） ----------
export function assertTopicValid(sentences, topic) {
  const ids = new Set()
  for (const s of sentences) {
    if (!s.zh || !s.en) throw new Error(`空句子：${s.id}`)
    if (!s.id.startsWith(`${topic}_`)) throw new Error(`id 前缀错误：${s.id}`)
    if (ids.has(s.id)) throw new Error(`重复 id：${s.id}`)
    ids.add(s.id)
  }
  if (sentences.length < MIN_SENTENCES) {
    throw new Error(`句数不足：${topic} 仅 ${sentences.length} 句（要求 ≥ ${MIN_SENTENCES}），不写入`)
  }
  return true
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx.cmd vitest run scripts/corpus-lib.test.js`
Expected: 27 passed

- [ ] **Step 5: 全量测试确认无回归**

Run: `npm.cmd run test`
Expected: 101 passed（74 旧 + 27 新）

- [ ] **Step 6: Commit**

```powershell
git add scripts/corpus-lib.mjs scripts/corpus-lib.test.js; git commit -m 'feat: 语料处理纯函数库与单元测试' -m '拆句、过滤、语言检测、sha256哈希id、去重、对齐、组装校验'
```

---

### Task 2: 抓取编排脚本 + 依赖

**Files:**
- Create: `scripts/fetch-corpus.mjs`
- Modify: `package.json`（scripts.fetch:corpus + devDependencies.cheerio）

- [ ] **Step 1: 安装 cheerio**

Run: `npm.cmd install -D cheerio`
Expected: package.json devDependencies 出现 cheerio

- [ ] **Step 2: 探测语料源可用性（先探测后定选择器，禁止凭空猜测页面结构）**

实现者用 `curl` 或 Node fetch 实际拉取候选页面确认可访问性与 HTML 结构，再写各源适配器。候选（按优先级）：

- **govreport：**
  1. 中国网双语（china.org.cn / english.china.org.cn）双语新闻/政府文件专题
  2. 政府工作报告中英对照专题页（gov.cn / english.www.gov.cn）
  3. 外交部发言人记者会双语实录（fmprc.gov.cn）——若中英文分属两页则放弃该源（无法可靠对齐）
- **news：**
  1. China Daily 双语频道（chinadaily.com.cn/language_news 或现路径，实现时确认）
  2. China Daily 双语新闻文章页（含 zh/en 对照区块）

**规则：** 每主题至少一个可用源即可；探测全部失败或抓取量不足时**如实报告，不得放宽过滤标准凑数**（宁缺毋滥）。文章列表页抓 25-40 篇，单篇失败 warn 后跳过。

- [ ] **Step 3: 写编排脚本** — `scripts/fetch-corpus.mjs`

骨架如下；`SOURCES` 中各源的 `listUrl / pickLinks / extract` 由 Step 2 探测结果填充（extract 返回 `{ zh: [...], en: [...] }` 段落数组，用 cheerio 按实际 DOM 结构提取）：

```js
#!/usr/bin/env node
// 真实语料抓取管线（构建期本地运行，产物随应用静态发布；应用运行时零网络依赖）
// 用法：npm run fetch:corpus
import { writeFile } from 'node:fs/promises'
import * as cheerio from 'cheerio'
import {
  alignPairs, buildTopicSentences, assertTopicValid, MIN_SENTENCES
} from './corpus-lib.mjs'

const TIMEOUT = 20000
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const ARTICLES_PER_SOURCE = 35

const PREFIX = { govreport: 'govreport_', news: 'news_' }
const OUT = { govreport: 'src/data/library/govreport.json', news: 'src/data/library/news.json' }

async function fetchText(url) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' },
      signal: ctrl.signal, redirect: 'follow'
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  } finally { clearTimeout(timer) }
}

// 各源适配器：listUrl 列表页；pickLinks($) 返回文章 URL 数组；extract($) 返回 { zh: [], en: [] }
const SOURCES = {
  govreport: [ /* Step 2 探测后填充 */ ],
  news: [ /* Step 2 探测后填充 */ ]
}

async function harvest(source) {
  const listHtml = await fetchText(source.listUrl)
  const $list = cheerio.load(listHtml)
  const articles = source.pickLinks($list).slice(0, ARTICLES_PER_SOURCE)
  if (!articles.length) throw new Error('列表页未解析出文章链接')
  const pairs = []
  for (const url of articles) {
    try {
      const $ = cheerio.load(await fetchText(url))
      const { zh, en } = source.extract($)
      if (zh.length !== en.length) {
        console.warn(`[warn] ${url} 段落不齐 zh=${zh.length} en=${en.length}，丢弃差额`)
      }
      pairs.push(...alignPairs(zh, en))
    } catch (e) {
      console.warn(`[warn] 跳过 ${url}：${e.message}`)
    }
  }
  return pairs
}

const results = {}
const failed = []
for (const topic of Object.keys(SOURCES)) {
  let pairs = []
  for (const source of SOURCES[topic]) {
    try {
      const got = await harvest(source)
      console.log(`[info] ${source.listUrl} 产出原始对 ${got.length}`)
      pairs.push(...got)
    } catch (e) {
      console.warn(`[warn] 源不可用 ${source.listUrl}：${e.message}`)
    }
    const probe = buildTopicSentences(pairs, PREFIX[topic])
    if (probe.length >= MIN_SENTENCES) break // 已够量，不再抓后续源
  }
  const sentences = buildTopicSentences(pairs, PREFIX[topic])
  try {
    assertTopicValid(sentences, topic)
    results[topic] = sentences
    console.log(`[ok] ${topic}: ${sentences.length} 句`)
  } catch (e) {
    console.error(`[fail] ${topic}: ${e.message}`)
    failed.push(topic)
  }
}

// 任一主题失败 → 不写入任何文件（现有题库保持原样），非零码退出
if (failed.length) {
  console.error(`抓取失败（${failed.join(', ')}），未写入任何题库文件`)
  process.exit(1)
}

for (const topic of Object.keys(results)) {
  await writeFile(OUT[topic], JSON.stringify(results[topic], null, 2) + '\n', 'utf8')
  console.log(`[write] ${OUT[topic]} (${results[topic].length} 句)`)
}
```

- [ ] **Step 4: package.json 加命令**

scripts 增加：`"fetch:corpus": "node scripts/fetch-corpus.mjs"`

- [ ] **Step 5: 真实运行抓取**

Run: `npm.cmd run fetch:corpus`
Expected: 两个主题各输出 `[ok]` 且 ≥ 40 句（目标 50-80），生成 `src/data/library/govreport.json`、`news.json`。若失败：按 warn 信息迭代适配器或换备选源；**不得放宽过滤标准**。

- [ ] **Step 6: 抽查产出质量**

打印每主题前 5 句人工过目（zh ≤ 60 字、中英对应、无乱码/广告/导航残留）；发现系统性污染 → 收紧 extract 选择器后重跑。

- [ ] **Step 7: Commit**

```powershell
git add scripts/fetch-corpus.mjs package.json package-lock.json; git commit -m 'feat: 语料抓取管线脚本与cheerio依赖' -m '构建期本地抓取官方双语语料，多源备选，宁缺毋滥'
```

---

### Task 3: 题库数据 + 前端接入

**Files:**
- Create（Task 2 产物）: `src/data/library/govreport.json`、`src/data/library/news.json`
- Modify: `src/lib/sentences.js`、`src/lib/sentences.test.js`

- [ ] **Step 1: 提交题库数据**

```powershell
git add src/data/library/govreport.json src/data/library/news.json; git commit -m 'feat: 新增政府文件与新闻时事真实语料题库'
```

- [ ] **Step 2: 改 sentences.js（唯一前端改动点）**

import 区（第 9 行 culture 之后）加：

```js
import govreport from '../data/library/govreport.json'
import news from '../data/library/news.json'
```

TOPICS 数组末尾（culture 之后）加：

```js
  { id: 'govreport', label: '政府文件' },
  { id: 'news', label: '新闻时事' }
```

BUILTIN 常量加两个键：

```js
const BUILTIN = { daily, economy, diplomacy, tech, environment, education, sports, culture, govreport, news }
```

- [ ] **Step 3: 同步 sentences.test.js 硬编码断言**

第 7-8 行改为：

```js
  it('exposes 10 topics with labels', () => {
    expect(TOPICS.map(t => t.id)).toEqual(['daily', 'economy', 'diplomacy', 'tech', 'environment', 'education', 'sports', 'culture', 'govreport', 'news'])
```

- [ ] **Step 4: 全量测试**

Run: `npm.cmd run test`
Expected: 101 passed（`library.test.js` 的 topic 数/前缀/长度断言由新 JSON 天然满足）

- [ ] **Step 5: 构建**

Run: `npm.cmd run build`
Expected: `✓ built`

- [ ] **Step 6: Commit**

```powershell
git add src/lib/sentences.js src/lib/sentences.test.js; git commit -m 'feat: 接入政府文件与新闻时事主题'
```

---

### Task 4: 终验、推送与线上验证

- [ ] **Step 1: 全量测试 + 构建复跑**

Run: `npm.cmd run test; npm.cmd run build`
Expected: 93 passed、`✓ built`

- [ ] **Step 2: 推送（触发 GitHub Pages 自动部署）**

```powershell
git push
```

Expected: master → origin/master 同步

- [ ] **Step 3: 验证部署**

约 1-2 分钟后用浏览器访问 https://lynn-hub123.github.io/interpret/ （必要时硬刷新绕过 Service Worker 缓存），验收清单：
1. 题库页出现 10 个主题卡，含「政府文件」「新闻时事」及句数（40-80 句）
2. 进入「新闻时事」抽一句练习，评分、历史正常；弱句复习可覆盖新主题句
3. 控制台无报错

- [ ] **Step 4: 收尾汇报**

向用户汇报：测试/构建结果、每主题最终句数与样本句、线上验收结果。
