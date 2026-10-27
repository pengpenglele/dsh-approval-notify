/**
 * Read-only session event router.
 *
 * The router only consumes append-only audit events. Approval and question
 * notifications are scheduled after a short debounce so a request answered
 * immediately (or a question whose tool fails at once) never raises a toast;
 * `approval/decided` and `tool/result` cancel the matching pending entry.
 * Turn ends notify immediately, gated by the five reason switches.
 * @module dsh-win-approval-notify/lib/events
 */

import { matchTool } from './filter.js'
import {
  SCENES,
  composeApproval,
  composePlan,
  composeQuestion,
  composeTurnEnd,
  isTurnKindEnabled,
} from './text.js'

/** How many processed request keys are remembered for duplicate suppression. */
const SEEN_LIMIT = 256

/**
 * Create the per-activation router state.
 * Timers and the clock are injectable so unit tests can run deterministically.
 * @param options - overrides for `setTimeout`, `clearTimeout` and `now`.
 * @returns fresh router state.
 */
export function createRouter(options = {}) {
  return {
    pending: new Map(),
    cooldowns: new Map(),
    seen: new Set(),
    seenOrder: [],
    lastResult: null,
    setTimeoutFn: options.setTimeout ?? setTimeout,
    clearTimeoutFn: options.clearTimeout ?? clearTimeout,
    now: options.now ?? (() => Date.now()),
  }
}

/**
 * Whether a request key was already delivered.
 * @param router - router state.
 * @param key - request identity.
 * @returns true when it was already handled.
 */
function wasSeen(router, key) {
  return router.seen.has(key)
}

/**
 * Remember a delivered request key, evicting the oldest past the capacity.
 * @param router - router state.
 * @param key - request identity.
 */
function remember(router, key) {
  if (router.seen.has(key)) return
  router.seen.add(key)
  router.seenOrder.push(key)
  while (router.seenOrder.length > SEEN_LIMIT) {
    const oldest = router.seenOrder.shift()
    router.seen.delete(oldest)
  }
}

/**
 * Apply the per-session, per-scene cooldown.
 * @param router - router state.
 * @param session - event session.
 * @param scene - scene key.
 * @param cfg - resolved config.
 * @returns true when the notification should be skipped.
 */
function isCooling(router, session, scene, cfg) {
  const id = typeof session?.id === 'string' ? session.id : 'unknown'
  const key = `${scene}:${id}`
  const at = router.now()
  const cooldownMs = Math.max(0, cfg.cooldownSec) * 1000
  if (router.cooldowns.has(key)) {
    const last = router.cooldowns.get(key) ?? 0
    if (at - last < cooldownMs) return true
  }
  router.cooldowns.set(key, at)
  return false
}

/**
 * Record the outcome marker used by the `/status` route.
 * @param router - router state.
 * @param scene - scene key.
 * @param ok - whether delivery was accepted by the transport.
 */
export function recordResult(router, scene, ok) {
  router.lastResult = {
    at: new Date(router.now()).toISOString(),
    scene,
    ok,
  }
}

/**
 * Deliver one composed notification unless the scene is cooling down.
 * @param router - router state.
 * @param cfg - resolved config.
 * @param io - `{ send(payload), log(line) }` callbacks.
 * @param session - event session.
 * @param scene - scene key.
 * @param payload - `{ title, body }`.
 */
function deliver(router, cfg, io, session, scene, payload) {
  if (isCooling(router, session, scene, cfg)) {
    io.log(`skip scene=${scene} reason=cooldown`)
    return
  }
  io.send({ scene, title: payload.title, body: payload.body })
}

/**
 * Read the current folded session title for a toast body.
 * @param io - delivery callbacks, optionally carrying `titleOf`.
 * @param session - event session.
 * @returns the trimmed title, or undefined when unavailable.
 */
function titleOfSession(io, session) {
  try {
    const value = io && typeof io.titleOf === 'function' ? io.titleOf(session) : undefined
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
  } catch {
    return undefined
  }
}
/**
 * Schedule a debounced notification for a request-shaped event.
 * @param router - router state.
 * @param session - event session.
 * @param cfg - resolved config.
 * @param io - delivery callbacks.
 * @param key - request identity used for dedupe/cancel.
 * @param scene - scene key.
 * @param build - composes `{ title, body }` at delivery time from the session title.
 */
