import { OPTIONS, grade, parseAnswerKey, partOf, pct, range, reviewItems } from './lib/grading.js'
import * as store from './lib/store.js'
import { initAnalysis, renderAnalysis } from './analysis-tab.js'

const $ = (sel, root = document) => root.querySelector(sel)
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)]
const pad = (q) => String(q).padStart(3, '0')
const TAGS = ['어휘', '문법', '해석', '패러프레이징', '듣기', '시간부족', '실수', '함정']
const STATUS_LABEL = { wrong: '오답', blank: '미응답', flagged: '헷갈림' }

const newSession = (keep = {}) => ({
  title: '',
  start: 1,
  count: 200,
  marks: {},
  flags: {},
  current: keep.start ?? 1,
  keyText: '',
  recordId: null,
  ...keep,
})

let session = newSession()
let records = []
let presets = {}
let detailId = null
let filter = 'all'

// ───────────────────────── 공통 UI ─────────────────────────

let toastTimer
function toast(msg, ms = 2600) {
  const el = $('#toast')
  el.textContent = msg
  el.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el.classList.remove('show'), ms)
}

/** 사이드 패널에서 안전하게 쓰는 확인/입력 대화상자 (window.prompt 대신) */
function ask(message, { input = false, value = '', ok = '확인', danger = false } = {}) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div')
    wrap.className = 'modal'
    wrap.innerHTML = `
      <form class="modal-box">
        <p></p>
        ${input ? '<input type="text" autocomplete="off" />' : ''}
        <div class="modal-actions">
          <button type="button" class="ghost" data-cancel>취소</button>
          <button type="submit" class="primary ${danger ? 'danger-fill' : ''}"></button>
        </div>
      </form>`
    $('p', wrap).textContent = message
    $('button[type=submit]', wrap).textContent = ok
    const field = $('input', wrap)
    if (field) field.value = value
    const done = (v) => {
      wrap.remove()
      resolve(v)
    }
    $('form', wrap).addEventListener('submit', (e) => {
      e.preventDefault()
      done(input ? field.value.trim() || null : true)
    })
    $('[data-cancel]', wrap).addEventListener('click', () => done(input ? null : false))
    wrap.addEventListener('keydown', (e) => e.key === 'Escape' && done(input ? null : false))
    document.body.append(wrap)
    ;(field ?? $('button[type=submit]', wrap)).focus()
  })
}

function switchTab(name) {
  for (const b of $$('.tabs button')) b.setAttribute('aria-selected', String(b.dataset.tab === name))
  for (const s of $$('.tab-body')) s.hidden = s.id !== 'tab-' + name
  if (name === 'mark') $('#omr').focus({ preventScroll: true })
  if (name === 'notes') renderNotes()
  if (name === 'analysis') renderAnalysis()
}

let saveTimer
function saveSession() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => store.set({ session }), 150)
}

const questions = () => range(session.start, session.count)
const recordQuestions = (rec) => range(rec.start, rec.count)
const gradeRecord = (rec) => grade(rec.marks, rec.key, recordQuestions(rec), rec.flags)
const fmtDate = (t) => new Date(t).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })

// ───────────────────────── 1. 마킹 ─────────────────────────

function buildOmr() {
  const omr = $('#omr')
  omr.textContent = ''
  const qs = questions()

  // 토익 파트 단위로 묶고, 200번을 넘는 번호는 하나의 묶음으로
  const groups = []
  for (const q of qs) {
    const p = partOf(q)
    const name = p ? `${p.name} · ${p.section}` : '문항'
    const last = groups.at(-1)
    if (last && last.name === name) last.qs.push(q)
    else groups.push({ name, qs: [q] })
  }

  for (const g of groups) {
    const sec = document.createElement('div')
    sec.className = 'part'
    const h = document.createElement('h3')
    h.textContent = `${g.name}  (${g.qs[0]}–${g.qs.at(-1)})`
    const grid = document.createElement('div')
    grid.className = 'part-grid'
    for (const q of g.qs) {
      const row = document.createElement('div')
      row.className = 'q'
      row.dataset.q = q
      row.innerHTML =
        `<button class="num" tabindex="-1" title="클릭: 이 문항으로 이동 / 우클릭: 헷갈림 표시">${q}</button>` +
        OPTIONS.map((o) => `<button class="bub" tabindex="-1" data-o="${o}">${o}</button>`).join('')
      grid.append(row)
    }
    sec.append(h, grid)
    omr.append(sec)
  }
  for (const q of qs) paintRow(q)
  paintRangeChips()
  paintProgress()
}

