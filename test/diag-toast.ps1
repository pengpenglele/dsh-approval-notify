param(
  [string]$AppId = 'com.deepseek.dsh',
  [string]$Text = 'Diag toast'
)

$ErrorActionPreference = 'Continue'

$null = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]

$notifier = $null
try {
  $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($AppId)
  Write-Output "create=ok appId=$AppId"
} catch {
  Write-Output "create=fail appId=$AppId error=$($_.Exception.Message)"
}

if ($notifier -ne $null) {
  try {
    Write-Output "setting=$($notifier.Setting)"
  } catch {
    Write-Output "setting=error $($_.Exception.Message)"
  }

  $template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText01)
  $nodes = $template.GetElementsByTagName('text')
  $null = $nodes.Item(0).AppendChild($template.CreateTextNode($Text))
  $toast = [Windows.UI.Notifications.ToastNotification]::new($template)
  try {
    $notifier.Show($toast)
    Write-Output 'show=ok'
  } catch {
    Write-Output "show=fail $($_.Exception.Message)"
  }
}
