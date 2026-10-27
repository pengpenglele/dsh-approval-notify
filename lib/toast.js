/**
 * Windows toast transport.
 *
 * The main channel is a short-lived Windows PowerShell 5.1 child that reads a
 * UTF-8 JSON task file and raises a WinRT toast under the desktop app's AUMID.
 * The child is detached: the host never waits for a notification, and a broken
 * transport only ever writes a log line. Payload text always travels through
 * the JSON file, never through a command line, so non-ASCII copy cannot be
 * mangled by the console code page or parsed as shell input.
 * @module dsh-win-approval-notify/lib/toast
 */

import { spawn } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

/** Folder under the OS temp dir that holds task files and the default log. */
const TEMP_DIR = join(tmpdir(), 'dsh-win-approval-notify')

/** Maximum size of the log before it is truncated in place. */
const LOG_LIMIT = 512 * 1024

/** How long a fallback card stays on screen, in seconds. */
const CARD_SECONDS = 8

/** Absolute path of this module, used to locate the bundled PowerShell files. */
const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * Default log file path.
 * @returns `%TEMP%\dsh-win-approval-notify\notify.log`.
 */
export function defaultLogFile() {
  return join(TEMP_DIR, 'notify.log')
}

/**
 * Resolve the Windows PowerShell 5.1 executable. WinRT's toast projection only
 * exists in 5.1; `pwsh` 7 does not ship it.
 * @returns absolute path to `powershell.exe`.
 */
function powershellPath() {
  const root = process.env.SystemRoot || process.env.windir || 'C:\\Windows'
  return join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
}

/**
 * Append one log line, rotating an over-sized file in place.
 * @param logFile - configured path, or the default when empty.
 * @param line - message to append.
 */
export function writeLog(logFile, line) {
  try {
    const target = typeof logFile === 'string' && logFile.length > 0 ? logFile : defaultLogFile()
    mkdirSync(dirname(target), { recursive: true })
    try {
      if (statSync(target).size > LOG_LIMIT) writeFileSync(target, '')
    } catch {
      // Missing log file is the normal first-write case.
    }
    appendFileSync(target, `${new Date().toISOString()} ${line}\n`)
  } catch {
    // Logging must never break a notification path.
  }
}

/**
 * Write the JSON task file handed to the PowerShell helper.
 * @param payload - `{ title, body }`.
 * @param cfg - resolved config.
 * @returns the absolute task file path.
 */
function writeTaskFile(payload, cfg) {
  mkdirSync(TEMP_DIR, { recursive: true })
  const file = join(TEMP_DIR, `task-${randomUUID()}.json`)
  const task = {
    title: payload.title,
    body: payload.body,
    appId: cfg.appId,
    duration: cfg.duration,
    silent: cfg.silent,
    cardSeconds: CARD_SECONDS,
  }
  writeFileSync(file, JSON.stringify(task), 'utf8')
  return file
}

/**
 * Remove a task file once the helper had time to read it.
 * @param file - task file path.
 */
function cleanupTaskFile(file) {
  const timer = setTimeout(() => {
    try {
      rmSync(file, { force: true })
    } catch {
      // Nothing to do: the temp dir is cleaned by the OS.
    }
  }, 15_000)
  if (typeof timer.unref === 'function') timer.unref()
}

/**
 * Spawn one PowerShell script with the task file as its only argument.
 *
 * The child must NOT use `detached: true`: a DETACHED_PROCESS has no console,
 * and Windows PowerShell 5.1 then exits 0 without ever running the script, so
 * the toast silently never happens. `windowsHide` + ignored stdio is enough;
 * the caller still `unref()`s the child so the host never waits for it.
 * @param scriptName - bundled script file name.
 * @param taskFile - absolute JSON task path.
 * @returns the child process.
 */
function spawnScript(scriptName, taskFile) {
  return spawn(
    powershellPath(),
    [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      join(HERE, scriptName),
      '-TaskFile',
      taskFile,
    ],
    { windowsHide: true, stdio: 'ignore' },
  )
}

