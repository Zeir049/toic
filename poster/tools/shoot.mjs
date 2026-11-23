// 포스터용 확장 프로그램 화면 캡처: node poster/tools/shoot.mjs
// 확장 프로그램의 실제 페이지(sidepanel.html, report.html)를 예시 데이터로 띄워 3배 해상도로 찍는다.
import fs from 'node:fs'
import path from 'node:path'
import { buildProfile } from '../../extension/lib/analysis.js'
import { partOf } from '../../extension/lib/grading.js'
import { retrieve } from '../../extension/lib/retrieve.js'
import { REPO, launch, serve, sleep } from './chrome.mjs'
import { keyText, makeDemo } from './demo-data.mjs'

const OUT = path.join(REPO, 'poster', 'assets')
fs.mkdirSync(OUT, { recursive: true })
const out = (name) => path.join(OUT, name)

const records = makeDemo()
const latest = records.at(-1)
const profile = buildProfile(records)
const sources = retrieve(profile).map((r) => ({ id: r.doc.id, title: r.doc.title, text: r.doc.text, matched: r.matched }))

// AI 추천 화면 예시 (실제 모델 응답이 아닌, 위 예시 데이터 수치에 맞춰 쓴 예시 문안)
const pct = (x) => (x * 100).toFixed(1) + '%'
const part = (n) => profile.parts.find((p) => p.name === n)
const coachingText = `## 한눈에 보는 진단
3회 평균 정답률은 ${pct(profile.accuracy)}로 오르는 중이에요(${profile.trend.map((t) => pct(t.correct / t.total)).join(' → ')}). LC ${pct(profile.sections.LC.acc)}에 비해 RC가 ${pct(profile.sections.RC.acc)}로 낮고, 특히 **Part 7(${pct(part('Part 7').acc)})** 과 RC 후반 미응답 ${profile.rcTailBlank}문항이 점수를 가장 많이 깎고 있어요.

## 약점 TOP 3
1. **Part 7 시간 관리** — 176–200번 미응답 ${profile.rcTailBlank}문항, '시간부족' 태그 ${profile.tags.find((t) => t.tag === '시간부족')?.count ?? 0}회.
2. **패러프레이징** — 가장 많이 단 태그(${profile.tags[0].count}회). 지문과 보기의 바뀐 표현을 잇지 못해요.
3. **Part 5 동사 문제** — 정답률 ${pct(part('Part 5').acc)}, '준동사 자리 혼동' 메모가 반복돼요.

## 추천 공부법
### 시간 관리
- Part 5는 문제당 20초, 막히면 표시하고 넘기기 [1]
- 질문을 먼저 읽고 찾을 정보를 정한 뒤 근거만 찾아 읽기 [2]
### 패러프레이징
- 틀린 문제마다 '지문 근거 문장 ↔ 정답 보기'를 짝지어 기록 [3]
### 문법
- 동사 문제는 수 일치 → 태 → 시제 순서로 확인 [5]

## 2주 학습 계획
- 1주차: 매일 Part 5 30문제(10분 타이머) + Part 7 단일 지문 4세트
- 2주차: 실전 모의고사 1회 + 패러프레이징 표현 복습

## 다음 모의고사에서 확인할 것
- Part 7 시작 때 남은 시간 55분 이상
- 미응답 0개`

const { server, base } = await serve()
const { page, close } = await launch()

