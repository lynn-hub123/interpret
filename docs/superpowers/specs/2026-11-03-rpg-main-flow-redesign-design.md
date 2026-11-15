# RPG 主线流程重设计

> 状态：待用户审阅 | 日期：2026-11-03 | 前置规格：`2026-10-14-interpret-practice-design.md`、`2026-10-24-card-collection-design.md`、`2026-10-28-world-bible-place-spirits.md`（既定硬约束全部继承）

## 1. 背景与目标

场景卡、抉择、新手引导、铃的像素形象陆续做完后，旧模块（题库 topic 网格、粘贴练句）没有跟着退位。结果是同一个应用里两套入口并列：

- 题库页：上半「现场」（RPG）、下半「题库」（旧）
- 练习页：场景栏（新）和旧 header 两层进度叠在一起
- 空态文案仍写着「去题库挑个主题」，刚建立的世界观立刻破功
- 底部导航还是「练习 / 题库 / 粘贴 / 我的」，主线在哪找不到

本轮把流程重新排一次，让**打开就是主线**，旧功能不删除、只降级。

三个设计意图：

1. **单一主线入口**——首屏就是当前站，玩家不需要先做选择。
2. **旧能力不消失**——题库和粘贴合并成一个「自由练习」支线，练句照旧攒券、抽卡、记统计，只是不推剧情。
3. **旧存档与旧书签继续可用**——`/library`、`/paste` 重定向，localStorage 键名一个不改。

## 2. 范围

**做：**

- 底部导航从四枚改为两枚：主线 / 拾潮人手册
- 主线页状态机：无 session 时按 `story.node` 加载当前站；全部完成后渲染「潮水未退」完成态
- 主线推进闸门：只有 `scene.id === story.node` 才推进，重游不推
- 新增 `/free` 自由练习页（主题网格 + 粘贴面板）
- 「我的」改版为「拾潮人手册」：卡牌图鉴置顶，新增主线进度块
- 铃新增 `mainDone` 台词桶
- 旧路由 `/library`、`/paste` 重定向到 `/free`

**不做（YAGNI）：**

- 第三幕及以后场景内容
- 抽卡流程、羁绊规则、AI 判分的任何改动
- 自由练习页的 tab 切换、筛选题材、搜索
- 账号体系、云同步
- 场景未解锁时的「图鉴预览」页

## 3. 目标结构

```
TabBar（两枚）
├─ 🌊 主线       /        PracticeView（改造）
└─ 🎴 拾潮人手册  /me      MeView（改版）

次级路由
├─ /free                  FreePracticeView（新增）
└─ /unlock/:id            UnlockView（不动）

兼容重定向
├─ /library  → /free
└─ /paste    → /free
└─ /review   → /         （既有，保留）
```

## 4. 主线页状态机

主线页是**一个页面同时容纳主线状态区和练习卡**，不做「点继续再跳页」。

进入 `/` 时按优先级决定本次会话：

| 优先级 | 条件 | 行为 | 是否推进主线 |
|---|---|---|---|
| 1 | `sessionStorage` 有 `mode=scene`（用户点重游） | 加载该场景，显示场景栏 | 否 |
| 2 | `sessionStorage` 有 `mode=topic` / `paste` | 加载普通句池，无场景栏 | 否 |
| 3 | 无 session，`story.node` 有值 | 自动加载该站，显示场景栏 | 是 |
| 4 | 无 session，`story.node` 为空 | 渲染完成态，不渲染练习卡 | — |

**完成态「潮水未退」**包含：

- 悬念文案（铃的语气，例如「潮水还没退。那一夜只露出这么一角。」）
- 铃的台词（`mainDone` 桶）
- 已完成场景的重游列表（标题 / 地点 / 已练句数 / 羁绊）
- 「自由练习」入口按钮（跳 `/free`）

**推进闸门**：`maybeAdvance()` 里增加条件

```js
if (choice && !story.choices[scene.id]) return   // 已有
if (scene.id !== story.node) return              // 新增：重游不推主线
advanceStory(scene.id)
```

`story.node` 为空表示主线走完（全部场景 `cleared`）。旧档缺 `node` 的情况由 `getStory()` 既有的校验逻辑回落处理，不改。

