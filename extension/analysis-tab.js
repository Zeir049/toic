// 사이드 패널 "분석" 탭: 약점 프로필(로컬 계산) + RAG 기반 AI 공부법 추천(OpenRouter)
import { buildProfile } from './lib/analysis.js'
import { buildMessages } from './lib/coach.js'
import { renderMarkdown } from './lib/markdown.js'
import { DEFAULT_MODEL, listFreeModels, streamChat } from './lib/openrouter.js'
import { retrieve } from './lib/retrieve.js'
import * as store from './lib/store.js'

const $ = (sel) => document.querySelector(sel)
const pctStr = (x) => (x == null ? '–' : `${(x * 100).toFixed(1)}%`)
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

let ctx // { getRecords, toast }
let settings = { apiKey: '', model: DEFAULT_MODEL }
let abort = null

export async function initAnalysis(context) {
  ctx = context
  settings = { ...settings, ...(await store.get('aiSettings', {})) }
  $('#ai-key').value = settings.apiKey ? '••••••••' + settings.apiKey.slice(-4) : ''
  $('#ai-settings').open = !settings.apiKey
  $('#an-range').value = String(settings.recent ?? 0)
  fillModels([{ id: settings.model, name: settings.model }])

  $('#an-range').addEventListener('change', async () => {
    settings.recent = Number($('#an-range').value)
    await store.set({ aiSettings: settings })
    renderAnalysis()
  })
  $('#ai-key').addEventListener('focus', (e) => {
    if (e.target.value.startsWith('••')) e.target.value = ''
  })
  $('#btn-key-save').addEventListener('click', saveKey)
  $('#ai-key').addEventListener('keydown', (e) => e.key === 'Enter' && saveKey())
  $('#btn-key-del').addEventListener('click', async () => {
    settings.apiKey = ''
    $('#ai-key').value = ''
    await store.set({ aiSettings: settings })
    ctx.toast('API 키를 삭제했어요.')
  })
  $('#ai-model').addEventListener('change', async (e) => {
    settings.model = e.target.value
    await store.set({ aiSettings: settings })
  })
  $('#btn-models').addEventListener('click', () => loadModels(true))
  $('#ai-settings').addEventListener('toggle', () => $('#ai-settings').open && loadModels(false))
  $('#btn-ai').addEventListener('click', runCoach)
  $('#btn-ai-stop').addEventListener('click', () => abort?.abort())
  $('#ai-sources').addEventListener('click', (e) => {
    const n = e.target.closest('[data-cite]')?.dataset.cite
    if (n) document.querySelector(`#ai-sources details[data-n="${n}"]`)?.setAttribute('open', '')
  })
  $('#ai-output').addEventListener('click', (e) => {
    const n = e.target.closest('.cite')?.dataset.cite
    const d = n && document.querySelector(`#ai-sources details[data-n="${n}"]`)
    if (d) {
      d.open = true
      d.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  })

  const last = await store.get('coaching', null)
  if (last) showResult(last)
}

async function saveKey() {
  const v = $('#ai-key').value.trim()
  if (!v || v.startsWith('••')) return ctx.toast('API 키를 붙여넣어 주세요.')
  settings.apiKey = v
  await store.set({ aiSettings: settings })
  $('#ai-key').value = '••••••••' + v.slice(-4)
  ctx.toast('API 키를 저장했어요.')
}

let modelsLoaded = false
async function loadModels(force) {
  if (modelsLoaded && !force) return
  const btn = $('#btn-models')
  btn.disabled = true
  try {
    const models = await listFreeModels()
    modelsLoaded = true
    fillModels(models)
    if (force) ctx.toast(`무료 모델 ${models.length}개를 불러왔어요.`)
  } catch (e) {
    ctx.toast(e.message)
  } finally {
    btn.disabled = false
  }
}

function fillModels(models) {
  const sel = $('#ai-model')
  sel.textContent = ''
  const ids = new Set(models.map((m) => m.id))
  if (!ids.has(settings.model)) models = [{ id: settings.model, name: settings.model + ' (목록에 없음)' }, ...models]
  for (const m of models) {
    const o = document.createElement('option')
    o.value = m.id
    o.textContent = m.id === DEFAULT_MODEL ? `${m.name} — 자동 선택(추천)` : m.name
    sel.append(o)
  }
  sel.value = settings.model
}

// ───────── 약점 프로필 (AI 없이) ─────────

function currentProfile() {
  return buildProfile(ctx.getRecords(), { recent: settings.recent ?? 0 })
}

export function renderAnalysis() {
  if (!ctx) return
  const p = currentProfile()
  const box = $('#an-profile')
  $('#btn-ai').disabled = !p.total
  if (!p.total) {
    box.innerHTML = '<p class="empty">채점 기록이 쌓이면 약점을 분석해 드려요.</p>'
    return
  }
  const weak = new Set(p.weakParts.map((w) => w.name))
  const bars = p.parts
    .map(
      (x) => `<div class="bd-row ${weak.has(x.name) ? 'weak' : ''}">
        <span>${x.name}</span>
        <div class="bd-bar"><div style="width:${(x.acc * 100).toFixed(1)}%"></div></div>
        <span class="bd-num">${pctStr(x.acc)}</span></div>`,
    )
    .join('')

  const tags = p.tags.length
    ? p.tags.map((t) => `<span class="chip static">${esc(t.tag)} <b>${t.count}</b></span>`).join('')
    : '<span class="muted small-text">아직 태그가 없어요. 오답노트에서 틀린 이유 태그를 달면 분석이 정확해져요.</span>'

  const signals = []
  if (p.rcTailBlank) signals.push(`⏱ RC 후반(176–200) 미응답 <b>${p.rcTailBlank}</b>문항 — 시간 관리 점검`)
  else if (p.blank) signals.push(`⏱ 미응답 <b>${p.blank}</b>문항`)
  if (p.flaggedTotal) signals.push(`⚑ 헷갈림 <b>${p.flaggedTotal}</b>문항 중 <b>${p.flaggedCorrect}</b>개는 맞힘 — 운으로 맞힌 문제 복습`)
  if (p.reviewTotal) signals.push(`📒 오답 복습 완료 <b>${p.reviewed}/${p.reviewTotal}</b>`)
  if (p.trend.length > 1) {
    signals.push('📈 회차별 ' + p.trend.map((t) => pctStr(t.total ? t.correct / t.total : null)).join(' → '))
  }

  box.innerHTML = `
    <div class="score-card">
      <div class="score-meta">모의고사 ${p.tests}회 · ${p.total}문항</div>
      <div class="score-big">${pctStr(p.accuracy)}</div>
      <div class="score-meta">LC ${pctStr(p.sections.LC.acc)} · RC ${pctStr(p.sections.RC.acc)}</div>
      <div class="breakdown">${bars}</div>
      ${p.weakParts.length ? `<p class="weak-note">평균보다 낮은 파트: <b>${p.weakParts.map((w) => w.name).join(', ')}</b></p>` : ''}
      <div class="label tag-label">틀린 이유 태그</div>
      <div class="tags">${tags}</div>
      ${signals.length ? `<ul class="signals">${signals.map((s) => `<li>${s}</li>`).join('')}</ul>` : ''}
    </div>`
}

// ───────── AI 추천 (RAG) ─────────

async function runCoach() {
  if (!settings.apiKey) {
    $('#ai-settings').open = true
    $('#ai-key').focus()
    return ctx.toast('먼저 OpenRouter API 키를 저장해 주세요.')
  }
  const profile = currentProfile()
  if (!profile.total) return ctx.toast('채점 기록이 없어요.')

  // 1) Retrieve  2) Augment  3) Generate
  const retrieved = retrieve(profile)
  const messages = buildMessages(profile, retrieved)
  const sources = retrieved.map((r) => ({ id: r.doc.id, title: r.doc.title, text: r.doc.text, matched: r.matched }))

  abort = new AbortController()
  setBusy(true, `공부법 자료 ${sources.length}개를 찾았어요. 모델에 요청하는 중…`)
  renderSources(sources, '')
  const out = $('#ai-output')
  out.hidden = false
  out.classList.remove('error')
  out.innerHTML = '<p class="muted">답을 기다리는 중…</p>'
  out.scrollIntoView({ block: 'nearest', behavior: 'smooth' })

  let pending = null
  let started = false
  try {
    const { text, model } = await streamChat({
      apiKey: settings.apiKey,
      model: settings.model,
      messages,
      signal: abort.signal,
      onReasoning: (r) => r && setStatus('모델이 생각하는 중…'),
      onText: (t) => {
        setStatus('작성 중…')
        if (!started) {
          started = true
          out.scrollIntoView({ block: 'start', behavior: 'smooth' })
        }
        pending = t
        requestAnimationFrame(() => {
          if (pending == null) return
          out.innerHTML = renderMarkdown(pending)
          pending = null
        })
      },
    })
    const result = { at: Date.now(), model, text, sources, recent: settings.recent ?? 0 }
    await store.set({ coaching: result })
    showResult(result)
    setBusy(false, '')
  } catch (e) {
    pending = null
    if (e.name === 'AbortError') {
      setBusy(false, '중지했어요.')
      if (!started) out.hidden = true
    } else {
      console.error(e)
      setBusy(false, '실패')
      // 토스트는 몇 초 뒤 사라지므로, 오류는 결과 자리에 남겨 둔다
      out.hidden = false
      out.classList.add('error')
      out.innerHTML = `<p><strong>추천을 받지 못했어요</strong></p><p>${esc(e.message || '요청에 실패했어요.')}</p>`
      out.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  } finally {
    abort = null
  }
}

function showResult(r) {
  const out = $('#ai-output')
  out.hidden = false
  out.classList.remove('error')
  out.innerHTML = renderMarkdown(r.text)
  renderSources(r.sources, r.text)
  const when = new Date(r.at).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })
  $('#ai-meta').textContent = `${when} · ${r.model}`
  $('#btn-ai').textContent = '다시 추천 받기'
}

function renderSources(sources, text) {
  const box = $('#ai-sources')
  box.hidden = !sources.length
  const cited = new Set([...String(text).matchAll(/\[(\d{1,2})\]/g)].map((m) => Number(m[1])))
  box.innerHTML =
    '<div class="label">참고한 학습 자료</div>' +
    sources
      .map(
        (s, i) => `<details data-n="${i + 1}" class="${cited.has(i + 1) ? 'cited' : ''}">
          <summary><span class="src-n">${i + 1}</span>${esc(s.title)}</summary>
          <p>${esc(s.text)}</p></details>`,
      )
      .join('')
}

function setBusy(busy, msg) {
  $('#btn-ai').disabled = busy
  $('#btn-ai-stop').hidden = !busy
  setStatus(msg)
}
function setStatus(msg) {
  $('#ai-status').textContent = msg
}