try {
  // 1) 가상 시험지(PDF 대신) + 오답노트에 붙일 문제 캡처 이미지
  await page.viewport(736, 1010, 2.5)
  await page.goto(`${base}/poster/sample-test.html`)
  await page.shot(out('sample-test.png'))
  const r = await page.eval(`(() => { const b = document.querySelector('#q123').getBoundingClientRect(); return { x: b.x - 6, y: b.y - 6, width: b.width + 12, height: b.height + 10 } })()`)
  const qImg = 'data:image/png;base64,' + (await page.shot(null, r))

  // 오답노트 예시: 123번(가상 시험지의 동사 문제)에 위 이미지를 첨부
  const noteQ = 123
  if (!latest.notes[noteQ]?.memo || partOf(noteQ)?.part !== 5 || latest.marks[noteQ] === latest.key[noteQ]) {
    throw new Error('예시 데이터에서 123번이 메모 달린 Part 5 오답이어야 해요')
  }
  latest.notes[noteQ].images = ['demo-img-1']
  latest.notes[noteQ].reviewed = false

  const seed = async (session, extra = {}) => {
    await page.goto(`${base}/extension/sidepanel.html`, 100)
    const data = {
      records,
      session,
      presets: { '모의고사 3회': { text: keyText(latest), start: 1 } },
      aiSettings: { apiKey: '', model: 'openrouter/free', recent: 0 },
      'img:demo-img-1': qImg,
      ...extra,
    }
    await page.eval(`(() => { localStorage.clear(); const d = ${JSON.stringify(data)}; for (const [k, v] of Object.entries(d)) localStorage.setItem('toic-ext:' + k, JSON.stringify(v)); })()`)
    await page.reload(700)
  }
  const click = (sel) => page.eval(`document.querySelector(${JSON.stringify(sel)}).click()`)

  // 2) 마킹 탭: 3회차를 131번까지 마킹 중
  const marksUpTo = Object.fromEntries(Object.entries(latest.marks).filter(([q]) => Number(q) <= 131))
  const flagsUpTo = Object.fromEntries(Object.entries(latest.flags).filter(([q]) => Number(q) <= 131))
  await page.viewport(400, 860)
  await seed({ title: latest.title, start: 1, count: 200, marks: marksUpTo, flags: flagsUpTo, current: 132, keyText: '', recordId: null })
  await page.eval(`document.querySelector('.q[data-q="132"]').scrollIntoView({ block: 'center' })`)
  await sleep(200)
  await page.shot(out('panel-mark.png'))

  // 3) 채점 탭: 해설지 정답을 붙여넣고 채점한 결과
  await page.viewport(400, 1240)
  await seed({ title: latest.title, start: 1, count: 200, marks: latest.marks, flags: latest.flags, current: 200, keyText: keyText(latest), recordId: latest.id })
  await click('[data-tab=grade]')
  await sleep(300)
  await page.shot(out('panel-grade.png'))

  // 4) 오답노트: 이미지·메모·태그가 달린 카드
  await page.viewport(400, 1000)
  await click('[data-tab=notes]')
  await sleep(200)
  await page.eval(`[...document.querySelectorAll('#records .record')].find((el) => el.textContent.includes(${JSON.stringify(latest.title)})).click()`)
  await sleep(900)
  await page.eval(`(() => { const card = document.querySelector('.item[data-q="${noteQ}"]'); const body = document.querySelector('#tab-notes'); body.scrollTop = card.offsetTop - body.offsetTop - 8 })()`)
  await sleep(300)
  await page.shot(out('panel-notes.png'))

  // 5) 분석 탭: 약점 프로필 + AI 추천(예시 문안)
  await page.viewport(400, 1090)
  await seed(
    { title: latest.title, start: 1, count: 200, marks: latest.marks, flags: latest.flags, current: 200, keyText: keyText(latest), recordId: latest.id },
    { coaching: { at: Date.parse('2026-11-23T10:30:00+09:00'), model: 'google/gemma-4-31b-it:free', text: coachingText, sources } },
  )
  await click('[data-tab=analysis]')
  await page.eval(`document.querySelector('#ai-settings').open = false`)
  await sleep(300)
  await page.shot(out('panel-analysis.png'))
  await page.viewport(400, 1240)
  await page.eval(`(() => { const box = document.querySelector('.ai-box'); const body = document.querySelector('#tab-analysis'); body.scrollTop = box.offsetTop - body.offsetTop })()`)
  await sleep(300)
  await page.shot(out('panel-ai.png'))

  // 6) 오답노트 PDF(인쇄용 문서) 첫 화면
  await page.viewport(820, 1100, 2.5)
  await page.goto(`${base}/extension/report.html?ids=${latest.id}`, 600)
  // 화면 옵션 '메모 없으면 필기 줄'을 끄고(실제 옵션), 툴바만 숨겨서 문서 부분을 찍음
  await page.eval(`(() => {
    const lines = document.querySelector('#opt-lines'); lines.checked = false; lines.dispatchEvent(new Event('change'))
    document.querySelector('.toolbar').style.display = 'none'; document.body.style.background = '#fff'
    document.querySelector('#doc').style.margin = '0 auto'; document.querySelector('.record').style.boxShadow = 'none'
  })()`)
  await sleep(400)
  await page.shot(out('report.png'))
  const card = await page.eval(`(() => { const c = [...document.querySelectorAll('.card')].find((el) => el.querySelector('img')); c.scrollIntoView({ block: 'center' }); const b = c.getBoundingClientRect(); return { x: b.x + scrollX - 2, y: b.y + scrollY - 2, width: b.width + 4, height: b.height + 4 } })()`)
  await sleep(200)
  await page.shot(out('report-card.png'), card)

  // 포스터 본문에 쓸 수치
  fs.writeFileSync(
    out('demo-stats.json'),
    JSON.stringify(
      {
        rounds: records.map((rec, i) => ({ title: rec.title, pct: profile.trend[i].correct / profile.trend[i].total, correct: profile.trend[i].correct })),
        accuracy: profile.accuracy,
        lc: profile.sections.LC.acc,
        rc: profile.sections.RC.acc,
        parts: profile.parts.map((p) => ({ name: p.name, acc: p.acc })),
        weak: profile.weakParts.map((p) => p.name),
        tags: profile.tags,
        rcTailBlank: profile.rcTailBlank,
        sources: sources.map((s) => s.title),
      },
      null,
      2,
    ),
  )
  console.log('saved:', fs.readdirSync(OUT).join(', '))
} finally {
  await close()
  server.close()
}
