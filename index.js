/**
 * dsh-win-approval-notify host half.
 *
 * Consumes read-only `session/event` records and raises Windows toasts for
 * three waiting moments (approval, questions/plan review) and for turn ends.
 * The plugin never touches the `approval/request` or `user-questions/request`
 * waterfalls: observing the audit log is enough and cannot disturb the host UI.
 *
 * Config fields are all `volatile()`, so the settings page (client half) writes
 * through the official settings service and each later event reads the new
 * value through `field.get()` without remounting this plugin.
 * @module dsh-win-approval-notify
 */

import z from '@deepseek-ai/schemastery'
import { resolveConfig } from './lib/config.js'
import { createRouter, disposeRouter, routeEvent } from './lib/events.js'
import { composeApproval, composePlan, composeQuestion, composeTurnEnd } from './lib/text.js'
import { createSender, defaultLogFile, sendAndWait, transportAvailable, writeLog } from './lib/toast.js'
import { registerRoutes } from './lib/routes.js'

/** Stable plugin name used by Loader diagnostics. */
export const name = 'approval-notify'

/** The approval and turn events ride the sessions service. */
export const inject = ['sessions']

/**
 * Plugin config. Every field is `volatile()` so the Plugins page serves it as
 * this row's configuration form and commits a save into the running activation.
 */
export const Config = z.object({
  enabled: z.boolean().default(true).volatile(),

  notifyApprovals: z.boolean().default(true).volatile(),
  approvalTools: z.array(z.string()).default([]).volatile(),

  notifyAskQuestion: z.boolean().default(true).volatile(),
  notifyPlanReview: z.boolean().default(true).volatile(),

  notifyTurnCompleted: z.boolean().default(true).volatile(),
  notifyTurnError: z.boolean().default(true).volatile(),
  notifyTurnBlocked: z.boolean().default(true).volatile(),
  notifyTurnAborted: z.boolean().default(true).volatile(),
  notifyTurnMaxTokens: z.boolean().default(true).volatile(),

  cooldownSec: z.number().min(0).max(600).default(20).volatile(),
  debounceMs: z.number().min(0).max(5000).default(500).volatile(),
  duration: z.union(['long', 'short']).default('long').volatile(),
  silent: z.boolean().default(false).volatile(),
  maxInflight: z.number().min(1).max(10).default(3).volatile(),

  includeReason: z.boolean().default(true).volatile(),
  includeQuestionText: z.boolean().default(true).volatile(),
  titlePrefix: z.string().default('DeepSeek Harness').volatile(),

  appId: z.string().default('com.deepseek.dsh').volatile(),
  skipSubagentSessions: z.boolean().default(true).volatile(),
  toastTimeoutMs: z.number().min(1000).max(60000).default(8000).volatile(),
  debug: z.boolean().default(false).volatile(),
  logFile: z.string().default('').volatile(),
})

/** Session stand-in used by the settings page's test notification. */
const TEST_SESSION = Object.freeze({
  id: 'test-session',
  meta: Object.freeze({ cwd: 'dsh-win-approval-notify' }),
})

/** Title shown by the settings page's test notifications. */
const TEST_TITLE = '测试会话'

/**
 * Compose the sample payload for one test scene.
 * @param scene - `approval` | `ask` | `plan` | `turn-completed`.
 * @param cfg - resolved config.
 * @returns `{ title, body, scene }`.
 */
function samplePayload(scene, cfg) {
  if (scene === 'ask') {
    return { ...composeQuestion({ text: '这是一条测试提问：是否继续？', count: 1 }, cfg, TEST_SESSION, TEST_TITLE), scene }
  }
  if (scene === 'plan') {
    return { ...composePlan(cfg, TEST_SESSION, TEST_TITLE), scene }
  }
  if (scene === 'turn-completed') {
    return { ...composeTurnEnd({ kind: 'completed' }, cfg, TEST_SESSION, TEST_TITLE), scene }
  }
  return {
    ...composeApproval({ toolName: 'pwsh', reason: '这是一条测试通知，用于验证 Windows 通知通道。' }, cfg, TEST_SESSION, TEST_TITLE),
    scene: 'approval',
  }
}

/**
 * Mount the host half: event routing plus the settings page's diagnostic routes.
 * @param ctx - host plugin context.
 * @param config - Loader config with live volatile references.
 */
export function apply(ctx, config = {}) {
  const router = createRouter()
  const log = (line) => writeLog(resolveConfig(config).logFile, line)
  const send = createSender(() => resolveConfig(config), log)

  // Optional: the folded session title, when the deployment mounts the title
  // service. Absent means the toast falls back to the workspace folder name;
  // the raw session id is never shown.
  let sessionTitles
  ctx.inject(['sessionTitle'], (scope) => {
    sessionTitles = scope.sessionTitle
  })
  const titleOf = (session) => {
    try {
      const snapshot = sessionTitles?.get(session)
      return snapshot !== null && typeof snapshot === 'object' && typeof snapshot.title === 'string'
        ? snapshot.title
        : undefined
    } catch {
      return undefined
    }
  }

  ctx.effect(() => () => disposeRouter(router), 'approval-notify: router timers')

  ctx.on('session/event', (session, event) => {
    try {
      routeEvent(router, session, event, resolveConfig(config), { send, log, titleOf })
    } catch (error) {
      log(`router error: ${String(error?.message ?? error)}`)
    }
  })

  ctx.inject(['webServer'], (web) => {
    web.effect(() => registerRoutes(web, {
      test: async (scene) => {
        const cfg = resolveConfig(config)
        const result = await sendAndWait(cfg, samplePayload(scene, cfg), log)
        router.lastResult = {
          at: new Date().toISOString(),
          scene,
          ok: result.ok,
          ...result.ok ? {} : { error: result.error },
        }
        return result
      },
      status: () => {
        const cfg = resolveConfig(config)
        return {
          ok: true,
          lastResult: router.lastResult,
          logPath: cfg.logFile.length > 0 ? cfg.logFile : defaultLogFile(),
          appId: cfg.appId,
          transport: transportAvailable(),
        }
      },
      log,
    }), 'approval-notify: diagnostic routes')
  })
}


