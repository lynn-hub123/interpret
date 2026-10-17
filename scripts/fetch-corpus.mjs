#!/usr/bin/env node
// 真实语料抓取管线（构建期本地运行，产物随应用静态发布；应用运行时零网络依赖）
// 用法：npm run fetch:corpus
// 数据源（均为官方媒体双语对照页，探测于 2026-10）：
//   govreport：中国网「中国关键词」双语术语库 keywords.china.org.cn（治国理政/一带一路等专题，
//              术语页 zh 术语+释义 与 en 术语+释义 同页按序对应）
//   news：中国日报网英语点津「双语新闻」language.chinadaily.com.cn/news_bilingual
//         （文章页两种版式：A 英文段/中文段交替独立段落；B 中英同段，英文原文在前中文翻译在后）
import { writeFile } from 'node:fs/promises'
import * as cheerio from 'cheerio'
import {
  alignPairs, buildTopicSentences, assertTopicValid, isZh, isEn, splitZh, splitEn, MAX_SENTENCES
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

// ---------- 段落对 → 句子对 ----------
// 仅当段落两侧拆句后均恰好单句才配对（1↔1）：多句段落的中英句界常不一致
// （官方译文压缩/合并句），句数碰巧相等也会错位，宁缺毋滥整段放弃
function sentencePairs(zhPara, enPara) {
  const sz = splitZh(zhPara)
  const se = splitEn(enPara)
  if (sz.length !== 1 || se.length !== 1) return []
  return [{ zh: sz[0], en: se[0] }]
}

function pushPairs(out, pairs) {
  for (const p of pairs) { out.zh.push(p.zh); out.en.push(p.en) }
}

// ---------- 中国关键词术语页：zh 块（术语+释义段）与 en 块按文档顺序一一对应，尾部差额丢弃 ----------
function extractKeywords($) {
  const zh = [], en = []
  $('div.wrapl div.content p').each((_, el) => {
    const t = $(el).text().replace(/\s+/g, ' ').trim()
    if (!t) return
    if (isZh(t)) zh.push(t)
    else if (isEn(t)) en.push(t)
  })
  const out = { zh: [], en: [] }
  const n = Math.min(zh.length, en.length)
  for (let i = 0; i < n; i++) pushPairs(out, sentencePairs(zh[i], en[i]))
  return out
}

// ---------- 中国日报双语新闻文章页 ----------
// 版式 A：英文段落独立成 p，后跟中文翻译 p（en→zh 相邻配对，开头的中文摘要无对应英文，自动丢弃）
// 版式 B：中英同段（英文原文在前、中文翻译在后），按首个中文字符切分后直接配对
function extractLanguage($) {
  const out = { zh: [], en: [] }
  let pendingEn = null
  $('div.mian_txt p').each((_, el) => {
    const t = $(el).text().replace(/\s+/g, ' ').trim()
    if (!t) return
    if (isZh(t)) {
      if (pendingEn) {
        pushPairs(out, sentencePairs(t, pendingEn))
        pendingEn = null
      }
      return
    }
    if (isEn(t)) { pendingEn = t; return }
    // 混合段：按首个 CJK 字符切分为英文原文 + 中文翻译；中文以数字开头时（2024年、7月29日）
    // 数字属于中文侧，切分点回退过数字串；再去掉英文侧两端列表装饰符（-- …… ——）
    const m = t.match(/[\u4e00-\u9fff]/)
    if (!m || m.index === undefined || m.index === 0) return
    let idx = m.index
    while (idx > 0 && /\d/.test(t[idx - 1])) idx--
    const enPart = t.slice(0, idx).replace(/^[-–—\s]+/, '').replace(/[-–—\s]+$/, '').trim()
    const zhPart = t.slice(idx).trim()
    if (isEn(enPart) && isZh(zhPart)) pushPairs(out, sentencePairs(zhPart, enPart))
  })
  return out
}

// ---------- 列表页文章链接 ----------
function pickLinks($list, pattern, host) {
  const seen = new Set()
  const out = []
  $list('a').each((_, el) => {
    let href = $list(el).attr('href') || ''
    if (!pattern.test(href)) return
    if (href.startsWith('//')) href = 'https:' + href
    else if (!/^https?:\/\//.test(href)) href = new URL(href, host).href
    if (!href.includes(host) || seen.has(href)) return
    seen.add(href)
    out.push(href)
  })
  return out
}

// 各源适配器：listUrl 列表页；pickLinks($) 返回文章 URL 数组；extract($) 返回 { zh: [], en: [] }
const SOURCES = {
  govreport: [
    { listUrl: 'http://keywords.china.org.cn/node_8008911.html', extract: extractKeywords }, // 治国理政
    { listUrl: 'http://keywords.china.org.cn/node_8008911_2.html', extract: extractKeywords },
    { listUrl: 'http://keywords.china.org.cn/node_8008911_3.html', extract: extractKeywords },
    { listUrl: 'http://keywords.china.org.cn/node_7248259.html', extract: extractKeywords } // 一带一路
  ],
  news: [
    { listUrl: 'https://language.chinadaily.com.cn/news_bilingual', extract: extractLanguage },
    { listUrl: 'https://language.chinadaily.com.cn/news_bilingual/page_2.html', extract: extractLanguage },
    { listUrl: 'https://language.chinadaily.com.cn/news_bilingual/page_3.html', extract: extractLanguage },
    { listUrl: 'https://language.chinadaily.com.cn/news_bilingual/page_4.html', extract: extractLanguage }
  ]
}

const LINK_PATTERNS = {
  govreport: { pattern: /content_\d+\.html/, host: 'keywords.china.org.cn' },
  news: { pattern: /\/a\/\d{6}\/\d{2}\/WS[a-z0-9]+\.html/, host: 'language.chinadaily.com.cn' }
}

async function harvest(topic, source) {
  const listHtml = await fetchText(source.listUrl)
  const $list = cheerio.load(listHtml)
  const { pattern, host } = LINK_PATTERNS[topic]
  const articles = pickLinks($list, pattern, host).slice(0, ARTICLES_PER_SOURCE)
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
      const got = await harvest(topic, source)
      console.log(`[info] ${source.listUrl} 产出原始对 ${got.length}`)
      pairs.push(...got)
    } catch (e) {
      console.warn(`[warn] 源不可用 ${source.listUrl}：${e.message}`)
    }
    const probe = buildTopicSentences(pairs, PREFIX[topic])
    if (probe.length >= MAX_SENTENCES) break // 已达上限，不再抓后续列表页；未达则累计下一页
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

// 抽查样本：每主题前 5 句人工过目
for (const topic of Object.keys(results)) {
  console.log(`\n[样本] ${topic} 前 5 句：`)
  for (const s of results[topic].slice(0, 5)) console.log(`  ZH: ${s.zh}\n  EN: ${s.en}`)
}

for (const topic of Object.keys(results)) {
  await writeFile(OUT[topic], JSON.stringify(results[topic], null, 2) + '\n', 'utf8')
  console.log(`\n[write] ${OUT[topic]} (${results[topic].length} 句)`)
}
