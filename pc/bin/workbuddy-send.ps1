param(
  [string]$ExeName = "WorkBuddy",
  [int]$WaitMs = 2600
)

# Paste the summary prompt from clipboard into WorkBuddy and press Enter.
# Only send when WorkBuddy main window is confirmed in foreground, so we never
# paste into the wrong window.
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WBWin {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
}
"@

Start-Sleep -Milliseconds $WaitMs

$procs = Get-Process -Name $ExeName -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 }
if (-not $procs) { exit 2 }
$target = $procs | Sort-Object StartTime -Descending | Select-Object -First 1
$h = $target.MainWindowHandle

[WBWin]::ShowWindow($h, 9) | Out-Null
[WBWin]::BringWindowToTop($h) | Out-Null
# Windows foreground lock: send a harmless Alt first, then grab foreground
$ws = New-Object -ComObject WScript.Shell
$ws.SendKeys("%")
Start-Sleep -Milliseconds 150
[WBWin]::SetForegroundWindow($h) | Out-Null
Start-Sleep -Milliseconds 400

# Verify: foreground window must be the WorkBuddy main window, else abort
$fg = [WBWin]::GetForegroundWindow()
if ($fg -ne $h) { exit 3 }

$ws.SendKeys("^v")
Start-Sleep -Milliseconds 300
$ws.SendKeys("{ENTER}")
exit 0
