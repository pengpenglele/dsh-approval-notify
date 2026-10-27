param(
  [Parameter(Mandatory = $true)][string]$TaskFile
)

$ErrorActionPreference = 'Stop'

try {
  $json = [IO.File]::ReadAllText($TaskFile, [Text.Encoding]::UTF8)
  $task = $json | ConvertFrom-Json

  $appId = 'com.deepseek.dsh'
  if ($task.appId) { $appId = [string]$task.appId }

  $null = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
  $template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
  $texts = $template.GetElementsByTagName('text')
  $null = $texts.Item(0).AppendChild($template.CreateTextNode([string]$task.title))
  $null = $texts.Item(1).AppendChild($template.CreateTextNode([string]$task.body))

  $root = $template.DocumentElement
  if ([string]$task.duration -eq 'long') { $root.SetAttribute('duration', 'long') }
  if ($task.silent -eq $true) { $root.SetAttribute('silent', 'true') }

  $toast = [Windows.UI.Notifications.ToastNotification]::new($template)
  $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId)

  # Diagnostic: record the platform's own verdict for this app so a suppressed
  # notification (disabled app / disabled user / policy / manifest) is visible.
  try {
    $setting = [string]$notifier.Setting
    $diag = Join-Path $env:TEMP 'dsh-win-approval-notify\diag.log'
    New-Item -ItemType Directory -Force -Path (Split-Path $diag) | Out-Null
    [IO.File]::AppendAllText($diag, ((Get-Date).ToString('o') + ' appId=' + $appId + ' setting=' + $setting + "`r`n"), [Text.Encoding]::UTF8)
  }
  catch {
    # Diagnostics must never block the notification attempt.
  }

  $notifier.Show($toast)
  exit 0
}
catch {
  $message = [string]$_.Exception.Message
  try {
    $log = Join-Path $env:TEMP 'dsh-win-approval-notify\toast-error.log'
    New-Item -ItemType Directory -Force -Path (Split-Path $log) | Out-Null
    [IO.File]::AppendAllText($log, ((Get-Date).ToString('o') + ' ' + $message + "`r`n"), [Text.Encoding]::UTF8)
  }
  catch {
    # Logging must not mask the original failure.
  }
  exit 2
}

