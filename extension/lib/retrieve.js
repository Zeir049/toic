// RAG 검색 단계: 약점 프로필의 신호(메타데이터)와 오답 메모(어휘)로 지식베이스 조각을 점수화.
// 임베딩 API 없이도 동작하는 하이브리드 검색 — 지식베이스가 수십 개 규모라 이걸로 충분하다.
import { KB } from './kb.js'

const SIGNAL_WEIGHT = 1
const KEYWORD_WEIGHT = 0.15

export function retrieve(profile, { k = 6, kb = KB } = {}) {
  const memoText = profile.memos.map((m) => m.text).join('\n').toLowerCase()
  const scored = kb.map((doc) => {
    let signalScore = 0
    const matched = []
    for (const s of doc.signals) {
      const w = profile.signals[s] ?? 0
      if (w > 0) {
        signalScore += w * SIGNAL_WEIGHT
        matched.push(s)
      }
    }
    const hits = doc.keywords.filter((kw) => memoText.includes(kw.toLowerCase()))
    const keywordScore = Math.min(hits.length, 4) * KEYWORD_WEIGHT
    return { doc, score: signalScore + keywordScore, matched, hits }
  })

  const picked = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)

  // 신호가 거의 없을 때(기록이 적거나 고르게 잘 본 경우)는 공통 학습법으로 채움
  if (picked.length < 3) {
    for (const s of scored) {
      if (picked.length >= 3) break
      if (s.doc.signals.includes('general') && !picked.includes(s)) picked.push(s)
    }
  }
  return picked
}
