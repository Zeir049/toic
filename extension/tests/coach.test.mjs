import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildProfile, profileToText } from '../lib/analysis.js'
import { buildMessages } from '../lib/coach.js'
import { KB } from '../lib/kb.js'
import { renderMarkdown } from '../lib/markdown.js'
import { listFreeModels, parseSSE, streamChat } from '../lib/openrouter.js'
import { retrieve } from '../lib/retrieve.js'

// 1–200 전체 시험: Part 5 를 많이 틀리고, RC 후반을 비워둔 학습자
function makeRecord({ id = 'r1', at = 1, part5Wrong = 18, tailBlank = 8, tags = ['문법'], memo = '시제 수동태 헷갈림' } = {}) {
  const key = {}
  const marks = {}
  for (let q = 1; q <= 200; q++) {
    key[q] = 'A'
    marks[q] = 'A'
  }
  for (let q = 101; q < 101 + part5Wrong; q++) marks[q] = 'B'
  for (let q = 200 - tailBlank + 1; q <= 200; q++) delete marks[q]
  const notes = { 101: { memo, tags, images: [], reviewed: false }, 102: { memo: '', tags, images: [], reviewed: false } }
  return { id, title: '테스트', createdAt: at, gradedAt: at, start: 1, count: 200, key, marks, flags: { 5: true, 6: true, 7: true }, notes }
}

test('약점 프로필: 약한 파트·태그·시간 부족 신호', () => {
  const p = buildProfile([makeRecord()])
  assert.equal(p.tests, 1)
  assert.equal(p.total, 200)
  assert.equal(p.weakParts[0].name, 'Part 5')
  assert.equal(p.rcTailBlank, 8)
  assert.deepEqual(p.tags, [{ tag: '문법', count: 2 }])
  assert.ok(p.signals['part:5'] > 0)
  assert.ok(p.signals['tag:문법'] > 0)
  assert.ok(p.signals.time > 0)
  assert.ok(p.signals.uncertain > 0)
  assert.equal(p.memos[0].part, 'Part 5')
})

test('약점 프로필: 최근 n회만', () => {
  const p = buildProfile([makeRecord({ id: 'a', at: 1 }), makeRecord({ id: 'b', at: 2, part5Wrong: 0, tailBlank: 0 })], { recent: 1 })
  assert.equal(p.tests, 1)
  assert.equal(p.correct, 200)
  assert.equal(p.weakParts.length, 0)
})

test('LLM 요약에는 시험 이름·이미지가 없고 수치와 메모만', () => {
  const text = profileToText(buildProfile([makeRecord()]))
  assert.match(text, /Part 5/)
  assert.match(text, /시제 수동태/)
  assert.doesNotMatch(text, /테스트/)
})

test('검색: Part 5 문법 약점 → 관련 공부법이 위로', () => {
  const hits = retrieve(buildProfile([makeRecord()]), { k: 6 })
  const ids = hits.map((h) => h.doc.id)
  assert.ok(ids.includes('p5-verb'), ids.join())
  assert.ok(ids.includes('time-allocation'), ids.join())
  assert.ok(hits.every((h, i) => i === 0 || hits[i - 1].score >= h.score))
})

test('검색: 신호가 없으면 공통 학습법으로 채움', () => {
  const hits = retrieve(buildProfile([makeRecord({ part5Wrong: 0, tailBlank: 0, tags: [], memo: '' })]))
  assert.ok(hits.length >= 3)
  assert.ok(hits.some((h) => h.doc.signals.includes('general')))
})

test('지식베이스 무결성: id 중복 없음, 필수 필드', () => {
  assert.equal(new Set(KB.map((d) => d.id)).size, KB.length)
  for (const d of KB) assert.ok(d.title && d.text && d.signals.length && Array.isArray(d.keywords), d.id)
})

test('프롬프트: 자료 번호가 매겨져 들어감', () => {
  const p = buildProfile([makeRecord()])
  const msgs = buildMessages(p, retrieve(p, { k: 3 }))
  assert.equal(msgs.length, 2)
  assert.match(msgs[1].content, /\[1\] /)
  assert.match(msgs[1].content, /\[3\] /)
})

test('마크다운: 모델 출력의 HTML은 이스케이프', () => {
  const html = renderMarkdown('## 진단\n- **문법** 약함 [2]\n<img src=x onerror=alert(1)>\n1. 첫째\n2. 둘째')
  assert.match(html, /<h3>진단<\/h3>/)
  assert.match(html, /<ul><li><strong>문법<\/strong> 약함 <sup class="cite" data-cite="2">2<\/sup><\/li><\/ul>/)
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/)
  assert.doesNotMatch(html, /<img/)
  assert.match(html, /<ol><li>첫째<\/li><li>둘째<\/li><\/ol>/)
})