function row(q) {
  return $(`#omr .q[data-q="${q}"]`)
}

function paintRow(q) {
  const r = row(q)
  if (!r) return
  r.classList.toggle('current', q === session.current)
  r.classList.toggle('flagged', !!session.flags[q])
  for (const b of $$('.bub', r)) b.classList.toggle('on', session.marks[q] === b.dataset.o)
}

function paintProgress() {
  const qs = questions()
  const done = qs.filter((q) => session.marks[q]).length
  $('#progress-fill').style.width = `${(done / qs.length) * 100}%`
  const flagged = qs.filter((q) => session.flags[q]).length
  $('#progress-text').textContent = `${done} / ${qs.length}` + (flagged ? ` · ⚑${flagged}` : '')
}

function paintRangeChips() {
  for (const c of $$('[data-range]')) {
    const [s, n] = c.dataset.range.split(',').map(Number)
    c.setAttribute('aria-pressed', String(s === session.start && n === session.count))
  }
  $('#range-start').value = session.start
  $('#range-count').value = session.count
}

function setCurrent(q, scroll = true) {
  const qs = questions()
  q = Math.min(Math.max(q, qs[0]), qs.at(-1))
  const prev = session.current
  session.current = q
  paintRow(prev)
  paintRow(q)
  if (scroll) row(q)?.scrollIntoView({ block: 'nearest' })
  saveSession()
}

function mark(q, opt, { toggle = false } = {}) {
  if (toggle && session.marks[q] === opt) delete session.marks[q]
  else session.marks[q] = opt
  paintRow(q)
  paintProgress()
  setCurrent(q + 1)
}

function toggleFlag(q) {
  if (session.flags[q]) delete session.flags[q]
  else session.flags[q] = true
  paintRow(q)
  paintProgress()
  saveSession()
}

function setRange(start, count) {
  if (!(start >= 1 && count >= 1 && count <= 999)) return
  session.start = start
  session.count = count
  session.current = start
  saveSession()
  buildOmr()
  renderKeyStatus()
}

function initMarking() {
  $('#title').addEventListener('input', (e) => {
    session.title = e.target.value
    saveSession()
  })

  for (const c of $$('[data-range]')) {
    c.addEventListener('click', () => {
      const [s, n] = c.dataset.range.split(',').map(Number)
      setRange(s, n)
    })
  }
  const onCustom = () => setRange(Number($('#range-start').value), Number($('#range-count').value))
  $('#range-start').addEventListener('change', onCustom)
  $('#range-count').addEventListener('change', onCustom)

  const omr = $('#omr')
  omr.addEventListener('click', (e) => {
    const r = e.target.closest('.q')
    if (!r) return
    const q = Number(r.dataset.q)
    if (e.target.classList.contains('bub')) mark(q, e.target.dataset.o, { toggle: true })
    else setCurrent(q, false)
    omr.focus({ preventScroll: true })
  })
  omr.addEventListener('contextmenu', (e) => {
    const r = e.target.closest('.q')
    if (!r) return
    e.preventDefault()
    toggleFlag(Number(r.dataset.q))
  })

  document.addEventListener('keydown', (e) => {
    if ($('#tab-mark').hidden || $('.modal')) return
    if (e.target.closest?.('input, textarea, select') || e.ctrlKey || e.metaKey || e.altKey) return
    const k = e.key.toLowerCase()
    const q = session.current
    const opt = { a: 'A', b: 'B', c: 'C', d: 'D', 1: 'A', 2: 'B', 3: 'C', 4: 'D' }[k]
    if (opt) mark(q, opt)
    else if (k === 'arrowdown' || k === 'j' || k === 'enter') setCurrent(q + 1)
    else if (k === 'arrowup' || k === 'k') setCurrent(q - 1)
    else if (k === 'f' || k === '?') toggleFlag(q)
    else if (k === 'backspace' || k === 'delete') {
      delete session.marks[q]
      paintRow(q)
      paintProgress()
      saveSession()
      if (k === 'backspace') setCurrent(q - 1)
    } else return
    e.preventDefault()
  })

  $('#btn-new').addEventListener('click', async () => {
    if (!(await ask('새 시험을 시작할까요? 지금 마킹과 붙여넣은 정답지가 비워집니다. (채점 기록과 오답노트는 그대로 남아요)', { ok: '새 시험' })))
      return
    session = newSession({ start: session.start, count: session.count })
    $('#title').value = ''
    $('#key-text').value = ''
    saveSession()
    buildOmr()
    renderKeyStatus()
    renderResult()
    $('#title').focus()
  })
  $('#btn-clear-marks').addEventListener('click', async () => {
    if (!(await ask('마킹한 답과 헷갈림 표시를 모두 지울까요?', { ok: '지우기', danger: true }))) return
    session.marks = {}
    session.flags = {}
    session.current = session.start
    saveSession()
    buildOmr()
  })
  $('#btn-to-grade').addEventListener('click', () => {
    switchTab('grade')
    if (!session.keyText) $('#key-text').focus()
  })
}

