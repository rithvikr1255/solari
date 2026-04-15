import { createApp } from '../../src/app.js'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'

let server: Server
let baseUrl: string

export async function startTestServer(): Promise<void> {
  const app = createApp()
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve) // port 0 = OS assigns a free port
  })
  const { port } = server.address() as AddressInfo
  baseUrl = `http://localhost:${port}`
}

export async function stopTestServer(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()))
  })
}

export function url(path: string): string {
  return `${baseUrl}${path}`
}

export async function post(path: string, body: unknown, opts?: { contentType?: string; rawBody?: Buffer }): Promise<Response> {
  if (opts?.rawBody) {
    return fetch(url(path), {
      method: 'POST',
      headers: { 'Content-Type': opts.contentType ?? 'application/octet-stream' },
      body: opts.rawBody,
    })
  }
  return fetch(url(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
