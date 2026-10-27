/**
 * Notification copy for the four scene families.
 *
 * The approval reason is shown in full (the user asked for the whole reason,
 * not a truncated preview). Windows may fold an over-long body on screen, but
 * the payload itself is never shortened here; only newlines are normalized so
 * the toast card renders predictably.
 * @module dsh-win-approval-notify/lib/text
 */

/** Scene keys used by the router, the log, and the test route. */
export const SCENES = Object.freeze({
  approval: 'approval',
  ask: 'ask',
  plan: 'plan',
  turn: 'turn',
})

/** `turn/end` reason kinds and the config switch that enables each one. */
export const TURN_KIND_FIELDS = Object.freeze({
  completed: 'notifyTurnCompleted',
  error: 'notifyTurnError',
  blocked: 'notifyTurnBlocked',
  aborted: 'notifyTurnAborted',
  'max-tokens': 'notifyTurnMaxTokens',
})

/** Toast headline per turn end reason kind. */
const TURN_TITLES = Object.freeze({
  completed: '任务完成',
  error: '任务出错',
  blocked: '任务被拦截',
  aborted: '任务被中断',
  'max-tokens': '达到输出上限',
})

/** Turn reasons that should notify when the kind is one this build does not know. */
const TURN_SWITCHES = Object.freeze([
  'notifyTurnCompleted',
  'notifyTurnError',
  'notifyTurnBlocked',
  'notifyTurnAborted',
  'notifyTurnMaxTokens',
])

/**
 * Whether a turn end reason kind is enabled in the resolved config.
 * An unknown kind follows "any turn switch on" so a newer harness reason still
 * notifies instead of silently disappearing.
 * @param cfg - resolved config.
 * @param kind - `turn/end` reason kind.
 * @returns whether this turn end should notify.
 */
export function isTurnKindEnabled(cfg, kind) {
  const field = TURN_KIND_FIELDS[kind]
  if (field !== undefined) return cfg[field] === true
  return TURN_SWITCHES.some((name) => cfg[name] === true)
}

/**
 * Build a human-readable session label: the folded session title when the title
 * service has one, else the workspace folder name, else a neutral fallback.
 * The session id is never shown.
 * @param session - the live session the event belongs to.
 * @param title - optional folded session title.
 * @returns a label safe to put in a toast body.
 */
export function sessionLabel(session, title) {
  if (typeof title === 'string') {
    const trimmed = title.trim()
    if (trimmed.length > 0) return trimmed
  }
  const cwd = session?.meta?.cwd
  let folder = ''
  if (typeof cwd === 'string' && cwd.trim().length > 0) {
    const parts = cwd.split(/[\\/]+/).filter((part) => part.length > 0)
    folder = parts.length > 0 ? parts[parts.length - 1] : ''
  }
  return folder.length > 0 ? folder : '未命名会话'
}

/**
 * Normalize text for a toast body without dropping content.
 * @param text - raw value.
 * @returns the text with CRLF/CR folded to LF.
 */
function clean(text) {
  return typeof text === 'string' ? text.replace(/\r\n?/g, '\n') : ''
}

/**
 * Compose the approval notification.
 * @param request - `{ toolName, reason }` from `approval/asked`.
 * @param cfg - resolved config.
 * @param session - requesting session.
 * @returns `{ title, body }`.
 */
export function composeApproval(request, cfg, session, title) {
  const toolName = typeof request?.toolName === 'string' && request.toolName.length > 0 ? request.toolName : '未知工具'
  const reason = clean(request?.reason)
  const lines = [`工具：${toolName}`]
  if (cfg.includeReason) {
    lines.push(reason.length > 0 ? `原因：${reason}` : `工具 ${toolName} 请求权限`)
  }
  lines.push(`会话：${sessionLabel(session, title)}`)
  return {
    title: `${cfg.titlePrefix} · 需要授权`,
    body: lines.join('\n'),
  }
}

/**
 * Compose the question notification.
 * @param question - `{ text, count }` extracted from the tool call arguments.
 * @param cfg - resolved config.
 * @param session - asking session.
 * @returns `{ title, body }`.
 */
export function composeQuestion(question, cfg, session, title) {
  const text = clean(question?.text)
  const count = Number.isInteger(question?.count) && question.count > 0 ? question.count : 1
  const lines = []
  if (cfg.includeQuestionText) {
    lines.push(text.length > 0 ? `问题：${text}` : 'agent 有问题需要你回答')
    if (count > 1) lines.push(`（共 ${count} 题）`)
  }
  lines.push(`会话：${sessionLabel(session, title)}`)
  return {
    title: `${cfg.titlePrefix} · 需要你的选择`,
    body: lines.join('\n'),
  }
}

/**
 * Compose the plan review notification.
 * @param cfg - resolved config.
 * @param session - asking session.
 * @returns `{ title, body }`.
 */
export function composePlan(cfg, session, title) {
  return {
    title: `${cfg.titlePrefix} · 需要你审阅计划`,
    body: `计划已就绪，等待你批准\n会话：${sessionLabel(session, title)}`,
  }
}

/**
 * Compose the turn end notification.
 * @param end - `{ kind, reason }` from `turn/end`.
 * @param cfg - resolved config.
 * @param session - the session whose turn ended.
 * @returns `{ title, body }`.
 */
export function composeTurnEnd(end, cfg, session, title) {
  const kind = end?.kind
  const headline = TURN_TITLES[kind] ?? '任务结束'
  const lines = []
  const errorMessage = clean(end?.reason?.error?.message)
  if (kind === 'error' && errorMessage.length > 0) lines.push(`错误：${errorMessage}`)
  lines.push(`会话：${sessionLabel(session, title)}`)
  return {
    title: `${cfg.titlePrefix} · ${headline}`,
    body: lines.join('\n'),
  }
}


