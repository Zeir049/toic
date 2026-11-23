// 오답노트 → 인쇄용 문서. 크롬 인쇄 창의 "PDF로 저장"으로 PDF 파일을 만든다.
// (브라우저가 한글 폰트를 그대로 렌더링하므로 별도 폰트 내장 없이 텍스트가 살아있는 PDF가 나옴)
import { grade, partOf, pct, range, reviewItems } from './lib/grading.js'
import * as store from './lib/store.js'

const $ = (s) => document.querySelector(s)
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const fmtDate = (t) => new Date(t).toLocaleString('ko-KR', { dateStyle: 'long', timeStyle: 'short' })
const LABEL = { wrong: '오답', blank: '미응답', correct: '헷갈림' }

const params = new URLSearchParams(location.search)
const ids = (params.get('ids') ?? '').split(',').filter(Boolean)
const all = await store.getRecords()
const records = ids.map((id) => all.find((r) => r.id === id)).filter(Boolean)

const images = {}
for (const rec of records) {
  for (const n of Object.values(rec.notes ?? {})) {
    for (const id of n.images ?? []) images[id] = await store.get('img:' + id, null)
  }
}

function recordHtml(rec, opt) {
  const g = grade(rec.marks, rec.key, range(rec.start, rec.count), rec.flags)
  const items = reviewItems(g).filter((it) => {
    const n = rec.notes?.[it.q]
    if (!opt.flagged && it.status === 'correct') return false
    if (!opt.reviewed && n?.reviewed) return false
    return true
  })

  const breakdown = g.breakdown.length
    ? `<table class="bd"><tr>${g.breakdown.map((b) => `<th>${b.name}</th>`).join('')}</tr>
       <tr>${g.breakdown.map((b) => `<td>${b.correct}/${b.total}<small>${pct(b.correct, b.total)}%</small></td>`).join('')}</tr></table>`
    : ''

  const grid = opt.grid
    ? `<h2>전체 답안</h2><div class="grid">${g.items
        .map(
          (i) =>
            `<span class="${i.status}${i.flagged ? ' flag' : ''}"><em>${i.q}</em>${
              i.status === 'correct' ? i.answer : `${i.mine ?? '–'}→<b>${i.answer}</b>`
            }</span>`,
        )
        .join('')}</div>
       <p class="legend">회색 = 정답, 빨간색 = 오답/미응답(내 답 → <b>정답</b>), 밑줄 = 헷갈림 표시</p>`
    : ''

  const cards = items.length
    ? items
        .map((it) => {
          const n = rec.notes?.[it.q] ?? {}
          const p = partOf(it.q)
          const imgs = (n.images ?? []).filter((id) => images[id]).map((id) => `<img src="${images[id]}" alt="" />`).join('')
          const memo = n.memo?.trim()
            ? `<div class="memo">${esc(n.memo)}</div>`
            : opt.lines
              ? '<div class="lines"></div>'
              : ''
          return `<article class="card">
            <header>
              <span class="q">${it.q}번</span>${p ? `<span class="part">${p.name}</span>` : ''}
              <span class="ans">내 답 <s class="${it.status === 'correct' ? 'ok' : ''}">${it.mine ?? '–'}</s>${
                it.status === 'correct' ? '' : ` → 정답 <b>${it.answer}</b>`
              }</span>
              <span class="badge ${it.status}">${LABEL[it.status]}${it.flagged && it.status !== 'correct' ? ' ⚑' : ''}</span>
              ${n.reviewed ? '<span class="done">✓ 복습</span>' : ''}
            </header>
            ${n.tags?.length ? `<div class="tags">${n.tags.map((t) => `<span>#${esc(t)}</span>`).join('')}</div>` : ''}
            ${imgs ? `<div class="imgs">${imgs}</div>` : ''}
            ${memo}
          </article>`
        })
        .join('')
    : '<p class="empty">정리할 문항이 없습니다.</p>'

  return `<section class="record">
    <h1>${esc(rec.title)}</h1>
    <p class="meta">${fmtDate(rec.gradedAt ?? rec.createdAt)} · 문항 ${rec.start}–${rec.start + rec.count - 1}</p>
    <div class="score"><strong>${g.correct}</strong> / ${g.total} <span>(${pct(g.correct, g.total)}%)</span>
      <small>오답 ${g.wrong.length} · 미응답 ${g.blank.length}</small></div>
    ${breakdown}
    <h2>오답 노트 <small>${items.length}문항</small></h2>
    ${cards}
    ${grid}
  </section>`
}

function render() {
  const opt = {
    grid: $('#opt-grid').checked,
    flagged: $('#opt-flagged').checked,
    reviewed: $('#opt-reviewed').checked,
    lines: $('#opt-lines').checked,
  }
  $('#doc').innerHTML = records.length
    ? records.map((r) => recordHtml(r, opt)).join('')
    : '<p class="empty">내보낼 기록을 찾지 못했어요.</p>'
}

// 저장될 PDF 파일 이름 = 문서 제목
const today = new Date().toISOString().slice(0, 10).replaceAll('-', '')
const name = records.length === 1 ? records[0].title : `전체 ${records.length}회`
document.title = `토익오답노트_${name}_${today}`.replace(/[\\/:*?"<>|]/g, '_')

for (const el of document.querySelectorAll('.toolbar input')) el.addEventListener('change', render)
$('#btn-print').addEventListener('click', () => print())
render()

// 이미지 로딩이 끝난 뒤 인쇄 창 자동 열기
await Promise.all([...document.images].map((img) => img.decode().catch(() => {})))
if (records.length && params.get('print') === '1') setTimeout(() => print(), 300)
