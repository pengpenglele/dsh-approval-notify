param(
  [Parameter(Mandatory = $true)][string]$TaskFile
)

$ErrorActionPreference = 'Stop'

try {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing

  $json = [IO.File]::ReadAllText($TaskFile, [Text.Encoding]::UTF8)
  $task = $json | ConvertFrom-Json

  $form = New-Object System.Windows.Forms.Form
  $form.Text = 'DeepSeek Harness'
  $form.TopMost = $true
  $form.StartPosition = 'Manual'
  $form.FormBorderStyle = 'FixedToolWindow'
  $form.ShowInTaskbar = $false
  $form.Width = 380
  $form.Height = 130

  $area = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
  $form.Left = $area.Right - $form.Width - 16
  $form.Top = $area.Bottom - $form.Height - 16

  $title = [string]$task.title
  $body = [string]$task.body

  $label = New-Object System.Windows.Forms.Label
  $label.Dock = 'Fill'
  $label.Padding = New-Object System.Windows.Forms.Padding(12, 10, 12, 10)
  $label.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 9)
  $label.Text = $title + "`r`n`r`n" + $body
  $form.Controls.Add($label)

  $seconds = 8
  if ($task.cardSeconds) { $seconds = [int]$task.cardSeconds }
  if ($seconds -lt 1) { $seconds = 1 }

  $timer = New-Object System.Windows.Forms.Timer
  $timer.Interval = $seconds * 1000
  $timer.Add_Tick({ $form.Close() })
  $timer.Start()

  [void]$form.ShowDialog()
  exit 0
}
catch {
  exit 2
}