function schedule(router, session, cfg, io, key, scene, build) {
  if (router.pending.has(key)) return
  const delay = Math.max(0, cfg.debounceMs)
  const timer = router.setTimeoutFn(() => {
    router.pending.delete(key)
    if (wasSeen(router, key)) return
    remember(router, key)
    deliver(router, cfg, io, session, scene, build(titleOfSession(io, session)))
  }, delay)
  if (timer !== undefined && timer !== null && typeof timer.unref === 'function') timer.unref()
  router.pending.set(key, { timer, scene })
}

/**
 * Cancel a pending debounced notification.
 * @param router - router state.
 * @param key - request identity.
 * @returns whether an entry was removed.
 */
export function cancel(router, key) {
  const entry = router.pending.get(key)
  if (entry === undefined) return false
  router.clearTimeoutFn(entry.timer)
  router.pending.delete(key)
  return true
}

/**
 * Whether the event belongs to a subagent/child session, using only metadata
 * the session itself exposes. Unknown shapes are treated as root sessions.
 * @param session - event session.
 * @returns true when it is a child session.
 */
function isChildSession(session) {
  const meta = session?.meta
  if (meta === null || typeof meta !== 'object') return false
  return typeof meta.parentSessionId === 'string' || typeof meta.parent === 'string'
}

/**
 * Route one `session/event` to the matching scene.
 * Never throws on well-formed events; the caller still wraps it defensively.
 * @param router - router state.
 * @param session - event session.
 * @param event - session event.
 * @param cfg - resolved config.
 * @param io - `{ send, log }` callbacks.
 */
export function routeEvent(router, session, event, cfg, io) {
  if (!cfg.enabled) return
  if (cfg.skipSubagentSessions && isChildSession(session)) return
  const type = event?.type

  if (type === 'approval/asked') {
    if (!cfg.notifyApprovals) return
    const data = event.data ?? {}
    if (!matchTool(cfg.approvalTools, data.toolName)) return
    const key = `approval:${data.id}`
    if (wasSeen(router, key)) return
    schedule(router, session, cfg, io, key, SCENES.approval, (title) => composeApproval(data, cfg, session, title))
    return
  }

  if (type === 'approval/decided') {
    cancel(router, `approval:${event.data?.id}`)
    return
  }

  if (type === 'tool/call') {
    const data = event.data ?? {}
    const callId = data.callId
    if (typeof callId !== 'string' || callId.length === 0) return
    if (data.name === 'ask_user_question') {
      if (!cfg.notifyAskQuestion) return
      const questions = Array.isArray(data.arguments?.questions) ? data.arguments.questions : []
      const first = questions[0]
      const text = typeof first?.question === 'string' ? first.question : ''
      const key = `question:${callId}`
      if (wasSeen(router, key)) return
      schedule(router, session, cfg, io, key, SCENES.ask, (title) => composeQuestion({ text, count: questions.length }, cfg, session, title))
      return
    }
    if (data.name === 'exit_plan_mode') {
      if (!cfg.notifyPlanReview) return
      const key = `plan:${callId}`
      if (wasSeen(router, key)) return
      schedule(router, session, cfg, io, key, SCENES.plan, (title) => composePlan(cfg, session, title))
    }
    return
  }

  if (type === 'tool/result') {
    const callId = event.data?.message?.callId
    if (typeof callId === 'string' && callId.length > 0) {
      cancel(router, `question:${callId}`)
      cancel(router, `plan:${callId}`)
    }
    return
  }

  if (type === 'turn/end') {
    const kind = event.data?.reason?.kind
    if (!isTurnKindEnabled(cfg, kind)) return
    const key = `turn:${session?.id ?? 'unknown'}:${event.seq ?? ''}`
    if (wasSeen(router, key)) return
    remember(router, key)
    deliver(router, cfg, io, session, SCENES.turn, composeTurnEnd({ kind, reason: event.data?.reason }, cfg, session, titleOfSession(io, session)))
  }
}

/**
 * Cancel every pending debounced notification (used on plugin teardown and in
 * tests). Kept separate from `cancel` so teardown cannot miss a timer.
 * @param router - router state.
 */
export function disposeRouter(router) {
  for (const key of [...router.pending.keys()]) cancel(router, key)
  router.pending.clear()
  router.cooldowns.clear()
  router.seen.clear()
  router.seenOrder.length = 0
}



