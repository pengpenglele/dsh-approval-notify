import assert from 'node:assert/strict'
import test from 'node:test'

import { DEFAULTS, resolveConfig } from '../lib/config.js'
import { matchTool } from '../lib/filter.js'
import {
  composeApproval,
  composeQuestion,
  sessionLabel,
  composeTurnEnd,
  isTurnKindEnabled,
} from '../lib/text.js'
import { createRouter, routeEvent } from '../lib/events.js'

/** Deterministic timer/clock harness for the debounce tests. */
class FakeClock {
  constructor() {
    this.now = 0
    this.timers = new Map()
    this.sequence = 0
  }

  setTimeout(callback, delay) {
    const id = ++this.sequence
    const timer = {
      id,
      unref() {},
    }
    this.timers.set(id, { callback, at: this.now + Math.max(0, delay) })
    return timer
  }

  clearTimeout(timer) {
    if (timer && typeof timer.id === 'number') this.timers.delete(timer.id)
  }

  tick(ms) {
    this.now += ms
    for (const [id, entry] of [...this.timers.entries()]) {
      if (entry.at > this.now) continue
      this.timers.delete(id)
      entry.callback()
    }
  }
}

/** Session fixture with a Windows-style cwd. */
const SESSION = {
  id: 'session-12345678-abcd',
  meta: { cwd: 'E:\\codeDir\\ds_tools' },
}

/** Build a router wired to a fake clock plus a collected send list. */
function harness(overrides = {}) {
  const clock = new FakeClock()
  const sent = []
  const router = createRouter({
    setTimeout: (callback, delay) => clock.setTimeout(callback, delay),
    clearTimeout: (timer) => clock.clearTimeout(timer),
    now: () => clock.now,
  })
  const cfg = resolveConfig({ ...overrides })
  const io = {
    send: (payload) => sent.push(payload),
    log: () => {},
  }
  return { clock, sent, router, cfg, io }
}

test('resolveConfig folds defaults and reads live volatile references', () => {
  const plain = resolveConfig({})
  assert.equal(plain.enabled, true)
  assert.equal(plain.cooldownSec, DEFAULTS.cooldownSec)
  assert.deepEqual(plain.approvalTools, [])

  const live = resolveConfig({ approvalTools: { get: () => ['pwsh*'] }, cooldownSec: { get: () => 5 } })
  assert.deepEqual(live.approvalTools, ['pwsh*'])
  assert.equal(live.cooldownSec, 5)

  const clamped = resolveConfig({ cooldownSec: 9999, maxInflight: 0 })
  assert.equal(clamped.cooldownSec, 600)
  assert.equal(clamped.maxInflight, 1)
})

test('matchTool honours empty, exact and prefix patterns', () => {
  assert.equal(matchTool([], 'pwsh'), true)
  assert.equal(matchTool(['pwsh'], 'pwsh'), true)
  assert.equal(matchTool(['pwsh'], 'bash'), false)
  assert.equal(matchTool(['pwsh*'], 'pwsh'), true)
  assert.equal(matchTool(['pwsh*'], 'pwsh-sandbox'), true)
  assert.equal(matchTool(['pwsh*'], 'bash'), false)
  assert.equal(matchTool(['  ', ''], 'anything'), false)
})

test('session labels prefer the title and never show the session id', () => {
  assert.equal(sessionLabel(SESSION, '我的会话'), '我的会话')
  assert.equal(sessionLabel(SESSION), 'ds_tools')
  assert.equal(sessionLabel({ id: 'session-abc' }), '未命名会话')
})

test('approval copy keeps the whole reason and honours includeReason', () => {
  const cfg = resolveConfig({ titlePrefix: 'DSH' })
  const reason = '请求以更高权限执行：' + '很长的原因'.repeat(200)
  const payload = composeApproval({ toolName: 'pwsh', reason }, cfg, SESSION, '我的会话')
  assert.equal(payload.title, 'DSH · 需要授权')
  assert.ok(payload.body.includes('会话：我的会话'))
  assert.ok(!payload.body.includes('session-12345678'))
  assert.ok(payload.body.includes(reason), 'reason must not be truncated')
  assert.ok(payload.body.includes('工具：pwsh'))

  const short = composeApproval({ toolName: 'pwsh', reason }, resolveConfig({ includeReason: false }), SESSION)
  assert.ok(!short.body.includes(reason))
  assert.ok(short.body.includes('ds_tools'))
})

test('question copy carries the first question and the count', () => {
  const cfg = resolveConfig({})
  const payload = composeQuestion({ text: '先做哪件事？', count: 3 }, cfg, SESSION)
  assert.ok(payload.body.includes('先做哪件事？'))
  assert.ok(payload.body.includes('共 3 题'))
})

test('turn copy maps reason kinds and includes the error message', () => {
  const cfg = resolveConfig({})
  assert.equal(composeTurnEnd({ kind: 'completed' }, cfg, SESSION).title, 'DeepSeek Harness · 任务完成')
  assert.equal(composeTurnEnd({ kind: 'max-tokens' }, cfg, SESSION).title, 'DeepSeek Harness · 达到输出上限')
  const failed = composeTurnEnd({ kind: 'error', reason: { error: { message: 'boom' } } }, cfg, SESSION)
  assert.ok(failed.body.includes('boom'))
  assert.equal(isTurnKindEnabled(cfg, 'completed'), true)
  assert.equal(isTurnKindEnabled(resolveConfig({ notifyTurnCompleted: false }), 'completed'), false)
  assert.equal(isTurnKindEnabled(resolveConfig({ notifyTurnCompleted: false }), 'unknown-kind'), true)
})