// ───────────────────────── 2. 채점 ─────────────────────────

function renderKeyStatus() {
  const el = $('#key-status')
  const text = session.keyText.trim()
  el.className = 'status'
  if (!text) {
    el.textContent = '번호가 있으면 번호대로, 없으면 시작 번호부터 순서대로 인식해요.'
    return
  }
  const { answers, mode, count, issues } = parseAnswerKey(text, session.start)
  const qs = questions()
  const matched = qs.filter((q) => answers[q])
  const missing = qs.filter((q) => !answers[q])
  if (count === 0) {
    el.textContent = 'A–D 정답을 찾지 못했어요.'
    el.classList.add('bad')
    return
  }
  const modeLabel = mode === 'numbered' ? '번호 형식' : '순서 형식'
  let msg = `${modeLabel}으로 ${count}개 인식 · 마킹 범위 ${qs[0]}–${qs.at(-1)} 중 ${matched.length}개 일치`
  if (missing.length) {
    const head = missing.slice(0, 6).join(', ')
    msg += ` · 정답 없음: ${head}${missing.length > 6 ? ` 외 ${missing.length - 6}개` : ''}`
  }
  if (issues.length) msg += ` · ${issues[0]}`
  el.textContent = msg
  el.classList.add(matched.length === 0 ? 'bad' : missing.length || issues.length ? 'warn' : 'ok')
}

function renderPresets() {
  const sel = $('#preset-select')
  const cur = sel.value
  sel.innerHTML = '<option value="">저장된 정답지…</option>'
  for (const name of Object.keys(presets).sort()) {
    const o = document.createElement('option')
    o.value = o.textContent = name
    sel.append(o)
  }
  sel.value = presets[cur] ? cur : ''
}

async function doGrade() {
  const { answers, count } = parseAnswerKey(session.keyText, session.start)
  if (!count) {
    toast('먼저 정답지를 붙여넣어 주세요.')
    $('#key-text').focus()
    return
  }
  const qs = questions()
  const key = Object.fromEntries(qs.filter((q) => answers[q]).map((q) => [q, answers[q]]))
  if (!Object.keys(key).length) {
    toast('마킹 범위 안의 번호와 맞는 정답이 없어요. 범위를 확인해 주세요.')
    return
  }

  records = await store.getRecords()
  const now = Date.now()
  const base = {
    title: session.title.trim() || `시험 ${new Date(now).toLocaleDateString('ko-KR')}`,
    start: session.start,
    count: session.count,
    marks: { ...session.marks },
    flags: { ...session.flags },
    key,
    gradedAt: now,
  }
  let rec = records.find((r) => r.id === session.recordId)
  if (rec) Object.assign(rec, base, { updatedAt: now })
  else {
    rec = { id: store.uid(), createdAt: now, updatedAt: now, notes: {}, ...base }
    records.unshift(rec)
    session.recordId = rec.id
  }
  const g = gradeRecord(rec)
  rec.score = { correct: g.correct, total: g.total }
  await store.set({ records, session })

  renderResult()
  updateNotesCount()
  const n = reviewItems(g).length
  toast(n ? `채점 완료 — ${n}문항이 오답노트에 정리됐어요.` : '채점 완료 — 만점입니다! 🎉')
}