/**
 * Wait for a child to settle, with a hard timeout.
 * @param child - spawned child.
 * @param timeoutMs - maximum wait.
 * @returns `{ code }` or `{ error }`.
 */
function waitForChild(child, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(value)
    }
    const timer = setTimeout(() => {
      try {
        child.kill()
      } catch {
        // The child may have exited between the timer and the kill.
      }
      finish({ error: 'timeout' })
    }, timeoutMs)
    if (typeof timer.unref === 'function') timer.unref()
    child.once('error', (error) => finish({ error: String(error?.message ?? error) }))
    child.once('exit', (code) => finish({ code }))
  })
}

/**
 * Deliver one payload, falling back to the native card when the toast fails.
 * @param cfg - resolved config.
 * @param payload - `{ title, body }`.
 * @param log - log sink.
 * @returns the primary child process.
 */
export function spawnToast(cfg, payload, log) {
  const taskFile = writeTaskFile(payload, cfg)
  cleanupTaskFile(taskFile)
  const child = spawnScript('toast.ps1', taskFile)
  let sawError = false
  child.once('error', (error) => {
    sawError = true
    log(`toast spawn failed: ${String(error?.message ?? error)}`)
    try {
      spawnScript('card.ps1', taskFile)
    } catch {
      // The fallback is best-effort only.
    }
  })
  child.once('exit', (code) => {
    if (code === 0 || sawError) {
      log(`toast ${code === 0 ? 'ok' : 'failed'} scene=${payload.scene ?? '-'} code=${code}`)
      return
    }
    log(`toast rejected code=${code}; using fallback card`)
    try {
      spawnScript('card.ps1', taskFile)
    } catch {
      // The fallback is best-effort only.
    }
  })
  if (typeof child.unref === 'function') child.unref()
  return child
}

/**
 * Deliver one payload and wait for the transport's verdict. Used only by the
 * settings-page "send test notification" route; live events stay fire-and-forget.
 * @param cfg - resolved config.
 * @param payload - `{ title, body }`.
 * @param log - log sink.
 * @returns `{ ok, error? }`.
 */
export async function sendAndWait(cfg, payload, log) {
  const taskFile = writeTaskFile(payload, cfg)
  cleanupTaskFile(taskFile)
  const child = spawnScript('toast.ps1', taskFile)
  const outcome = await waitForChild(child, cfg.toastTimeoutMs)
  if (outcome.code === 0) {
    log(`toast ok scene=${payload.scene ?? '-'} code=0`)
    return { ok: true }
  }
  const reason = outcome.error ?? `exit ${String(outcome.code)}`
  log(`toast failed scene=${payload.scene ?? '-'} reason=${reason}`)
  try {
    const fallback = spawnScript('card.ps1', taskFile)
    if (typeof fallback.unref === 'function') fallback.unref()
  } catch {
    // The fallback is best-effort only.
  }
  return { ok: false, error: reason }
}

/**
 * Build a fire-and-forget sender with the configured in-flight cap.
 * @param cfgOrGetter - resolved config, or a getter returning the latest one.
 * @param log - log sink.
 * @returns a `send(payload)` function.
 */
export function createSender(cfgOrGetter, log) {
  let inflight = 0
  const read = typeof cfgOrGetter === 'function' ? cfgOrGetter : () => cfgOrGetter
  return function send(payload) {
    const cfg = read()
    if (inflight >= cfg.maxInflight) {
      log(`skip scene=${payload.scene ?? '-'} reason=inflight`)
      return
    }
    inflight += 1
    try {
      const child = spawnToast(cfg, payload, log)
      child.once('exit', () => {
        inflight = Math.max(0, inflight - 1)
      })
      child.once('error', () => {
        inflight = Math.max(0, inflight - 1)
      })
    } catch (error) {
      inflight = Math.max(0, inflight - 1)
      log(`send failed: ${String(error?.message ?? error)}`)
    }
  }
}

/**
 * Whether a toast helper script exists on disk (used by diagnostics).
 * @returns true when `toast.ps1` is bundled next to this module.
 */
export function transportAvailable() {
  return existsSync(join(HERE, 'toast.ps1')) && existsSync(join(HERE, 'card.ps1'))
}

