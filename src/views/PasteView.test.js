import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import PasteView from './PasteView.vue'
import { save } from '../lib/storage.js'

function seedSentences() {
  save('custom.v1', [
    { id: 'c_1', zh: '第一句。', en: '', topic: 'paste', source: 'custom' },
    { id: 'c_2', zh: '', en: 'Second one.', topic: 'paste', source: 'custom' }
  ])
}

function mountView() {
  return mount(PasteView)
}

beforeEach(() => { localStorage.clear() })
afterEach(() => { vi.useRealTimers() })

describe('custom sentence panel', () => {
  it('does not render when there are no custom sentences', () => {
    const w = mountView()
    expect(w.find('.saved').exists()).toBe(false)
  })

  it('shows count and stays collapsed until clicked', async () => {
    seedSentences()
    const w = mountView()
    expect(w.find('.saved-head').text()).toContain('已保存 2 句')
    expect(w.find('.saved-list').exists()).toBe(false)
    await w.find('.saved-head').trigger('click')
    expect(w.findAll('.saved-item')).toHaveLength(2)
  })

  it('renders newest first with language tag and practice count', async () => {
    seedSentences()
    save('records.v1', [
      { id: 'r1', sentenceId: 'c_1', direction: 'zh2en', rating: 'ok', ts: 1 },
      { id: 'r2', sentenceId: 'c_1', direction: 'zh2en', rating: 'ok', ts: 2 }
    ])
    const w = mountView()
    await w.find('.saved-head').trigger('click')
    const items = w.findAll('.saved-item')
    expect(items[0].text()).toContain('Second one.')
    expect(items[0].text()).toContain('英')
    expect(items[0].text()).toContain('未练')
    expect(items[1].text()).toContain('第一句。')
    expect(items[1].text()).toContain('中')
    expect(items[1].text()).toContain('已练 2 次')
  })

  it('deletes one item and restores it via undo', async () => {
    seedSentences()
    const w = mountView()
    await w.find('.saved-head').trigger('click')
    await w.findAll('.btn-remove')[0].trigger('click')
    expect(w.findAll('.saved-item')).toHaveLength(1)
    expect(w.find('.undo-bar').exists()).toBe(true)
    await w.find('.undo-btn').trigger('click')
    expect(w.findAll('.saved-item')).toHaveLength(2)
    expect(w.findAll('.saved-item')[0].text()).toContain('Second one.')
    expect(w.find('.undo-bar').exists()).toBe(false)
  })

  it('batch deletes selected items in manage mode', async () => {
    seedSentences()
    const w = mountView()
    await w.find('.saved-head').trigger('click')
    await w.find('.btn-tool.manage').trigger('click')
    expect(w.findAll('.check')).toHaveLength(2)
    await w.findAll('.saved-main')[0].trigger('click')
    expect(w.findAll('.check.on')).toHaveLength(1)
    expect(w.find('.btn-del').text()).toContain('删除所选（1）')
    await w.find('.btn-del').trigger('click')
    expect(w.findAll('.saved-item')).toHaveLength(1)
    expect(w.find('.undo-bar').exists()).toBe(true)
  })

  it('select-all toggles every visible item', async () => {
    seedSentences()
    const w = mountView()
    await w.find('.saved-head').trigger('click')
    await w.find('.btn-tool.manage').trigger('click')
    await w.find('.btn-tool.all').trigger('click')
    expect(w.findAll('.check.on')).toHaveLength(2)
    expect(w.find('.btn-del').text()).toContain('删除所选（2）')
    await w.find('.btn-tool.all').trigger('click')
    expect(w.findAll('.check.on')).toHaveLength(0)
    expect(w.find('.btn-del').attributes('disabled')).toBeDefined()
  })

  it('hides the panel entirely after deleting everything', async () => {
    seedSentences()
    const w = mountView()
    await w.find('.saved-head').trigger('click')
    await w.find('.btn-tool.manage').trigger('click')
    await w.find('.btn-tool.all').trigger('click')
    await w.find('.btn-del').trigger('click')
    expect(w.find('.saved').exists()).toBe(false)
  })

  it('undo bar auto-hides after 6 seconds', async () => {
    vi.useFakeTimers()
    seedSentences()
    const w = mountView()
    await w.find('.saved-head').trigger('click')
    await w.findAll('.btn-remove')[0].trigger('click')
    expect(w.find('.undo-bar').exists()).toBe(true)
    vi.advanceTimersByTime(6000)
    await w.vm.$nextTick()
    expect(w.find('.undo-bar').exists()).toBe(false)
  })
})
