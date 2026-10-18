# 录音反馈优化（计时器 + 脉冲动画）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 练习卡录音过程增加 `00:00` 递增计时器和按钮呼吸脉冲动画，让「正在录音」有明确的状态感知。

**Architecture:** 计时器为视图层 UI 状态（PracticeCard.vue 内 setInterval + computed 格式化），recorder.js 纯函数库不动；脉冲动画为纯 CSS keyframes，`prefers-reduced-motion` 下关闭。回放条、错误文案等现有行为一律不变。

**Tech Stack:** Vue 3 `<script setup>` + Vitest（happy-dom）+ vi.useFakeTimers。

**规格：** `docs/superpowers/specs/2026-10-18-recording-feedback-design.md`

**环境备忘（Windows PowerShell 5）：** npm/npx 用 `.cmd` 后缀（`npm.cmd` / `npx.cmd`）；多命令用 `;` 分隔，禁用 `&&`；提交信息中文单行无空格。

---

### Task 1: 录音计时器（TDD）

**Files:**
- Modify: `src/components/PracticeCard.vue`（模板 rec-zone 区、脚本计时逻辑、样式 rec-live/rec-time）
- Test: `src/components/PracticeCard.test.js`（recording zone describe 追加 3 个用例）

- [ ] **Step 1: 写失败测试**

在 `src/components/PracticeCard.test.js` 的 `describe('recording zone')` 块末尾（`revokes url on sentence change` 用例之后）追加：

```js
  it('shows elapsed timer while recording and hides after stop', async () => {
    vi.useFakeTimers()
    try {
      const wrapper = mount(PracticeCard, { props: { sentence: { id: 'x_001', zh: '你好', en: 'hello' }, direction: 'zh2en' } })
      await wrapper.find('.btn-rec').trigger('click')
      await flushPromises()
      expect(wrapper.find('.rec-time').exists()).toBe(true)
      expect(wrapper.find('.rec-time').text()).toBe('00:00')
      await vi.advanceTimersByTimeAsync(2000)
      expect(wrapper.find('.rec-time').text()).toBe('00:02')
      await wrapper.find('.btn-rec').trigger('click')
      await flushPromises()
      expect(wrapper.find('.rec-time').exists()).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
  it('formats minutes at 65 seconds', async () => {
    vi.useFakeTimers()
    try {
      const wrapper = mount(PracticeCard, { props: { sentence: { id: 'x_001', zh: '你好', en: 'hello' }, direction: 'zh2en' } })
      await wrapper.find('.btn-rec').trigger('click')
      await flushPromises()
      await vi.advanceTimersByTimeAsync(65000)
      expect(wrapper.find('.rec-time').text()).toBe('01:05')
    } finally {
      vi.useRealTimers()
    }
  })
  it('resets timer on sentence change and recounts from zero', async () => {
    vi.useFakeTimers()
    try {
      const wrapper = mount(PracticeCard, { props: { sentence: { id: 'x_001', zh: '你好', en: 'hello' }, direction: 'zh2en' } })
      await wrapper.find('.btn-rec').trigger('click')
      await flushPromises()
      await vi.advanceTimersByTimeAsync(3000)
      await wrapper.setProps({ sentence: { id: 'x_002', zh: '世界', en: 'world' } })
      expect(wrapper.find('.rec-time').exists()).toBe(false)
      await wrapper.find('.btn-rec').trigger('click')
      await flushPromises()
      expect(wrapper.find('.rec-time').text()).toBe('00:00')
    } finally {
      vi.useRealTimers()
    }
  })
```

- [ ] **Step 2: 运行确认失败**

Run: `npx.cmd vitest run src/components/PracticeCard.test.js`
Expected: 新增 3 个用例 FAIL（找不到 `.rec-time`），原有用例全部 PASS

- [ ] **Step 3: 实现计时器**

3a. 模板：rec-zone 内按钮区改为 `rec-live` 行容器（PracticeCard.vue 第 21-25 行附近）：

```html
      <div class="rec-zone" v-if="recOK && !revealed">
        <button v-if="!isRec" class="btn btn-rec" @click="onRecStart">🎙 录音</button>
        <div v-else class="rec-live">
          <button class="btn btn-rec recording" @click="onRecStop">⏹ 停止</button>
          <span class="rec-time">{{ recTimeText }}</span>
        </div>
        <audio v-if="recUrl" class="rec-playback" :src="recUrl" controls></audio>
      </div>
```

3b. 脚本：`const recError = ref('')` 之后新增计时逻辑：

```js
const recSeconds = ref(0)
let recTimer = null
const recTimeText = computed(() => {
  const m = String(Math.floor(recSeconds.value / 60)).padStart(2, '0')
  const s = String(recSeconds.value % 60).padStart(2, '0')
  return `${m}:${s}`
})

function startRecTimer() {
  recSeconds.value = 0
  recTimer = setInterval(() => { recSeconds.value++ }, 1000)
}

function stopRecTimer() {
  if (recTimer) { clearInterval(recTimer); recTimer = null }
}
```

