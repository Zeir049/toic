// 채점 기록 → 약점 프로필 (AI 없이 계산되는 부분). 순수 함수.
import { TOEIC_PARTS, grade, partOf, range, reviewItems } from './grading.js'

const MIN_PART_QUESTIONS = 3 // 이보다 적게 푼 파트는 약점 판단에서 제외

/**
 * @param {Array} records  저장된 채점 기록
 * @param {{ recent?: number }} opt  최근 n회만 볼 때
 */
export function buildProfile(records, { recent = 0 } = {}) {
  const sorted = [...records].sort((a, b) => (a.gradedAt ?? a.createdAt) - (b.gradedAt ?? b.createdAt))
  const used = recent > 0 ? sorted.slice(-recent) : sorted

  const parts = new Map(TOEIC_PARTS.map((p) => [p.name, { ...p, correct: 0, total: 0 }]))
  const sections = { LC: { correct: 0, total: 0 }, RC: { correct: 0, total: 0 } }
  const tagCount = new Map()
  const memos = []
  const trend = []
  let correct = 0
  let total = 0
  let blank = 0
  let rcTailBlank = 0
  let flaggedTotal = 0
  let flaggedCorrect = 0
  let reviewTotal = 0
  let reviewed = 0

  for (const rec of used) {
    const g = grade(rec.marks, rec.key, range(rec.start, rec.count), rec.flags)
    correct += g.correct
    total += g.total
    blank += g.blank.length
    // RC 마지막 25문항(176–200)의 미응답 → 시간 부족 신호
    rcTailBlank += g.blank.filter((q) => q >= 176 && q <= 200).length
    trend.push({ title: rec.title, at: rec.gradedAt ?? rec.createdAt, correct: g.correct, total: g.total })

    for (const it of g.items) {
      const p = partOf(it.q)
      const ok = it.status === 'correct'
      if (p) {
        const agg = parts.get(p.name)
        agg.total++
        if (ok) agg.correct++
        sections[p.section].total++
        if (ok) sections[p.section].correct++
      }
      if (it.flagged) {
        flaggedTotal++
        if (ok) flaggedCorrect++
      }
    }

    for (const it of reviewItems(g)) {
      reviewTotal++
      const n = rec.notes?.[it.q]
      if (!n) continue
      if (n.reviewed) reviewed++
      for (const t of n.tags ?? []) tagCount.set(t, (tagCount.get(t) ?? 0) + 1)
      const memo = n.memo?.trim()
      if (memo) memos.push({ at: rec.gradedAt ?? rec.createdAt, q: it.q, part: partOf(it.q)?.name ?? null, text: memo })
    }
  }

  const acc = (c, t) => (t ? c / t : null)
  const overall = acc(correct, total)
  const partList = [...parts.values()]
    .filter((p) => p.total > 0)
    .map((p) => ({ name: p.name, part: p.part, section: p.section, correct: p.correct, total: p.total, acc: acc(p.correct, p.total) }))

  // 전체 평균보다 낮은 파트를 낮은 순으로 (최대 3개). 표본이 적은 파트는 제외
  const weakParts = partList
    .filter((p) => p.total >= MIN_PART_QUESTIONS && overall != null && p.acc < overall)
    .sort((a, b) => a.acc - b.acc)
    .slice(0, 3)

  const tags = [...tagCount.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count)
  const tagged = tags.reduce((s, t) => s + t.count, 0)

  // 검색(retrieval)에 쓸 신호와 가중치(0~1)
  const signals = {}
  const bump = (k, w) => (signals[k] = Math.min(1, (signals[k] ?? 0) + w))
  for (const p of weakParts) bump('part:' + p.part, Math.max(0.3, (overall - p.acc) * 4))
  for (const t of tags) bump('tag:' + t.tag, (t.count / Math.max(tagged, 1)) * 1.5)
  for (const [name, s] of Object.entries(sections)) {
    const other = sections[name === 'LC' ? 'RC' : 'LC']
    if (s.total >= 10 && other.total >= 10 && acc(s.correct, s.total) + 0.05 < acc(other.correct, other.total)) {
      bump('section:' + name, 0.5)
    }
  }
  if (rcTailBlank >= 3 || (tagCount.get('시간부족') ?? 0) >= 2) bump('time', 0.4 + Math.min(rcTailBlank, 15) / 25)
  if (flaggedTotal >= 3) bump('uncertain', Math.min(1, flaggedTotal / Math.max(total, 1) * 10))
  if (reviewTotal >= 10 && reviewed / reviewTotal < 0.3) bump('review', 0.4)

  return {
    tests: used.length,
    correct,
    total,
    accuracy: overall,
    sections: Object.fromEntries(
      Object.entries(sections).map(([k, s]) => [k, { ...s, acc: acc(s.correct, s.total) }]),
    ),
    parts: partList,
    weakParts,
    tags,
    tagged,
    blank,
    rcTailBlank,
    flaggedTotal,
    flaggedCorrect,
    reviewTotal,
    reviewed,
    trend,
    memos: memos.sort((a, b) => b.at - a.at).slice(0, 15),
    signals,
  }
}

const pctStr = (x) => (x == null ? '-' : `${(x * 100).toFixed(1)}%`)

/** LLM에 보낼 요약 (개인정보 최소화: 시험 이름·날짜·이미지는 보내지 않음) */
export function profileToText(p) {
  const lines = [
    `분석한 모의고사: ${p.tests}회, 총 ${p.total}문항, 정답률 ${pctStr(p.accuracy)}`,
    `LC 정답률 ${pctStr(p.sections.LC.acc)} (${p.sections.LC.correct}/${p.sections.LC.total}), RC 정답률 ${pctStr(p.sections.RC.acc)} (${p.sections.RC.correct}/${p.sections.RC.total})`,
    '파트별 정답률: ' + p.parts.map((x) => `${x.name} ${pctStr(x.acc)} (${x.correct}/${x.total})`).join(', '),
    '평균보다 낮은 파트: ' + (p.weakParts.map((x) => `${x.name} ${pctStr(x.acc)}`).join(', ') || '없음'),
    '오답 원인 태그(학습자가 직접 분류): ' + (p.tags.map((t) => `${t.tag} ${t.count}회`).join(', ') || '태그 없음'),
    `미응답 ${p.blank}문항 (그중 RC 176–200번 ${p.rcTailBlank}문항)`,
    `헷갈림 표시 ${p.flaggedTotal}문항 (그중 맞힌 문항 ${p.flaggedCorrect})`,
    `오답노트 복습 완료 ${p.reviewed}/${p.reviewTotal}`,
  ]
  if (p.trend.length > 1) {
    lines.push('회차별 정답률 추이(오래된 순): ' + p.trend.map((t) => pctStr(t.total ? t.correct / t.total : null)).join(' → '))
  }
  if (p.memos.length) {
    lines.push('최근 오답 메모(학습자 작성):')
    for (const m of p.memos.slice(0, 10)) lines.push(`- [${m.part ?? m.q + '번'}] ${m.text.replace(/\s+/g, ' ').slice(0, 140)}`)
  }
  return lines.join('\n')
}
