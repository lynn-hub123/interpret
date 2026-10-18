// 用微软 Edge 自然语音为题库预生成朗读音频（仅本地运行，产物提交入仓）。
// 用法：node scripts/generate-audio.mjs [--force]
//   默认跳过已存在的文件；--force 全量重新生成。
// 本机网络需代理时设置 HTTPS_PROXY 环境变量即可，脚本自动使用。
import { readdirSync, readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'public', 'audio')
const libraryDir = join(root, 'src', 'data', 'library')
const force = process.argv.includes('--force')

// 声音按规格固定：中文晓晓、英文 Andrew，默认语速
const VOICES = { zh: 'zh-CN-XiaoxiaoNeural', en: 'en-US-AndrewNeural' }

const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy
let agent = null
if (proxyUrl) {
  const { HttpsProxyAgent } = await import('https-proxy-agent')
  agent = new HttpsProxyAgent(proxyUrl)
}

// 合成走 SSML 模板，输入含 &/</> 时必须转义
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

let generated = 0
let skipped = 0
try {
  mkdirSync(outDir, { recursive: true })
  const files = readdirSync(libraryDir).filter(f => f.endsWith('.json'))
  for (const lang of ['zh', 'en']) {
    const items = []
    for (const f of files) {
      const arr = JSON.parse(readFileSync(join(libraryDir, f), 'utf8'))
      for (const s of arr) {
        const text = (s[lang] || '').trim()
        if (text) items.push({ id: s.id, text })
      }
    }
    // 先按存在性过滤，无待生成文件时不建连接（幂等重跑免联网）
    const pending = []
    for (const { id, text } of items) {
      const out = join(outDir, `${id}.${lang}.mp3`)
      if (!force && existsSync(out)) { skipped++; continue }
      pending.push({ id, text })
    }
    if (!pending.length) continue
    // 每种语言一条连接，批量合成减少握手次数
    const tts = agent ? new MsEdgeTTS({ agent }) : new MsEdgeTTS()
    await tts.setMetadata(VOICES[lang], OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
    for (const { id, text } of pending) {
      const out = join(outDir, `${id}.${lang}.mp3`)
      const { audioStream } = await tts.toStream(esc(text))
      const chunks = []
      for await (const chunk of audioStream) chunks.push(chunk)
      writeFileSync(out, Buffer.concat(chunks))
      generated++
      console.log(`✓ ${id}.${lang}.mp3`)
    }
  }
  console.log(`完成：生成 ${generated}，跳过 ${skipped}（已存在）`)
} catch (e) {
  console.error(`生成失败（已生成文件保留，重跑续传）：${e?.message || e}`)
  process.exit(1)
}
