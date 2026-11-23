// LLM 응답용 최소 마크다운 렌더러. 먼저 HTML을 이스케이프하므로 모델 출력이 스크립트로 실행될 수 없다.
// 지원: #/##/### 제목, -/* 목록, 1. 번호 목록, **굵게**, `코드`, [1] 인용 번호, 문단

const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

function inline(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[(\d{1,2})\]/g, '<sup class="cite" data-cite="$1">$1</sup>')
}

export function renderMarkdown(md) {
  const out = []
  let list = null // 'ul' | 'ol'
  let para = []

  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map(inline).join('<br>')}</p>`)
    para = []
  }
  const closeList = () => {
    if (list) out.push(`</${list}>`)
    list = null
  }

  for (const raw of String(md ?? '').replace(/\r/g, '').split('\n')) {
    const line = raw.trimEnd()
    let m
    if (!line.trim()) {
      flushPara()
      closeList()
    } else if ((m = line.match(/^\s*(#{1,4})\s+(.*)$/))) {
      flushPara()
      closeList()
      const level = Math.min(m[1].length + 1, 5) // # → h2 (패널 안에서 너무 크지 않게)
      out.push(`<h${level}>${inline(m[2])}</h${level}>`)
    } else if ((m = line.match(/^\s*[-*•]\s+(.*)$/)) || (m = line.match(/^\s*(\d+)[.)]\s+(.*)$/))) {
      flushPara()
      const ordered = /^\s*\d/.test(line)
      const kind = ordered ? 'ol' : 'ul'
      if (list !== kind) {
        closeList()
        out.push(`<${kind}>`)
        list = kind
      }
      out.push(`<li>${inline(ordered ? m[2] : m[1])}</li>`)
    } else if (/^\s*(---|\*\*\*)\s*$/.test(line)) {
      flushPara()
      closeList()
      out.push('<hr>')
    } else {
      closeList()
      para.push(line.trim())
    }
  }
  flushPara()
  closeList()
  return out.join('')
}
