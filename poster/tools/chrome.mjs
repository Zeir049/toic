// 헤드리스 크롬 + 정적 서버 + 최소 CDP 클라이언트 (추가 설치 없이 Node 22+ 내장 WebSocket 사용)
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

export const REPO = path.resolve(import.meta.dirname, '..', '..')

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export function serve(root = REPO, port = 5190) {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    const file = path.join(root, rel)
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end('not found')
      return
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' })
    fs.createReadStream(file).pipe(res)
  })
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${port}` })))
}

export async function launch(port = 9333) {
  const exe = CHROME_CANDIDATES.find((p) => fs.existsSync(p))
  if (!exe) throw new Error('Chrome을 찾지 못했어요. CHROME_PATH 환경변수로 경로를 지정하세요.')
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'toic-poster-'))
  const proc = spawn(exe, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--force-color-profile=srgb',
    'about:blank',
  ])
  let target
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200)
    try {
      target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json()
    } catch {}
  }
  if (!target) throw new Error('헤드리스 크롬에 연결하지 못했어요.')
  const page = await Page.connect(target.webSocketDebuggerUrl)
  return {
    page,
    async close() {
      page.ws.close()
      proc.kill()
      await sleep(300)
      fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 })
    },
  }
}

export class Page {
  static async connect(url) {
    const ws = new WebSocket(url)
    await new Promise((res, rej) => {
      ws.onopen = res
      ws.onerror = rej
    })
    const p = new Page(ws)
    await p.send('Page.enable')
    await p.send('Runtime.enable')
    await p.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] })
    return p
  }

  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    this.waiters = []
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)
      } else if (msg.method) {
        if (msg.method === 'Runtime.exceptionThrown') console.error('[page error]', msg.params.exceptionDetails?.exception?.description)
        this.waiters = this.waiters.filter((w) => (w.method === msg.method ? (w.resolve(msg.params), false) : true))
      }
    }
  }

  send(method, params = {}) {
    const id = ++this.id
    this.ws.send(JSON.stringify({ id, method, params }))
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }))
  }

  once(method) {
    return new Promise((resolve) => this.waiters.push({ method, resolve }))
  }

  async goto(url, settle = 400) {
    const loaded = this.once('Page.loadEventFired')
    await this.send('Page.navigate', { url })
    await loaded
    await this.eval('document.fonts.ready.then(() => true)')
    await sleep(settle)
  }

  async reload(settle = 500) {
    const loaded = this.once('Page.loadEventFired')
    await this.send('Page.reload', { ignoreCache: true })
    await loaded
    await sleep(settle)
  }

  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
    return r.result.value
  }

  viewport(width, height, scale = 3) {
    return this.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false })
  }

  async shot(file, clip) {
    const params = { format: 'png', captureBeyondViewport: false }
    if (clip) params.clip = { ...clip, scale: 1 }
    const { data } = await this.send('Page.captureScreenshot', params)
    if (file) fs.writeFileSync(file, Buffer.from(data, 'base64'))
    return data
  }
}

export { sleep }
