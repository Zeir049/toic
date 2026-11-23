// 사이드 패널에서 찍은 화면(pendingCapture)을 받아 영역을 잘라 오답노트에 저장
import * as store from './lib/store.js'

const shot = document.getElementById('shot')
const selBox = document.getElementById('sel')
const stage = document.getElementById('stage')
const saveBtn = document.getElementById('save')

let pending = null
let sel = null // 화면 좌표(표시 크기 기준) { x, y, w, h }
let dragFrom = null

function paintSel() {
  if (!sel || sel.w < 4 || sel.h < 4) {
    selBox.style.display = 'none'
    saveBtn.disabled = true
    return
  }
  Object.assign(selBox.style, {
    display: 'block',
    left: sel.x + 'px',
    top: sel.y + 'px',
    width: sel.w + 'px',
    height: sel.h + 'px',
  })
  saveBtn.disabled = false
}

function point(e) {
  const r = shot.getBoundingClientRect()
  return {
    x: Math.min(Math.max(e.clientX - r.left, 0), r.width),
    y: Math.min(Math.max(e.clientY - r.top, 0), r.height),
  }
}

stage.addEventListener('pointerdown', (e) => {
  stage.setPointerCapture(e.pointerId)
  dragFrom = point(e)
  sel = { ...dragFrom, w: 0, h: 0 }
  paintSel()
})
stage.addEventListener('pointermove', (e) => {
  if (!dragFrom) return
  const p = point(e)
  sel = {
    x: Math.min(p.x, dragFrom.x),
    y: Math.min(p.y, dragFrom.y),
    w: Math.abs(p.x - dragFrom.x),
    h: Math.abs(p.y - dragFrom.y),
  }
  paintSel()
})
stage.addEventListener('pointerup', () => (dragFrom = null))

async function save(full) {
  if (!pending) return
  const scale = shot.naturalWidth / shot.getBoundingClientRect().width
  const area = full || !sel
    ? { x: 0, y: 0, w: shot.naturalWidth, h: shot.naturalHeight }
    : { x: sel.x * scale, y: sel.y * scale, w: sel.w * scale, h: sel.h * scale }
  const c = document.createElement('canvas')
  c.width = Math.round(area.w)
  c.height = Math.round(area.h)
  c.getContext('2d').drawImage(shot, area.x, area.y, area.w, area.h, 0, 0, c.width, c.height)
  await store.addImage(pending.recordId, pending.q, c.toDataURL('image/png'))
  await store.remove('pendingCapture')
  window.close()
}

async function cancel() {
  await store.remove('pendingCapture')
  window.close()
}

document.getElementById('save').addEventListener('click', () => save(false))
document.getElementById('full').addEventListener('click', () => save(true))
document.getElementById('cancel').addEventListener('click', cancel)
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') cancel()
  if (e.key === 'Enter' && !saveBtn.disabled) save(false)
})
addEventListener('resize', () => {
  sel = null
  paintSel()
})

pending = await store.get('pendingCapture', null)
if (pending) {
  shot.src = pending.dataUrl
  document.title = `${pending.q}번 문제 영역 자르기`
} else {
  document.querySelector('header p').textContent = '캡처한 화면이 없어요. 창을 닫고 다시 시도해 주세요.'
}
