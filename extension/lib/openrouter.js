// OpenRouter 클라이언트 (OpenAI 호환 chat completions + SSE 스트리밍).
// OpenRouter API는 CORS를 허용하므로 확장 프로그램에 별도 호스트 권한이 필요 없다.

const BASE = 'https://openrouter.ai/api/v1'
export const DEFAULT_MODEL = 'openrouter/free' // 무료 모델 자동 라우터

/** 무료(입력·출력 가격 0) + 텍스트 출력 모델 목록. 키 없이 조회 가능 */
export async function listFreeModels(fetchImpl = fetch) {
  const res = await fetchImpl(`${BASE}/models`)
  if (!res.ok) throw new Error(`모델 목록을 불러오지 못했어요 (${res.status})`)
  const { data } = await res.json()
  return data
    .filter((m) => {
      const p = m.pricing ?? {}
      const out = m.architecture?.output_modalities ?? ['text']
      return Number(p.prompt) === 0 && Number(p.completion) === 0 && out.length === 1 && out[0] === 'text'
    })
    .map((m) => ({ id: m.id, name: m.name, context: m.context_length }))
    .sort((a, b) => (a.id === DEFAULT_MODEL ? -1 : b.id === DEFAULT_MODEL ? 1 : a.name.localeCompare(b.name)))
}

export class OpenRouterError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

export function explainError(status, apiMessage = '') {
  const tail = apiMessage ? ` (${apiMessage})` : ''
  switch (status) {
    case 401:
      return 'API 키가 올바르지 않아요. AI 설정에서 키를 다시 확인해 주세요.' + tail
    case 402:
      return '이 모델은 크레딧이 필요해요. 이름에 (free)가 붙은 무료 모델을 골라 주세요.' + tail
    case 429:
      return '무료 사용 한도(분당/일일 요청 수)에 걸렸어요. 잠시 뒤 다시 시도하거나 다른 무료 모델을 골라 주세요.' + tail
    case 404:
    case 400:
      return '선택한 모델을 지금 쓸 수 없어요. 다른 무료 모델을 골라 주세요.' + tail
    case 502:
    case 503:
      return '모델 제공사가 일시적으로 응답하지 않아요. 잠시 뒤 다시 시도해 주세요.' + tail
    default:
      return `요청에 실패했어요 (${status ?? '네트워크'}).` + tail
  }
}

/** 답 본문이 비었을 때 원인별 안내 */
export function explainEmpty({ model, finish, reasoningChars }) {
  const who = model ? `(${model})` : ''
  if (reasoningChars > 0 && finish === 'length') {
    return `모델${who}이 생각하는 데 글자 수 한도를 다 써서 답을 쓰지 못했어요. 다시 시도하거나, AI 설정에서 Gemma처럼 추론하지 않는 무료 모델을 골라 주세요.`
  }
  if (reasoningChars > 0) {
    return `모델${who}이 생각만 하고 답을 보내지 않았어요. 다시 시도하거나 다른 무료 모델을 골라 주세요.`
  }
  return `모델${who}이 빈 답을 돌려줬어요${finish ? ` (종료 이유: ${finish})` : ''}. 다시 시도하거나 다른 무료 모델을 골라 주세요.`
}

/**
 * SSE 청크를 이어 붙이며 완성된 data: 줄을 이벤트로 돌려준다.
 * @returns {{ events: object[], rest: string, done: boolean }}
 */
export function parseSSE(buffer) {
  const events = []
  let done = false
  const lines = buffer.split('\n')
  const rest = lines.pop() // 마지막 줄은 아직 덜 온 것일 수 있음
  for (const raw of lines) {
    const line = raw.trim()
    if (!line.startsWith('data:')) continue // ": OPENROUTER PROCESSING" 같은 주석 무시
    const payload = line.slice(5).trim()
    if (payload === '[DONE]') {
      done = true
      continue
    }
    try {
      events.push(JSON.parse(payload))
    } catch {
      // 잘린 JSON은 무시 (OpenRouter는 줄 단위로 완결된 JSON을 보냄)
    }
  }
  return { events, rest, done }
}

/**
 * 스트리밍 채팅. onText(누적 텍스트), onReasoning(추론 중 여부) 콜백으로 진행 상황 전달.
 * @returns {Promise<{ text: string, model: string }>}
 */
export async function streamChat({ apiKey, model, messages, signal, onText, onReasoning, fetchImpl = fetch }) {
  const res = await fetchImpl(`${BASE}/chat/completions`, {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Title': 'TOEIC Wrong-Answer Coach',
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      temperature: 0.4,
      max_tokens: 6000,
      // 추론(thinking) 모델이 토큰을 생각하는 데 다 써서 답이 비는 것을 막기 위해 추론량을 낮춤.
      // 추론을 지원하지 않는 모델은 이 값을 무시한다.
      reasoning: { effort: 'low' },
    }),
  })

  if (!res.ok) {
    let msg = ''
    try {
      msg = (await res.json())?.error?.message ?? ''
    } catch {}
    throw new OpenRouterError(explainError(res.status, msg), res.status)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let text = ''
  let usedModel = model
  let finish = null
  let reasoningChars = 0

  const handle = (events) => {
    for (const ev of events) {
      if (ev.error) throw new OpenRouterError(explainError(ev.error.code, ev.error.message), ev.error.code)
      if (ev.model) usedModel = ev.model
      const choice = ev.choices?.[0] ?? {}
      if (choice.finish_reason) finish = choice.finish_reason
      const delta = choice.delta ?? {}
      const thinking = delta.reasoning ?? delta.reasoning_content ?? ''
      if (thinking) {
        reasoningChars += thinking.length
        if (!delta.content) onReasoning?.(true)
      }
      if (delta.content) {
        text += delta.content
        onReasoning?.(false)
        onText?.(text)
      }
    }
  }

  let ended = false
  while (!ended) {
    const { value, done } = await reader.read()
    if (done) {
      // 마지막 줄이 줄바꿈 없이 끝난 경우까지 처리
      handle(parseSSE(buf + decoder.decode() + '\n').events)
      break
    }
    buf += decoder.decode(value, { stream: true })
    const parsed = parseSSE(buf)
    buf = parsed.rest
    handle(parsed.events)
    ended = parsed.done
  }

  if (!text.trim()) throw new OpenRouterError(explainEmpty({ model: usedModel, finish, reasoningChars }), 'empty')
  return { text, model: usedModel, finish }
}
