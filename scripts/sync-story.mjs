// 把同级 story 仓的章节与说话人表同步到游戏导入目录；该目录不纳入版本管理。
import { cp, mkdir, readdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(root, process.argv[2] || '../story/chapters')
const target = join(root, 'src/data/story-import')

const entries = await readdir(source).catch(() => null)
if (!entries) {
  console.error(`找不到剧本目录：${source}`)
  console.error('先克隆 story 仓到同级目录，或传入路径：npm run sync:story -- <chapters 目录>')
  process.exit(1)
}

const files = entries.filter((name) => name.endsWith('.json'))
if (!files.length) {
  console.error(`剧本目录里没有 JSON：${source}`)
  process.exit(1)
}

await mkdir(target, { recursive: true })
for (const name of files) {
  await cp(join(source, name), join(target, name))
}
console.log(`已同步 ${files.length} 个文件 → src/data/story-import/：${files.join('、')}`)