test('approval waits for the debounce and cancels when decided first', () => {
  const first = harness()
  routeEvent(first.router, SESSION, {
    type: 'approval/asked',
    data: { id: 'a1', toolName: 'pwsh', reason: 'test' },
  }, first.cfg, first.io)
  assert.equal(first.sent.length, 0)
  first.clock.tick(500)
  assert.equal(first.sent.length, 1)
  assert.equal(first.sent[0].scene, 'approval')

  const second = harness()
  routeEvent(second.router, SESSION, {
    type: 'approval/asked',
    data: { id: 'a2', toolName: 'pwsh' },
  }, second.cfg, second.io)
  routeEvent(second.router, SESSION, {
    type: 'approval/decided',
    data: { id: 'a2', outcome: 'allowed-once' },
  }, second.cfg, second.io)
  second.clock.tick(500)
  assert.equal(second.sent.length, 0)
})

test('the per-session cooldown suppresses a second approval notification', () => {
  const h = harness({ cooldownSec: 20 })
  routeEvent(h.router, SESSION, { type: 'approval/asked', data: { id: 'b1', toolName: 'pwsh' } }, h.cfg, h.io)
  h.clock.tick(500)
  assert.equal(h.sent.length, 1)

  routeEvent(h.router, SESSION, { type: 'approval/asked', data: { id: 'b2', toolName: 'pwsh' } }, h.cfg, h.io)
  h.clock.tick(500)
  assert.equal(h.sent.length, 1)

  h.clock.tick(20_000)
  routeEvent(h.router, SESSION, { type: 'approval/asked', data: { id: 'b3', toolName: 'pwsh' } }, h.cfg, h.io)
  h.clock.tick(500)
  assert.equal(h.sent.length, 2)
})

test('duplicate approval ids only notify once', () => {
  const h = harness()
  const event = { type: 'approval/asked', data: { id: 'dup', toolName: 'pwsh' } }
  routeEvent(h.router, SESSION, event, h.cfg, h.io)
  h.clock.tick(500)
  routeEvent(h.router, SESSION, event, h.cfg, h.io)
  h.clock.tick(500)
  assert.equal(h.sent.length, 1)
})

test('question and plan notifications route through tool calls and cancel on result', () => {
  const h = harness()
  routeEvent(h.router, SESSION, {
    type: 'tool/call',
    data: { callId: 'c1', name: 'ask_user_question', arguments: { questions: [{ question: '选哪个？' }] } },
  }, h.cfg, h.io)
  h.clock.tick(500)
  assert.equal(h.sent.length, 1)
  assert.equal(h.sent[0].scene, 'ask')
  assert.ok(h.sent[0].body.includes('选哪个？'))

  routeEvent(h.router, SESSION, {
    type: 'tool/call',
    data: { callId: 'c2', name: 'exit_plan_mode', arguments: {} },
  }, h.cfg, h.io)
  routeEvent(h.router, SESSION, {
    type: 'tool/result',
    data: { message: { callId: 'c2' } },
  }, h.cfg, h.io)
  h.clock.tick(500)
  assert.equal(h.sent.length, 1)
})

test('scene switches suppress their own notifications', () => {
  const h = harness({
    notifyApprovals: false,
    notifyAskQuestion: false,
    notifyPlanReview: false,
    notifyTurnCompleted: false,
    notifyTurnError: false,
    notifyTurnBlocked: false,
    notifyTurnAborted: false,
    notifyTurnMaxTokens: false,
  })
  routeEvent(h.router, SESSION, { type: 'approval/asked', data: { id: 's1', toolName: 'pwsh' } }, h.cfg, h.io)
  routeEvent(h.router, SESSION, { type: 'tool/call', data: { callId: 's2', name: 'ask_user_question', arguments: {} } }, h.cfg, h.io)
  routeEvent(h.router, SESSION, { type: 'turn/end', seq: 7, data: { reason: { kind: 'completed' } } }, h.cfg, h.io)
  h.clock.tick(500)
  assert.equal(h.sent.length, 0)
})

test('the approval tool allowlist filters tools', () => {
  const h = harness({ approvalTools: ['pwsh*'] })
  routeEvent(h.router, SESSION, { type: 'approval/asked', data: { id: 't1', toolName: 'bash' } }, h.cfg, h.io)
  h.clock.tick(500)
  assert.equal(h.sent.length, 0)

  routeEvent(h.router, SESSION, { type: 'approval/asked', data: { id: 't2', toolName: 'pwsh-sandbox' } }, h.cfg, h.io)
  h.clock.tick(500)
  assert.equal(h.sent.length, 1)
})

test('turn end notifies immediately with the configured headline', () => {
  const h = harness()
  routeEvent(h.router, SESSION, { type: 'turn/end', seq: 3, data: { reason: { kind: 'completed' } } }, h.cfg, h.io)
  assert.equal(h.sent.length, 1)
  assert.equal(h.sent[0].title, 'DeepSeek Harness · 任务完成')
  assert.equal(h.sent[0].scene, 'turn')
})

test('an unknown event type is ignored', () => {
  const h = harness()
  routeEvent(h.router, SESSION, { type: 'user/message', data: {} }, h.cfg, h.io)
  h.clock.tick(500)
  assert.equal(h.sent.length, 0)
})


test('the notification body uses the session title when the title service has one', () => {
  const h = harness()
  h.io.titleOf = () => '我的会话标题'
  routeEvent(h.router, SESSION, { type: 'approval/asked', data: { id: 'title-1', toolName: 'pwsh' } }, h.cfg, h.io)
  h.clock.tick(500)
  assert.equal(h.sent.length, 1)
  assert.ok(h.sent[0].body.includes('会话：我的会话标题'))
  assert.ok(!h.sent[0].body.includes('session-'))
})