function renderResult() {
  const box = $('#result')
  const rec = records.find((r) => r.id === session.recordId)
  if (!rec) {
    box.textContent = ''
    return
  }
  const g = gradeRecord(rec)
  const sections = g.breakdown
    .map(
      (b) => `<div class="bd-row ${b.name.length === 2 ? 'section' : ''}">
        <span>${b.name}</span>
        <div class="bd-bar"><div style="width:${pct(b.correct, b.total)}%"></div></div>
        <span class="bd-num">${b.correct}/${b.total}</span></div>`,
    )
    .join('')

  const flaggedRight = g.items.filter((i) => i.flagged && i.status === 'correct').length
  box.innerHTML = `
    <div class="score-card">
      <div class="score-big">${g.correct} <small>/ ${g.total} · ${pct(g.correct, g.total)}%</small></div>
      <div class="score-meta">
        오답 ${g.wrong.length} · 미응답 ${g.blank.length}${flaggedRight ? ` · 맞았지만 헷갈림 ${flaggedRight}` : ''}
        ${g.noKey.length ? ` · 정답 없어 제외 ${g.noKey.length}` : ''}<br/>
        ${fmtDate(rec.gradedAt)} 채점
      </div>
      ${sections ? `<div class="breakdown">${sections}</div>` : ''}
      <button class="primary wide" id="btn-open-note">오답노트 정리하기 →</button>
    </div>
    <div class="answer-grid">
      ${g.items
        .map(
          (i) =>
            `<span class="cell ${i.status} ${i.flagged ? 'flagged' : ''}" title="${i.q}번 · 내 답 ${i.mine ?? '-'} / 정답 ${i.answer}">${i.q} ${
              i.status === 'correct' ? i.answer : `${i.mine ?? '-'}→<b>${i.answer}</b>`
            }</span>`,
        )
        .join('')}
    </div>
    <p class="legend">빨간칸 = 오답/미응답 (내 답→정답), 노란 테두리 = 헷갈림 표시. 마킹을 고친 뒤 다시 채점하면 이 기록이 갱신돼요.</p>`
  $('#btn-open-note').addEventListener('click', () => {
    detailId = rec.id
    switchTab('notes')
  })
}

function initGrading() {
  const ta = $('#key-text')
  ta.addEventListener('input', () => {
    session.keyText = ta.value
    saveSession()
    renderKeyStatus()
  })

  $('#btn-preset-save').addEventListener('click', async () => {
    if (!parseAnswerKey(session.keyText, session.start).count) return toast('저장할 정답지를 먼저 붙여넣어 주세요.')
    const name = await ask('저장할 정답지 이름', { input: true, value: session.title.trim(), ok: '저장' })
    if (!name) return
    presets[name] = { text: session.keyText, start: session.start }
    await store.set({ presets })
    renderPresets()
    $('#preset-select').value = name
    toast(`'${name}' 정답지를 저장했어요.`)
  })
  $('#btn-preset-load').addEventListener('click', () => {
    const p = presets[$('#preset-select').value]
    if (!p) return toast('불러올 정답지를 선택해 주세요.')
    ta.value = session.keyText = p.text
    saveSession()
    renderKeyStatus()
  })
  $('#btn-preset-del').addEventListener('click', async () => {
    const name = $('#preset-select').value
    if (!name) return toast('삭제할 정답지를 선택해 주세요.')
    if (!(await ask(`'${name}' 정답지를 삭제할까요?`, { ok: '삭제', danger: true }))) return
    delete presets[name]
    await store.set({ presets })
    renderPresets()
  })
  $('#btn-grade').addEventListener('click', doGrade)
}

// ───────────────────────── 3. 오답노트 ─────────────────────────

function updateNotesCount() {
  let n = 0
  for (const rec of records) {
    for (const it of reviewItems(gradeRecord(rec))) if (!rec.notes?.[it.q]?.reviewed) n++
  }
  const pill = $('#notes-count')
  pill.hidden = n === 0
  pill.textContent = n
}

function renderNotes() {
  const detail = records.find((r) => r.id === detailId)
  $('#notes-list-view').hidden = !!detail
  $('#notes-detail-view').hidden = !detail
  if (detail) renderDetail(detail)
  else renderRecordList()
}

