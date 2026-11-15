// 普通回合的轻判定：只分「听懂了 / 没听懂」两档，不判语法、不打分、不记历史。
// 做法：把候选的英文译文取内容词，与玩家输入逐词做词形对齐，命中过半即算听懂。
import { normalize, stem } from './gate.js'

const STOP = new Set([
  'i', 'me', 'my', 'we', 'us', 'our', 'you', 'your', 'he', 'him', 'his',
  'she', 'her', 'it', 'its', 'they', 'them', 'their',
  'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'do', 'does', 'did', 'have', 'has', 'had',
  'will', 'would', 'can', 'could', 'should', 'may', 'might', 'must',
  'a', 'an', 'the', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'from', 'by',
  'up', 'down', 'out', 'off', 'over', 'into', 'about', 'as', 'than',
  'and', 'or', 'but', 'so', 'if', 'then', 'that', 'this', 'these', 'those',
  'there', 'here', 'what', 'who', 'whom', 'how', 'why', 'when', 'where', 'which',
  'not', 'no', 'just', 'all', 'any', 'some', 'very', 'too', 'also',
  'please', 'ok', 'okay', 'sorry', 'well', 'now', 'still', 'again'
])

export function contentWords(text) {
  return normalize(text)
    .split(' ')
    .filter(w => w && !STOP.has(w) && (w.length > 2 || /^\d+$/.test(w)))
}

export function comprehends(input, reference) {
  const want = contentWords(reference)
  if (!want.length) return true
  const got = new Set(contentWords(input).map(stem))
  const hits = want.filter(w => got.has(stem(w))).length
  return hits * 2 >= want.length
}
