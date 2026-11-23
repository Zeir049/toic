// chrome.storage.local 래퍼. 확장 밖(일반 웹페이지로 열어 개발할 때)에서는 localStorage 로 대체.
//
// 저장 키
//   session      : 지금 풀고 있는 시험 (마킹/범위/붙여넣은 정답지)
//   presets      : 이름 붙여 저장한 정답지 { name: { text, start } }
//   records      : 채점 기록 + 오답노트 [{ id, title, ..., notes: { q: { memo, tags, images, reviewed } } }]
//   img:<id>     : 오답노트 이미지(dataURL). 기록과 분리해서 메모 저장 시 이미지까지 다시 쓰지 않게 함

const area = globalThis.chrome?.storage?.local ?? null
const PREFIX = 'toic-ext:'

export async function get(key, fallback) {
  if (area) {
    const res = await area.get(key)
    return res[key] ?? fallback
  }
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw == null ? fallback : JSON.parse(raw)
  } catch {
    return fallback
  }
}

export async function set(obj) {
  if (area) return area.set(obj)
  for (const [k, v] of Object.entries(obj)) localStorage.setItem(PREFIX + k, JSON.stringify(v))
}

export async function remove(keys) {
  if (area) return area.remove(keys)
  for (const k of [].concat(keys)) localStorage.removeItem(PREFIX + k)
}

/** cb(changedKeys: string[]) — 다른 창(캡처 창 등)에서 바뀐 내용을 반영할 때 사용 */
export function onChange(cb) {
  if (globalThis.chrome?.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local') cb(Object.keys(changes))
    })
  } else {
    addEventListener('storage', (e) => e.key?.startsWith(PREFIX) && cb([e.key.slice(PREFIX.length)]))
  }
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

// ---- 기록(records) 헬퍼: 항상 저장소에서 다시 읽어 수정 → 다른 창의 변경을 덮어쓰지 않음 ----

export async function getRecords() {
  return get('records', [])
}

export async function updateRecord(id, fn) {
  const records = await getRecords()
  const rec = records.find((r) => r.id === id)
  if (!rec) return null
  fn(rec)
  rec.updatedAt = Date.now()
  await set({ records })
  return rec
}

export function noteOf(rec, q) {
  rec.notes ??= {}
  rec.notes[q] ??= { memo: '', tags: [], images: [], reviewed: false }
  return rec.notes[q]
}

export async function addImage(recordId, q, dataUrl) {
  const imgId = uid()
  await set({ ['img:' + imgId]: dataUrl })
  await updateRecord(recordId, (rec) => noteOf(rec, q).images.push(imgId))
  return imgId
}

export async function deleteImage(recordId, q, imgId) {
  await updateRecord(recordId, (rec) => {
    const n = noteOf(rec, q)
    n.images = n.images.filter((i) => i !== imgId)
  })
  await remove('img:' + imgId)
}

export async function deleteRecord(id) {
  const records = await getRecords()
  const rec = records.find((r) => r.id === id)
  if (!rec) return
  const imgKeys = Object.values(rec.notes ?? {}).flatMap((n) => n.images.map((i) => 'img:' + i))
  await set({ records: records.filter((r) => r.id !== id) })
  if (imgKeys.length) await remove(imgKeys)
}
