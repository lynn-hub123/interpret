'use strict';
/* 剧本工作台：纯静态、无构建、无后端。数据存 localStorage。 */
(function () {
  const STORE_KEY = 'storyWorkbench.v1';
  const CLOUD_KEY = 'storyWorkbench.cloud.v1';
  const CLOUD_DEFAULT = {
    repo: 'lynn-hub123/interpret',
    branch: 'master',
    dir: 'docs/story-drafts',
    token: ''
  };

  const TYPE_ORDER = ['narration', 'visual', 'action', 'npc', 'os', 'phone', 'say', 'choice', 'scene', 'event', 'divider'];
  const TYPE_LABEL = {
    narration: '旁白',
    visual: '画面',
    action: '动作',
    npc: '角色对话',
    os: '内心 OS',
    phone: '手机消息',
    say: '玩家台词',
    choice: '分支选项',
    scene: '场景开头',
    event: '线索卡',
    divider: '分隔线'
  };
  // 下拉里把 schema v1 没有的类型标明，避免写手以为游戏会读到
  const TYPE_OPTION_LABEL = Object.assign({}, TYPE_LABEL, { choice: '分支选项（未接入）' });
  const DEFAULT_RATING = { horror: 'H2', nonhuman: 'N1', intimacy: 'R2', cg: 'C1' };
  const DEFAULT_GATE_BUDGET = { min: 2, max: 3 };
  const SPEAKER_COLORS = ['#8fb3d9', '#c99a6e', '#8fbfa8', '#c08fa2', '#b9a86a', '#9b8fd0', '#7fb0a8'];
  const DEFAULT_SPEAKERS = [
    { id: 'zhou_yan', displayName: '周砚', color: SPEAKER_COLORS[0] },
    { id: 'door_voice', displayName: '门内', color: SPEAKER_COLORS[1] },
    { id: 'phone_voice', displayName: '听筒', color: SPEAKER_COLORS[2] },
    { id: 'player', displayName: '你', color: SPEAKER_COLORS[3] }
  ];
  // 以 src/data/story/speakers.json 为准；加载失败时退回上面的内置名单
  const knownSpeakerIds = { ids: null };

  const state = {
    chapters: [],
    activeId: null,
    ui: { autoLocate: true }
  };

  let seq = 0;
  let saveTimer = null;
  let previewTimer = null;
  let hotTimer = null;
  let dragId = null;
  const cloud = { cfg: Object.assign({}, CLOUD_DEFAULT), files: null, manifest: null };
  const history = { stack: [], index: -1, limit: 150, timer: null };

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

  /* ---------------- 基础工具 ---------------- */

  function uid(prefix) {
    seq += 1;
    return (prefix || 'n') + '_' + Date.now().toString(36) + '_' + seq.toString(36);
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function escAttr(value) {
    return esc(value).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function splitLines(value) {
    return String(value || '')
      .split(/\r?\n/)
      .map(function (line) { return line.trim(); })
      .filter(Boolean);
  }

  function joinSentence(a, b) {
    const x = String(a || '').trim();
    const y = String(b || '').trim();
    if (!x) return y;
    if (!y) return x;
    return x + ' ' + y;
  }

  function joinNotes() {
    return Array.prototype.slice.call(arguments)
      .map(function (v) { return String(v || '').trim(); })
      .filter(Boolean)
      .join('\n');
  }

  function clock() {
    const d = new Date();
    const pad = function (n) { return String(n).padStart(2, '0'); };
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function setSaveState(text) {
    const el = $('#saveState');
    if (el) el.textContent = text;
  }

  function toast(message) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    document.body.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('show'); });
    setTimeout(function () {
      el.classList.remove('show');
      setTimeout(function () { el.remove(); }, 220);
    }, 1900);
  }

  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(url);
      a.remove();
    }, 800);
  }

  function safeName(name) {
    return String(name || 'chapter')
      .replace(/[\\/:*?"<>|\s]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'chapter';
  }

  /* ---------------- 数据模型 ---------------- */

  function makeOption(patch) {
    const opt = { id: uid('o'), zh: '', en: '', required: [], nodes: [] };
    return Object.assign(opt, patch || {});
  }

  function makeScene(patch) {
    return Object.assign({
      title: '',
      place: '',
      time: '',
      presentation: 'chat',
      caption: '',
      sight: '',
      sound: '',
      smell: ''
    }, patch || {});
  }

  function makeNode(type, patch) {
    const base = { id: uid('n'), type: type, collapsed: false, note: '' };
    if (type === 'narration') {
      Object.assign(base, { text: '' });
    } else if (type === 'visual') {
      Object.assign(base, { text: '', shot: '', sound: '' });
    } else if (type === 'action') {
      Object.assign(base, { text: '' });
    } else if (type === 'npc') {
      Object.assign(base, { speaker: 'zhou_yan', zh: '', en: '', emotion: '' });
    } else if (type === 'phone') {
      Object.assign(base, { speaker: 'phone_voice', zh: '', en: '' });
    } else if (type === 'os') {
      Object.assign(base, { text: '' });
    } else if (type === 'say') {
      Object.assign(base, { zh: '', en: '', intent: '', required: [], gate: null });
    } else if (type === 'choice') {
      Object.assign(base, { intent: '', gate: null, options: [makeOption(), makeOption()] });
    } else if (type === 'scene') {
      Object.assign(base, { scene: makeScene() });
    } else if (type === 'event') {
      Object.assign(base, { event: { kind: 'clue', title: '', body: '', meta: '' } });
    } else if (type === 'divider') {
      Object.assign(base, { title: '', time: '' });
    }
    return Object.assign(base, patch || {});
  }

  function makeChapter(patch) {
    const ch = {
      id: uniqueChapterId(),
      title: '新章节',
      dir: 'zh2en',
      place: '',
      time: '',
      warnings: [],
      rating: Object.assign({}, DEFAULT_RATING),
      gateBudget: Object.assign({}, DEFAULT_GATE_BUDGET),
      customSpeakers: [],
      nodes: [],
      updatedAt: Date.now()
    };
    return Object.assign(ch, patch || {});
  }

  function starterChapter() {
    const ch = makeChapter({ title: '第一章 · 未命名' });
    ch.nodes = [
      makeNode('scene', { scene: makeScene({ title: '场景 1', presentation: 'chat' }) }),
      makeNode('narration')
    ];
    ch.id = 'draft01';
    return ch;
  }

  function uniqueChapterId() {
    let i = 1;
    let id = 'ch' + String(i).padStart(2, '0');
    while (state.chapters.some(function (c) { return c.id === id; })) {
      i += 1;
      id = 'ch' + String(i).padStart(2, '0');
    }
    return id;
  }

  function uniqueChapterIdFor(base) {
    let id = String(base || '').trim() || uniqueChapterId();
    let n = 2;
    while (state.chapters.some(function (c) { return c.id === id; })) {
      id = String(base) + '_' + n;
      n += 1;
    }
    return id;
  }

  function activeChapter() {
    return state.chapters.find(function (c) { return c.id === state.activeId; }) || state.chapters[0];
  }

  function walkNodes(nodes, fn) {
    (nodes || []).forEach(function (n) {
      fn(n);
      if (n.type === 'choice') {
        (n.options || []).forEach(function (o) {
          walkNodes(o.nodes || [], fn);
        });
      }
    });
  }

  function findNode(id, list) {
    const nodes = list || activeChapter().nodes;
    for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i];
      if (n.id === id) return n;
      if (n.type === 'choice') {
        for (let j = 0; j < (n.options || []).length; j += 1) {
          const found = findNode(id, n.options[j].nodes || []);
          if (found) return found;
        }
      }
    }
    return null;
  }

  function locate(id, list, parent) {
    const nodes = list || activeChapter().nodes;
    for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i];
      if (n.id === id) return { node: n, list: nodes, index: i, parent: parent || null };
      if (n.type === 'choice') {
        for (let j = 0; j < (n.options || []).length; j += 1) {
          const found = locate(id, n.options[j].nodes || [], n);
          if (found) return found;
        }
      }
    }
    return null;
  }

  function normalizeNode(n) {
    if (!n || typeof n !== 'object') return null;
    if (!n.id) n.id = uid('n');
    if (!TYPE_LABEL[n.type]) n.type = 'narration';
    const defaults = makeNode(n.type);
    Object.keys(defaults).forEach(function (k) {
      if (!(k in n)) n[k] = defaults[k];
    });
    if (typeof n.collapsed !== 'boolean') n.collapsed = false;
    if (n.type === 'scene') {
      n.scene = makeScene(n.scene || {});
    } else if (n.type === 'event') {
      n.event = Object.assign({ kind: 'clue', title: '', body: '', meta: '' }, n.event || {});
    } else if (n.type === 'choice') {
      n.options = Array.isArray(n.options) ? n.options : [];
      n.options.forEach(function (o) {
        if (!o.id) o.id = uid('o');
        o.zh = o.zh || '';
        o.en = o.en || '';
        o.required = Array.isArray(o.required) ? o.required : [];
        o.nodes = Array.isArray(o.nodes) ? o.nodes.map(normalizeNode).filter(Boolean) : [];
      });
    }
    if (n.type === 'say') {
      n.required = Array.isArray(n.required) ? n.required : [];
    }
    return n;
  }

  function normalizeChapter(ch) {
    ch.customSpeakers = Array.isArray(ch.customSpeakers) ? ch.customSpeakers : [];
    ch.customSpeakers.forEach(function (sp) {
      if (!sp.id) sp.id = uid('sp');
      sp.displayName = sp.displayName || sp.id;
      sp.color = sp.color || speakerColor(ch, sp.id);
      sp.avatar = sp.avatar || '';
    });
    ch.speakerOverrides = (ch.speakerOverrides && typeof ch.speakerOverrides === 'object') ? ch.speakerOverrides : {};
    ch.warnings = Array.isArray(ch.warnings) ? ch.warnings : [];
    ch.rating = Object.assign({}, DEFAULT_RATING, ch.rating || {});
    ch.gateBudget = Object.assign({}, DEFAULT_GATE_BUDGET, ch.gateBudget || {});
    ch.nodes = Array.isArray(ch.nodes) ? ch.nodes.map(normalizeNode).filter(Boolean) : [];
    ch.updatedAt = Number(ch.updatedAt) || Date.now();
    return ch;
  }

  /* ---------------- 持久化 ---------------- */

  function loadState() {
    let data = null;
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) data = JSON.parse(raw);
    } catch (err) {
      console.warn('[workbench] 读取本地存储失败', err);
    }
    if (data && Array.isArray(data.chapters) && data.chapters.length) {
      state.chapters = data.chapters.map(normalizeChapter);
      state.activeId = data.activeId;
      state.ui = Object.assign(state.ui, data.ui || {});
    }
    if (!state.chapters.length) {
      const ch = starterChapter();
      normalizeChapter(ch);
      state.chapters = [ch];
      state.activeId = ch.id;
    }
    if (!state.chapters.some(function (c) { return c.id === state.activeId; })) {
      state.activeId = state.chapters[0].id;
    }
  }

  function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        chapters: state.chapters,
        activeId: state.activeId,
        ui: state.ui
      }));
      setSaveState('已保存 ' + clock());
    } catch (err) {
      console.warn('[workbench] 保存失败', err);
      setSaveState('无法保存到本地');
    }
  }

  function scheduleSave(touch) {
    if (touch !== false) {
      const ch = activeChapter();
      if (ch) ch.updatedAt = Date.now();
    }
    setSaveState('保存中…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 400);
  }

  function schedulePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(renderPreview, 100);
  }

  /* ---------------- 初始化与事件 ---------------- */

  function init() {
    loadState();
    loadSpeakers();
    loadCloudCfg();
    const auto = $('#autoLocate');
    if (auto) auto.checked = state.ui.autoLocate !== false;
    wire();
    renderChapterBar();
    renderEditor();
    renderPreview();
    updateCloudState();
    resetHistory();
    setSaveState('已载入 ' + clock());
    const first = firstEditableId();
    if (first) focusNode(first);
  }

  function wire() {
    $('#chapterSelect').addEventListener('change', function (e) {
      switchChapter(e.target.value);
    });
    $('#newChapter').addEventListener('click', addChapter);
    $('#chapterListBtn').addEventListener('click', openChapterDirectory);
    $('#chapterSettings').addEventListener('click', openChapterSettings);
    $('#undoBtn').addEventListener('click', undo);
    $('#redoBtn').addEventListener('click', redo);
    $('#cloudBtn').addEventListener('click', openCloud);
    $('#importBtn').addEventListener('click', openImport);
    $('#exportMd').addEventListener('click', function () { doExport('md'); });
    $('#exportJson').addEventListener('click', function () { doExport('json'); });
    $('#autoLocate').addEventListener('change', function (e) {
      state.ui.autoLocate = e.target.checked;
      scheduleSave(false);
    });
    $('#previewToggle').addEventListener('click', function () {
      $('#previewPane').classList.toggle('open');
    });
    $('#closePreview').addEventListener('click', function () {
      $('#previewPane').classList.remove('open');
    });

    const ed = $('#editor');
    ed.addEventListener('input', onInput);
    ed.addEventListener('change', onChange);
    ed.addEventListener('keydown', onKeydown);
    ed.addEventListener('click', onClick);
    ed.addEventListener('focusin', onFocusIn);
    ed.addEventListener('dragstart', onDragStart);
    ed.addEventListener('dragover', onDragOver);
    ed.addEventListener('dragleave', onDragLeave);
    ed.addEventListener('drop', onDrop);
    ed.addEventListener('dragend', onDragEnd);

    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveNow();
        return;
      }
      const modalOpen = !$('#modalRoot').hidden;
      if (!modalOpen && (e.ctrlKey || e.metaKey) && !e.altKey) {
        const key = e.key.toLowerCase();
        if (key === 'z') {
          e.preventDefault();
          if (e.shiftKey) redo(); else undo();
          return;
        }
        if (key === 'y') {
          e.preventDefault();
          redo();
          return;
        }
      }
      if (e.key === 'Escape' && modalOpen) {
        closeModal();
      }
    });
    window.addEventListener('beforeunload', saveNow);
  }

  function renderChapterBar() {
    const sel = $('#chapterSelect');
    if (!sel) return;
    sel.innerHTML = state.chapters.map(function (c) {
      return '<option value="' + escAttr(c.id) + '"' + (c.id === state.activeId ? ' selected' : '') + '>' +
        esc(c.title || c.id) + '</option>';
    }).join('');
  }

  function firstEditableId() {
    const ch = activeChapter();
    if (!ch || !ch.nodes.length) return null;
    const node = ch.nodes.find(function (n) { return n.type !== 'scene'; }) || ch.nodes[0];
    return node ? node.id : null;
  }

  function renderAll(focusFirst) {
    renderChapterBar();
    renderEditor(focusFirst ? firstEditableId() : null);
    renderPreview();
    updateHistoryButtons();
  }

  /* ---------------- 撤销 / 重做 ---------------- */

  function snapshotState() {
    return JSON.stringify({ chapters: state.chapters, activeId: state.activeId });
  }

  function updateHistoryButtons() {
    const u = $('#undoBtn');
    const r = $('#redoBtn');
    if (u) u.disabled = history.index <= 0;
    if (r) r.disabled = history.index >= history.stack.length - 1;
  }

  function pushHistory() {
    clearTimeout(history.timer);
    history.timer = null;
    const snap = snapshotState();
    if (history.index >= 0 && history.stack[history.index] === snap) {
      updateHistoryButtons();
      return;
    }
    history.stack = history.stack.slice(0, history.index + 1);
    history.stack.push(snap);
    if (history.stack.length > history.limit) history.stack.shift();
    history.index = history.stack.length - 1;
    updateHistoryButtons();
  }

  function scheduleHistory() {
    clearTimeout(history.timer);
    history.timer = setTimeout(pushHistory, 450);
  }

  function flushHistory() {
    if (history.timer) pushHistory();
  }

  function resetHistory() {
    clearTimeout(history.timer);
    history.timer = null;
    history.stack = [snapshotState()];
    history.index = 0;
    updateHistoryButtons();
  }

  function applyHistory(snap) {
    let data = null;
    try { data = JSON.parse(snap); } catch (err) { return; }
    if (!data || !Array.isArray(data.chapters)) return;
    state.chapters = data.chapters.map(normalizeChapter);
    state.activeId = data.activeId;
    if (!state.chapters.some(function (c) { return c.id === state.activeId; })) {
      state.activeId = state.chapters[0] ? state.chapters[0].id : null;
    }
    saveNow();
    renderAll();
    updateHistoryButtons();
  }

  function undo() {
    flushHistory();
    if (history.index <= 0) {
      toast('没有可撤销的操作');
      return;
    }
    history.index -= 1;
    applyHistory(history.stack[history.index]);
    toast('已撤销');
  }

  function redo() {
    flushHistory();
    if (history.index >= history.stack.length - 1) {
      toast('没有可重做的操作');
      return;
    }
    history.index += 1;
    applyHistory(history.stack[history.index]);
    toast('已重做');
  }

  function switchChapter(id) {
    if (!id || id === state.activeId) return;
    saveNow();
    state.activeId = id;
    renderChapterBar();
    renderEditor();
    renderPreview();
    saveNow();
    const first = firstEditableId();
    if (first) focusNode(first);
  }

  function addChapter() {
    saveNow();
    flushHistory();
    const ch = makeChapter({ title: '新章节 ' + (state.chapters.length + 1) });
    ch.nodes = [
      makeNode('scene', { scene: makeScene({ title: '场景 1', presentation: 'chat' }) }),
      makeNode('narration')
    ];
    state.chapters.push(ch);
    state.activeId = ch.id;
    renderAll(true);
    saveNow();
    pushHistory();
    toast('已新建章节');
  }

  /* ---------------- 章节目录 ---------------- */

  function chapterCharCount(ch) {
    let total = 0;
    const add = function (s) { total += String(s || '').replace(/\s+/g, '').length; };
    walkNodes(ch.nodes || [], function (node) {
      if (node.type === 'narration' || node.type === 'visual' || node.type === 'action' || node.type === 'os') {
        add(node.text);
      } else if (node.type === 'npc' || node.type === 'phone') {
        add(node.zh);
      } else if (node.type === 'say') {
        add(node.zh);
      } else if (node.type === 'choice') {
        (node.options || []).forEach(function (o) { add(o.zh); });
      } else if (node.type === 'scene') {
        const s = node.scene || {};
        add(s.title); add(s.caption); add(s.sight); add(s.sound); add(s.smell);
      } else if (node.type === 'event') {
        const ev = node.event || {};
        add(ev.title); add(ev.body);
      }
    });
    return total;
  }

  function fmtStamp(ts) {
    if (!ts) return '未记录';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '未记录';
    const pad = function (x) { return String(x).padStart(2, '0'); };
    return pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function openChapterDirectory() {
    const undo = [];
    let renaming = null;

    openModal(
      '<h2 id="dirHead">章节目录</h2>' +
      '<p class="hint">删除只影响本机，不会动云端副本。云端副本要在「云端草稿 → 同步检查」里单独删除。</p>' +
      '<div class="dir-list" id="dirList"></div>' +
      '<div class="modal-actions">' +
        '<button type="button" id="dirUndo" style="margin-right:auto" disabled>撤销删除</button>' +
        '<button type="button" id="dirNew">新建章节</button>' +
        '<button type="button" data-close>关闭</button>' +
      '</div>',
      function (root) {
        const list = $('#dirList', root);
        const head = $('#dirHead', root);
        const undoBtn = $('#dirUndo', root);

        function rerender(focusTitle) {
          head.textContent = '章节目录 · ' + state.chapters.length + ' 章';
          undoBtn.disabled = !undo.length;
          undoBtn.textContent = undo.length ? '撤销删除（' + undo.length + '）' : '撤销删除';
          if (!state.chapters.length) {
            list.innerHTML = '<p class="dir-empty">还没有章节。</p>';
            return;
          }
          list.innerHTML = state.chapters.map(function (c) {
            const current = c.id === state.activeId;
            if (renaming === c.id) {
              return '<div class="dir-row' + (current ? ' current' : '') + '" data-id="' + escAttr(c.id) + '">' +
                '<div class="dir-rename"><input data-rename-input value="' + escAttr(c.title || c.id) + '">' +
                '<button type="button" data-rename-save>保存</button>' +
                '<button type="button" data-rename-cancel>取消</button></div>' +
                '</div>';
            }
            return '<div class="dir-row' + (current ? ' current' : '') + '" data-id="' + escAttr(c.id) + '">' +
              '<button type="button" class="dir-main" data-open="' + escAttr(c.id) + '">' +
                '<span class="dir-title">' + esc(c.title || c.id) + '</span>' +
                '<span class="dir-meta">' + (current ? '当前 · ' : '') +
                  chapterCharCount(c) + ' 字 · ' + fmtStamp(c.updatedAt) + '</span>' +
              '</button>' +
              (current ? '<span class="dir-badge">当前</span>' : '') +
              '<div class="dir-acts">' +
                '<button type="button" data-up="' + escAttr(c.id) + '" title="上移">↑</button>' +
                '<button type="button" data-down="' + escAttr(c.id) + '" title="下移">↓</button>' +
                '<button type="button" data-rename="' + escAttr(c.id) + '">重命名</button>' +
                '<button type="button" class="danger-btn" data-del="' + escAttr(c.id) + '">删除</button>' +
              '</div>' +
              '</div>';
          }).join('');
          if (focusTitle) {
            const input = $('[data-rename-input]', list);
            if (input) { input.focus(); input.select(); }
          }
        }

        list.addEventListener('click', function (e) {
          const btn = e.target.closest('button');
          if (!btn) return;
          const row = btn.closest('.dir-row');
          const id = row ? row.getAttribute('data-id') : '';
          const ch = state.chapters.find(function (c) { return c.id === id; });
          if (!ch) return;

          if (btn.hasAttribute('data-open')) {
            switchChapter(id);
            closeModal();
            return;
          }
          if (btn.hasAttribute('data-rename')) {
            renaming = id;
            rerender(true);
            return;
          }
          if (btn.hasAttribute('data-rename-cancel')) {
            renaming = null;
            rerender(false);
            return;
          }
          if (btn.hasAttribute('data-rename-save')) {
            const input = $('[data-rename-input]', row);
            const title = input ? input.value.trim() : '';
            if (!title) { toast('标题不能为空'); return; }
            flushHistory();
            ch.title = title;
            ch.updatedAt = Date.now();
            renaming = null;
            saveNow();
            renderChapterBar();
            rerender(false);
            pushHistory();
            return;
          }
          if (btn.hasAttribute('data-up') || btn.hasAttribute('data-down')) {
            const from = state.chapters.indexOf(ch);
            const to = btn.hasAttribute('data-up') ? from - 1 : from + 1;
            if (to < 0 || to >= state.chapters.length) return;
            flushHistory();
            state.chapters.splice(from, 1);
            state.chapters.splice(to, 0, ch);
            saveNow();
            renderChapterBar();
            rerender(false);
            pushHistory();
            return;
          }
          if (btn.hasAttribute('data-del')) {
            if (state.chapters.length <= 1) { toast('至少保留一个章节'); return; }
            if (!window.confirm('删除「' + (ch.title || ch.id) + '」和它的全部内容？\n\n删除只影响本机，云端副本不会动。')) return;
            flushHistory();
            const index = state.chapters.indexOf(ch);
            const wasActive = state.activeId === ch.id;
            state.chapters.splice(index, 1);
            undo.push({ chapter: ch, index: index, wasActive: wasActive });
            if (wasActive) {
              state.activeId = state.chapters[Math.min(index, state.chapters.length - 1)].id;
            }
            saveNow();
            renderAll(true);
            rerender(false);
            pushHistory();
            toast('已删除，可在目录里撤销');
          }
        });

        undoBtn.addEventListener('click', function () {
          const item = undo.pop();
          if (!item) return;
          flushHistory();
          state.chapters.splice(Math.min(item.index, state.chapters.length), 0, item.chapter);
          if (item.wasActive) state.activeId = item.chapter.id;
          saveNow();
          renderAll(false);
          rerender(false);
          pushHistory();
          toast('已恢复「' + (item.chapter.title || item.chapter.id) + '」');
        });

        $('#dirNew', root).addEventListener('click', function () {
          addChapter();
          renaming = null;
          rerender(false);
        });

        rerender(false);
      }
    );
  }

  /* ---------------- 编辑器渲染 ---------------- */

  function speakerList(ch) {
    const seen = {};
    const out = [];
    (ch.customSpeakers || []).concat(DEFAULT_SPEAKERS).forEach(function (sp) {
      if (!sp || !sp.id || seen[sp.id]) return;
      seen[sp.id] = true;
      out.push(speakerEntry(ch, sp.id));
    });
    return out;
  }

  function hashColor(id) {
    let h = 0;
    const s = String(id || '');
    for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return SPEAKER_COLORS[h % SPEAKER_COLORS.length];
  }

  function speakerEntry(ch, id) {
    const overrides = (ch.speakerOverrides && typeof ch.speakerOverrides === 'object') ? ch.speakerOverrides : {};
    const ov = overrides[id] || {};
    const custom = (ch.customSpeakers || []).find(function (s) { return s.id === id; });
    const base = DEFAULT_SPEAKERS.find(function (s) { return s.id === id; });
    const src = custom || base || {};
    return {
      id: id,
      displayName: ov.displayName || src.displayName || id || '未命名角色',
      color: ov.color || src.color || hashColor(id),
      avatar: ov.avatar != null ? ov.avatar : (src.avatar || ''),
      builtin: !custom && !!base
    };
  }

  function speakerName(ch, id) {
    return speakerEntry(ch, id).displayName;
  }

  function speakerColor(ch, id) {
    return speakerEntry(ch, id).color;
  }

  function renderSpeakerOptions(ch, selected) {
    const list = speakerList(ch);
    const known = list.some(function (s) { return s.id === selected; });
    let html = list.map(function (s) {
      return '<option value="' + escAttr(s.id) + '"' + (s.id === selected ? ' selected' : '') + '>' +
        esc(s.displayName) + '（' + esc(s.id) + '）</option>';
    }).join('');
    if (!known && selected) {
      html += '<option value="' + escAttr(selected) + '" selected>' + esc(selected) + '（未登记）</option>';
    }
    html += '<option value="__add">＋ 添加角色…</option>';
    return html;
  }

  function renderNote(n) {
    return '<input class="note-input" data-field="note" value="' + escAttr(n.note || '') +
      '" placeholder="作者备注（不显示给玩家）">';
  }

  function optionLetter(index) {
    return String.fromCharCode(65 + index);
  }

  function renderFields(n, ch) {
    if (n.type === 'narration') {
      const legacy = (n.shot || n.sound)
        ? '<p class="scene-hint">这个节点还留着旧版旁白的镜头/音效，切到「画面」就能看到并继续编辑。</p>'
        : '';
      return '<textarea class="main-text" data-field="text" data-main="1" rows="1" placeholder="旁白：只写叙述文字，不写镜头和音效">' +
        esc(n.text) + '</textarea>' + legacy + renderNote(n);
    }
    if (n.type === 'visual') {
      return '<textarea class="main-text" data-field="text" data-main="1" rows="1" placeholder="画面描述：玩家此刻看到什么">' +
        esc(n.text) + '</textarea>' +
        '<div class="mini-grid">' +
          '<input data-field="shot" value="' + escAttr(n.shot || '') + '" placeholder="镜头（推近 / 俯拍 / 特写…）">' +
          '<input data-field="sound" value="' + escAttr(n.sound || '') + '" placeholder="音效 / 环境声（可选）">' +
        '</div>' + renderNote(n);
    }
    if (n.type === 'action') {
      return '<textarea class="main-text" data-field="text" data-main="1" rows="1" placeholder="动作：角色做了什么（推门、后退一步、把手机翻过来…）">' +
        esc(n.text) + '</textarea>' + renderNote(n);
    }
    if (n.type === 'os') {
      return '<textarea class="main-text" data-field="text" data-main="1" rows="1" placeholder="玩家内心 OS……">' +
        esc(n.text) + '</textarea>' + renderNote(n);
    }
    if (n.type === 'npc') {
      return '<div class="row">' +
          '<select data-field="speaker" aria-label="说话人">' + renderSpeakerOptions(ch, n.speaker) + '</select>' +
          '<input class="short" data-field="emotion" value="' + escAttr(n.emotion) + '" placeholder="情绪（可选）">' +
        '</div>' +
        '<div class="grid2">' +
          '<textarea data-field="zh" data-main="1" rows="1" placeholder="中文原意">' + esc(n.zh) + '</textarea>' +
          '<textarea data-field="en" rows="1" placeholder="English line">' + esc(n.en) + '</textarea>' +
        '</div>' + renderNote(n);
    }
    if (n.type === 'phone') {
      return '<div class="row">' +
          '<select data-field="speaker" aria-label="消息来自">' + renderSpeakerOptions(ch, n.speaker) + '</select>' +
        '</div>' +
        '<div class="grid2">' +
          '<textarea data-field="zh" data-main="1" rows="1" placeholder="屏幕上显示的中文">' + esc(n.zh) + '</textarea>' +
          '<textarea data-field="en" rows="1" placeholder="屏幕上的 English">' + esc(n.en) + '</textarea>' +
        '</div>' + renderNote(n);
    }
    if (n.type === 'say') {
      return '<textarea data-field="zh" data-main="1" class="main-text" rows="1" placeholder="玩家想说出口的话（中文原意）">' +
        esc(n.zh) + '</textarea>' +
        '<textarea data-field="en" rows="1" placeholder="参考译文 / 实际台词（English）" style="margin-top:6px">' +
        esc(n.en) + '</textarea>' +
        '<input data-field="intent" value="' + escAttr(n.intent) + '" placeholder="这句话想达成什么（可选）" style="margin-top:6px">' +
        renderNote(n);
    }
    if (n.type === 'choice') {
      return '<input data-field="intent" value="' + escAttr(n.intent) + '" placeholder="这个选择点在推进什么（可选）">' +
        '<div class="options">' +
        (n.options || []).map(function (o, i) {
          const letter = optionLetter(i);
          return '<div class="option" data-option-id="' + escAttr(o.id) + '">' +
              '<div class="option-head">' +
                '<span class="opt-letter">' + letter + '</span>' +
                '<span class="hint" style="margin:0">选项 ' + letter + '</span>' +
                '<button type="button" class="icon-btn danger" data-action="del-option" data-option-id="' +
                  escAttr(o.id) + '" title="删除选项">✕</button>' +
              '</div>' +
              '<textarea data-opt-field="zh" rows="1" placeholder="选项中文' +
                (i === 0 ? '（Shift+Enter 换行，Enter 开始写这条线）' : '') + '"' +
                (i === 0 ? ' data-main="1"' : '') + '>' + esc(o.zh) + '</textarea>' +
              '<input data-opt-field="en" value="' + escAttr(o.en) + '" placeholder="English（可选）" style="margin-top:6px">' +
              '<div class="branch">' +
                '<div class="branch-label">' + letter + ' 线</div>' +
                (o.nodes || []).map(function (child) { return renderNode(child, ch, 1); }).join('') +
                '<button type="button" class="add-inline" data-action="add-child" data-option-id="' +
                  escAttr(o.id) + '">＋ 在这条线下写</button>' +
              '</div>' +
            '</div>';
        }).join('') +
        '</div>' +
        '<button type="button" class="add-inline" data-action="add-option">＋ 选项</button>';
    }
    if (n.type === 'divider') {
      return '<div class="row">' +
          '<input data-field="title" data-main="1" value="' + escAttr(n.title) + '" placeholder="分隔线标题">' +
          '<input class="short" data-field="time" value="' + escAttr(n.time) + '" placeholder="时间（可选）">' +
        '</div>' +
        '<p class="scene-hint">游戏里的分隔线由换场自动生成；这里的节点原样导出成 divider，StoryView 目前不渲染 JSON 里的 divider。</p>';
    }
    if (n.type === 'scene') {
      const s = n.scene || makeScene();
      return '<p class="scene-lead">场景开头 = 新场景的第一张卡。场景名、地点、时间、场景台词和画面线索都写在这里；它下面的节点都属于这个场景，换场景时再插一张。</p>' +
        '<div class="row">' +
          '<input class="scene-title" data-scene-field="title" data-main="1" value="' + escAttr(s.title) +
            '" placeholder="场景名（Enter 新建旁白）">' +
          '<select data-scene-field="presentation" class="short" style="flex:0 0 120px">' +
            '<option value="chat"' + (s.presentation === 'chat' ? ' selected' : '') + '>消息流</option>' +
            '<option value="scene"' + (s.presentation === 'scene' ? ' selected' : '') + '>场景界面</option>' +
          '</select>' +
        '</div>' +
        '<div class="grid2">' +
          '<input data-scene-field="place" value="' + escAttr(s.place) + '" placeholder="地点">' +
          '<input data-scene-field="time" value="' + escAttr(s.time) + '" placeholder="时间">' +
        '</div>' +
        '<div class="grid2">' +
          '<textarea data-scene-field="caption" rows="2" placeholder="场景台词（恰好 4 行，每行一句）">' +
            esc(s.caption) + '</textarea>' +
          '<textarea data-scene-field="sight" rows="2" placeholder="画面 / 可见线索（每行一条）">' +
            esc(s.sight) + '</textarea>' +
        '</div>' +
        '<div class="grid2">' +
          '<textarea data-scene-field="sound" rows="2" placeholder="音效（每行一条）">' + esc(s.sound) + '</textarea>' +
          '<textarea data-scene-field="smell" rows="2" placeholder="气味（每行一条）">' + esc(s.smell) + '</textarea>' +
        '</div>' +
        '<p class="scene-hint">场景界面需要 4 行 caption；消息流可留空。这里的「画面线索」只描述这个场景的画面，和独立的「画面」节点不冲突。</p>';
    }
    if (n.type === 'event') {
      const ev = n.event || {};
      return '<div class="row">' +
          '<select data-event-field="kind" class="short" style="flex:0 0 130px">' +
            '<option value="clue"' + (ev.kind === 'clue' ? ' selected' : '') + '>线索卡</option>' +
            '<option value="relation"' + (ev.kind === 'relation' ? ' selected' : '') + '>关系卡</option>' +
          '</select>' +
          '<input data-event-field="meta" value="' + escAttr(ev.meta) + '" placeholder="meta / 标记（可选）">' +
        '</div>' +
        '<input data-event-field="title" data-main="1" value="' + escAttr(ev.title) + '" placeholder="卡片标题">' +
        '<textarea data-event-field="body" rows="2" placeholder="卡片正文" style="margin-top:6px">' +
          esc(ev.body) + '</textarea>';
    }
    return '';
  }

  function nodeSummary(n, ch) {
    if (n.type === 'scene') return (n.scene && n.scene.title) || '未命名场景';
    if (n.type === 'choice') {
      const text = (n.options || []).map(function (o) { return o.zh || o.en || ''; }).filter(Boolean).join(' / ');
      return text ? text.slice(0, 50) : '空选项';
    }
    if (n.type === 'npc' || n.type === 'phone') {
      return speakerName(ch, n.speaker) + '：' + (n.zh || n.en || '').slice(0, 36);
    }
    if (n.type === 'say') return (n.zh || n.en || '空台词').slice(0, 50);
    if (n.type === 'event') return (n.event && n.event.title) || '空卡片';
    return (n.text || '空').slice(0, 60);
  }

  function renderNode(n, ch, depth) {
    const collapsed = !!n.collapsed;
    const gateBadge = n.gate ? '<span class="badge-gate">门禁</span>' : '';
    return '<article class="node t-' + n.type + (collapsed ? ' is-collapsed' : '') + '" data-id="' + escAttr(n.id) +
      '" data-depth="' + (depth || 0) + '">' +
        '<div class="node-gutter">' +
          '<span class="drag" draggable="true" title="拖动排序（同一层内）">⋮⋮</span>' +
        '</div>' +
        '<div class="node-main">' +
          '<div class="node-head">' +
            '<button type="button" class="collapse" data-action="toggle-collapse" title="折叠 / 展开">' +
              (collapsed ? '▸' : '▾') + '</button>' +
            '<span class="type-chip">' + TYPE_LABEL[n.type] + '</span>' +
            gateBadge +
            '<select class="type-select" data-action="type-select" aria-label="节点类型">' +
              TYPE_ORDER.map(function (t) {
                return '<option value="' + t + '"' + (t === n.type ? ' selected' : '') + '>' +
                  TYPE_OPTION_LABEL[t] + '</option>';
              }).join('') +
            '</select>' +
            (collapsed ? '<span class="node-summary">' + esc(nodeSummary(n, ch)) + '</span>' : '') +
            '<div class="node-actions">' +
              '<button type="button" class="icon-btn" data-action="up" title="上移（Alt+↑）">↑</button>' +
              '<button type="button" class="icon-btn" data-action="down" title="下移（Alt+↓）">↓</button>' +
              '<button type="button" class="icon-btn" data-action="insert-after" title="在下面插入">＋</button>' +
              '<button type="button" class="icon-btn danger" data-action="delete" title="删除">✕</button>' +
            '</div>' +
          '</div>' +
          (collapsed ? '' : '<div class="node-fields">' + renderFields(n, ch) + '</div>') +
        '</div>' +
      '</article>';
  }

  function renderEditor(focusId) {
    const ch = activeChapter();
    const host = $('#editor');
    if (!host) return;
    host.innerHTML = ch.nodes.map(function (n) { return renderNode(n, ch, 0); }).join('') +
      '<button type="button" class="add-node" data-action="add-end">＋ 添加节点</button>';
    $$('textarea', host).forEach(grow);
    if (focusId) focusNode(focusId);
  }

  function grow(el) {
    if (!el || el.tagName !== 'TEXTAREA') return;
    el.style.height = 'auto';
    el.style.height = Math.min(Math.max(el.scrollHeight + 2, 34), 520) + 'px';
  }

  function focusNode(id, selector) {
    requestAnimationFrame(function () {
      const art = $('#editor .node[data-id="' + id + '"]');
      if (!art) return;
      const el = selector ? art.querySelector(selector) : art.querySelector('[data-main="1"]');
      const target = el || art.querySelector('textarea, input, select');
      if (!target) return;
      target.focus();
      if (target.tagName === 'TEXTAREA') {
        const len = target.value.length;
        try { target.setSelectionRange(len, len); } catch (err) { /* ignore */ }
      }
    });
  }

  /* ---------------- 编辑操作 ---------------- */

  function defaultNextType(node) {
    if (node.type === 'scene' || node.type === 'choice') return 'narration';
    return node.type;
  }

  function insertAfter(node) {
    const loc = locate(node.id);
    if (!loc) return;
    flushHistory();
    const nn = makeNode(defaultNextType(node));
    loc.list.splice(loc.index + 1, 0, nn);
    renderEditor(nn.id);
    renderPreview();
    scheduleSave();
    pushHistory();
  }

  function addChild(node, optionId) {
    if (!node || node.type !== 'choice') return;
    const opt = (node.options || []).find(function (o) { return o.id === optionId; }) || node.options[0];
    if (!opt) return;
    flushHistory();
    const nn = makeNode('narration');
    opt.nodes.push(nn);
    renderEditor(nn.id);
    renderPreview();
    scheduleSave();
    pushHistory();
  }

  function addEnd() {
    const ch = activeChapter();
    flushHistory();
    const nn = makeNode('narration');
    ch.nodes.push(nn);
    renderEditor(nn.id);
    renderPreview();
    scheduleSave();
    pushHistory();
  }

  function addOption(node) {
    if (!node || node.type !== 'choice') return;
    flushHistory();
    const opt = makeOption();
    node.options.push(opt);
    renderEditor(node.id);
    renderPreview();
    scheduleSave();
    focusNode(node.id, '.option[data-option-id="' + opt.id + '"] [data-opt-field="zh"]');
    pushHistory();
  }

  function deleteOption(node, optionId) {
    if (!node || node.type !== 'choice') return;
    if (node.options.length <= 1) {
      toast('至少保留一个选项');
      return;
    }
    flushHistory();
    node.options = node.options.filter(function (o) { return o.id !== optionId; });
    renderEditor(node.id);
    renderPreview();
    scheduleSave();
    pushHistory();
  }

  function deleteNode(node) {
    const loc = locate(node.id);
    if (!loc) return;
    if (node.type === 'choice' && node.options.some(function (o) { return o.nodes && o.nodes.length; })) {
      if (!window.confirm('删除这个分支节点，以及它下面挂的所有支线内容？')) return;
    }
    flushHistory();
    const prev = loc.list[loc.index - 1] || loc.list[loc.index + 1] || null;
    loc.list.splice(loc.index, 1);
    const parent = loc.parent;
    if (parent && (!parent.options || parent.options.every(function (o) { return !o.nodes.length; }))) {
      // 分支被清空时保留父节点即可
    }
    if (!activeChapter().nodes.length) {
      activeChapter().nodes.push(makeNode('narration'));
    }
    renderEditor();
    renderPreview();
    scheduleSave();
    pushHistory();
    if (prev) focusNode(prev.id);
    else if (parent) focusNode(parent.id);
  }

  function moveNode(node, delta) {
    const loc = locate(node.id);
    if (!loc) return;
    const target = loc.index + delta;
    if (target < 0 || target >= loc.list.length) return;
    flushHistory();
    loc.list.splice(loc.index, 1);
    loc.list.splice(target, 0, node);
    renderEditor(node.id);
    renderPreview();
    scheduleSave();
    pushHistory();
  }

  function primaryText(node) {
    switch (node.type) {
      case 'narration':
      case 'visual':
      case 'action':
      case 'os':
        return node.text || '';
      case 'npc':
      case 'phone':
      case 'say':
        return node.zh || '';
      case 'scene':
        return (node.scene && node.scene.title) || '';
      case 'event':
        return (node.event && node.event.title) || '';
      case 'choice':
        return (node.options && node.options[0] && node.options[0].zh) || '';
      default:
        return '';
    }
  }

  function changeType(node, next) {
    if (!TYPE_LABEL[next] || next === node.type) return;
    flushHistory();
    const prev = node.type;
    const oldText = primaryText(node);
    const textTypes = { narration: 1, visual: 1, action: 1, os: 1, npc: 1, phone: 1, say: 1 };
    const defaults = makeNode(next);
    Object.keys(defaults).forEach(function (k) {
      if (!(k in node)) node[k] = defaults[k];
    });
    node.type = next;
    if (next === 'scene') {
      node.scene = makeScene(node.scene || {});
      if (oldText && !node.scene.title) node.scene.title = oldText;
    } else if (next === 'event') {
      node.event = Object.assign({ kind: 'clue', title: '', body: '', meta: '' }, node.event || {});
      if (oldText && !node.event.title) node.event.title = oldText;
    } else if (next === 'choice') {
      if (!Array.isArray(node.options) || !node.options.length) {
        node.options = [makeOption(), makeOption()];
      }
      if (oldText && node.options[0] && !node.options[0].zh) node.options[0].zh = oldText;
    } else if (textTypes[next]) {
      // 文本类之间来回切换时，把最新写下的主文本带过去；旧字段仍保留在节点上，切回来不会丢。
      const targetField = (next === 'npc' || next === 'phone' || next === 'say') ? 'zh' : 'text';
      if (oldText && (textTypes[prev] || !node[targetField])) node[targetField] = oldText;
      if (next === 'npc' && !node.speaker) node.speaker = 'zhou_yan';
      if (next === 'phone' && !node.speaker) node.speaker = 'phone_voice';
    }
    node.collapsed = false;
    renderEditor(node.id);
    renderPreview();
    scheduleSave();
    pushHistory();
  }

  function cycleType(node, delta) {
    const index = TYPE_ORDER.indexOf(node.type);
    const next = TYPE_ORDER[(index + delta + TYPE_ORDER.length) % TYPE_ORDER.length];
    changeType(node, next);
  }

  /* ---------------- 编辑器事件 ---------------- */

  function nodeFromEvent(e) {
    const art = e.target.closest ? e.target.closest('.node') : null;
    if (!art) return null;
    return { art: art, node: findNode(art.dataset.id) };
  }

  function onInput(e) {
    const el = e.target;
    if (el.tagName === 'SELECT') return;
    const info = nodeFromEvent(e);
    if (!info || !info.node) return;
    const node = info.node;
    let handled = true;
    if (el.dataset.field) {
      node[el.dataset.field] = el.value;
    } else if (el.dataset.optField) {
      const optEl = el.closest('.option');
      const opt = (node.options || []).find(function (o) { return o.id === optEl.dataset.optionId; });
      if (opt) opt[el.dataset.optField] = el.value;
    } else if (el.dataset.sceneField) {
      node.scene[el.dataset.sceneField] = el.value;
    } else if (el.dataset.eventField) {
      node.event[el.dataset.eventField] = el.value;
    } else {
      handled = false;
    }
    if (!handled) return;
    grow(el);
    schedulePreview();
    scheduleSave();
    scheduleHistory();
  }

  function onChange(e) {
    const el = e.target;
    const info = nodeFromEvent(e);
    if (!info || !info.node) return;
    const node = info.node;
    if (el.dataset.action === 'type-select') {
      changeType(node, el.value);
      return;
    }
    if (el.dataset.field === 'speaker') {
      if (el.value === '__add') {
        openAddSpeaker(node);
        renderEditor();
        return;
      }
      node.speaker = el.value;
      schedulePreview();
      scheduleSave();
      pushHistory();
      return;
    }
    if (el.dataset.sceneField === 'presentation') {
      node.scene.presentation = el.value;
      schedulePreview();
      scheduleSave();
      pushHistory();
      return;
    }
    if (el.dataset.eventField === 'kind') {
      node.event.kind = el.value === 'relation' ? 'relation' : 'clue';
      schedulePreview();
      scheduleSave();
      pushHistory();
    }
  }

  function onKeydown(e) {
    const el = e.target;
    const info = nodeFromEvent(e);
    if (!info || !info.node) return;
    const node = info.node;
    if (el.tagName === 'SELECT') return;

    if (e.ctrlKey && e.altKey && String(e.key).toLowerCase() === 't') {
      e.preventDefault();
      cycleType(node, e.shiftKey ? -1 : 1);
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (el.dataset.optField) {
        e.preventDefault();
        addChild(node, el.closest('.option').dataset.optionId);
        return;
      }
      if (el.dataset.main === '1') {
        e.preventDefault();
        insertAfter(node);
        return;
      }
    }

    if (e.key === 'Backspace' && el.dataset.main === '1' && !el.dataset.optField &&
      node.type !== 'scene' && el.value === '' && !e.isComposing) {
      e.preventDefault();
      deleteNode(node);
      return;
    }

    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      moveNode(node, e.key === 'ArrowUp' ? -1 : 1);
    }
  }

  function onClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'type-select') return;
    const info = nodeFromEvent(e);
    if (!info || !info.node) {
      if (action === 'add-end') addEnd();
      return;
    }
    const node = info.node;
    if (action === 'toggle-collapse') {
      node.collapsed = !node.collapsed;
      renderEditor();
      scheduleSave();
    } else if (action === 'insert-after') {
      insertAfter(node);
    } else if (action === 'up') {
      moveNode(node, -1);
    } else if (action === 'down') {
      moveNode(node, 1);
    } else if (action === 'delete') {
      deleteNode(node);
    } else if (action === 'add-option') {
      addOption(node);
    } else if (action === 'del-option') {
      deleteOption(node, btn.dataset.optionId);
    } else if (action === 'add-child') {
      addChild(node, btn.dataset.optionId);
    } else if (action === 'add-end') {
      addEnd();
    }
  }

  function onFocusIn(e) {
    const art = e.target.closest ? e.target.closest('.node') : null;
    if (!art) return;
    if (!state.ui.autoLocate) return;
    const target = $('#preview').querySelector('[data-preview-id="' + art.dataset.id + '"]');
    if (!target) return;
    target.classList.add('is-hot');
    target.scrollIntoView({ block: 'center' });
    clearTimeout(hotTimer);
    hotTimer = setTimeout(function () { target.classList.remove('is-hot'); }, 1200);
  }

  /* ---------------- 拖动排序（同一层） ---------------- */

  function clearDropMarks() {
    $$('.node.drop-before, .node.drop-after', $('#editor')).forEach(function (el) {
      el.classList.remove('drop-before', 'drop-after');
    });
  }

  function onDragStart(e) {
    const handle = e.target.closest ? e.target.closest('.drag') : null;
    if (!handle) return;
    const art = handle.closest('.node');
    if (!art) return;
    dragId = art.dataset.id;
    art.classList.add('dragging');
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', dragId); } catch (err) { /* ignore */ }
    }
  }

  function onDragOver(e) {
    if (!dragId) return;
    const art = e.target.closest ? e.target.closest('.node') : null;
    if (!art || art.dataset.id === dragId) return;
    const src = locate(dragId);
    const dst = locate(art.dataset.id);
    if (!src || !dst || src.list !== dst.list) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    clearDropMarks();
    const rect = art.getBoundingClientRect();
    art.classList.add(e.clientY < rect.top + rect.height / 2 ? 'drop-before' : 'drop-after');
  }

  function onDragLeave(e) {
    const art = e.target.closest ? e.target.closest('.node') : null;
    if (!art) return;
    art.classList.remove('drop-before', 'drop-after');
  }

  function onDrop(e) {
    if (!dragId) return;
    const art = e.target.closest ? e.target.closest('.node') : null;
    if (!art) return;
    const targetId = art.dataset.id;
    if (targetId === dragId) return;
    const src = locate(dragId);
    const dst = locate(targetId);
    if (!src || !dst || src.list !== dst.list) return;
    e.preventDefault();
    flushHistory();
    const before = art.classList.contains('drop-before');
    const list = src.list;
    const moved = src.node;
    list.splice(src.index, 1);
    let insertAt = dst.index;
    if (src.index < dst.index) insertAt -= 1;
    if (!before) insertAt += 1;
    list.splice(insertAt, 0, moved);
    clearDropMarks();
    renderEditor(moved.id);
    renderPreview();
    scheduleSave();
    pushHistory();
  }

  function onDragEnd() {
    clearDropMarks();
    $$('.node.dragging', $('#editor')).forEach(function (el) { el.classList.remove('dragging'); });
    dragId = null;
  }

  /* ---------------- 手机预览 ---------------- */

  function previewEmpty() {
    return '<span class="pv-empty">（未填写）</span>';
  }

  function cueHtml(n) {
    const parts = [];
    if (n.shot) parts.push('镜头：' + n.shot);
    if (n.sound) parts.push('音效：' + n.sound);
    if (!parts.length) return '';
    return '<p class="pv-cue">' + parts.map(esc).join('　') + '</p>';
  }

  function renderPreviewScene(n) {
    const s = n.scene || makeScene();
    const caption = splitLines(s.caption);
    let html = '<div class="pv-divider pv-scene-start" data-preview-id="' + escAttr(n.id) + '">' +
      '<span><span class="pv-scene-tag">场景开头</span>' + esc(s.title || '未命名场景') + '</span>' +
      '<span>' + esc(s.time || '') + '</span>' +
      '</div>';
    if (s.place) html += '<div class="pv-sub">' + esc(s.place) + '</div>';
    if (s.presentation === 'scene' && caption.length) {
      html += '<div class="pv-stage">' + caption.map(function (line) {
        return '<p>' + esc(line) + '</p>';
      }).join('') + '</div>';
    }
    return html;
  }

  function speakerAvatarHtml(ch, id) {
    const sp = speakerEntry(ch, id);
    if (sp.avatar) {
      return '<img class="pv-avatar" src="' + escAttr(sp.avatar) + '" alt="">';
    }
    const initial = String(sp.displayName || '?').slice(0, 1);
    return '<span class="pv-avatar pv-avatar-letter" style="background:' + escAttr(sp.color) + '">' +
      esc(initial) + '</span>';
  }

  function renderPreviewNodes(nodes, ch) {
    return (nodes || []).map(function (n) {
      const pid = ' data-preview-id="' + escAttr(n.id) + '"';
      if (n.type === 'scene') return renderPreviewScene(n);
      if (n.type === 'narration') {
        return '<p class="pv-narration"' + pid + '>' + (n.text ? esc(n.text) : previewEmpty()) + '</p>' +
          cueHtml(n);
      }
      if (n.type === 'visual') {
        return '<p class="pv-visual"' + pid + '><span class="pv-tag">画面</span>' +
          (n.text ? esc(n.text) : previewEmpty()) + '</p>' + cueHtml(n);
      }
      if (n.type === 'action') {
        return '<p class="pv-action"' + pid + '><span class="pv-tag">动作</span>' +
          (n.text ? esc(n.text) : previewEmpty()) + '</p>';
      }
      if (n.type === 'os') {
        return '<p class="pv-narration pv-os"' + pid + '><span class="pv-tag">OS</span>' +
          (n.text ? esc(n.text) : previewEmpty()) + '</p>' + cueHtml(n);
      }
      if (n.type === 'npc') {
        const text = ch.dir === 'zh2en' ? (n.en || n.zh) : (n.zh || n.en);
        const sp = speakerEntry(ch, n.speaker);
        return '<div class="pv-npc"' + pid + ' style="--spk:' + escAttr(sp.color) + '">' +
          '<div class="pv-npc-head">' + speakerAvatarHtml(ch, n.speaker) +
            '<span class="pv-name">' + esc(sp.displayName) + '</span></div>' +
          '<p>' + (text ? esc(text) : previewEmpty()) + '</p>' +
          '</div>' + cueHtml(n);
      }
      if (n.type === 'phone') {
        const text = ch.dir === 'zh2en' ? (n.en || n.zh) : (n.zh || n.en);
        const sp = speakerEntry(ch, n.speaker);
        return '<div class="pv-phone"' + pid + ' style="--spk:' + escAttr(sp.color) + '">' +
          '<div class="pv-phone-head">' + speakerAvatarHtml(ch, n.speaker) + esc(sp.displayName) + '</div>' +
          '<p>' + (text ? esc(text) : previewEmpty()) + '</p>' +
          '</div>';
      }
      if (n.type === 'say') {
        const main = ch.dir === 'zh2en' ? (n.en || n.zh) : (n.zh || n.en);
        const sub = ch.dir === 'zh2en' ? n.zh : n.en;
        return '<div class="pv-me"' + pid + '>' +
          '<div class="pv-me-body">' +
            '<p class="pv-me-main">' + (main ? esc(main) : previewEmpty()) + '</p>' +
            (sub ? '<p class="pv-me-sub">' + esc(sub) + '</p>' : '') +
          '</div>' +
          '</div>';
      }
      if (n.type === 'choice') {
        const opts = n.options || [];
        const optHtml = opts.map(function (o, i) {
          const letter = optionLetter(i);
          return '<div class="pv-opt"><b>' + letter + '</b><span>' +
            (o.zh ? esc(o.zh) : previewEmpty()) +
            (o.en ? '<em>' + esc(o.en) + '</em>' : '') +
            '</span></div>';
        }).join('');
        const branchHtml = opts.map(function (o, i) {
          if (!o.nodes || !o.nodes.length) return '';
          return '<div class="pv-branch"><span class="pv-branch-label">' + optionLetter(i) + ' 线</span>' +
            renderPreviewNodes(o.nodes, ch) + '</div>';
        }).join('');
        return '<div class="pv-choice"' + pid + '>' + optHtml + branchHtml + '</div>';
      }
      if (n.type === 'divider') {
        return '<div class="pv-divider"' + pid + '>' +
          '<span>' + esc(n.title || '分隔线') + '</span>' +
          (n.time ? '<span>' + esc(n.time) + '</span>' : '') +
          '</div>';
      }
      if (n.type === 'event') {
        const ev = n.event || {};
        return '<div class="pv-card"' + pid + '>' +
          '<span class="pv-card-title">' + esc(ev.title || (ev.kind === 'relation' ? '关系卡' : '线索卡')) + '</span>' +
          (ev.body ? '<p class="pv-card-body">' + esc(ev.body) + '</p>' : '') +
          (ev.meta ? '<span class="pv-card-meta">' + esc(ev.meta) + '</span>' : '') +
          '</div>';
      }
      return '';
    }).join('');
  }

  function renderPreview() {
    const host = $('#preview');
    if (!host) return;
    const ch = activeChapter();
    let html = '<div class="pv-scene-head"><span>' + esc(ch.title || '未命名章节') + '</span><span>' +
      (ch.dir === 'en2zh' ? '英 → 中' : '中 → 英') + '</span></div>';
    if (!ch.nodes.length) {
      html += '<p class="pv-hint">左侧还没有内容。<br>按 Enter 新建一条，Ctrl+Alt+T 切换类型。</p>';
    } else {
      html += '<div class="pv-stream">' + renderPreviewNodes(ch.nodes, ch) + '</div>';
    }
    host.innerHTML = html;
  }

  /* ---------------- 导出 ---------------- */

  function groupScenes(ch) {
    const groups = [];
    ch.nodes.forEach(function (n) {
      if (n.type === 'scene') {
        groups.push({ scene: n, nodes: [] });
      } else {
        if (!groups.length) groups.push({ scene: null, nodes: [] });
        groups[groups.length - 1].nodes.push(n);
      }
    });
    if (!groups.length) groups.push({ scene: null, nodes: [] });
    return groups;
  }

  function parseCues(note) {
    let rest = String(note || '');
    let shot = '';
    let sound = '';
    rest = rest.replace(/(?:^|\n)\s*镜头[:：]\s*([^\n]*)/, function (_, v) {
      shot = v.trim();
      return '';
    });
    rest = rest.replace(/(?:^|\n)\s*音效[:：]\s*([^\n]*)/, function (_, v) {
      sound = v.trim();
      return '';
    });
    rest = rest.replace(/^\s*OS\s*[·:：]?\s*/i, '').trim();
    return { shot: shot, sound: sound, rest: rest };
  }

  function isKnownSpeaker(id) {
    if (knownSpeakerIds.ids) return knownSpeakerIds.ids.has(id);
    return DEFAULT_SPEAKERS.some(function (s) { return s.id === id; });
  }

  // 校验要以游戏真正读取的 speakers.json 为准，不能只看内置名单
  function loadSpeakers() {
    fetch('../../src/data/story/speakers.json')
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        const list = data && Array.isArray(data.speakers) ? data.speakers : null;
        if (!list || !list.length) return;
        knownSpeakerIds.ids = new Set(list.map(function (s) { return s.id; }).filter(Boolean));
      })
      .catch(function () { /* 打不开就沿用内置名单 */ });
  }

  function collectBeats(node, out, nextId, ch, warnings, usedSpeakers, topLevel) {
    if (node.type === 'narration') {
      const text = (node.text || '').trim();
      if (!text && !node.shot && !node.sound) return;
      const beat = { id: nextId(), kind: 'narration', text: text };
      const note = joinNotes(
        node.shot ? '镜头：' + node.shot : '',
        node.sound ? '音效：' + node.sound : '',
        node.note || ''
      );
      if (note) beat.beatNote = note;
      out.push(beat);
      return;
    }
    if (node.type === 'visual') {
      const text = (node.text || '').trim();
      if (!text && !node.shot && !node.sound) return;
      const beat = { id: nextId(), kind: 'narration', text: text };
      const note = joinNotes(
        '画面',
        node.shot ? '镜头：' + node.shot : '',
        node.sound ? '音效：' + node.sound : '',
        node.note || ''
      );
      if (note) beat.beatNote = note;
      out.push(beat);
      return;
    }
    if (node.type === 'action') {
      const text = (node.text || '').trim();
      if (!text) return;
      const beat = { id: nextId(), kind: 'narration', text: text };
      const note = joinNotes('动作', node.note || '');
      if (note) beat.beatNote = note;
      out.push(beat);
      return;
    }
    if (node.type === 'os') {
      const text = (node.text || '').trim();
      if (!text) return;
      const beat = { id: nextId(), kind: 'narration', text: text, beatNote: joinNotes('OS', node.note || '') };
      out.push(beat);
      return;
    }
    if (node.type === 'npc') {
      if (!node.zh && !node.en) {
        warnings.push('有一条角色对话是空的。');
        return;
      }
      if (!isKnownSpeaker(node.speaker)) {
        warnings.push('角色 id「' + node.speaker + '」不在 speakers.json 中，导出前需要补登，否则游戏读不到名字。');
      }
      usedSpeakers.add(node.speaker);
      const beat = {
        id: nextId(),
        kind: 'npc',
        speaker: node.speaker,
        text: { en: node.en || '', zh: node.zh || '' }
      };
      if (node.emotion) beat.emotion = node.emotion;
      if (node.note) beat.beatNote = node.note;
      out.push(beat);
      return;
    }
    if (node.type === 'phone') {
      if (!node.zh && !node.en) {
        warnings.push('有一条手机消息是空的。');
        return;
      }
      if (!isKnownSpeaker(node.speaker)) {
        warnings.push('角色 id「' + node.speaker + '」不在 speakers.json 中，导出前需要补登。');
      }
      usedSpeakers.add(node.speaker);
      const beat = {
        id: nextId(),
        kind: 'npc',
        speaker: node.speaker,
        text: { en: node.en || '', zh: node.zh || '' },
        beatNote: joinNotes('手机屏幕', node.note || '')
      };
      out.push(beat);
      return;
    }
    if (node.type === 'say') {
      if (!node.zh || !node.en) {
        warnings.push('有一句玩家台词缺少' + (!node.zh ? '中文' : '英文') + '，导出后对应槽位会是空的。');
      }
      const candidate = {
        id: 'a',
        zh: node.zh || '',
        en: node.en || '',
        required: Array.isArray(node.required) ? node.required : []
      };
      const beat = {
        id: nextId(),
        kind: 'player',
        dir: ch.dir,
        intent: node.intent || '',
        candidates: [candidate]
      };
      if (node.gate) beat.gate = node.gate;
      out.push(beat);
      return;
    }
    if (node.type === 'choice') {
      const opts = (node.options || []).filter(function (o) {
        return o.zh || o.en || (o.nodes && o.nodes.length);
      });
      if (!opts.length) {
        warnings.push('有一个分支节点还没有任何选项内容。');
        return;
      }
      if (opts.length > 3) {
        warnings.push('有一个分支写了 ' + opts.length + ' 个选项，schema 规定每回合最多 3 个候选。');
      }
      const candidates = opts.map(function (o, i) {
        const candidate = {
          id: i < 3 ? 'abc'[i] : 'o' + (i + 1),
          zh: o.zh || '',
          en: o.en || '',
          required: Array.isArray(o.required) ? o.required : []
        };
        if (o.accept) candidate.accept = o.accept;
        if (!o.zh && !o.en) warnings.push('分支里有空选项。');
        if (o.nodes && o.nodes.length) {
          const sub = [];
          o.nodes.forEach(function (child) {
            collectBeats(child, sub, nextId, ch, warnings, usedSpeakers, false);
          });
          if (sub.length) {
            candidate.branch = sub;
            warnings.push('分支「' + String(opts[0].zh || opts[0].en || '未命名').slice(0, 10) + '」的 ' +
              optionLetter(i) + ' 线写了 ' + sub.length + ' 条内容，只能落在 candidate.branch 里；' +
              'schema v1 没有这个字段，游戏端读不到，这条线在游戏里会消失。');
          }
        }
        return candidate;
      });
      const beat = {
        id: nextId(),
        kind: 'player',
        dir: ch.dir,
        intent: node.intent || '',
        candidates: candidates
      };
      if (node.gate) beat.gate = node.gate;
      out.push(beat);
      return;
    }
    if (node.type === 'event') {
      const ev = node.event || {};
      if (!ev.title && !ev.body) return;
      out.push({
        id: nextId(),
        kind: 'event',
        event: ev.kind === 'relation' ? 'relation' : 'clue',
        card: { title: ev.title || '', body: ev.body || '', meta: ev.meta || '' }
      });
      return;
    }
    if (node.type === 'divider') {
      const title = (node.title || '').trim();
      const time = (node.time || '').trim();
      if (!title && !time) return;
      out.push({ id: nextId(), kind: 'divider', title: title, time: time });
      return;
    }
    if (node.type === 'scene') {
      if (!topLevel) {
        warnings.push('分支内部的「场景开头」不会在 JSON 里生成新场景，只保留它下面的节点。');
      }
    }
  }

  function chapterToJson(ch) {
    const warnings = [];
    const errors = [];
    const usedSpeakers = new Set();
    if (!ch.nodes.length) warnings.push('本章还没有内容。');
    const groups = groupScenes(ch);
    const scenes = groups.map(function (g, i) {
      const s = g.scene ? (g.scene.scene || makeScene()) : makeScene();
      const title = (s.title || '').trim() || '场景 ' + (i + 1);
      const scene = {
        id: (ch.id || 'ch') + '_s' + (i + 1),
        index: i + 1,
        title: title,
        place: s.place || ch.place || '',
        time: s.time || ch.time || '',
        ambience: {
          sight: splitLines(s.sight),
          sound: splitLines(s.sound),
          smell: splitLines(s.smell)
        },
        presentation: s.presentation === 'scene' ? 'scene' : 'chat'
      };
      if (scene.presentation === 'scene') {
        scene.caption = splitLines(s.caption);
        if (scene.caption.length !== 4) {
          errors.push('「' + title + '」是场景界面，caption 必须恰好 4 行，现在是 ' + scene.caption.length + ' 行。');
        }
      }
      let counter = 0;
      const nextId = function () {
        counter += 1;
        return scene.id + '_' + String(counter).padStart(2, '0');
      };
      const beats = [];
      g.nodes.forEach(function (n) {
        collectBeats(n, beats, nextId, ch, warnings, usedSpeakers, true);
      });
      scene.beats = beats;
      const total = beats.length + (scene.caption ? scene.caption.length : 0);
      if (!beats.length) {
        errors.push('「' + title + '」没有任何消息节点，schema 规定每场至少 8 条（caption 计入）。');
      } else if (total < 8) {
        errors.push('「' + title + '」只有 ' + total + ' 条（caption+beats），schema 规定每场至少 8 条。');
      }
      if (total > 14) errors.push('「' + title + '」有 ' + total + ' 条（caption+beats），schema 规定每场最多 14 条。');
      return scene;
    });

    const casting = [];
    usedSpeakers.forEach(function (id) {
      if (casting.indexOf(id) === -1) casting.push(id);
    });

    // 硬门禁：同场最多 1 个，总数落在 gateBudget 内
    const hardScenes = [];
    scenes.forEach(function (s, i) {
      const hard = s.beats.filter(function (b) {
        return b.gate && b.gate.type === 'hard';
      }).length;
      if (hard > 1) {
        errors.push('「' + s.title + '」有 ' + hard + ' 个硬门禁，schema 规定同一场最多 1 个。');
      }
      if (hard) hardScenes.push(i);
    });
    const budget = ch.gateBudget || DEFAULT_GATE_BUDGET;
    const budgetMin = Number(budget.min) || 0;
    const budgetMax = Number(budget.max) || 0;
    if (hardScenes.length > budgetMax) {
      errors.push('本章有 ' + hardScenes.length + ' 个硬门禁，超出 gateBudget 上限 ' + budgetMax + '。');
    }
    if (hardScenes.length < budgetMin) {
      errors.push('本章只有 ' + hardScenes.length + ' 个硬门禁，低于 gateBudget 下限 ' + budgetMin + '。');
    }
    for (let i = 1; i < hardScenes.length; i += 1) {
      if (hardScenes[i] - hardScenes[i - 1] < 2) {
        warnings.push('「' + scenes[hardScenes[i - 1]].title + '」与「' + scenes[hardScenes[i]].title +
          '」的硬门禁挨在一起；建议中间隔一场，不影响导出。');
      }
    }

    const allBeats = scenes.reduce(function (acc, s) { return acc.concat(s.beats); }, []);
    allBeats.forEach(function (b) {
      if (b.gate && b.gate.type === 'hard' && (b.candidates || []).length !== 1) {
        errors.push('有一条硬门禁带了 ' + (b.candidates || []).length + ' 个候选，schema 规定硬门禁只有一个候选。');
      }
    });
    if (!allBeats.some(function (b) { return b.kind === 'event' && b.event === 'clue'; })) {
      errors.push('本章没有线索卡（event: clue），schema 规定每章至少一张。');
    }
    if (!allBeats.some(function (b) { return b.kind === 'event' && b.event === 'relation'; })) {
      errors.push('本章没有关系事件（event: relation），schema 规定每章至少一条。');
    }
    // 只有成功读到 speakers.json 才按它拦，避免打不开文件时误伤
    if (knownSpeakerIds.ids) {
      casting.forEach(function (id) {
        if (!knownSpeakerIds.ids.has(id)) {
          errors.push('角色 id「' + id + '」不在 src/data/story/speakers.json 中，游戏读不到名字。');
        }
      });
    }

    return {
      json: {
        id: ch.id,
        title: ch.title,
        dir: ch.dir,
        rating: Object.assign({}, ch.rating),
        warnings: (ch.warnings || []).slice(),
        gateBudget: Object.assign({}, ch.gateBudget),
        place: ch.place || '',
        time: ch.time || '',
        casting: casting,
        scenes: scenes
      },
      warnings: warnings,
      errors: errors
    };
  }

  function exportWithWarnings(text, filename, mime, warnings, note, errors) {
    if (errors && errors.length) {
      openModal(
        '<h2>这一章还不能交</h2>' +
        '<p class="hint">下面这些问题违反 src/data/story/schema.md，修好之前不能导出 JSON。</p>' +
        '<ul class="warn-list">' + errors.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul>' +
        '<div class="modal-actions">' +
          '<button type="button" class="primary" data-close>返回修改</button>' +
        '</div>'
      );
      return;
    }
    if (!warnings.length) {
      download(filename, text, mime);
      toast('已导出 ' + filename);
      return;
    }
    openModal(
      '<h2>导出前检查</h2>' +
      '<p class="hint">下面这些问题不阻止导出，但导入游戏前最好确认一下。</p>' +
      '<ul class="warn-list">' + warnings.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>' +
      (note ? '<p class="hint">' + esc(note) + '</p>' : '') +
      '<div class="modal-actions">' +
        '<button type="button" data-close>返回修改</button>' +
        '<button type="button" class="primary" id="forceExport">仍然导出</button>' +
      '</div>',
      function (root) {
        $('#forceExport', root).addEventListener('click', function () {
          closeModal();
          download(filename, text, mime);
          toast('已导出 ' + filename);
        });
      }
    );
  }

  function doExport(kind) {
    const ch = activeChapter();
    if (kind === 'json') {
      const result = chapterToJson(ch);
      exportWithWarnings(
        JSON.stringify(result.json, null, 2),
        safeName(ch.id || ch.title) + '.json',
        'application/json;charset=utf-8',
        result.warnings,
        '「分支选项」尚未接入：选项下面的内容只能写成 candidate.branch，schema v1 没有这个字段，游戏端读不到。',
        result.errors
      );
    } else {
      const result = chapterToMarkdown(ch);
      exportWithWarnings(
        result.text,
        safeName(ch.title || ch.id) + '.md',
        'text/markdown;charset=utf-8',
        result.warnings,
        ''
      );
    }
  }

  /* ---------------- Markdown 导出 ---------------- */

  function mdNode(node, ch, indent, lines, warnings) {
    const p = ' '.repeat(indent);
    const blank = function () { lines.push(''); };
    if (node.type === 'narration') {
      if (!node.text) return;
      lines.push(p + '【旁白】');
      lines.push(p + node.text);
      if (node.note) lines.push(p + '（备注：' + node.note + '）');
      blank();
      return;
    }
    if (node.type === 'visual') {
      if (!node.text && !node.shot && !node.sound) return;
      lines.push(p + '【画面】');
      if (node.text) lines.push(p + node.text);
      if (node.shot) lines.push(p + '（镜头：' + node.shot + '）');
      if (node.sound) lines.push(p + '（音效：' + node.sound + '）');
      if (node.note) lines.push(p + '（备注：' + node.note + '）');
      blank();
      return;
    }
    if (node.type === 'action') {
      if (!node.text) return;
      lines.push(p + '【动作】');
      lines.push(p + node.text);
      if (node.note) lines.push(p + '（备注：' + node.note + '）');
      blank();
      return;
    }
    if (node.type === 'os') {
      if (!node.text) return;
      lines.push(p + '【OS】');
      lines.push(p + node.text);
      if (node.note) lines.push(p + '（备注：' + node.note + '）');
      blank();
      return;
    }
    if (node.type === 'npc' || node.type === 'phone') {
      const name = speakerName(ch, node.speaker);
      lines.push(p + (node.type === 'phone' ? '【手机 · ' : '【角色 · ') + name + '】');
      if (node.en) lines.push(p + 'EN：' + node.en);
      if (node.zh) lines.push(p + 'ZH：' + node.zh);
      if (node.emotion) lines.push(p + '（情绪：' + node.emotion + '）');
      if (node.note) lines.push(p + '（备注：' + node.note + '）');
      blank();
      return;
    }
    if (node.type === 'say') {
      lines.push(p + '【玩家台词】');
      if (node.zh) lines.push(p + 'ZH：' + node.zh);
      if (node.en) lines.push(p + 'EN：' + node.en);
      if (node.intent) lines.push(p + '（意图：' + node.intent + '）');
      if (node.gate) lines.push(p + '（门禁：' + (node.gate.category || node.gate.type || '已设置') + '）');
      if (node.note) lines.push(p + '（备注：' + node.note + '）');
      blank();
      return;
    }
    if (node.type === 'choice') {
      const opts = node.options || [];
      if (!opts.length) return;
      lines.push(p + '【分支选项】');
      if (node.intent) lines.push(p + '（意图：' + node.intent + '）');
      if (node.gate) lines.push(p + '（门禁：' + (node.gate.category || node.gate.type || '已设置') + '）');
      opts.forEach(function (o, i) {
        const letter = optionLetter(i);
        lines.push(p + '- ' + letter + '. ' + (o.zh || '（空）'));
        if (o.en) lines.push(p + '  EN：' + o.en);
        if (o.nodes && o.nodes.length) {
          lines.push(p + '  ' + letter + ' 线：');
          o.nodes.forEach(function (child) {
            mdNode(child, ch, indent + 2, lines, warnings);
          });
        }
      });
      blank();
      return;
    }
    if (node.type === 'event') {
      const ev = node.event || {};
      if (!ev.title && !ev.body) return;
      lines.push(p + '【' + (ev.kind === 'relation' ? '关系卡' : '线索卡') + '】');
      if (ev.title) lines.push(p + '标题：' + ev.title);
      if (ev.body) lines.push(p + ev.body);
      if (ev.meta) lines.push(p + '（meta：' + ev.meta + '）');
      blank();
      return;
    }
    if (node.type === 'scene') {
      warnings.push('分支内部的「场景开头」在 Markdown 里只保留标题，不拆分结构。');
      lines.push(p + '【场景开头 · ' + ((node.scene && node.scene.title) || '未命名') + '】');
      blank();
    }
  }

  function chapterToMarkdown(ch) {
    const warnings = [];
    const lines = [];
    lines.push('# ' + (ch.title || '未命名章节'));
    lines.push('');
    lines.push('- 方向：' + (ch.dir === 'en2zh' ? '英 → 中' : '中 → 英'));
    if (ch.place) lines.push('- 地点：' + ch.place);
    if (ch.time) lines.push('- 时间：' + ch.time);
    lines.push('');

    if (!ch.nodes.length) warnings.push('本章还没有内容。');

    const groups = groupScenes(ch);
    groups.forEach(function (g, i) {
      const s = g.scene ? (g.scene.scene || makeScene()) : makeScene();
      const title = (s.title || '').trim() || '场景 ' + (i + 1);
      lines.push('---');
      lines.push('');
      lines.push('## ' + title);
      lines.push('');
      lines.push('- 呈现：' + (s.presentation === 'scene' ? '场景界面' : '消息流'));
      if (s.place || ch.place) lines.push('- 地点：' + (s.place || ch.place));
      if (s.time || ch.time) lines.push('- 时间：' + (s.time || ch.time));
      const caption = splitLines(s.caption);
      if (s.presentation === 'scene' && caption.length) {
        if (caption.length !== 4 && g.scene) {
          warnings.push('「' + title + '」是场景界面，caption 应为 4 行，现在是 ' + caption.length + ' 行。');
        }
        lines.push('');
        caption.forEach(function (line) { lines.push('> ' + line); });
      }
      if (splitLines(s.sight).length) {
        lines.push('');
        lines.push('**画面**');
        splitLines(s.sight).forEach(function (line) { lines.push('- ' + line); });
      }
      if (splitLines(s.sound).length) {
        lines.push('');
        lines.push('**音效**');
        splitLines(s.sound).forEach(function (line) { lines.push('- ' + line); });
      }
      if (splitLines(s.smell).length) {
        lines.push('');
        lines.push('**气味**');
        splitLines(s.smell).forEach(function (line) { lines.push('- ' + line); });
      }
      lines.push('');
      g.nodes.forEach(function (n) { mdNode(n, ch, 0, lines, warnings); });
    });

    return { text: lines.join('\n').replace(/\n{3,}/g, '\n\n'), warnings: warnings };
  }

  /* ---------------- 导入：JSON ---------------- */

  function beatToNode(beat) {
    if (!beat || typeof beat !== 'object') return null;
    if (beat.kind === 'divider') {
      return makeNode('divider', { title: beat.title || '', time: beat.time || '' });
    }
    if (beat.kind === 'narration') {
      const note = String(beat.beatNote || '');
      if (/(^|[^A-Za-z])OS([^A-Za-z]|$)/i.test(note) || /内心|独白/.test(note)) {
        const cues = parseCues(note);
        return makeNode('os', { text: beat.text || '', note: cues.rest || '' });
      }
      const cues = parseCues(note);
      return makeNode('narration', {
        text: beat.text || '',
        shot: cues.shot,
        sound: cues.sound,
        note: cues.rest || ''
      });
    }
    if (beat.kind === 'npc') {
      const note = String(beat.beatNote || '');
      const isPhone = /手机|屏幕|短信|消息/.test(note);
      const cues = parseCues(note.replace(/手机屏幕/g, '').replace(/手机|屏幕|短信|消息/g, ''));
      return makeNode(isPhone ? 'phone' : 'npc', {
        speaker: beat.speaker || (isPhone ? 'phone_voice' : 'zhou_yan'),
        zh: (beat.text && beat.text.zh) || '',
        en: (beat.text && beat.text.en) || '',
        emotion: beat.emotion || '',
        note: cues.rest || ''
      });
    }
    if (beat.kind === 'event') {
      const card = beat.card || {};
      return makeNode('event', {
        event: {
          kind: beat.event === 'relation' ? 'relation' : 'clue',
          title: card.title || '',
          body: card.body || '',
          meta: card.meta || ''
        }
      });
    }
    if (beat.kind === 'player') {
      const candidates = Array.isArray(beat.candidates) ? beat.candidates : [];
      if (candidates.length <= 1) {
        const c = candidates[0] || {};
        const node = makeNode('say', {
          zh: c.zh || '',
          en: c.en || '',
          intent: beat.intent || '',
          required: Array.isArray(c.required) ? c.required : []
        });
        if (beat.gate) node.gate = beat.gate;
        return node;
      }
      const node = makeNode('choice', {
        intent: beat.intent || '',
        gate: beat.gate || null,
        options: candidates.map(function (c) {
          const opt = makeOption({
            zh: c.zh || '',
            en: c.en || '',
            required: Array.isArray(c.required) ? c.required : []
          });
          if (c.accept) opt.accept = c.accept;
          const branches = c.branch || c.beats || c.children || [];
          opt.nodes = (Array.isArray(branches) ? branches : []).map(beatToNode).filter(Boolean);
          return opt;
        })
      });
      return node;
    }
    return null;
  }

  function chapterFromJson(raw, stats) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.scenes)) return null;
    const ch = makeChapter({
      id: uniqueChapterIdFor(raw.id || ''),
      title: raw.title || '未命名章节',
      dir: raw.dir === 'en2zh' ? 'en2zh' : 'zh2en',
      place: raw.place || '',
      time: raw.time || '',
      warnings: Array.isArray(raw.warnings) ? raw.warnings.slice() : [],
      rating: Object.assign({}, DEFAULT_RATING, raw.rating || {}),
      gateBudget: Object.assign({}, DEFAULT_GATE_BUDGET, raw.gateBudget || {}),
      customSpeakers: []
    });
    ch.nodes = [];
    raw.scenes.forEach(function (s, i) {
      const ambience = s.ambience || {};
      ch.nodes.push(makeNode('scene', {
        scene: makeScene({
          title: s.title || '场景 ' + (i + 1),
          place: s.place || '',
          time: s.time || '',
          presentation: s.presentation || 'chat',
          caption: Array.isArray(s.caption) ? s.caption.join('\n') : '',
          sight: Array.isArray(ambience.sight) ? ambience.sight.join('\n') : '',
          sound: Array.isArray(ambience.sound) ? ambience.sound.join('\n') : '',
          smell: Array.isArray(ambience.smell) ? ambience.smell.join('\n') : ''
        })
      }));
      (Array.isArray(s.beats) ? s.beats : []).forEach(function (beat) {
        const node = beatToNode(beat);
        if (node) {
          ch.nodes.push(node);
        } else if (stats) {
          const kind = String((beat && beat.kind) || '未知类型');
          stats.dropped[kind] = (stats.dropped[kind] || 0) + 1;
        }
      });
    });
    walkNodes(ch.nodes, function (n) {
      if ((n.type === 'npc' || n.type === 'phone') && n.speaker && !isKnownSpeaker(n.speaker) &&
        !ch.customSpeakers.some(function (s) { return s.id === n.speaker; })) {
        ch.customSpeakers.push({ id: n.speaker, displayName: n.speaker, color: hashColor(n.speaker), avatar: '' });
      }
    });
    return ch;
  }

  function droppedSummary(stats) {
    if (!stats || !stats.dropped) return '';
    const kinds = Object.keys(stats.dropped);
    if (!kinds.length) return '';
    const total = kinds.reduce(function (n, k) { return n + stats.dropped[k]; }, 0);
    return '；丢弃 ' + total + ' 条不支持的消息（' + kinds.map(function (k) {
      return k + ' × ' + stats.dropped[k];
    }).join('，') + '）';
  }

  function chapterFromNative(raw, keepId) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.nodes)) return null;
    const ch = makeChapter({
      id: keepId && raw.id ? String(raw.id) : uniqueChapterIdFor(raw.id || ''),
      title: raw.title || '未命名章节',
      dir: raw.dir === 'en2zh' ? 'en2zh' : 'zh2en',
      place: raw.place || '',
      time: raw.time || '',
      warnings: Array.isArray(raw.warnings) ? raw.warnings.slice() : [],
      rating: Object.assign({}, DEFAULT_RATING, raw.rating || {}),
      gateBudget: Object.assign({}, DEFAULT_GATE_BUDGET, raw.gateBudget || {}),
      customSpeakers: Array.isArray(raw.customSpeakers) ? raw.customSpeakers.slice() : [],
      speakerOverrides: (raw.speakerOverrides && typeof raw.speakerOverrides === 'object') ? raw.speakerOverrides : {},
      nodes: raw.nodes.map(normalizeNode).filter(Boolean)
    });
    return ch;
  }

  function importJsonChapters(data, stats) {
    let list = [];
    if (Array.isArray(data)) list = data;
    else if (data && Array.isArray(data.chapters)) list = data.chapters;
    else if (data && Array.isArray(data.scenes)) list = [data];
    else if (data && data.chapter && Array.isArray(data.chapter.scenes)) list = [data.chapter];
    if (!list.length && data && data.chapter && Array.isArray(data.chapter.nodes)) {
      return [chapterFromNative(data.chapter, false)].filter(Boolean);
    }
    return list.map(function (raw) {
      if (raw && Array.isArray(raw.nodes)) return chapterFromNative(raw, false);
      return chapterFromJson(raw, stats);
    }).filter(Boolean);
  }

  /* ---------------- 导入：草稿文本 ---------------- */

  function splitBilingual(value) {
    const text = String(value || '').trim();
    if (!text) return { zh: '', en: '' };
    const parts = text.split(/\s*(?:\|\||｜｜|｜|\t)\s*/);
    if (parts.length >= 2) {
      return { zh: parts[0].trim(), en: parts.slice(1).join(' ').trim() };
    }
    return { zh: text, en: '' };
  }

  function resolveSpeaker(ch, name) {
    const clean = String(name || '').trim();
    if (!clean) return ch.customSpeakers.length ? ch.customSpeakers[0].id : 'zhou_yan';
    const all = DEFAULT_SPEAKERS.concat(ch.customSpeakers);
    const found = all.find(function (s) { return s.id === clean || s.displayName === clean; });
    if (found) return found.id;
    let n = ch.customSpeakers.length + 1;
    let id = 'sp_' + n;
    while (all.some(function (s) { return s.id === id; })) {
      n += 1;
      id = 'sp_' + n;
    }
    ch.customSpeakers.push({ id: id, displayName: clean, color: hashColor(id), avatar: '' });
    return id;
  }

  function parsePhoneLine(rest, ch) {
    let body = String(rest || '').trim();
    let from = '';
    const m = body.match(/^([^：:]{1,10})[：:]\s*(.+)$/);
    if (m) {
      from = m[1].trim();
      body = m[2].trim();
    }
    const bi = splitBilingual(body);
    return {
      speaker: from ? resolveSpeaker(ch, from) : 'phone_voice',
      zh: bi.zh,
      en: bi.en
    };
  }

  function isCueLine(line) {
    return /^(?:EN|En|en|英文|English|镜头|音效|SFX|sfx)\s*[:：]/.test(line) || /^【/.test(line);
  }

  function parseDraftInto(text, ch) {
    const lines = String(text || '').replace(/\r/g, '').split('\n');
    let pending = null;
    let last = null;

    function push(node) {
      ch.nodes.push(node);
      last = node;
      pending = null;
      return node;
    }

    lines.forEach(function (raw) {
      const line = raw.trim();
      if (!line) return;

      if (pending) {
        if (!isCueLine(line)) {
          pending.text = joinSentence(pending.text, line);
          last = pending;
          pending = null;
          return;
        }
        pending = null;
      }

      const marker = line.match(/^【([^】]{1,16})】\s*(.*)$/);
      if (marker) {
        const label = marker[1].trim();
        const rest = marker[2].trim();
        if (/^(场景|旁白|情景)$/.test(label)) {
          const n = makeNode('narration', { text: rest });
          ch.nodes.push(n);
          last = n;
          pending = rest ? null : n;
          return;
        }
        if (/^(场景画面|画面|画面表现|视觉)$/.test(label)) {
          const n = makeNode('visual', { text: rest });
          ch.nodes.push(n);
          last = n;
          pending = rest ? null : n;
          return;
        }
        if (/^(动作|动作描写)$/.test(label)) {
          const n = makeNode('action', { text: rest });
          ch.nodes.push(n);
          last = n;
          pending = rest ? null : n;
          return;
        }
        if (/^(os|OS|内心|内心os|独白|心声)$/i.test(label)) {
          const n = makeNode('os', { text: rest });
          ch.nodes.push(n);
          last = n;
          pending = rest ? null : n;
          return;
        }
        if (/^(我|你|玩家)$/.test(label)) {
          const bi = splitBilingual(rest);
          push(makeNode('say', { zh: bi.zh, en: bi.en }));
          return;
        }
        if (/^(手机|短信|消息|微信|屏幕|手机屏幕)$/.test(label)) {
          const info = parsePhoneLine(rest, ch);
          push(makeNode('phone', { speaker: info.speaker, zh: info.zh, en: info.en }));
          return;
        }
        if (/^选项/.test(label)) {
          let choice = last && last.type === 'choice' ? last : null;
          if (!choice) {
            choice = makeNode('choice', { options: [] });
            ch.nodes.push(choice);
            last = choice;
          }
          const bi = splitBilingual(rest);
          if (rest) {
            choice.options.push(makeOption({ zh: bi.zh, en: bi.en }));
          }
          return;
        }
        if (/^(音效|SFX|sfx)$/i.test(label)) {
          if (last && (last.type === 'visual' || last.type === 'narration')) {
            last.sound = joinSentence(last.sound, rest);
          } else {
            push(makeNode('narration', { sound: rest }));
          }
          return;
        }
        if (/^(镜头)$/.test(label)) {
          if (last && (last.type === 'visual' || last.type === 'narration')) {
            last.shot = joinSentence(last.shot, rest);
          } else {
            push(makeNode('narration', { shot: rest }));
          }
          return;
        }
        const speaker = resolveSpeaker(ch, label);
        const bi = splitBilingual(rest);
        push(makeNode('npc', { speaker: speaker, zh: bi.zh, en: bi.en }));
        return;
      }

      let m;
      if ((m = line.match(/^(?:EN|En|en|英文|English)\s*[:：]\s*(.*)$/))) {
        if (last) {
          if (last.type === 'npc' || last.type === 'phone' || last.type === 'say') {
            last.en = m[1].trim();
          } else if (last.type === 'choice' && last.options.length) {
            last.options[last.options.length - 1].en = m[1].trim();
          } else if (last.type === 'narration') {
            last.note = joinSentence(last.note, m[1].trim());
          }
        }
        return;
      }
      if ((m = line.match(/^(?:镜头)\s*[:：]\s*(.*)$/))) {
        if (last && last.type === 'narration') last.shot = joinSentence(last.shot, m[1].trim());
        else push(makeNode('narration', { shot: m[1].trim() }));
        return;
      }
      if ((m = line.match(/^(?:音效|SFX|sfx)\s*[:：]\s*(.*)$/i))) {
        if (last && last.type === 'narration') last.sound = joinSentence(last.sound, m[1].trim());
        else push(makeNode('narration', { sound: m[1].trim() }));
        return;
      }

      if (last && last.type === 'choice') {
        const om = line.match(/^(?:[-*·]\s*|[A-Za-z][.、)]\s*|[①②③④⑤⑥]\s*|选项\s*[A-Za-z一二三四五六1-6][.、:：]?\s*)(.+)$/);
        if (om) {
          const bi = splitBilingual(om[1]);
          last.options.push(makeOption({ zh: bi.zh, en: bi.en }));
          return;
        }
      }

      const colon = line.match(/^([^：:]{1,10})[：:]\s*(.+)$/);
      if (colon) {
        const name = colon[1].trim();
        const body = colon[2].trim();
        if (/^(我|你|玩家)$/.test(name)) {
          const bi = splitBilingual(body);
          push(makeNode('say', { zh: bi.zh, en: bi.en }));
          return;
        }
        if (/^(旁白|画面|场景|镜头)$/.test(name)) {
          push(makeNode('narration', { text: body }));
          return;
        }
        if (/^(OS|os|内心|独白)$/.test(name)) {
          push(makeNode('os', { text: body }));
          return;
        }
        if (/^(音效|SFX)$/.test(name)) {
          push(makeNode('narration', { sound: body }));
          return;
        }
        const speaker = resolveSpeaker(ch, name);
        const bi = splitBilingual(body);
        push(makeNode('npc', { speaker: speaker, zh: bi.zh, en: bi.en }));
        return;
      }

      push(makeNode('narration', { text: line }));
    });
  }

  function analyzeDraft(text) {
    const ch = makeChapter();
    ch.nodes = [];
    parseDraftInto(text, ch);
    const counts = {};
    ch.nodes.forEach(function (n) { counts[n.type] = (counts[n.type] || 0) + 1; });
    const parts = Object.keys(counts).map(function (k) {
      return TYPE_LABEL[k] + ' ' + counts[k];
    }).join(' · ');
    return { total: ch.nodes.length, parts: parts, chapter: ch };
  }

  /* ---------------- 弹窗与章节设置 ---------------- */

  function openModal(html, mount) {
    const root = $('#modalRoot');
    root.innerHTML = '<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true">' +
      html + '</div></div>';
    root.hidden = false;
    const backdrop = $('.modal-backdrop', root);
    backdrop.addEventListener('mousedown', function (e) {
      if (e.target === backdrop) closeModal();
    });
    $$('[data-close]', root).forEach(function (btn) {
      btn.addEventListener('click', closeModal);
    });
    if (mount) mount(root);
  }

  function closeModal() {
    const root = $('#modalRoot');
    if (!root) return;
    root.hidden = true;
    root.innerHTML = '';
  }

  function nextChapterTitle() {
    return '新章节 ' + (state.chapters.length + 1);
  }

  function openChapterSettings() {
    const ch = activeChapter();
    const rating = ch.rating || DEFAULT_RATING;
    const budget = ch.gateBudget || DEFAULT_GATE_BUDGET;
    openModal(
      '<h2>章节设置</h2>' +
      '<div class="form-grid">' +
        '<label>章节标题<input id="chTitle" value="' + escAttr(ch.title) + '"></label>' +
        '<label>章节 id（导出文件名 / 数据 id）<input id="chId" value="' + escAttr(ch.id) + '"></label>' +
        '<label>翻译方向' +
          '<select id="chDir">' +
            '<option value="zh2en"' + (ch.dir === 'zh2en' ? ' selected' : '') + '>中 → 英</option>' +
            '<option value="en2zh"' + (ch.dir === 'en2zh' ? ' selected' : '') + '>英 → 中</option>' +
          '</select>' +
        '</label>' +
        '<label>章节地点（可选）<input id="chPlace" value="' + escAttr(ch.place || '') + '"></label>' +
        '<label>章节时间（可选）<input id="chTime" value="' + escAttr(ch.time || '') + '"></label>' +
        '<label>内容提示（逗号分隔）<input id="chWarnings" value="' + escAttr((ch.warnings || []).join(', ')) + '"></label>' +
      '</div>' +
      '<label>角色管理（预览按颜色区分；改名、改色会同步到所有历史节点）</label>' +
      '<div id="spList" class="sp-list">' +
        speakerList(ch).map(function (s) {
          return '<div class="sp-row" data-sp-builtin="' + (s.builtin ? '1' : '0') + '" data-sp-key="' + escAttr(s.id) + '">' +
            '<span class="sp-dot" style="background:' + escAttr(s.color) + '"></span>' +
            (s.builtin
              ? '<span class="sp-id" title="内置角色 id">' + esc(s.id) + '</span>'
              : '<input data-sp-id value="' + escAttr(s.id) + '" placeholder="id（英文）">') +
            '<input data-sp-name value="' + escAttr(s.displayName) + '" placeholder="显示名">' +
            '<input data-sp-color type="color" value="' + escAttr(s.color) + '" title="气泡颜色">' +
            '<input data-sp-avatar value="' + escAttr(s.avatar) + '" placeholder="头像 URL（可选）">' +
            '<button type="button" class="icon-btn danger" data-sp-del title="删除"' +
              (s.builtin ? ' disabled' : '') + '>✕</button>' +
            '</div>';
        }).join('') +
      '</div>' +
      '<button type="button" class="add-inline" id="spAdd">＋ 添加角色</button>' +
      '<details style="margin-top:14px">' +
        '<summary class="hint" style="cursor:pointer">分级与门禁预算（进阶）</summary>' +
        '<div class="form-grid" style="margin-top:8px">' +
          '<label>Horror<input id="rtHorror" value="' + escAttr(rating.horror) + '"></label>' +
          '<label>Nonhuman<input id="rtNonhuman" value="' + escAttr(rating.nonhuman) + '"></label>' +
          '<label>Intimacy<input id="rtIntimacy" value="' + escAttr(rating.intimacy) + '"></label>' +
          '<label>CG<input id="rtCg" value="' + escAttr(rating.cg) + '"></label>' +
          '<label>每章门禁下限<input id="gbMin" type="number" min="0" max="9" value="' + escAttr(budget.min) + '"></label>' +
          '<label>每章门禁上限<input id="gbMax" type="number" min="0" max="9" value="' + escAttr(budget.max) + '"></label>' +
        '</div>' +
      '</details>' +
      '<div class="modal-actions">' +
        '<button type="button" class="danger-btn" id="chDelete" style="margin-right:auto">删除本章</button>' +
        '<button type="button" data-close>取消</button>' +
        '<button type="button" class="primary" id="chSave">保存</button>' +
      '</div>',
      function (root) {
        const spList = $('#spList', root);
        spList.addEventListener('click', function (e) {
          const btn = e.target.closest('[data-sp-del]');
          if (btn) btn.closest('.sp-row').remove();
        });
        $('#spAdd', root).addEventListener('click', function () {
          const row = document.createElement('div');
          row.className = 'sp-row';
          row.setAttribute('data-sp-builtin', '0');
          row.innerHTML = '<span class="sp-dot" style="background:' + SPEAKER_COLORS[0] + '"></span>' +
            '<input data-sp-id placeholder="id（英文）">' +
            '<input data-sp-name placeholder="显示名">' +
            '<input data-sp-color type="color" value="' + SPEAKER_COLORS[0] + '" title="气泡颜色">' +
            '<input data-sp-avatar placeholder="头像 URL（可选）">' +
            '<button type="button" class="icon-btn danger" data-sp-del title="删除">✕</button>';
          spList.appendChild(row);
          row.querySelector('input').focus();
        });
        $('#chSave', root).addEventListener('click', function () {
          const id = $('#chId', root).value.trim();
          if (!id) {
            toast('章节 id 不能为空');
            return;
          }
          if (state.chapters.some(function (c) { return c.id === id && c !== ch; })) {
            toast('章节 id 已经存在');
            return;
          }
          const title = $('#chTitle', root).value.trim() || id;
          ch.id = id.replace(/\s+/g, '_');
          ch.title = title;
          ch.dir = $('#chDir', root).value === 'en2zh' ? 'en2zh' : 'zh2en';
          ch.place = $('#chPlace', root).value.trim();
          ch.time = $('#chTime', root).value.trim();
          ch.warnings = $('#chWarnings', root).value.split(/[,，]/).map(function (s) { return s.trim(); }).filter(Boolean);
          ch.rating = {
            horror: $('#rtHorror', root).value.trim(),
            nonhuman: $('#rtNonhuman', root).value.trim(),
            intimacy: $('#rtIntimacy', root).value.trim(),
            cg: $('#rtCg', root).value.trim()
          };
          ch.gateBudget = {
            min: Number($('#gbMin', root).value) || 0,
            max: Number($('#gbMax', root).value) || 0
          };
          const customs = [];
          const overrides = {};
          $$('.sp-row', spList).forEach(function (row) {
            const builtin = row.getAttribute('data-sp-builtin') === '1';
            const key = row.getAttribute('data-sp-key') || '';
            const idInput = $('[data-sp-id]', row);
            const id = (builtin ? key : (idInput ? idInput.value.trim() : key)).replace(/\s+/g, '_');
            if (!id) return;
            const name = $('[data-sp-name]', row).value.trim();
            const color = $('[data-sp-color]', row).value || hashColor(id);
            const avatar = $('[data-sp-avatar]', row).value.trim();
            if (builtin) {
              const base = DEFAULT_SPEAKERS.find(function (s) { return s.id === id; });
              const baseName = base ? base.displayName : id;
              const baseColor = (base && base.color) || hashColor(id);
              if (name !== baseName || color !== baseColor || avatar) {
                overrides[id] = { displayName: name || baseName, color: color, avatar: avatar };
              }
            } else {
              customs.push({ id: id, displayName: name || id, color: color, avatar: avatar });
            }
          });
          flushHistory();
          ch.customSpeakers = customs;
          ch.speakerOverrides = overrides;
          ch.updatedAt = Date.now();
          closeModal();
          renderChapterBar();
          renderEditor();
          renderPreview();
          saveNow();
          pushHistory();
          toast('章节设置已保存');
        });
        $('#chDelete', root).addEventListener('click', function () {
          if (state.chapters.length <= 1) {
            toast('至少保留一个章节');
            return;
          }
          if (!window.confirm('删除「' + ch.title + '」以及它所有内容？')) return;
          flushHistory();
          const index = state.chapters.indexOf(ch);
          state.chapters.splice(index, 1);
          state.activeId = state.chapters[Math.max(0, index - 1)].id;
          closeModal();
          renderAll(true);
          saveNow();
          pushHistory();
          toast('已删除章节');
        });
      }
    );
  }

  function openAddSpeaker(node) {
    openModal(
      '<h2>添加角色</h2>' +
      '<p class="hint">id 要写成英文，导出后在 speakers.json 里补登同样的 id 和显示名，游戏里才会显示正确名字。</p>' +
      '<div class="form-grid">' +
        '<label>显示名<input id="spName" placeholder="例如：陈迟"></label>' +
        '<label>角色 id<input id="spId" placeholder="例如：chen_chi"></label>' +
        '<label>气泡颜色<input id="spColor" type="color" value="' + SPEAKER_COLORS[0] + '"></label>' +
        '<label>头像 URL（可选）<input id="spAvatar" placeholder="https://…"></label>' +
      '</div>' +
      '<div class="modal-actions">' +
        '<button type="button" data-close>取消</button>' +
        '<button type="button" class="primary" id="spSave">添加</button>' +
      '</div>',
      function (root) {
        const nameEl = $('#spName', root);
        const idEl = $('#spId', root);
        nameEl.focus();
        $('#spSave', root).addEventListener('click', function () {
          const ch = activeChapter();
          let name = nameEl.value.trim();
          let id = idEl.value.trim().replace(/\s+/g, '_');
          if (!name && !id) {
            toast('先填写显示名或 id');
            return;
          }
          if (!id) {
            id = 'sp_' + (ch.customSpeakers.length + 1);
          }
          id = id.replace(/[^\w-]/g, '_');
          const all = DEFAULT_SPEAKERS.concat(ch.customSpeakers);
          if (all.some(function (s) { return s.id === id; })) {
            toast('这个角色 id 已经存在');
            return;
          }
          if (!name) name = id;
          flushHistory();
          ch.customSpeakers.push({
            id: id,
            displayName: name,
            color: $('#spColor', root).value || hashColor(id),
            avatar: $('#spAvatar', root).value.trim()
          });
          ch.updatedAt = Date.now();
          node.speaker = id;
          closeModal();
          renderEditor(node.id);
          renderPreview();
          saveNow();
          pushHistory();
          toast('已添加角色：' + name);
        });
      }
    );
  }

  function commitImported(list, message) {
    if (!list || !list.length) return;
    list.forEach(function (ch) {
      ch.id = uniqueChapterIdFor(ch.id);
      state.chapters.push(ch);
    });
    state.activeId = list[list.length - 1].id;
    closeModal();
    saveNow();
    renderAll(true);
    toast(message);
  }

  function openImport() {
    let mode = 'text';
    let parsedChapters = null;
    openModal(
      '<h2>导入</h2>' +
      '<div class="tabs">' +
        '<button type="button" class="tab on" data-tab="text">草稿文本</button>' +
        '<button type="button" class="tab" data-tab="json">剧本 JSON</button>' +
      '</div>' +
      '<div id="paneText">' +
        '<p class="hint">识别【旁白】【画面】【动作】【镜头】【os】【我】【角色名】标记；也支持「角色：台词」。「英文：…」会接到上一条台词。</p>' +
        '<textarea id="draftText" rows="10" placeholder="把草稿直接粘到这里……"></textarea>' +
        '<p class="hint" id="draftSummary">还没有识别到内容。</p>' +
      '</div>' +
      '<div id="paneJson" hidden>' +
        '<p class="hint">选择现有 ch01.json 一类的文件；支持单章、章节数组，或 { chapters: [...] }。导入后会新建章节，不会覆盖当前内容。</p>' +
        '<input type="file" id="jsonFile" accept=".json,application/json">' +
        '<p class="hint" id="jsonSummary">还没有选择文件。</p>' +
      '</div>' +
      '<div class="modal-actions">' +
        '<button type="button" data-close>取消</button>' +
        '<button type="button" class="primary" id="doImport">导入为新章节</button>' +
      '</div>',
      function (root) {
        const tabs = $$('.tab', root);
        tabs.forEach(function (tab) {
          tab.addEventListener('click', function () {
            mode = tab.dataset.tab;
            tabs.forEach(function (t) { t.classList.toggle('on', t === tab); });
            $('#paneText', root).hidden = mode !== 'text';
            $('#paneJson', root).hidden = mode !== 'json';
          });
        });

        const ta = $('#draftText', root);
        const summary = $('#draftSummary', root);
        let timer = null;
        ta.addEventListener('input', function () {
          clearTimeout(timer);
          timer = setTimeout(function () {
            const result = analyzeDraft(ta.value);
            summary.textContent = result.total
              ? '识别到 ' + result.total + ' 个节点：' + result.parts
              : '还没有识别到内容。';
          }, 150);
        });
        ta.addEventListener('paste', function () {
          setTimeout(function () { ta.dispatchEvent(new Event('input')); }, 0);
        });
        ta.focus();

        const fileInput = $('#jsonFile', root);
        fileInput.addEventListener('change', function () {
          const file = fileInput.files && fileInput.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = function () {
            try {
              const data = JSON.parse(String(reader.result));
              const stats = { dropped: {} };
              parsedChapters = importJsonChapters(data, stats);
              $('#jsonSummary', root).textContent = parsedChapters.length
                ? '识别到 ' + parsedChapters.length + ' 章：' + parsedChapters.map(function (c) { return c.title; }).join('、') + droppedSummary(stats)
                : '文件里没有找到 scenes。';
            } catch (err) {
              parsedChapters = null;
              $('#jsonSummary', root).textContent = 'JSON 解析失败：' + err.message;
            }
          };
          reader.readAsText(file, 'utf-8');
        });

        $('#doImport', root).addEventListener('click', function () {
          if (mode === 'text') {
            const text = ta.value;
            if (!text.trim()) {
              toast('先粘贴草稿文本');
              return;
            }
            const ch = makeChapter({ title: nextChapterTitle() });
            ch.nodes = [];
            parseDraftInto(text, ch);
            if (!ch.nodes.length) {
              toast('没有识别出内容');
              return;
            }
            normalizeChapter(ch);
            commitImported([ch], '已导入草稿（' + ch.nodes.length + ' 个节点）');
            return;
          }
          if (!parsedChapters || !parsedChapters.length) {
            toast('先选择一个可用的 JSON 文件');
            return;
          }
          parsedChapters.forEach(normalizeChapter);
          commitImported(parsedChapters, '已导入剧本');
        });
      }
    );
  }

  /* ---------------- 云端草稿（GitHub 私有仓库） ---------------- */

  function loadCloudCfg() {
    try {
      const raw = localStorage.getItem(CLOUD_KEY);
      if (raw) cloud.cfg = Object.assign({}, CLOUD_DEFAULT, JSON.parse(raw));
    } catch (err) {
      console.warn('[workbench] 读取云端设置失败', err);
    }
  }

  function saveCloudCfg() {
    try {
      localStorage.setItem(CLOUD_KEY, JSON.stringify(cloud.cfg));
    } catch (err) {
      console.warn('[workbench] 保存云端设置失败', err);
    }
  }

  function updateCloudState() {
    const el = $('#cloudState');
    if (!el) return;
    const on = !!(cloud.cfg.token && cloud.cfg.repo);
    el.textContent = on ? '云端：' + cloud.cfg.repo : '草稿仅本机';
    el.classList.toggle('on', on);
  }

  function b64Encode(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  function b64Decode(value) {
    const binary = atob(String(value || '').replace(/\s+/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  async function ghFetch(repoPath, method, body) {
    if (!cloud.cfg.token) throw new Error('还没有填写访问令牌');
    const res = await fetch('https://api.github.com' + repoPath, {
      method: method || 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: 'Bearer ' + cloud.cfg.token,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (err) { data = null; }
    if (!res.ok) {
      const error = new Error((data && data.message) || 'HTTP ' + res.status);
      error.status = res.status;
      throw error;
    }
    return data;
  }

  function cloudDirPath() {
    return String(cloud.cfg.dir || 'drafts').split('/').filter(Boolean).map(encodeURIComponent).join('/');
  }

  function cloudContentUrl(file) {
    return '/repos/' + cloud.cfg.repo + '/contents/' + cloudDirPath() +
      (file ? '/' + encodeURIComponent(file) : '');
  }

  async function readCloudRaw(file) {
    const data = await ghFetch(cloudContentUrl(file) + '?ref=' + encodeURIComponent(cloud.cfg.branch));
    return JSON.parse(b64Decode(data.content || ''));
  }

  async function refreshCloudList() {
    try {
      const data = await ghFetch(cloudContentUrl('') + '?ref=' + encodeURIComponent(cloud.cfg.branch));
      cloud.files = Array.isArray(data)
        ? data.filter(function (f) {
            return f.type === 'file' && /\.json$/i.test(f.name) && f.name !== 'index.json';
          })
        : [];
    } catch (err) {
      if (err.status === 404) {
        cloud.files = [];
      } else {
        cloud.files = null;
        throw err;
      }
    }
    return cloud.files;
  }

  async function buildManifestFromFiles() {
    const entries = [];
    const files = cloud.files || [];
    for (let i = 0; i < files.length; i += 1) {
      const f = files[i];
      try {
        const raw = await readCloudRaw(f.name);
        const ch = raw && raw.chapter ? raw.chapter : raw;
        if (ch && Array.isArray(ch.nodes)) {
          entries.push({
            id: ch.id,
            file: f.name,
            title: ch.title || ch.id,
            updatedAt: Number(ch.updatedAt) || 0
          });
        }
      } catch (err) {
        console.warn('[workbench] 读取云端草稿失败', f.name, err);
      }
    }
    return entries;
  }

  async function fetchCloudManifest(force) {
    if (cloud.manifest && !force) return cloud.manifest;
    try {
      const data = await ghFetch(cloudContentUrl('index.json') + '?ref=' + encodeURIComponent(cloud.cfg.branch));
      const obj = JSON.parse(b64Decode(data.content || ''));
      cloud.manifest = Array.isArray(obj.chapters)
        ? obj.chapters.filter(function (e) { return e && e.id && e.file; })
        : [];
    } catch (err) {
      if (err.status !== 404) throw err;
      cloud.manifest = await buildManifestFromFiles();
    }
    return cloud.manifest;
  }

  async function writeCloudManifest() {
    const payload = {
      app: 'story-workbench',
      version: 1,
      updatedAt: new Date().toISOString(),
      chapters: (cloud.manifest || []).slice().sort(function (a, b) {
        return (b.updatedAt || 0) - (a.updatedAt || 0);
      })
    };
    const url = cloudContentUrl('index.json');
    let sha = null;
    try {
      const current = await ghFetch(url + '?ref=' + encodeURIComponent(cloud.cfg.branch));
      sha = current.sha;
    } catch (err) {
      if (err.status !== 404) throw err;
    }
    const body = {
      message: 'workbench: index ' + new Date().toISOString(),
      content: b64Encode(JSON.stringify(payload, null, 2)),
      branch: cloud.cfg.branch
    };
    if (sha) body.sha = sha;
    try {
      await ghFetch(url, 'PUT', body);
    } catch (err) {
      if (err.status !== 409) throw err;
      const current = await ghFetch(url + '?ref=' + encodeURIComponent(cloud.cfg.branch));
      body.sha = current.sha;
      await ghFetch(url, 'PUT', body);
    }
  }

  function upsertManifest(ch, file) {
    if (!Array.isArray(cloud.manifest)) cloud.manifest = [];
    const entry = {
      id: ch.id,
      file: file,
      title: ch.title || ch.id,
      updatedAt: Number(ch.updatedAt) || Date.now()
    };
    const index = cloud.manifest.findIndex(function (e) { return e.id === ch.id; });
    if (index >= 0) cloud.manifest[index] = entry;
    else cloud.manifest.push(entry);
  }

  function computeSyncPlan(entries) {
    const localById = Object.create(null);
    state.chapters.forEach(function (c) { localById[c.id] = c; });
    const cloudIds = Object.create(null);
    const onlyCloud = [];
    const conflicts = [];
    (entries || []).forEach(function (entry) {
      cloudIds[entry.id] = true;
      const local = localById[entry.id];
      if (!local) {
        onlyCloud.push(entry);
      } else if ((Number(local.updatedAt) || 0) !== (Number(entry.updatedAt) || 0)) {
        conflicts.push({ cloud: entry, local: local });
      }
    });
    const onlyLocal = state.chapters.filter(function (c) { return !cloudIds[c.id]; });
    return { onlyCloud: onlyCloud, onlyLocal: onlyLocal, conflicts: conflicts };
  }

  function renderCloudList(root) {
    const box = $('#clList', root);
    if (!box) return;
    if (cloud.files === null) {
      box.innerHTML = '<p class="hint" style="padding:8px 10px;margin:0">还没有连接。填好仓库和令牌后点「连接」。</p>';
      return;
    }
    if (!cloud.files.length) {
      box.innerHTML = '<p class="hint" style="padding:8px 10px;margin:0">云端还没有草稿。点「保存当前章节」就会创建第一份。</p>';
      return;
    }
    const manifest = cloud.manifest || [];
    box.innerHTML = cloud.files.map(function (f) {
      const entry = manifest.find(function (e) { return e.file === f.name; });
      const label = entry ? entry.title : f.name.replace(/\.json$/i, '');
      const stamp = entry ? fmtStamp(entry.updatedAt) : Math.max(1, Math.round((f.size || 0) / 1024)) + ' KB';
      return '<div class="cloud-row">' +
        '<span class="cloud-name">' + esc(label) + '</span>' +
        '<span class="cloud-meta">' + esc(stamp) + '</span>' +
        '<button type="button" data-cloud-load="' + escAttr(f.name) + '">载入</button>' +
        '</div>';
    }).join('');
  }

  function renderSyncPlan(root) {
    const box = $('#clSync', root);
    if (!box) return;
    const note = $('#syncNote', root);
    if (cloud.files === null && !cloud.manifest) {
      box.innerHTML = '<p class="sync-note">还没连接。填好仓库和令牌后点「连接」。</p>';
      return;
    }
    const plan = computeSyncPlan(cloud.manifest || []);
    const parts = [];
    plan.onlyCloud.forEach(function (entry) {
      parts.push('<div class="sync-row">' +
        '<span class="sync-tag">仅在云端</span>' +
        '<span class="sync-name">' + esc(entry.title || entry.id) + '</span>' +
        '<span class="sync-time">' + esc(fmtStamp(entry.updatedAt)) + '</span>' +
        '<button type="button" data-sync-pull="' + escAttr(entry.file) + '">下载到本机</button>' +
        '<button type="button" data-sync-del="' + escAttr(entry.id) + '">删除云端</button>' +
        '</div>');
    });
    plan.conflicts.forEach(function (pair) {
      const localTime = Number(pair.local.updatedAt) || 0;
      const cloudTime = Number(pair.cloud.updatedAt) || 0;
      parts.push('<div class="sync-row">' +
        '<span class="sync-tag">同名不同内容</span>' +
        '<span class="sync-name">' + esc(pair.local.title || pair.cloud.title || pair.cloud.id) + '</span>' +
        '<span class="sync-time">本机 ' + esc(fmtStamp(localTime)) + ' · 云端 ' + esc(fmtStamp(cloudTime)) +
          (cloudTime > localTime ? '（云端较新）' : '（本机较新）') + '</span>' +
        '<button type="button" data-sync-upload="' + escAttr(pair.local.id) + '">本机覆盖云端</button>' +
        '<button type="button" data-sync-download="' + escAttr(pair.cloud.file) + '">云端覆盖本机</button>' +
        '</div>');
    });
    plan.onlyLocal.forEach(function (ch) {
      parts.push('<div class="sync-row">' +
        '<span class="sync-tag">仅在本机</span>' +
        '<span class="sync-name">' + esc(ch.title || ch.id) + '</span>' +
        '<span class="sync-time">' + esc(fmtStamp(ch.updatedAt)) + '</span>' +
        '<button type="button" data-sync-push="' + escAttr(ch.id) + '">上传到云端</button>' +
        '</div>');
    });
    box.innerHTML = parts.length
      ? parts.join('')
      : '<p class="sync-note">云端与本机一致，没有需要处理的差异。</p>';
    if (note) {
      note.textContent = '云端有 ' + plan.onlyCloud.length + ' 章本机没有（默认保留，可下载或删除）；' +
        plan.conflicts.length + ' 章同名但内容不同；' +
        plan.onlyLocal.length + ' 章仅在本机。';
    }
  }

  function applyNativeChapter(raw, force) {
    const existing = raw.id
      ? state.chapters.find(function (c) { return c.id === raw.id; })
      : null;
    if (existing && !force &&
      !window.confirm('本机已有「' + (existing.title || existing.id) + '」，用云端版本覆盖它吗？\n\n本机版本会被替换，不能撤销。')) {
      return false;
    }
    const ch = chapterFromNative(raw, !!existing);
    if (!ch) return false;
    normalizeChapter(ch);
    if (existing) {
      state.chapters[state.chapters.indexOf(existing)] = ch;
    } else {
      state.chapters.push(ch);
    }
    state.activeId = ch.id;
    saveNow();
    renderAll(true);
    return true;
  }

  async function loadCloudFile(name) {
    const raw = await readCloudRaw(name);
    if (raw && raw.chapter && Array.isArray(raw.chapter.nodes)) return applyNativeChapter(raw.chapter);
    if (raw && Array.isArray(raw.nodes)) return applyNativeChapter(raw);
    if (raw && Array.isArray(raw.scenes)) {
      const ch = chapterFromJson(raw);
      if (!ch) throw new Error('文件里没有可用的章节');
      normalizeChapter(ch);
      state.chapters.push(ch);
      state.activeId = ch.id;
      saveNow();
      renderAll(true);
      return true;
    }
    throw new Error('不是工作台草稿');
  }

  async function saveCloudChapter(ch, skipManifest) {
    const file = safeName(ch.id || ch.title) + '.json';
    const url = cloudContentUrl(file);
    const payload = {
      app: 'story-workbench',
      version: 1,
      savedAt: new Date().toISOString(),
      chapter: ch
    };
    let sha = null;
    try {
      const current = await ghFetch(url + '?ref=' + encodeURIComponent(cloud.cfg.branch));
      sha = current.sha;
    } catch (err) {
      if (err.status !== 404) throw err;
    }
    const body = {
      message: 'workbench: ' + (ch.id || 'chapter') + ' ' + new Date().toISOString(),
      content: b64Encode(JSON.stringify(payload, null, 2)),
      branch: cloud.cfg.branch
    };
    if (sha) body.sha = sha;
    try {
      await ghFetch(url, 'PUT', body);
    } catch (err) {
      if (err.status !== 409) throw err;
      const current = await ghFetch(url + '?ref=' + encodeURIComponent(cloud.cfg.branch));
      if (!window.confirm('云端这份在别处改过。用本机版本覆盖吗？')) throw new Error('已取消覆盖');
      body.sha = current.sha;
      await ghFetch(url, 'PUT', body);
    }
    upsertManifest(ch, file);
    if (!skipManifest) await writeCloudManifest();
    return file;
  }

  async function deleteCloudEntry(entry) {
    if (!window.confirm('从云端删除「' + (entry.title || entry.id) + '」？\n\n本机副本不受影响。删除后不能撤销。')) {
      return false;
    }
    const url = cloudContentUrl(entry.file);
    const current = await ghFetch(url + '?ref=' + encodeURIComponent(cloud.cfg.branch));
    await ghFetch(url, 'DELETE', {
      message: 'workbench: delete ' + entry.id,
      sha: current.sha,
      branch: cloud.cfg.branch
    });
    cloud.manifest = (cloud.manifest || []).filter(function (e) { return e.id !== entry.id; });
    await writeCloudManifest();
    await refreshCloudList();
    if (cloud.files === null) cloud.files = [];
    return true;
  }

  async function restoreAllFromCloud(root, msg) {
    await refreshCloudList();
    const entries = await fetchCloudManifest(true);
    if (!entries.length) {
      msg.textContent = '云端没有可恢复的章节。';
      return;
    }
    const localIds = Object.create(null);
    state.chapters.forEach(function (c) { localIds[c.id] = true; });
    const overwriteCount = entries.filter(function (e) { return localIds[e.id]; }).length;
    if (overwriteCount &&
      !window.confirm('有 ' + overwriteCount + ' 章与本机同名，会用云端版本覆盖它们（不能撤销）。\n\n继续恢复 ' + entries.length + ' 章？')) {
      return;
    }
    let done = 0;
    let failed = 0;
    let lastId = '';
    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i];
      msg.textContent = '恢复 ' + (i + 1) + ' / ' + entries.length + '…';
      try {
        const raw = await readCloudRaw(entry.file);
        const ch = chapterFromNative(raw.chapter || raw, true);
        if (!ch) throw new Error('格式不对');
        normalizeChapter(ch);
        const index = state.chapters.findIndex(function (c) { return c.id === ch.id; });
        if (index >= 0) state.chapters[index] = ch;
        else state.chapters.push(ch);
        lastId = ch.id;
        done += 1;
      } catch (err) {
        console.warn('[workbench] 恢复失败', entry.file, err);
        failed += 1;
      }
    }
    if (lastId) state.activeId = lastId;
    saveNow();
    renderAll(true);
    msg.textContent = '已恢复 ' + done + ' 章' + (failed ? '，' + failed + ' 章失败' : '') + '。';
  }

  function exportBackup() {
    const stamp = new Date().toISOString().slice(0, 10);
    download(
      'story-workbench-backup-' + stamp + '.json',
      JSON.stringify({
        app: 'story-workbench',
        version: 1,
        savedAt: new Date().toISOString(),
        chapters: state.chapters
      }, null, 2),
      'application/json;charset=utf-8'
    );
    toast('已导出全部 ' + state.chapters.length + ' 章');
  }

  function openCloud() {
    const cfg = cloud.cfg;
    openModal(
      '<h2>云端草稿</h2>' +
      '<p class="hint">保存只上传，不会删除云端任何文件。删除只在本机生效；云端副本要在下面「同步检查」里单独确认删除。</p>' +
      '<div class="form-grid">' +
        '<label>仓库（owner/repo）<input id="clRepo" value="' + escAttr(cfg.repo) + '" placeholder="lynn-hub123/interpret"></label>' +
        '<label>分支<input id="clBranch" value="' + escAttr(cfg.branch) + '" placeholder="master"></label>' +
        '<label style="grid-column:1/-1">访问令牌（只存在本机浏览器）' +
          '<input id="clToken" type="password" value="' + escAttr(cfg.token) + '" placeholder="github_pat_...">' +
        '</label>' +
      '</div>' +
      '<div class="cloud-bar">' +
        '<button type="button" id="clConnect">连接 / 刷新列表</button>' +
        '<button type="button" id="clClear">清除令牌</button>' +
        '<span class="hint" id="clMsg">' + (cloud.files === null ? '未连接。' : (cloud.files.length ? '云端 ' + cloud.files.length + ' 份草稿。' : '已连接，暂无草稿。')) + '</span>' +
      '</div>' +
      '<h3 class="sync-title">同步检查</h3>' +
      '<p class="sync-note" id="syncNote">连接后这里会列出本机与云端的差异。云端多出来的章节默认保留，不会自动删除。</p>' +
      '<div id="clSync"></div>' +
      '<h3 class="sync-title">云端文件</h3>' +
      '<div class="cloud-list" id="clList"></div>' +
      '<div class="modal-actions">' +
        '<button type="button" id="clBackup" style="margin-right:auto">导出全部备份</button>' +
        '<button type="button" id="clRestoreAll">全部恢复到本机</button>' +
        '<button type="button" id="clSaveAll">全部保存到云端</button>' +
        '<button type="button" class="primary" id="clSave">保存当前章节</button>' +
        '<button type="button" data-close>关闭</button>' +
      '</div>',
      function (root) {
        const msg = $('#clMsg', root);

        async function refreshAll() {
          await refreshCloudList();
          await fetchCloudManifest(true);
          renderCloudList(root);
          renderSyncPlan(root);
        }

        renderCloudList(root);
        renderSyncPlan(root);

        function readForm() {
          cloud.cfg.repo = $('#clRepo', root).value.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '');
          cloud.cfg.branch = $('#clBranch', root).value.trim() || 'main';
          cloud.cfg.token = $('#clToken', root).value.trim();
          saveCloudCfg();
          updateCloudState();
        }

        $('#clConnect', root).addEventListener('click', async function () {
          readForm();
          if (!cloud.cfg.repo || !cloud.cfg.token) {
            msg.textContent = '仓库和令牌都要填。';
            return;
          }
          msg.textContent = '连接中…';
          try {
            const repo = await ghFetch('/repos/' + cloud.cfg.repo);
            if (!cloud.cfg.branch && repo && repo.default_branch) {
              cloud.cfg.branch = repo.default_branch;
              $('#clBranch', root).value = cloud.cfg.branch;
              saveCloudCfg();
            }
            await refreshAll();
            msg.textContent = cloud.files.length ? '已连接，云端 ' + cloud.files.length + ' 份草稿。' : '已连接，云端还没有草稿。';
          } catch (err) {
            msg.textContent = '连接失败：' + err.message;
          }
        });

        $('#clClear', root).addEventListener('click', function () {
          cloud.cfg.token = '';
          $('#clToken', root).value = '';
          saveCloudCfg();
          updateCloudState();
          msg.textContent = '令牌已从本机清除。';
        });

        $('#clSync', root).addEventListener('click', async function (e) {
          const btn = e.target.closest('button');
          if (!btn) return;
          btn.disabled = true;
          try {
            if (btn.hasAttribute('data-sync-pull')) {
              msg.textContent = '下载中…';
              await loadCloudFile(btn.getAttribute('data-sync-pull'));
              msg.textContent = '已下载到本机。';
              toast('已下载到本机');
            } else if (btn.hasAttribute('data-sync-del')) {
              const id = btn.getAttribute('data-sync-del');
              const entry = (cloud.manifest || []).find(function (x) { return x.id === id; });
              if (entry && await deleteCloudEntry(entry)) {
                msg.textContent = '已从云端删除「' + (entry.title || entry.id) + '」。';
                toast('已删除云端副本');
              } else {
                msg.textContent = '已取消删除。';
              }
            } else if (btn.hasAttribute('data-sync-push')) {
              const ch = state.chapters.find(function (c) { return c.id === btn.getAttribute('data-sync-push'); });
              if (ch) {
                msg.textContent = '上传中…';
                await saveCloudChapter(ch, true);
                await writeCloudManifest();
                msg.textContent = '已上传「' + (ch.title || ch.id) + '」。';
              }
            } else if (btn.hasAttribute('data-sync-upload')) {
              const ch = state.chapters.find(function (c) { return c.id === btn.getAttribute('data-sync-upload'); });
              if (ch && window.confirm('用本机「' + (ch.title || ch.id) + '」覆盖云端版本？\n\n云端这份会被替换，不能撤销。')) {
                msg.textContent = '上传中…';
                await saveCloudChapter(ch, true);
                await writeCloudManifest();
                msg.textContent = '已用本机版本覆盖云端。';
              } else {
                msg.textContent = '已取消覆盖。';
              }
            } else if (btn.hasAttribute('data-sync-download')) {
              msg.textContent = '下载中…';
              if (await loadCloudFile(btn.getAttribute('data-sync-download'))) {
                msg.textContent = '已用云端版本覆盖本机。';
              } else {
                msg.textContent = '已取消覆盖。';
              }
            }
            await refreshAll();
          } catch (err) {
            msg.textContent = '操作失败：' + err.message;
          } finally {
            btn.disabled = false;
          }
        });

        $('#clList', root).addEventListener('click', async function (e) {
          const btn = e.target.closest('[data-cloud-load]');
          if (!btn) return;
          const name = btn.getAttribute('data-cloud-load');
          btn.disabled = true;
          msg.textContent = '载入中…';
          try {
            if (await loadCloudFile(name)) {
              closeModal();
              toast('已载入「' + name.replace(/\.json$/i, '') + '」');
            } else {
              msg.textContent = '已取消载入。';
            }
          } catch (err) {
            msg.textContent = '载入失败：' + err.message;
          } finally {
            btn.disabled = false;
          }
        });

        $('#clBackup', root).addEventListener('click', exportBackup);

        $('#clRestoreAll', root).addEventListener('click', async function () {
          const btn = this;
          btn.disabled = true;
          msg.textContent = '恢复中…';
          try {
            await restoreAllFromCloud(root, msg);
            await refreshAll();
          } catch (err) {
            msg.textContent = '恢复失败：' + err.message;
          } finally {
            btn.disabled = false;
          }
        });

        $('#clSave', root).addEventListener('click', async function () {
          readForm();
          if (!cloud.cfg.token) {
            msg.textContent = '先填写访问令牌。';
            return;
          }
          const btn = this;
          btn.disabled = true;
          msg.textContent = '上传中…';
          try {
            const file = await saveCloudChapter(activeChapter());
            await refreshAll();
            msg.textContent = '已保存 ' + file + '（只上传，未删除任何云端文件）';
            toast('已保存到云端');
          } catch (err) {
            msg.textContent = '保存失败：' + err.message;
          } finally {
            btn.disabled = false;
          }
        });

        $('#clSaveAll', root).addEventListener('click', async function () {
          readForm();
          if (!cloud.cfg.token) {
            msg.textContent = '先填写访问令牌。';
            return;
          }
          const btn = this;
          btn.disabled = true;
          let done = 0;
          try {
            for (let i = 0; i < state.chapters.length; i += 1) {
              msg.textContent = '上传 ' + (i + 1) + ' / ' + state.chapters.length + '…';
              await saveCloudChapter(state.chapters[i], true);
              done += 1;
            }
            await writeCloudManifest();
            await refreshAll();
            msg.textContent = '已上传 ' + done + ' 章（云端多余章节保持原样）。';
            toast('已全部保存到云端');
          } catch (err) {
            msg.textContent = '上传中断：' + err.message + '（已完成 ' + done + ' 章）';
          } finally {
            btn.disabled = false;
          }
        });
      }
    );
  }

  /* ---------------- 启动 ---------------- */

  init();

  window.__workbench = {
    state: state,
    activeChapter: activeChapter,
    chapterToJson: chapterToJson,
    chapterToMarkdown: chapterToMarkdown,
    analyzeDraft: analyzeDraft,
    parseDraftInto: parseDraftInto,
    chapterFromJson: chapterFromJson,
    chapterFromNative: chapterFromNative,
    importJsonChapters: importJsonChapters,
    saveNow: saveNow,
    undo: undo,
    redo: redo,
    changeType: changeType,
    speakerList: speakerList,
    cloud: cloud,
    refreshCloudList: refreshCloudList,
    computeSyncPlan: computeSyncPlan,
    saveCloudChapter: saveCloudChapter,
    loadCloudFile: loadCloudFile,
    exportBackup: exportBackup
  };
})();