test('SSE 파싱: 주석·[DONE]·덜 온 줄', () => {
  const r = parseSSE(': OPENROUTER PROCESSING\n\ndata: {"a":1}\n\ndata: [DONE]\ndata: {"b"')
  assert.deepEqual(r.events, [{ a: 1 }])
  assert.equal(r.done, true)
  assert.equal(r.rest, 'data: {"b"')
})

test('무료 텍스트 모델만, 자동 라우터가 맨 위', async () => {
  const fake = async () => ({
    ok: true,
    json: async () => ({
      data: [
        { id: 'x/paid', name: 'Paid', pricing: { prompt: '0.000001', completion: '0.000002' }, architecture: { output_modalities: ['text'] } },
        { id: 'g/music', name: 'Music', pricing: { prompt: '0', completion: '0' }, architecture: { output_modalities: ['text', 'audio'] } },
        { id: 'a/model:free', name: 'A free', pricing: { prompt: '0', completion: '0' }, architecture: { output_modalities: ['text'] } },
        { id: 'openrouter/free', name: 'Free Models Router', pricing: { prompt: '0', completion: '0' }, architecture: { output_modalities: ['text'] } },
      ],
    }),
  })
  const models = await listFreeModels(fake)
  assert.deepEqual(models.map((m) => m.id), ['openrouter/free', 'a/model:free'])
})

function sseResponse(chunks, status = 200) {
  const enc = new TextEncoder()
  return {
    ok: status < 400,
    status,
    json: async () => JSON.parse(chunks.join('')),
    body: new ReadableStream({
      start(c) {
        for (const ch of chunks) c.enqueue(enc.encode(ch))
        c.close()
      },
    }),
  }
}

test('스트리밍: 청크가 잘려 와도 이어 붙임 + 헤더/본문', async () => {
  let req
  const fake = async (url, init) => {
    req = { url, init }
    return sseResponse([
      ': OPENROUTER PROCESSING\n\n',
      'data: {"model":"g/real:free","choices":[{"delta":{"reasoning":"..."}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"## 진"}}]}\n\ndata: {"choi',
      'ces":[{"delta":{"content":"단"}}]}\n\n',
      'data: [DONE]\n\n',
    ])
  }
  const seen = []
  let reasoning = false
  const r = await streamChat({
    apiKey: 'test-key',
    model: 'openrouter/free',
    messages: [{ role: 'user', content: 'hi' }],
    fetchImpl: fake,
    onText: (t) => seen.push(t),
    onReasoning: (v) => v && (reasoning = true),
  })
  assert.equal(r.text, '## 진단')
  assert.equal(r.model, 'g/real:free')
  assert.deepEqual(seen, ['## 진', '## 진단'])
  assert.ok(reasoning)
  assert.equal(req.url, 'https://openrouter.ai/api/v1/chat/completions')
  assert.equal(req.init.headers.Authorization, 'Bearer test-key')
  const body = JSON.parse(req.init.body)
  assert.equal(body.stream, true)
  assert.equal(body.model, 'openrouter/free')
})

test('오류: 429는 무료 한도 안내, 스트림 중 error 이벤트도 처리', async () => {
  await assert.rejects(
    streamChat({ apiKey: 'k', model: 'm', messages: [], fetchImpl: async () => sseResponse(['{"error":{"message":"Rate limit","code":429}}'], 429) }),
    (e) => e.status === 429 && /무료 사용 한도/.test(e.message),
  )
  await assert.rejects(
    streamChat({ apiKey: 'k', model: 'm', messages: [], fetchImpl: async () => sseResponse(['data: {"error":{"message":"upstream","code":502}}\n\n']) }),
    (e) => e.status === 502,
  )
})

test('추론만 하고 답이 비면: 원인(한도 소진)을 알려 줌', async () => {
  const fake = async () =>
    sseResponse([
      'data: {"model":"x/thinker:free","choices":[{"delta":{"reasoning":"생각 생각 생각"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":""},"finish_reason":"length"}]}\n\n',
      'data: [DONE]\n\n',
    ])
  await assert.rejects(
    streamChat({ apiKey: 'k', model: 'openrouter/free', messages: [], fetchImpl: fake }),
    (e) => e.status === 'empty' && /한도/.test(e.message) && /x\/thinker:free/.test(e.message),
  )
})

test('추론량을 낮춰 요청 + 마지막 줄에 줄바꿈이 없어도 처리', async () => {
  let body
  const fake = async (_url, init) => {
    body = JSON.parse(init.body)
    return sseResponse(['data: {"choices":[{"delta":{"content":"답"},"finish_reason":"stop"}]}'])
  }
  const r = await streamChat({ apiKey: 'k', model: 'm', messages: [], fetchImpl: fake })
  assert.equal(r.text, '답')
  assert.equal(r.finish, 'stop')
  assert.deepEqual(body.reasoning, { effort: 'low' })
})
