// 순수 채점 로직 (DOM/chrome API 의존 없음 → node --test 로 테스트 가능)
// web/src/grading.js 를 확장: 번호가 섞인 정답지 붙여넣기, 범위 채점, 파트별 집계.

export const OPTIONS = ['A', 'B', 'C', 'D']

// 토익 정기시험 문항 구성 (LC 1–100, RC 101–200)
export const TOEIC_PARTS = [
  { part: 1, name: 'Part 1', section: 'LC', from: 1, to: 6 },
  { part: 2, name: 'Part 2', section: 'LC', from: 7, to: 31 },
  { part: 3, name: 'Part 3', section: 'LC', from: 32, to: 70 },
  { part: 4, name: 'Part 4', section: 'LC', from: 71, to: 100 },
  { part: 5, name: 'Part 5', section: 'RC', from: 101, to: 130 },
  { part: 6, name: 'Part 6', section: 'RC', from: 131, to: 146 },
  { part: 7, name: 'Part 7', section: 'RC', from: 147, to: 200 },
]

export function partOf(q) {
  return TOEIC_PARTS.find((p) => q >= p.from && q <= p.to) ?? null
}

export function range(start, count) {
  return Array.from({ length: count }, (_, i) => start + i)
}

const CIRCLED = {
  '①': 'A', '②': 'B', '③': 'C', '④': 'D',
  'Ⓐ': 'A', 'Ⓑ': 'B', 'Ⓒ': 'C', 'Ⓓ': 'D',
  'ⓐ': 'A', 'ⓑ': 'B', 'ⓒ': 'C', 'ⓓ': 'D',
  'Ａ': 'A', 'Ｂ': 'B', 'Ｃ': 'C', 'Ｄ': 'D',
}

// 번호 + 정답 쌍: "101. B", "101 (B)", "101) b", "101번 B", "1A2B", "101: B"
const NUMBERED_RE = /(?<!\d)(\d{1,3})\s*(?:번|[.):\]\-])?\s*[([]?\s*([A-Da-d])\s*[)\]]?(?![A-Za-z])/g

/**
 * 붙여넣은 정답지 텍스트를 { 문항번호: 'A'|'B'|'C'|'D' } 로 변환.
 * - 번호가 함께 있으면(1. A 2. C ...) 번호를 그대로 사용
 * - 번호가 없으면(ABCDA...) start 번호부터 순서대로 배정
 */
export function parseAnswerKey(text, start = 1) {
  const src = String(text ?? '').replace(/[①-④Ⓐ-Ⓓⓐ-ⓓＡ-Ｄ]/g, (c) => CIRCLED[c] ?? c)

  const numbered = [...src.matchAll(NUMBERED_RE)].map((m) => [Number(m[1]), m[2].toUpperCase()])

  // 순차 형식: 숫자를 지우고 A–D 로만 이루어진 토큰의 글자만 모음 ("Answer", "Part" 같은 단어는 무시)
  const sequential = src
    .replace(/\d+/g, ' ')
    .split(/[^A-Za-z]+/)
    .filter((tok) => tok && /^[A-Da-d]+$/.test(tok))
    .join('')
    .toUpperCase()

  const answers = {}
  const issues = []

  if (numbered.length > 0 && numbered.length >= sequential.length * 0.5) {
    for (const [q, a] of numbered) {
      if (answers[q] && answers[q] !== a) {
        issues.push(`${q}번 정답이 두 번 나옵니다 (${answers[q]} / ${a}). 뒤의 값을 사용합니다.`)
      }
      answers[q] = a
    }
    return { answers, mode: 'numbered', count: Object.keys(answers).length, issues }
  }

  for (let i = 0; i < sequential.length; i++) answers[start + i] = sequential[i]
  return { answers, mode: 'sequential', count: sequential.length, issues }
}

/**
 * 범위(questions) 안에서 채점. 정답지에 없는 번호는 채점에서 제외(noKey)한다.
 * 마킹 안 한 문항은 오답(blank)으로 집계.
 */
export function grade(marks, key, questions, flags = {}) {
  const items = []
  const noKey = []
  for (const q of questions) {
    const answer = key[q]
    if (!answer) {
      noKey.push(q)
      continue
    }
    const mine = marks[q] ?? null
    const status = mine === answer ? 'correct' : mine ? 'wrong' : 'blank'
    items.push({ q, mine, answer, status, flagged: !!flags[q] })
  }

  const groups = new Map()
  const bump = (name, ok) => {
    const g = groups.get(name) ?? { name, correct: 0, total: 0 }
    g.total += 1
    if (ok) g.correct += 1
    groups.set(name, g)
  }
  for (const it of items) {
    const p = partOf(it.q)
    if (p) {
      bump(p.section, it.status === 'correct')
      bump(p.name, it.status === 'correct')
    }
  }
  const order = ['LC', 'RC', ...TOEIC_PARTS.map((p) => p.name)]
  const breakdown = order.filter((n) => groups.has(n)).map((n) => groups.get(n))

  const correct = items.filter((i) => i.status === 'correct').length
  return {
    items,
    correct,
    total: items.length,
    wrong: items.filter((i) => i.status === 'wrong').map((i) => i.q),
    blank: items.filter((i) => i.status === 'blank').map((i) => i.q),
    noKey,
    breakdown,
  }
}

/** 오답노트에 올라갈 문항: 오답 + 미응답 + (맞았지만) 헷갈림 표시 */
export function reviewItems(gradeResult) {
  return gradeResult.items.filter((i) => i.status !== 'correct' || i.flagged)
}

export function pct(correct, total) {
  return total ? ((correct / total) * 100).toFixed(1) : '0.0'
}
