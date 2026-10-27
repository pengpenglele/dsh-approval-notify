/**
 * Approval tool allowlist matching.
 *
 * An empty list means "notify for every tool". A configured entry is either an
 * exact tool name or a trailing-`*` prefix pattern (`pwsh*`). The prefix form
 * exists so a family of variant tool names needs no list maintenance.
 * @module dsh-win-approval-notify/lib/filter
 */

/**
 * Whether a tool name passes the configured allowlist.
 * @param patterns - resolved `approvalTools` value.
 * @param toolName - the tool that requested approval.
 * @returns true when the tool should notify.
 */
export function matchTool(patterns, toolName) {
  if (!Array.isArray(patterns) || patterns.length === 0) return true
  if (typeof toolName !== 'string' || toolName.length === 0) return false
  for (const pattern of patterns) {
    if (typeof pattern !== 'string') continue
    const value = pattern.trim()
    if (value.length === 0) continue
    if (value.endsWith('*')) {
      if (toolName.startsWith(value.slice(0, -1))) return true
      continue
    }
    if (toolName === value) return true
  }
  return false
}