function renderRecordList() {
  const box = $('#records')
  if (!records.length) {
    box.innerHTML = '<p class="empty">아직 채점 기록이 없어요.<br/>마킹 → 채점하면 오답이 여기에 모여요.</p>'
    return
  }
  box.textContent = ''
  for (const rec of [...records].sort((a, b) => b.createdAt - a.createdAt)) {
    const g = gradeRecord(rec)
    const items = reviewItems(g)
    const reviewed = items.filter((i) => rec.notes?.[i.q]?.reviewed).length
    const el = document.createElement('div')
    el.className = 'record'
    el.tabIndex = 0
    el.innerHTML = `<span class="t"></span><span class="s">${g.correct}/${g.total}</span>
      <span class="m">${fmtDate(rec.gradedAt ?? rec.createdAt)} · 정리할 문항 ${items.length} · 복습 ${reviewed}/${items.length}</span>`
    $('.t', el).textContent = rec.title
    const open = () => {
      detailId = rec.id
      renderNotes()
      $('#tab-notes').scrollTop = 0
    }
    el.addEventListener('click', open)
    el.addEventListener('keydown', (e) => e.key === 'Enter' && open())
    box.append(el)
  }
}

function itemKind(it) {
  return it.status === 'correct' ? 'flagged' : it.status
}

function renderDetail(rec) {
  const g = gradeRecord(rec)
  $('#detail-title').textContent = rec.title
  $('#detail-sub').textContent = `${g.correct}/${g.total} (${pct(g.correct, g.total)}%) · ${fmtDate(rec.gradedAt ?? rec.createdAt)}`
  for (const c of $$('[data-filter]')) c.setAttribute('aria-pressed', String(c.dataset.filter === filter))

  const hideReviewed = $('#hide-reviewed').checked
  const items = reviewItems(g).filter((it) => {
    if (hideReviewed && rec.notes?.[it.q]?.reviewed) return false
    if (filter === 'all') return true
    if (filter === 'flagged') return it.flagged
    return it.status === filter
  })

  const box = $('#items')
  box.textContent = ''
  if (!items.length) {
    box.innerHTML = `<p class="empty">${reviewItems(g).length ? '조건에 맞는 문항이 없어요.' : '만점! 정리할 오답이 없어요.'}</p>`
    return
  }
  for (const it of items) box.append(itemCard(rec, it))
}

function itemCard(rec, it) {
  const note = rec.notes?.[it.q] ?? { memo: '', tags: [], images: [], reviewed: false }
  const p = partOf(it.q)
  const kind = itemKind(it)
  const el = document.createElement('div')
  el.className = 'item' + (note.reviewed ? ' reviewed' : '')
  el.tabIndex = 0
  el.dataset.q = it.q
  el.innerHTML = `
    <div class="item-head">
      <span class="item-q">${it.q}번</span>
      ${p ? `<span class="item-part">${p.name}</span>` : ''}
      <span class="item-ans">내 답 <span class="mine ${it.status === 'correct' ? 'ok' : ''}">${it.mine ?? '–'}</span>
        ${it.status === 'correct' ? '' : `→ 정답 <span class="right">${it.answer}</span>`}</span>
      <span class="badge ${kind}">${STATUS_LABEL[kind]}${it.flagged && kind !== 'flagged' ? ' · ⚑' : ''}</span>
    </div>
    <div class="tags">${TAGS.map(
      (t) => `<button class="chip" data-tag="${t}" aria-pressed="${note.tags.includes(t)}">${t}</button>`,
    ).join('')}</div>
    <textarea placeholder="왜 틀렸는지, 핵심 표현, 해석 등을 메모하세요"></textarea>
    <div class="imgs"></div>
    <div class="item-foot">
      <button class="ghost small" data-act="capture" title="지금 보고 있는 PDF 화면을 캡처해서 영역을 잘라 붙입니다">📷 화면 캡처</button>
      <button class="ghost small" data-act="file">🖼 이미지</button>
      <input type="file" accept="image/*" multiple hidden />
      <label class="check"><input type="checkbox" data-act="reviewed" ${note.reviewed ? 'checked' : ''}/> 복습 완료</label>
    </div>`
  const ta = $('textarea', el)
  ta.value = note.memo
  autoGrow(ta)
  paintImages(el, note.images)
  return el
}

function autoGrow(ta) {
  ta.style.height = 'auto'
  ta.style.height = Math.min(ta.scrollHeight + 2, 320) + 'px'
}

async function paintImages(card, ids) {
  const box = $('.imgs', card)
  const key = ids.join(',')
  if (box.dataset.key === key) return
  box.dataset.key = key
  box.textContent = ''
  for (const id of ids) {
    const src = await store.get('img:' + id, null)
    if (!src) continue
    const t = document.createElement('div')
    t.className = 'thumb'
    t.innerHTML = `<img alt="첨부 이미지" /><button title="이미지 삭제" data-img="${id}">✕</button>`
    $('img', t).src = src
    box.append(t)
  }
}

