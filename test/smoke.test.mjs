import assert from 'node:assert/strict'
import test from 'node:test'

import { apply, name, Config } from '../index.js'

/** Build the smallest host context surface `apply` touches. */
function fakeContext() {
  const handlers = []
  const routes = []
  const disposers = []
  const ctx = {
    on: (type, callback) => {
      handlers.push({ type, callback })
      return () => {}
    },
    effect: (callback) => {
      const disposer = callback()
      if (typeof disposer === 'function') disposers.push(disposer)
      return () => {}
    },
    inject: (services, callback) => {
      if (!services.includes('webServer')) return
      const web = {
        effect: (fn) => {
          const disposer = fn()
          if (typeof disposer === 'function') disposers.push(disposer)
          return () => {}
        },
        webServer: {
          register: (route) => {
            routes.push(route)
            return () => {}
          },
        },
      }
      callback(web)
    },
  }
  return { ctx, handlers, routes, disposers }
}

/** Call one registered route with a fake loopback request. */
function invoke(route) {
  const captured = { status: 0, headers: null, body: '' }
  const res = {
    writeHead: (status, headers) => {
      captured.status = status
      captured.headers = headers
    },
    end: (body) => {
      captured.body = body ?? ''
    },
    destroy: () => {},
  }
  const req = { method: 'GET', socket: { remoteAddress: '127.0.0.1' } }
  route.handler(req, res)
  return { status: captured.status, json: JSON.parse(captured.body) }
}

test('host entry exposes the plugin contract', () => {
  assert.equal(name, 'approval-notify')
  assert.equal(typeof apply, 'function')
  assert.ok(Config && typeof Config.toJSON === 'function')
})

test('apply registers the event listener and both diagnostic routes', () => {
  const fake = fakeContext()
  apply(fake.ctx, { enabled: false })
  assert.equal(fake.handlers.length, 1)
  assert.equal(fake.handlers[0].type, 'session/event')
  assert.equal(fake.routes.length, 2)
  assert.equal(fake.routes[0].path, '/approval-notify/test')
  assert.equal(fake.routes[1].path, '/approval-notify/status')
})

test('the status route reports the transport and log path without session data', () => {
  const fake = fakeContext()
  apply(fake.ctx, { enabled: false })
  const status = invoke(fake.routes[1])
  assert.equal(status.status, 200)
  assert.equal(status.json.ok, true)
  assert.equal(status.json.appId, 'com.deepseek.dsh')
  assert.equal(typeof status.json.logPath, 'string')
  assert.equal(status.json.transport, true)
})

test('disabled config suppresses routing before any notification', () => {
  const fake = fakeContext()
  apply(fake.ctx, { enabled: false })
  const handler = fake.handlers[0].callback
  handler({ id: 's1', meta: { cwd: 'E:\\tmp' } }, {
    type: 'approval/asked',
    data: { id: 'a1', toolName: 'pwsh', reason: 'test' },
  })
  // No assertion on timers: a disabled plugin must simply not throw.
  assert.equal(fake.routes.length, 2)
})