## 5. 自由练习页 `/free`

```
FreePracticeView.vue（薄壳，只负责排版）
├─ <h2>自由练习</h2>
├─ <p class="hint">铃的一句话（世界观语气，不是「去题库挑主题」）
├─ <section> 按主题练   → <TopicGrid />
└─ <section> 粘一段进来 → <PastePanel />
```

两个区块上下排列，不做 tab。

组件抽取：

| 新文件 | 来源 | 职责 |
|---|---|---|
| `src/components/TopicGrid.vue` | LibraryView 的 topic 部分 | 渲染 11 个主题 + 句数；点击写 `session {mode:'topic', topic}` 并跳 `/` |
| `src/components/PastePanel.vue` | PasteView 的全部主体 | textarea / 拆句预览 / 开始练习 / 已保存列表 / 撤销 |

`LibraryView.vue`、`PasteView.vue` 删除。`LibraryView.test.js`、`PasteView.test.js` 的用例迁移到对应组件测试。

`TopicGrid` 与 `PastePanel` 都不依赖 `scene` 相关模块，保持与主线解耦。

## 6. 拾潮人手册 `/me`

只调模板顺序 + 加一个展示块：

```
1. 卡牌图鉴（置顶；含券数、抽卡入口）
2. 主线进度（当前站 · 已完成 N 站 · 抉择一行摘要）   ← 新增
3. 统计（连续天数 / 今日 / 累计 + 主题强弱）
4. 设置（默认方向 / 计时 / 深浅主题）
5. AI 判分配置
6. 数据（导出 / 导入 / 清空）
```

主线进度块数据来自 `getStory()` + `allScenes()`，纯展示，不写存档。

标题由「我的」改为「拾潮人手册」。

## 7. 铃的台词

`src/lib/lingQuips.js` 新增桶：

```js
mainDone: [
  '潮水还没退。那一夜只露出这么一角。',
  '师父的脚印在下一层，还得等下一次退潮。',
  '别急着下去。水底的东西，都是自己浮上来的。'
]
```

`pick()` 接口与 `validBucket` 白名单同步更新。完成态出现时用 `pick('mainDone', 0)`。

## 8. 数据与兼容

- localStorage 键名全部不变：`records.v1`、`custom.v1`、`story.v1`、`bonds.v1`、`cards.v1`、`settings.v1`、`onboarded.v1`。
- `story.node` 语义不变（当前站 id 或空字符串）。
- 旧书签 `/library`、`/paste` 命中重定向，不会 404。
- 首页默认加载行为改变：老玩家打开即进当前站（原本需要先进题库页点场景）。这是本轮改版的目的，不是回归。

## 9. 测试

| 文件 | 用例 |
|---|---|
| `FreePracticeView.test.js`（新） | 两个区块都渲染；点主题写 session 并跳 `/`；粘贴后写 session |
| `TopicGrid.test.js`（新） | 11 个主题与句数；点击写 `mode:'topic'` |
| `PastePanel.test.js`（新，迁移） | 原 PasteView 全部用例 |
| `PracticeView.test.js`（改） | 无 session + node=scn02 自动加载 scn02；重游 session 不推进 node；node 为空时显示完成态且不渲染练习卡；`mainDone` 台词出现 |
| `TabBar.test.js`（改） | 两枚：主线 / 拾潮人手册 |
| `lingQuips.test.js`（改） | `mainDone` 桶存在、可被 pick 取出 |
| 全量回归 | `npm test -- --run` + `npm run build` |

## 10. 风险

- **删页影响**：`LibraryView` / `PasteView` 删除后，任何直接 import 它们的地方会编译失败。实施时先全局搜索引用（预计只有 router 与各自测试）。
- **session 残留**：用户从自由练习进入后没练完就返回，sessionStorage 里仍有 `mode`，下次进 `/` 会继续自由练习而不是主线。保留该行为（与现有体验一致），不在本轮回改。
- **完成态空荡**：只有两幕时，走完立刻看到完成态。靠重游列表与自由练习入口兜住内容量，不额外造内容。