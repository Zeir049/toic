// 포스터 스크린샷용 예시 데이터 (결정적 난수 → 매번 같은 화면)
// 실제 사용자 기록이 아닌 가상의 모의고사 3회분이다.

const O = 'ABCD'

function rng(seed) {
  let s = seed
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

// 회차별 파트 정답률 목표와 RC 후반 미응답 시작 번호
const ROUNDS = [
  { title: '모의고사 1회', daysAgo: 20, acc: [0.84, 0.82, 0.8, 0.78, 0.58, 0.66, 0.5], blankFrom: 187 },
  { title: '모의고사 2회', daysAgo: 12, acc: [0.86, 0.86, 0.84, 0.82, 0.64, 0.72, 0.58], blankFrom: 192 },
  { title: '모의고사 3회', daysAgo: 4, acc: [0.92, 0.9, 0.87, 0.86, 0.72, 0.78, 0.66], blankFrom: 198 },
]
const PART_RANGES = [[1, 6], [7, 31], [32, 70], [71, 100], [101, 130], [131, 146], [147, 200]]

const NOTE_BY_PART = {
  2: [['함정'], 'Where 질문에 장소 단어가 반복된 보기를 고름. 우회 응답 "아직 안 정해졌어요"가 정답'],
  3: [['패러프레이징', '듣기'], 'broken printer → device is not working 으로 바뀐 걸 못 알아들음'],
  4: [['듣기'], '호주 발음 화자, 숫자(fifteen/fifty) 구분 실패'],
  5: [['문법'], '동사 자리인데 준동사 골랐음. 주어 수 일치 → 태 → 시제 순서로 볼 것'],
  6: [['문법', '해석'], '접속부사 however/therefore 앞 문장 안 읽고 풀었음'],
  7: [['패러프레이징', '시간부족'], '근거 문장 찾다가 시간 초과. three branches = multiple locations'],
}

export function makeDemo(now = Date.parse('2026-11-23T10:00:00+09:00')) {
  const records = []
  ROUNDS.forEach((round, r) => {
    const rand = rng(97 + r * 31)
    const key = {}
    const marks = {}
    const flags = {}
    const notes = {}
    PART_RANGES.forEach(([from, to], p) => {
      for (let q = from; q <= to; q++) {
        const opts = p === 1 ? 'ABC' : O
        key[q] = opts[Math.floor(rand() * opts.length)]
        if (q >= round.blankFrom) continue
        marks[q] = rand() < round.acc[p] ? key[q] : opts[(opts.indexOf(key[q]) + 1 + Math.floor(rand() * (opts.length - 1))) % opts.length]
        if (rand() < 0.05) flags[q] = true
      }
    })
    // 틀린 문항 일부에 태그·메모 (학습자가 정리했다고 가정)
    let n = 0
    for (let q = 1; q <= 200; q++) {
      if (marks[q] === key[q] || !marks[q]) continue
      const part = PART_RANGES.findIndex(([a, b]) => q >= a && q <= b) + 1
      const tmpl = NOTE_BY_PART[part]
      if (!tmpl || rand() < 0.45) continue
      notes[q] = { memo: n % 2 === 0 ? tmpl[1] : '', tags: tmpl[0], images: [], reviewed: r < 2 ? rand() < 0.6 : n < 2 }
      n++
    }
    const at = now - round.daysAgo * 86400000
    records.push({ id: 'demo' + (r + 1), title: round.title, createdAt: at, gradedAt: at, updatedAt: at, start: 1, count: 200, key, marks, flags, notes })
  })
  return records
}

export function keyText(rec) {
  // 해설지에서 복사해 온 것처럼 "101. (B)" 형식
  const parts = []
  for (let q = rec.start; q < rec.start + rec.count; q++) parts.push(`${q}. (${rec.key[q]})`)
  return parts.join('  ')
}