const memoTimers = new Map()
function saveMemo(recId, q, value) {
  clearTimeout(memoTimers.get(q))
  memoTimers.set(
    q,
    setTimeout(() => store.updateRecord(recId, (rec) => (store.noteOf(rec, q).memo = value)), 400),
  )
}

async function readImageFile(file) {
  const url = await new Promise((res, rej) => {
    const fr = new FileReader()
    fr.onload = () => res(fr.result)
    fr.onerror = rej
    fr.readAsDataURL(file)
  })
  return shrink(url)
}

/** 너무 큰 이미지는 가로 1600px로 줄여 저장 공간 절약 */
async function shrink(dataUrl, maxW = 1600) {
  const img = new Image()
  img.src = dataUrl
  await img.decode()
  if (img.naturalWidth <= maxW) return dataUrl
  const c = document.createElement('canvas')
  c.width = maxW
  c.height = Math.round((img.naturalHeight * maxW) / img.naturalWidth)
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
  return c.toDataURL('image/png')
}

async function addImages(q, files) {
  const imgs = [...files].filter((f) => f.type.startsWith('image/'))
  if (!imgs.length) return false
  for (const f of imgs) await store.addImage(detailId, q, await readImageFile(f))
  await onRecordsChanged()
  toast('이미지를 붙였어요.')
  return true
}

async function captureFor(q) {
  if (!globalThis.chrome?.tabs?.captureVisibleTab) return toast('확장 프로그램으로 설치했을 때만 쓸 수 있어요.')
  let granted = false
  try {
    // 사용자 클릭 직후 바로 요청해야 권한 창이 뜸 (await 전에 호출)
    granted = await chrome.permissions.request({ origins: ['<all_urls>'] })
  } catch (e) {
    console.error(e)
  }
  if (!granted) return toast('화면 캡처 권한이 없어요. 대신 Win+Shift+S로 캡처한 뒤 카드에서 Ctrl+V 하세요.', 4500)

  let dataUrl
  try {
    const win = await chrome.windows.getCurrent()
    dataUrl = await chrome.tabs.captureVisibleTab(win.id, { format: 'png' })
  } catch (e) {
    console.error(e)
    return toast(
      '이 탭은 캡처할 수 없어요. 내 PC의 PDF라면 확장 프로그램 관리 → 세부정보 → "파일 URL에 대한 액세스 허용"을 켜 주세요. (또는 Win+Shift+S → Ctrl+V)',
      7000,
    )
  }
  await store.set({ pendingCapture: { dataUrl, recordId: detailId, q } })
  const w = Math.min(screen.availWidth - 40, 1500)
  const h = Math.min(screen.availHeight - 40, 1000)
  await chrome.windows.create({
    url: chrome.runtime.getURL('crop.html'),
    type: 'popup',
    width: w,
    height: h,
    left: Math.round((screen.availWidth - w) / 2) + (screen.availLeft ?? 0),
    top: Math.round((screen.availHeight - h) / 2) + (screen.availTop ?? 0),
  })
}

function openReport(ids) {
  const url = 'report.html?print=1&ids=' + encodeURIComponent(ids.join(','))
  if (globalThis.chrome?.tabs?.create) chrome.tabs.create({ url: chrome.runtime.getURL(url) })
  else open(url, '_blank')
}

