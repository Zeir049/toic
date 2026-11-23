// RAG 생성 단계: 약점 프로필 + 검색된 공부법 조각 → LLM 프롬프트
import { profileToText } from './analysis.js'

export function buildMessages(profile, retrieved) {
  const sources = retrieved.map((r, i) => `[${i + 1}] ${r.doc.title}\n${r.doc.text}`).join('\n\n')

  const system = `너는 한국인 토익 수험생을 돕는 학습 코치다.
규칙:
- 반드시 [학습자 데이터]의 수치와 메모에 근거해 진단하고, 데이터에 없는 사실(점수 예측, 시험 일정 등)을 지어내지 않는다.
- 공부법은 [학습 자료]를 우선 활용하고, 활용한 문장 끝에 [1], [2]처럼 자료 번호를 붙인다. 자료에 없는 일반적인 조언을 덧붙일 때는 번호를 붙이지 않는다.
- 데이터가 적으면(모의고사 1~2회, 태그 거의 없음) 그 한계를 한 줄로 밝히고, 오답노트에 태그·메모를 남기면 더 정확해진다고 안내한다.
- 한국어로, 마크다운으로, 전체 1,200자 안팎으로 간결하게 쓴다. 표는 쓰지 않는다.

출력 형식:
## 한눈에 보는 진단
(2~3문장)
## 약점 TOP 3
1. **약점 이름** — 근거 수치 한 줄, 원인 추정 한 줄
## 추천 공부법
### (약점별 소제목)
- 구체적인 방법과 하루 분량
## 2주 학습 계획
- 1주차: ...
- 2주차: ...
## 다음 모의고사에서 확인할 것
- 체크 항목 2~3개`

  const user = `[학습자 데이터]
${profileToText(profile)}

[학습 자료]
${sources || '(검색된 자료 없음)'}

위 데이터를 바탕으로 약점을 진단하고 공부법을 추천해 줘.`

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}
