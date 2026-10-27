/**
 * Config defaults and live field folding.
 *
 * Every plugin config field is declared `volatile()` in the host entry, so the
 * Loader hands the plugin a live reference object with `get()` instead of a
 * plain value. `readField` reads through that reference on every event, which
 * is what makes a settings-page save apply without remounting the plugin.
 * A plain value (profile patch fallback or a unit test) passes through.
 * @module dsh-win-approval-notify/lib/config
 */

/** Defaults mirror the schema in index.js and the bundle patch. */
export const DEFAULTS = Object.freeze({
  enabled: true,

  notifyApprovals: true,
  approvalTools: [],

  notifyAskQuestion: true,
  notifyPlanReview: true,

  notifyTurnCompleted: true,
  notifyTurnError: true,
  notifyTurnBlocked: true,
  notifyTurnAborted: true,
  notifyTurnMaxTokens: true,

  cooldownSec: 20,
  debounceMs: 500,
  duration: 'long',
  silent: false,
  maxInflight: 3,

  includeReason: true,
  includeQuestionText: true,
  titlePrefix: 'DeepSeek Harness',

  appId: 'com.deepseek.dsh',
  skipSubagentSessions: false,
  toastTimeoutMs: 8000,
  debug: false,
  logFile: '',
})

/**
 * Read one config field through a live volatile reference or a plain value.
 * @param field - the value the Loader passed in, a volatile reference, or undefined.
 * @param fallback - default used when the field is absent or unreadable.
 * @returns the effective value.
 */
export function readField(field, fallback) {
  if (field === undefined || field === null) return fallback
  if (typeof field === 'object' && typeof field.get === 'function') {
    const value = field.get()
    return value === undefined ? fallback : value
  }
  return field
}

/**
 * Clamp a numeric field into its accepted range, falling back on nonsense.
 * @param value - candidate number.
 * @param min - inclusive lower bound.
 * @param max - inclusive upper bound.
 * @param fallback - value used when the candidate is not finite.
 * @returns a finite number inside the range.
 */
function clampNumber(value, min, max, fallback) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, number))
}

/**
 * Normalize a comma/space separated or array tool list into clean patterns.
 * An empty list means "every tool" and is kept empty.
 * @param value - configured list.
 * @returns clean exact names and trailing-`*` prefix patterns.
 */
function normalizeTools(value) {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : []
  const tools = []
  for (const entry of list) {
    if (typeof entry !== 'string') continue
    const name = entry.trim()
    if (name.length > 0) tools.push(name)
  }
  return tools
}

/**
 * Fold the Loader config into every value the router needs for one event.
 * @param config - the config handed to `apply` (volatile references).
 * @returns a plain resolved config object.
 */
export function resolveConfig(config) {
  const raw = (key) => readField(config?.[key], DEFAULTS[key])
  const asBool = (key) => raw(key) !== false
  const asString = (key) => {
    const value = raw(key)
    return typeof value === 'string' ? value : DEFAULTS[key]
  }
  const duration = raw('duration') === 'short' ? 'short' : 'long'
  return {
    enabled: asBool('enabled'),

    notifyApprovals: asBool('notifyApprovals'),
    approvalTools: normalizeTools(raw('approvalTools')),

    notifyAskQuestion: asBool('notifyAskQuestion'),
    notifyPlanReview: asBool('notifyPlanReview'),

    notifyTurnCompleted: asBool('notifyTurnCompleted'),
    notifyTurnError: asBool('notifyTurnError'),
    notifyTurnBlocked: asBool('notifyTurnBlocked'),
    notifyTurnAborted: asBool('notifyTurnAborted'),
    notifyTurnMaxTokens: asBool('notifyTurnMaxTokens'),

    cooldownSec: clampNumber(raw('cooldownSec'), 0, 600, DEFAULTS.cooldownSec),
    debounceMs: clampNumber(raw('debounceMs'), 0, 5000, DEFAULTS.debounceMs),
    duration,
    silent: asBool('silent'),
    maxInflight: clampNumber(raw('maxInflight'), 1, 10, DEFAULTS.maxInflight),

    includeReason: asBool('includeReason'),
    includeQuestionText: asBool('includeQuestionText'),
    titlePrefix: asString('titlePrefix'),

    appId: asString('appId'),
    skipSubagentSessions: asBool('skipSubagentSessions'),
    toastTimeoutMs: clampNumber(raw('toastTimeoutMs'), 1000, 60000, DEFAULTS.toastTimeoutMs),
    debug: asBool('debug'),
    logFile: asString('logFile'),
  }
}