function initNotes() {
  const items = $('#items')

  items.addEventListener('input', (e) => {
    if (e.target.tagName !== 'TEXTAREA') return
    const q = Number(e.target.closest('.item').dataset.q)
    autoGrow(e.target)
    saveMemo(detailId, q, e.target.value)
  })

  items.addEventListener('click', async (e) => {
    const card = e.target.closest('.item')
    if (!card) return
    const q = Number(card.dataset.q)
    const t = e.target
    if (t.dataset.tag) {
      const on = t.getAttribute('aria-pressed') !== 'true'
      t.setAttribute('aria-pressed', String(on))
      await store.updateRecord(detailId, (rec) => {
        const n = store.noteOf(rec, q)
        n.tags = on ? [...new Set([...n.tags, t.dataset.tag])] : n.tags.filter((x) => x !== t.dataset.tag)
      })
    } else if (t.dataset.img) {
      await store.deleteImage(detailId, q, t.dataset.img)
      await onRecordsChanged()
    } else if (t.tagName === 'IMG') {
      const lb = document.createElement('div')
      lb.className = 'lightbox'
      lb.innerHTML = '<img alt="" />'
      $('img', lb).src = t.src
      lb.addEventListener('click', () => lb.remove())
      document.body.append(lb)
    } else if (t.dataset.act === 'capture') {
      captureFor(q)
    } else if (t.dataset.act === 'file') {
      $('input[type=file]', card).click()
    }
  })

  items.addEventListener('change', async (e) => {
    const card = e.target.closest('.item')
    if (!card) return
    const q = Number(card.dataset.q)
    if (e.target.type === 'file') {
      await addImages(q, e.target.files)
      e.target.value = ''
    } else if (e.target.dataset.act === 'reviewed') {
      const v = e.target.checked
      card.classList.toggle('reviewed', v)
      await store.updateRecord(detailId, (rec) => (store.noteOf(rec, q).reviewed = v))
      await onRecordsChanged()
      if (v && $('#hide-reviewed').checked) card.remove()
    }
  })

  // Win+Shift+S 로 잘라낸 이미지를 카드에 Ctrl+V
  items.addEventListener('paste', async (e) => {
    const card = e.target.closest('.item')
    if (!card) return
    const files = [...(e.clipboardData?.files ?? [])]
    if (files.some((f) => f.type.startsWith('image/'))) {
      e.preventDefault()
      await addImages(Number(card.dataset.q), files)
    }
  })
  items.addEventListener('dragover', (e) => e.target.closest('.item') && e.preventDefault())
  items.addEventListener('drop', async (e) => {
    const card = e.target.closest('.item')
    if (!card) return
    e.preventDefault()
    await addImages(Number(card.dataset.q), e.dataTransfer.files)
  })

  for (const c of $$('[data-filter]')) {
    c.addEventListener('click', () => {
      filter = c.dataset.filter
      renderNotes()
    })
  }
  $('#hide-reviewed').addEventListener('change', renderNotes)
  $('#btn-back').addEventListener('click', () => {
    detailId = null
    renderNotes()
  })
  $('#btn-export-one').addEventListener('click', () => openReport([detailId]))
  $('#btn-export-all').addEventListener('click', () => {
    if (!records.length) return toast('내보낼 기록이 없어요.')
    openReport(records.map((r) => r.id))
  })
  $('#btn-del-record').addEventListener('click', async () => {
    const rec = records.find((r) => r.id === detailId)
    if (!rec) return
    if (!(await ask(`'${rec.title}' 기록과 오답노트(메모·이미지 포함)를 삭제할까요? 되돌릴 수 없어요.`, { ok: '삭제', danger: true })))
      return
    await store.deleteRecord(rec.id)
    if (session.recordId === rec.id) {
      session.recordId = null
      saveSession()
    }
    detailId = null
    records = await store.getRecords()
    renderNotes()
    renderResult()
    updateNotesCount()
  })
}

/** 다른 창(캡처 창)이나 이 패널에서 기록이 바뀌면 화면 반영. 입력 중인 메모는 건드리지 않음 */
async function onRecordsChanged() {
  records = await store.getRecords()
  updateNotesCount()
  if (!$('#tab-analysis').hidden) renderAnalysis()
  if ($('#tab-notes').hidden) return
  const rec = records.find((r) => r.id === detailId)
  if (!rec) return renderNotes()
  for (const card of $$('#items .item')) {
    const n = rec.notes?.[card.dataset.q]
    if (n) paintImages(card, n.images)
  }
}

// ───────────────────────── 시작 ─────────────────────────

async function main() {
  session = { ...newSession(), ...(await store.get('session', {})) }
  records = await store.getRecords()
  presets = await store.get('presets', {})

  for (const b of $$('.tabs button')) b.addEventListener('click', () => switchTab(b.dataset.tab))
  initMarking()
  initGrading()
  initNotes()
  await initAnalysis({ getRecords: () => records, toast })

  $('#title').value = session.title
  $('#key-text').value = session.keyText
  buildOmr()
  renderKeyStatus()
  renderPresets()
  renderResult()
  updateNotesCount()
  row(session.current)?.scrollIntoView({ block: 'center' })
  $('#omr').focus({ preventScroll: true })

  store.onChange((keys) => {
    if (keys.includes('records')) onRecordsChanged()
    if (keys.includes('presets'))
      store.get('presets', {}).then((p) => {
        presets = p
        renderPresets()
      })
  })
}

main()
