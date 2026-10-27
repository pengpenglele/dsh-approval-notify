/**
 * Same-origin routes used by the settings page.
 *
 * `POST /approval-notify/test` raises one sample toast and answers with the
 * transport verdict; `GET /approval-notify/status` reports the last result, the
 * AUMID, and the log path. Both are loopback-only and never return session
 * content.
 * @module dsh-win-approval-notify/lib/routes
 */

/** Maximum accepted JSON request body, in bytes. */
const BODY_LIMIT = 4096

/**
 * Whether the request came from a loopback address.
 * @param req - Node request.
 * @returns true for 127.0.0.0/8 and ::1 peers.
 */
export function isLoopback(req) {
  const address = req?.socket?.remoteAddress
  if (typeof address !== 'string') return false
  return address === '::1' || address === '127.0.0.1' || address === '::ffff:127.0.0.1'
}

/**
 * Send a JSON response and end the exchange.
 * @param res - Node response.
 * @param status - HTTP status code.
 * @param payload - JSON-safe body.
 */
function json(res, status, payload) {
  try {
    const body = JSON.stringify(payload)
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    })
    res.end(body)
  } catch {
    try {
      res.destroy()
    } catch {
      // The socket may already be gone.
    }
  }
}

/**
 * Read a small JSON body.
 * @param req - Node request.
 * @returns the parsed body, or undefined for invalid/oversized input.
 */
function readJsonBody(req) {
  return new Promise((resolve) => {
    let size = 0
    const chunks = []
    let done = false
    const finish = (value) => {
      if (done) return
      done = true
      resolve(value)
    }
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > BODY_LIMIT) {
        finish(undefined)
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.once('end', () => {
      if (chunks.length === 0) {
        finish({})
        return
      }
      try {
        finish(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        finish(undefined)
      }
    })
    req.once('error', () => finish(undefined))
  })
}

/** Scenes the test route accepts. */
const TEST_SCENES = new Set(['approval', 'ask', 'plan', 'turn-completed'])

/**
 * Register the diagnostic routes on the host web server.
 * @param scope - the context that owns the `webServer` service.
 * @param deps - `{ test(scene), status(), log }` callbacks.
 * @returns a disposer that removes both routes.
 */
export function registerRoutes(scope, deps) {
  const testRoute = scope.webServer.register({
    kind: 'exact',
    path: '/approval-notify/test',
    handler: (req, res) => {
      if (!isLoopback(req)) {
        json(res, 403, { ok: false, error: 'loopback only' })
        return
      }
      if (req.method !== 'POST') {
        json(res, 405, { ok: false, error: 'method not allowed' })
        return
      }
      void readJsonBody(req).then(async (body) => {
        if (body === undefined) {
          json(res, 400, { ok: false, error: 'invalid json' })
          return
        }
        const scene = TEST_SCENES.has(body?.scene) ? body.scene : 'approval'
        try {
          const result = await deps.test(scene)
          json(res, 200, result)
        } catch (error) {
          deps.log(`test route failed: ${String(error?.message ?? error)}`)
          json(res, 500, { ok: false, error: String(error?.message ?? error) })
        }
      })
    },
  })
  const statusRoute = scope.webServer.register({
    kind: 'exact',
    path: '/approval-notify/status',
    handler: (req, res) => {
      if (!isLoopback(req)) {
        json(res, 403, { ok: false, error: 'loopback only' })
        return
      }
      json(res, 200, deps.status())
    },
  })
  return () => {
    try {
      testRoute()
    } catch {
      // Disposing twice is harmless.
    }
    try {
      statusRoute()
    } catch {
      // Disposing twice is harmless.
    }
  }
}

