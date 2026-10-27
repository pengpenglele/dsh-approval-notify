/**
 * dsh-win-approval-notify browser half.
 *
 * Registers one configuration page into the built-in Plugins page through the
 * `plugins.row.config` slot (key = package name + row id). The page renders a
 * draft form over the row's volatile Config fields and only writes through
 * `form.mutate` when the user presses Save; a test button posts to the host's
 * loopback-only route so the toast channel can be verified without waiting for
 * a real approval.
 */
window.__ModuleLoader__.load({
  id: 'dsh-win-approval-notify',
  factory: (require) => {
    const React = require('react')
    const module = { exports: {} }
    const exports = module.exports

    /** Dictionary namespace owned by this plugin. */
    const NS = 'approvalNotify'

    /** Defaults mirrored from the host schema (draft fallback only). */
    const DEFAULTS = {
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
    }

    /** Fields compared when building the save operations. */
    const FIELD_KEYS = Object.keys(DEFAULTS).filter((key) => key !== 'logFile')

    /** Tool pattern accepted by the allowlist input. */
    const TOOL_PATTERN = /^[A-Za-z0-9_.:@/-]+\*?$/

    const en = {
      summary: 'Windows toasts when the agent needs approval, waits for your answer, or finishes a turn.',
      title: 'Windows notifications',
      description: 'Toast notifications for approval requests, questions, plan review, and turn ends. Saves apply immediately.',
      enabled: 'Enable notifications',
      enabledHint: 'Master switch; turning it off stops every scene immediately.',
      situationsTitle: 'Notify me when',
      approvalGroup: 'Approval',
      notifyApprovals: 'A tool requests higher permission',
      notifyApprovalsHint: 'Fires when a tool call is blocked waiting for your approval.',
      approvalTools: 'Only these tools',
      approvalToolsHint: 'Comma separated. Empty means every tool. A trailing * matches a prefix, e.g. pwsh*.',
      toolsPlaceholder: 'pwsh*, bash*',
      waitingGroup: 'Waiting for you',
      notifyAskQuestion: 'The agent asks a question',
      notifyAskQuestionHint: 'Fires for ask_user_question.',
      notifyPlanReview: 'A plan waits for review',
      notifyPlanReviewHint: 'Fires for exit_plan_mode.',
      turnGroup: 'Turn ends',
      notifyTurnCompleted: 'Completed',
      notifyTurnError: 'Errored',
      notifyTurnBlocked: 'Blocked',
      notifyTurnAborted: 'Interrupted',
      notifyTurnMaxTokens: 'Token limit reached',
      paceTitle: 'Timing',
      cooldownSec: 'Cooldown per session (seconds)',
      cooldownSecHint: 'Minimum gap between two notifications of the same scene in one session.',
      debounceMs: 'Debounce (ms)',
      debounceMsHint: 'Wait this long before notifying; a request already answered is dropped.',
      maxInflight: 'Max concurrent toasts',
      maxInflightHint: 'Extra notifications beyond this are skipped and logged.',
      appearanceTitle: 'Appearance',
      duration: 'Toast duration',
      durationHint: 'Long stays about 25 seconds, short about 5.',
      durationLong: 'Long',
      durationShort: 'Short',
      silent: 'Mute the toast sound',
      silentHint: 'The notification still appears in the Action Center.',
      titlePrefix: 'Title prefix',
      titlePrefixHint: 'Shown before the scene headline.',
      appId: 'AppUserModelID',
      appIdHint: 'Leave empty to use the desktop app id.',
      includeReason: 'Include the full approval reason',
      includeReasonHint: 'The reason is shown verbatim, not truncated.',
      includeQuestionText: 'Include the question text',
      includeQuestionTextHint: 'Shows the first question in the body.',
      diagnosticsTitle: 'Diagnostics',
      testScene: 'Test scene',
      testApproval: 'Approval',
      testAsk: 'Question',
      testPlan: 'Plan review',
      testTurn: 'Turn completed',
      sendTest: 'Send test notification',
      testing: 'Sending…',
      testOk: 'Test notification sent.',
      testFailed: 'Test notification failed.',
      lastResult: 'Last result',
      logPath: 'Log file',
      aumid: 'AUMID',
      transportOk: 'Toast scripts found.',
      transportMissing: 'Toast scripts are missing from the plugin folder.',
      debug: 'Verbose log',
      debugHint: 'Writes extra delivery decisions to the log.',
      save: 'Save',
      saving: 'Saving…',
      cancel: 'Cancel',
      restoreDefaults: 'Restore defaults',
      saved: 'Saved.',
      saveFailed: 'The deployment rejected these values, or the config changed elsewhere. Reload and try again.',
      noChanges: 'Nothing changed.',
      restored: 'Defaults restored in the draft; press Save to apply.',
      unsaved: 'Unsaved changes',
      readOnly: 'This deployment stores settings read-only.',
      unavailable: 'This plugin is not loaded, so it cannot be configured right now.',
      loadingTrace: 'Loading configuration…',
      allOff: 'All scenes are off: no notifications will be sent.',
      errCooldown: 'Cooldown must be a whole number between 0 and 600.',
      errDebounce: 'Debounce must be a whole number between 0 and 5000.',
      errInflight: 'Concurrent toasts must be a whole number between 1 and 10.',
      errTitle: 'Title prefix must be 1–40 characters.',
      errAppId: 'AUMID may only contain letters, digits, dot, underscore and dash.',
      errTimeout: 'Toast timeout must be a whole number between 1000 and 60000.',
      errTools: 'Tool names may only contain letters, digits, _ . : @ / - and an optional trailing *.',
      errTooManyTools: 'At most 32 tool patterns.',
    }

    const zh = {
      summary: '需要授权、等你回答或一轮结束时，发 Windows 通知。',
      title: 'Windows 通知',
      description: '在需要授权、提问、计划审阅、轮次结束时发 Toast 通知。保存即生效。',
      enabled: '启用通知',
      enabledHint: '总开关；关闭后所有场景立即停止。',
      situationsTitle: '通知哪些情况',
      approvalGroup: '需要授权',
      notifyApprovals: '工具请求更高权限时提醒',
      notifyApprovalsHint: '工具调用卡在审批、等待你决定时触发。',
      approvalTools: '只提醒这些工具',
      approvalToolsHint: '逗号分隔。留空 = 全部工具。尾缀 * 表示前缀匹配，例如 pwsh*。',
      toolsPlaceholder: 'pwsh*, bash*',
      waitingGroup: '等你回答',
      notifyAskQuestion: '提问时提醒',
      notifyAskQuestionHint: '对应 ask_user_question。',
      notifyPlanReview: '计划审阅时提醒',
      notifyPlanReviewHint: '对应 exit_plan_mode。',
      turnGroup: '任务结束',
      notifyTurnCompleted: '任务完成',
      notifyTurnError: '任务出错',
      notifyTurnBlocked: '任务被拦截',
      notifyTurnAborted: '任务被中断',
      notifyTurnMaxTokens: '达到输出上限',
      paceTitle: '触发与节奏',
      cooldownSec: '同会话冷却（秒）',
      cooldownSecHint: '同一会话、同一场景两次提醒的最小间隔。',
      debounceMs: '延迟合并（毫秒）',
      debounceMsHint: '先等这么久再发；这期间已被回答的请求不发通知。',
      maxInflight: '并发通知上限',
      maxInflightHint: '超出的通知会被跳过并记录日志。',
      appearanceTitle: '通知外观',
      duration: '通知停留时长',
      durationHint: 'long 约 25 秒，short 约 5 秒。',
      durationLong: '长',
      durationShort: '短',
      silent: '静音',
      silentHint: '通知仍会进入 Windows 通知中心。',
      titlePrefix: '标题前缀',
      titlePrefixHint: '显示在场景标题之前。',
      appId: 'AppUserModelID',
      appIdHint: '留空则使用桌面版的应用 ID。',
      includeReason: '审批正文包含完整原因',
      includeReasonHint: '原因按原文展示，不截断。',
      includeQuestionText: '提问正文包含题目文本',
      includeQuestionTextHint: '显示第一道题的文本。',
      diagnosticsTitle: '诊断',
      testScene: '测试场景',
      testApproval: '审批',
      testAsk: '提问',
      testPlan: '计划审阅',
      testTurn: '任务完成',
      sendTest: '发送测试通知',
      testing: '发送中…',
      testOk: '测试通知已发送。',
      testFailed: '测试通知发送失败。',
      lastResult: '最近结果',
      logPath: '日志文件',
      aumid: 'AUMID',
      transportOk: 'Toast 脚本已就位。',
      transportMissing: '插件目录里缺少 Toast 脚本。',
      debug: '记录调试日志',
      debugHint: '向日志额外写入投递判定。',
      save: '保存',
      saving: '保存中…',
      cancel: '取消',
      restoreDefaults: '恢复默认',
      saved: '已保存。',
      saveFailed: '本部署拒绝了这些值，或配置已在别处修改。请刷新后重试。',
      noChanges: '没有修改。',
      restored: '已在草稿中恢复默认值，点保存后生效。',
      unsaved: '有未保存的修改',
      readOnly: '本部署的设置为只读。',
      unavailable: '该插件当前未加载，暂时无法配置。',
      loadingTrace: '正在加载配置…',
      allOff: '所有场景都已关闭：不会收到任何通知。',
      errCooldown: '冷却必须是 0–600 的整数。',
      errDebounce: '延迟必须是 0–5000 的整数。',
      errInflight: '并发上限必须是 1–10 的整数。',
      errTitle: '标题前缀需为 1–40 个字符。',
      errAppId: 'AUMID 只能包含字母、数字、点、下划线和短横线。',
      errTimeout: 'Toast 超时必须是 1000–60000 的整数。',
      errTools: '工具名只能包含字母、数字、_ . : @ / - 和可选的结尾 *。',
      errTooManyTools: '最多 32 个工具模式。',
    }

    const h = React.createElement
    const styles = {
      page: { display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 780 },
      head: { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 4 },
      title: { margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--dsw-alias-label-primary)' },
      desc: { margin: 0, fontSize: 12.5, lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)' },
      section: { display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 12, borderTop: '1px solid var(--dsw-alias-border-l2)' },
      sectionTitle: { margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--dsw-alias-label-primary)' },
      group: { margin: '4px 0 2px', fontSize: 12, fontWeight: 600, color: 'var(--dsw-alias-label-secondary)' },
      row: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, padding: '4px 0' },
      rowMain: { minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 },
      rowLabel: { fontSize: 13, lineHeight: '18px', color: 'var(--dsw-alias-label-primary)' },
      rowHint: { fontSize: 11.5, lineHeight: '16px', color: 'var(--dsw-alias-label-tertiary)' },
      control: { flex: 'none', display: 'flex', alignItems: 'center', gap: 8 },
      check: { width: 16, height: 16, accentColor: 'var(--dsw-alias-state-business-primary)', cursor: 'pointer' },
      input: {
        boxSizing: 'border-box',
        width: 220,
        maxWidth: '56vw',
        border: '0.5px solid var(--dsw-alias-border-l4)',
        borderRadius: 6,
        background: 'var(--dsw-alias-bg-layer-3)',
        color: 'var(--dsw-alias-label-primary)',
        font: 'inherit',
        fontSize: 12.5,
        padding: '4px 8px',
        outline: 'none',
      },
      inputWide: { width: 320 },
      select: {
        boxSizing: 'border-box',
        border: '0.5px solid var(--dsw-alias-border-l4)',
        borderRadius: 6,
        background: 'var(--dsw-alias-bg-layer-3)',
        color: 'var(--dsw-alias-label-primary)',
        font: 'inherit',
        fontSize: 12.5,
        padding: '4px 8px',
      },
      footer: { display: 'flex', alignItems: 'center', gap: 8, paddingTop: 12, borderTop: '1px solid var(--dsw-alias-border-l2)' },
      button: {
        border: '0.5px solid var(--dsw-alias-border-l4)',
        borderRadius: 6,
        background: 'var(--dsw-alias-bg-layer-3)',
        color: 'var(--dsw-alias-label-primary)',
        font: 'inherit',
        fontSize: 12.5,
        padding: '5px 12px',
        cursor: 'pointer',
      },
      primary: {
        border: '0.5px solid var(--dsw-alias-state-business-primary)',
        borderRadius: 6,
        background: 'var(--dsw-alias-state-business-primary)',
        color: 'var(--dsw-alias-label-primary-foreground, #fff)',
        font: 'inherit',
        fontSize: 12.5,
        padding: '5px 12px',
        cursor: 'pointer',
      },
      message: { fontSize: 12, lineHeight: '18px' },
      info: { fontSize: 11.5, lineHeight: '17px', color: 'var(--dsw-alias-label-tertiary)', overflowWrap: 'anywhere' },
      notice: { fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-state-warn-label, #a15c00)' },
      error: { fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-state-error-primary, #c0392b)' },
    }

    /**
     * Merge stored values over the draft defaults.
     * @param value - form snapshot value.
     * @returns a draft object with every field present.
     */
    function normalize(value) {
      const source = value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}
      const merged = { ...DEFAULTS, ...source }
      merged.approvalTools = Array.isArray(merged.approvalTools)
        ? merged.approvalTools.filter((entry) => typeof entry === 'string')
        : []
      merged.duration = merged.duration === 'short' ? 'short' : 'long'
      return merged
    }

    /**
     * Structural equality for JSON-shaped field values.
     * @param a - first value.
     * @param b - second value.
     * @returns whether both serialize identically.
     */
    function same(a, b) {
      return JSON.stringify(a) === JSON.stringify(b)
    }

    /**
     * Parse the comma/space separated tool allowlist input.
     * @param text - raw input text.
     * @returns clean tool patterns.
     */
    function parseTools(text) {
      return String(text ?? '')
        .split(/[,\s]+/)
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
    }

    /**
     * Validate the draft before any write.
     * @param draft - draft values.
     * @param toolsText - tool allowlist input text.
     * @returns a dictionary key naming the first problem, or null.
     */
    function validateDraft(draft, toolsText) {
      if (!Number.isInteger(draft.cooldownSec) || draft.cooldownSec < 0 || draft.cooldownSec > 600) return 'errCooldown'
      if (!Number.isInteger(draft.debounceMs) || draft.debounceMs < 0 || draft.debounceMs > 5000) return 'errDebounce'
      if (!Number.isInteger(draft.maxInflight) || draft.maxInflight < 1 || draft.maxInflight > 10) return 'errInflight'
      if (!Number.isInteger(draft.toastTimeoutMs) || draft.toastTimeoutMs < 1000 || draft.toastTimeoutMs > 60000) return 'errTimeout'
      const title = String(draft.titlePrefix ?? '').trim()
      if (title.length < 1 || title.length > 40) return 'errTitle'
      const appId = String(draft.appId ?? '').trim()
      if (appId.length > 0 && !/^[A-Za-z0-9._-]+$/.test(appId)) return 'errAppId'
      const tools = parseTools(toolsText)
      if (tools.length > 32) return 'errTooManyTools'
      for (const tool of tools) {
        if (tool.length > 64 || !TOOL_PATTERN.test(tool)) return 'errTools'
      }
      return null
    }

    /**
     * One labelled switch row.
     * @param props - `{ t, label, hint, checked, disabled, onChange }`.
     * @returns a row element.
     */
    function checkRow(props) {
      return h('div', { style: styles.row }, [
        h('div', { style: styles.rowMain, key: 'main' }, [
          h('div', { style: styles.rowLabel, key: 'label' }, props.label),
          props.hint ? h('div', { style: styles.rowHint, key: 'hint' }, props.hint) : null,
        ]),
        h('div', { style: styles.control, key: 'control' },
          h('input', {
            type: 'checkbox',
            style: { ...styles.check, cursor: props.disabled ? 'not-allowed' : 'pointer' },
            checked: props.checked === true,
            disabled: props.disabled === true,
            onChange: (event) => props.onChange(event.target.checked),
            'aria-label': props.label,
          })),
      ])
    }

    /**
     * One labelled input row.
     * @param props - `{ label, hint, children }`.
     * @returns a row element.
     */
    function inputRow(props) {
      return h('div', { style: styles.row }, [
        h('div', { style: styles.rowMain, key: 'main' }, [
          h('div', { style: styles.rowLabel, key: 'label' }, props.label),
          props.hint ? h('div', { style: styles.rowHint, key: 'hint' }, props.hint) : null,
        ]),
        h('div', { style: styles.control, key: 'control' }, props.children),
      ])
    }

    /**
     * One titled form section.
     * @param props - `{ title, children }`.
     * @returns a section element.
     */
    function section(props) {
      return h('section', { style: styles.section }, [
        h('h3', { style: styles.sectionTitle, key: 'title' }, props.title),
        ...(Array.isArray(props.children) ? props.children : [props.children]),
      ])
    }

    /**
     * Render the row configuration page.
     * @param props - `{ t, view, form }` from the Plugins page.
     * @returns the page, a summary line, or a status message.
     */
    function ApprovalNotifyPage(props) {
      const t = props.t
      const form = props.form
      const snapshot = form && form.state ? form.state : {}
      const ready = snapshot.status === 'ready' && snapshot.value !== null && typeof snapshot.value === 'object'
      const writable = snapshot.writable !== false
      const storedKey = JSON.stringify(snapshot.value ?? null)
      const syncedKey = React.useRef(storedKey)

      const [draft, setDraft] = React.useState(() => normalize(snapshot.value))
      const [toolsText, setToolsText] = React.useState(() => normalize(snapshot.value).approvalTools.join(', '))
      const [dirty, setDirty] = React.useState(false)
      const [busy, setBusy] = React.useState(false)
      const [message, setMessage] = React.useState('')
      const [testScene, setTestScene] = React.useState('approval')
      const [testBusy, setTestBusy] = React.useState(false)
      const [testText, setTestText] = React.useState('')
      const [info, setInfo] = React.useState(null)

      React.useEffect(() => {
        if (dirty || syncedKey.current === storedKey) return
        syncedKey.current = storedKey
        const next = normalize(form && form.state ? form.state.value : undefined)
        setDraft(next)
        setToolsText(next.approvalTools.join(', '))
      }, [storedKey, dirty])

      React.useEffect(() => {
        let live = true
        fetch('/approval-notify/status', { credentials: 'same-origin' })
          .then((response) => response.json())
          .then((value) => {
            if (live) setInfo(value)
          })
          .catch(() => {
            if (live) setInfo(null)
          })
        return () => {
          live = false
        }
      }, [])

      if (props.view === 'summary') return h('span', null, t('summary'))
      if (!form) return h('p', { style: styles.rowHint }, t('unavailable'))
      if (snapshot.status === 'unavailable') return h('p', { style: styles.rowHint }, t('unavailable'))
      if (!ready) return h('p', { style: styles.rowHint }, t('loadingTrace'))

      const disabled = !writable || busy
      const invalid = validateDraft(draft, toolsText)
      const allOff = !draft.notifyApprovals && !draft.notifyAskQuestion && !draft.notifyPlanReview
        && !draft.notifyTurnCompleted && !draft.notifyTurnError && !draft.notifyTurnBlocked
        && !draft.notifyTurnAborted && !draft.notifyTurnMaxTokens

      /**
       * Update one draft field.
       * @param key - config field.
       * @param value - new draft value.
       */
      function edit(key, value) {
        setDraft((previous) => ({ ...previous, [key]: value }))
        setDirty(true)
        setMessage('')
      }

      /**
       * Replace the draft with the schema defaults (saved only on Save).
       */
      function restoreDefaults() {
        setDraft({ ...DEFAULTS, approvalTools: [] })
        setToolsText('')
        setDirty(true)
        setMessage(t('restored'))
      }

      /**
       * Discard the draft back to the stored snapshot.
       */
      function discardDraft() {
        const next = normalize(form.state ? form.state.value : undefined)
        setDraft(next)
        setToolsText(next.approvalTools.join(', '))
        setDirty(false)
        setMessage('')
      }

      /**
       * Write every changed field through the shared config form.
       */
      async function saveDraft() {
        if (invalid !== null) {
          setMessage(t(invalid))
          return
        }
        const stored = normalize(form.state ? form.state.value : undefined)
        const operations = []
        for (const key of FIELD_KEYS) {
          const next = key === 'approvalTools' ? parseTools(toolsText) : draft[key]
          if (!same(next, stored[key])) operations.push({ op: 'set', path: [key], value: next })
        }
        if (operations.length === 0) {
          setMessage(t('noChanges'))
          return
        }
        setBusy(true)
        try {
          const revision = form.state ? form.state.revision : undefined
          const accepted = await form.mutate(operations, revision)
          if (accepted) {
            setDirty(false)
            setMessage(t('saved'))
          } else {
            setMessage(t('saveFailed'))
          }
        } catch {
          setMessage(t('saveFailed'))
        } finally {
          setBusy(false)
        }
      }

      /**
       * Ask the host to raise one sample toast for the selected scene.
       */
      async function sendTest() {
        setTestBusy(true)
        setTestText('')
        try {
          const response = await fetch('/approval-notify/test', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ scene: testScene }),
          })
          const value = await response.json()
          setTestText(value.ok ? t('testOk') : `${t('testFailed')} ${value.error ?? ''}`.trim())
          if (value.ok) {
            fetch('/approval-notify/status', { credentials: 'same-origin' })
              .then((result) => result.json())
              .then((next) => setInfo(next))
              .catch(() => {})
          }
        } catch (error) {
          setTestText(`${t('testFailed')} ${String(error && error.message ? error.message : error)}`.trim())
        } finally {
          setTestBusy(false)
        }
      }

      const numeric = (key, min, max) => h('input', {
        type: 'number',
        min,
        max,
        step: 1,
        style: styles.input,
        value: draft[key] === undefined || draft[key] === null ? '' : String(draft[key]),
        disabled,
        onChange: (event) => {
          const raw = event.target.value
          edit(key, raw === '' ? '' : Number(raw))
        },
      })

      const text = (key, placeholder) => h('input', {
        type: 'text',
        style: { ...styles.input, ...styles.inputWide },
        value: draft[key] ?? '',
        placeholder: placeholder ?? '',
        disabled,
        onChange: (event) => edit(key, event.target.value),
      })

      return h('div', { style: styles.page }, [
        h('div', { style: styles.head, key: 'head' }, [
          h('h2', { style: styles.title, key: 'title' }, t('title')),
          h('p', { style: styles.desc, key: 'desc' }, t('description')),
        ]),

        !writable ? h('p', { style: styles.notice, key: 'readonly' }, t('readOnly')) : null,
        allOff ? h('p', { style: styles.notice, key: 'alloff' }, t('allOff')) : null,
        dirty ? h('p', { style: styles.notice, key: 'dirty' }, t('unsaved')) : null,

        section({
          key: 'master',
          title: t('enabled'),
          children: [
            checkRow({
              t,
              label: t('enabled'),
              hint: t('enabledHint'),
              checked: draft.enabled,
              disabled,
              onChange: (value) => edit('enabled', value),
            }),
          ],
        }),

        section({
          key: 'situations',
          title: t('situationsTitle'),
          children: [
            h('div', { style: styles.group, key: 'approval-group' }, t('approvalGroup')),
            checkRow({
              t,
              label: t('notifyApprovals'),
              hint: t('notifyApprovalsHint'),
              checked: draft.notifyApprovals,
              disabled,
              onChange: (value) => edit('notifyApprovals', value),
            }),
            inputRow({
              t,
              label: t('approvalTools'),
              hint: t('approvalToolsHint'),
              children: h('input', {
                type: 'text',
                style: { ...styles.input, ...styles.inputWide },
                value: toolsText,
                placeholder: t('toolsPlaceholder'),
                disabled: disabled || !draft.notifyApprovals,
                onChange: (event) => {
                  setToolsText(event.target.value)
                  setDirty(true)
                  setMessage('')
                },
              }),
            }),

            h('div', { style: styles.group, key: 'waiting-group' }, t('waitingGroup')),
            checkRow({
              t,
              label: t('notifyAskQuestion'),
              hint: t('notifyAskQuestionHint'),
              checked: draft.notifyAskQuestion,
              disabled,
              onChange: (value) => edit('notifyAskQuestion', value),
            }),
            checkRow({
              t,
              label: t('notifyPlanReview'),
              hint: t('notifyPlanReviewHint'),
              checked: draft.notifyPlanReview,
              disabled,
              onChange: (value) => edit('notifyPlanReview', value),
            }),

            h('div', { style: styles.group, key: 'turn-group' }, t('turnGroup')),
            checkRow({
              t,
              label: t('notifyTurnCompleted'),
              checked: draft.notifyTurnCompleted,
              disabled,
              onChange: (value) => edit('notifyTurnCompleted', value),
            }),
            checkRow({
              t,
              label: t('notifyTurnError'),
              checked: draft.notifyTurnError,
              disabled,
              onChange: (value) => edit('notifyTurnError', value),
            }),
            checkRow({
              t,
              label: t('notifyTurnBlocked'),
              checked: draft.notifyTurnBlocked,
              disabled,
              onChange: (value) => edit('notifyTurnBlocked', value),
            }),
            checkRow({
              t,
              label: t('notifyTurnAborted'),
              checked: draft.notifyTurnAborted,
              disabled,
              onChange: (value) => edit('notifyTurnAborted', value),
            }),
            checkRow({
              t,
              label: t('notifyTurnMaxTokens'),
              checked: draft.notifyTurnMaxTokens,
              disabled,
              onChange: (value) => edit('notifyTurnMaxTokens', value),
            }),
          ],
        }),

        section({
          key: 'pace',
          title: t('paceTitle'),
          children: [
            inputRow({ t, label: t('cooldownSec'), hint: t('cooldownSecHint'), children: numeric('cooldownSec', 0, 600) }),
            inputRow({ t, label: t('debounceMs'), hint: t('debounceMsHint'), children: numeric('debounceMs', 0, 5000) }),
            inputRow({ t, label: t('maxInflight'), hint: t('maxInflightHint'), children: numeric('maxInflight', 1, 10) }),
          ],
        }),

        section({
          key: 'appearance',
          title: t('appearanceTitle'),
          children: [
            inputRow({
              t,
              label: t('duration'),
              hint: t('durationHint'),
              children: h('select', {
                style: styles.select,
                value: draft.duration,
                disabled,
                onChange: (event) => edit('duration', event.target.value === 'short' ? 'short' : 'long'),
              }, [
                h('option', { value: 'long', key: 'long' }, t('durationLong')),
                h('option', { value: 'short', key: 'short' }, t('durationShort')),
              ]),
            }),
            checkRow({
              t,
              label: t('silent'),
              hint: t('silentHint'),
              checked: draft.silent,
              disabled,
              onChange: (value) => edit('silent', value),
            }),
            inputRow({ t, label: t('titlePrefix'), hint: t('titlePrefixHint'), children: text('titlePrefix') }),
            inputRow({ t, label: t('appId'), hint: t('appIdHint'), children: text('appId') }),
            checkRow({
              t,
              label: t('includeReason'),
              hint: t('includeReasonHint'),
              checked: draft.includeReason,
              disabled,
              onChange: (value) => edit('includeReason', value),
            }),
            checkRow({
              t,
              label: t('includeQuestionText'),
              hint: t('includeQuestionTextHint'),
              checked: draft.includeQuestionText,
              disabled,
              onChange: (value) => edit('includeQuestionText', value),
            }),
          ],
        }),

        section({
          key: 'diagnostics',
          title: t('diagnosticsTitle'),
          children: [
            inputRow({
              t,
              label: t('testScene'),
              hint: info ? `${t('aumid')}: ${info.appId ?? ''}${info.transport === false ? ` · ${t('transportMissing')}` : ''}` : null,
              children: h('div', { style: styles.control }, [
                h('select', {
                  style: styles.select,
                  key: 'scene',
                  value: testScene,
                  disabled: testBusy,
                  onChange: (event) => setTestScene(event.target.value),
                }, [
                  h('option', { value: 'approval', key: 'approval' }, t('testApproval')),
                  h('option', { value: 'ask', key: 'ask' }, t('testAsk')),
                  h('option', { value: 'plan', key: 'plan' }, t('testPlan')),
                  h('option', { value: 'turn-completed', key: 'turn' }, t('testTurn')),
                ]),
                h('button', {
                  type: 'button',
                  key: 'send',
                  style: { ...styles.button, opacity: testBusy ? 0.6 : 1 },
                  disabled: testBusy || !writable,
                  onClick: () => { void sendTest() },
                }, testBusy ? t('testing') : t('sendTest')),
              ]),
            }),
            testText ? h('p', { style: styles.message, key: 'testresult' }, testText) : null,
            info ? h('p', { style: styles.info, key: 'logpath' }, `${t('logPath')}: ${info.logPath ?? ''}`) : null,
            info && info.lastResult ? h('p', { style: styles.info, key: 'lastresult' }, `${t('lastResult')}: ${info.lastResult.ok ? t('testOk') : t('testFailed')} (${info.lastResult.at ?? ''})`) : null,
            !info || info.transport !== false ? null : h('p', { style: styles.error, key: 'transport' }, t('transportMissing')),
            checkRow({
              t,
              label: t('debug'),
              hint: t('debugHint'),
              checked: draft.debug,
              disabled,
              onChange: (value) => edit('debug', value),
            }),
          ],
        }),

        invalid !== null ? h('p', { style: styles.error, key: 'invalid' }, t(invalid)) : null,
        message ? h('p', { style: styles.message, key: 'message' }, message) : null,

        h('div', { style: styles.footer, key: 'footer' }, [
          h('button', {
            type: 'button',
            key: 'save',
            style: { ...styles.primary, opacity: busy || invalid !== null || !writable ? 0.6 : 1 },
            disabled: busy || invalid !== null || !writable,
            onClick: () => { void saveDraft() },
          }, busy ? t('saving') : t('save')),
          h('button', {
            type: 'button',
            key: 'cancel',
            style: styles.button,
            disabled: busy || !writable,
            onClick: discardDraft,
          }, t('cancel')),
          h('button', {
            type: 'button',
            key: 'restore',
            style: styles.button,
            disabled: busy || !writable,
            onClick: restoreDefaults,
          }, t('restoreDefaults')),
        ]),
      ])
    }

    /** Required client services. */
    const inject = ['slots', 'locale']

    /**
     * Mount the configuration page on the built-in Plugins page.
     * @param ctx - browser plugin context.
     */
    function apply(ctx) {
      const t = ctx.locale.bind(NS)
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'approval-notify: dictionaries')
      ctx.effect(() => ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
        name: 'plugins.row.config',
        key: 'dsh-win-approval-notify#approval-notify',
        locale: NS,
      }, ApprovalNotifyPage)), 'approval-notify: settings page')
      void t
    }

    exports.NS = NS
    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})

