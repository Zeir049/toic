// Pure grading/validation logic, mirroring app/grading.py from the Python version.
// Kept dependency-free so it's easy to reason about and reuse from App.jsx.

export const DEFAULT_QUESTION_COUNT = 100
export const OPTIONS = ['A', 'B', 'C', 'D']

export function normalizeAnswerString(raw) {
  return raw.trim().toUpperCase().replace(/\s+/g, '')
}

// When `total` is given, raw must be exactly that many characters (used to
// check submitted answers against an already-registered key's length). When
// omitted, any non-empty string of valid option characters is accepted — the
// key's own length becomes the question count to grade.
export function validateAnswerString(raw, total = null) {
  if (!raw) {
    return '정답을 입력해주세요.'
  }
  if (total !== null && raw.length !== total) {
    return `정답은 정확히 ${total}자여야 합니다. (현재: ${raw.length}자)`
  }
  for (const char of raw) {
    if (!OPTIONS.includes(char)) {
      return `유효하지 않은 문자: '${char}'`
    }
  }
  return null
}

export function parseAnswerString(raw) {
  const map = {}
  for (let i = 0; i < raw.length; i++) {
    map[i + 1] = raw[i]
  }
  return map
}

export function grade(userAnswers, answerKey, total = null) {
  const effectiveTotal = total ?? Object.keys(answerKey).length
  let correctCount = 0
  const wrongQuestions = []
  for (let q = 1; q <= effectiveTotal; q++) {
    if (userAnswers[q] === answerKey[q]) {
      correctCount += 1
    } else {
      wrongQuestions.push(q)
    }
  }
  return { correctCount, wrongQuestions }
}

export function buildResultText({
  timestamp,
  correctCount,
  total,
  userAnswers,
  answerKey,
  wrongQuestions,
  notes,
}) {
  const accuracy = ((correctCount / total) * 100).toFixed(1)
  const lines = [
    '=========================================',
    '           토익 채점 및 오답 노트          ',
    '=========================================',
    `일시: ${timestamp}`,
    `점수: ${correctCount} / ${total} (${accuracy}%)`,
    '',
    '[ 전체 답안 현황 ]',
  ]

  for (let i = 1; i <= total; i++) {
    const isCorrect = userAnswers[i] === answerKey[i] ? 'O' : 'X'
    lines.push(
      `${String(i).padStart(3, '0')}번 | 제출: ${userAnswers[i]} | 정답: ${answerKey[i]} | [${isCorrect}]`,
    )
  }

  lines.push('')
  lines.push('[ 오답 노트 ]')
  if (wrongQuestions.length > 0) {
    for (const q of wrongQuestions) {
      const reason = (notes[q] || '').trim() || '메모 없음'
      lines.push(`- ${String(q).padStart(3, '0')}번 (제출: ${userAnswers[q]} / 정답: ${answerKey[q]})`)
      lines.push(`  이유: ${reason}`)
    }
  } else {
    lines.push('틀린 문제가 없습니다.')
  }

  return lines.join('\n') + '\n'
}
