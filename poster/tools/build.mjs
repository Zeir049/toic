// A2 포스터 PDF 출력: node poster/tools/build.mjs
//   poster/poster.pdf          인쇄용 (420 × 594 mm, 1쪽, 벡터 텍스트)
//   poster/poster-preview.png  확인용 미리보기
import fs from 'node:fs'
import path from 'node:path'
import { REPO, launch, serve, sleep } from './chrome.mjs'

const DIR = path.join(REPO, 'poster')
const MM = 96 / 25.4 // CSS px per mm
const W = Math.round(420 * MM)
const H = Math.round(594 * MM)

const { server, base } = await serve()
const { page, close } = await launch(9334)
try {
  await page.viewport(W, H, 1)
  await page.goto(`${base}/poster/poster.html`, 300)
  for (let i = 0; i < 100 && !(await page.eval('window.__posterReady === true')); i++) await sleep(100)

  // 넘침 검사: 고정 높이 상자에서 내용이 잘리는 곳을 찾는다
  const overflow = await page.eval(`(() => {
    const out = []
    for (const el of document.querySelectorAll('.poster, .body, .row, .card, .feature, .hero-side, .ai-left, .points, .bottom > div, .text'))
      if (el.scrollHeight - el.clientHeight > 2) out.push((el.className || el.tagName) + ' +' + (el.scrollHeight - el.clientHeight) + 'px')
    const body = document.querySelector('.body').getBoundingClientRect()
    const last = [...document.querySelectorAll('.body > section')].at(-1).getBoundingClientRect()
    out.push('spare below last section: ' + Math.round(body.bottom - last.bottom) + 'px')
    return out
  })()`)
  console.log('layout:', overflow.join(' | '))

  const { data } = await page.send('Page.printToPDF', {
    printBackground: true,
    preferCSSPageSize: true,
    paperWidth: 420 / 25.4,
    paperHeight: 594 / 25.4,
    marginTop: 0,
    marginBottom: 0,
    marginLeft: 0,
    marginRight: 0,
  })
  fs.writeFileSync(path.join(DIR, 'poster.pdf'), Buffer.from(data, 'base64'))
  await page.shot(path.join(DIR, 'poster-preview.png'))
  console.log('saved poster.pdf, poster-preview.png')
} finally {
  await close()
  server.close()
}