3c. `onRecStart` 成功分支启动计时：

```js
async function onRecStart() {
  recError.value = ''
  if (recUrl.value) { revoke(recUrl.value); recUrl.value = '' }
  const ok = await startRecording()
  isRec.value = ok
  if (ok) startRecTimer()
  if (!ok) recError.value = REC_ERROR_TEXT[lastErrorName()] || '无法访问麦克风'
}
```

3d. `onRecStop` 先停计时：

```js
async function onRecStop() {
  stopRecTimer()
  const url = await stopRecording()
  isRec.value = false
  if (url) recUrl.value = url
}
```

3e. 句子切换 watch 内（`isRec.value = false` 之后）加 `stopRecTimer()`：

```js
watch(() => props.sentence, () => {
  revealed.value = false
  listenTextShown.value = false
  listenError.value = ''
  speakError.value = ''
  stop()
  playing.value = false
  isRec.value = false
  stopRecTimer()
  if (recUrl.value) { revoke(recUrl.value); recUrl.value = '' }
})
```

3f. `onUnmounted` 加 `stopRecTimer()`：

```js
onUnmounted(() => {
  stop()
  stopRecTimer()
  if (recUrl.value) revoke(recUrl.value)
})
```

3g. 样式（scoped style 末尾追加；`.btn-rec.recording` 现有规则保持不动）：

```css
.rec-live { display: flex; align-items: center; gap: 8px; }
.rec-time { font-size: 13px; color: #e8463a; font-variant-numeric: tabular-nums; }
```

- [ ] **Step 4: 运行新用例确认通过**

Run: `npx.cmd vitest run src/components/PracticeCard.test.js`
Expected: 全部 PASS（原用例 + 3 个新用例）

- [ ] **Step 5: 全量回归**

Run: `npm.cmd test`
Expected: 全部通过，无失败无跳过

- [ ] **Step 6: 提交**

```bash
git add src/components/PracticeCard.vue src/components/PracticeCard.test.js
git commit -m "录音计时器显示与清理"
```

---

### Task 2: 录音按钮呼吸脉冲动画（纯 CSS）

**Files:**
- Modify: `src/components/PracticeCard.vue`（仅 scoped style：`.btn-rec.recording` 加动画 + keyframes + reduced-motion 关闭）

依赖：Task 1 已完成（`.rec-live`/`.rec-time` 布局样式已就位）。

- [ ] **Step 1: 修改样式**

`.btn-rec.recording { color: #e8463a; }` 改为：

```css
.btn-rec.recording {
  color: #e8463a;
  animation: rec-pulse 1.6s ease-in-out infinite;
}
```

同文件 scoped style 末尾追加：

```css
@keyframes rec-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(232, 70, 58, 0.3); }
  50% { box-shadow: 0 0 0 8px rgba(232, 70, 58, 0); }
}
@media (prefers-reduced-motion: reduce) {
  .btn-rec.recording { animation: none; }
}
```

说明：光晕用 rgba 低透明度红色扩散，视觉低饱和；不新增 JS，不改 DOM 结构。

- [ ] **Step 2: 全量回归**

Run: `npm.cmd test`
Expected: 全部通过（happy-dom 不解析 CSS，样式改动不影响断言，跑一遍防手滑）

- [ ] **Step 3: 提交**

```bash
git add src/components/PracticeCard.vue
git commit -m "录音按钮呼吸脉冲动画"
```

---

### Task 3: 构建终验 + push

**Files:** 无代码改动，验证与发布。

- [ ] **Step 1: 构建**

Run: `npm.cmd run build`
Expected: 构建成功无报错

- [ ] **Step 2: push**

```bash
git push
```

Expected: push 成功，GitHub Actions 部署正常（可在 https://github.com/lynn-hub123/interpret/actions 查看）。

- [ ] **Step 3: 线上验收**

部署完成后在 https://lynn-hub123.github.io/interpret/ 验证（需浏览器环境，由主会话用浏览器子代理或用户手动完成）：

1. 进入练习，点「🎙 录音」→ 按钮变红并出现呼吸脉冲，旁边出现 `00:00` 计时并每秒递增
2. 点「⏹ 停止」→ 计时消失，回放条照常出现
3. 换下一句 → 无计时残留
4. 拒绝麦克风权限 → 错误文案照旧，无计时出现

---

## 自审记录

- 规格覆盖：计时器（Task 1）、脉冲动画 + reduced-motion（Task 2）、测试三用例（Task 1 Step 1）、改动边界仅两文件（Task 1/2 Files）、YAGNI 边界未引入波形/时长上限（无相关任务）✔
- 占位符扫描：无 TBD/TODO，所有代码步骤含完整代码 ✔
- 类型一致性：`recTimeText`/`startRecTimer`/`stopRecTimer`/`recSeconds` 各任务间命名一致 ✔
