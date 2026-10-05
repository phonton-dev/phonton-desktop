param(
    [Parameter(Mandatory)][ValidateSet('cancel', 'select')][string]$Action,
    [Parameter(Mandatory)][string]$ReportPath
)
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows') { throw 'Disposable Windows Actions runner required' }
$app = $env:PHONTON_ACCEPTANCE_APP
$fixture = $env:PHONTON_ACCEPTANCE_FIXTURE
if (!(Test-Path -LiteralPath $app -PathType Leaf) -or !(Test-Path -LiteralPath $fixture -PathType Container)) { throw 'Owned app and fixture required' }
if (Test-Path -LiteralPath $ReportPath) { throw 'Never replace a picker report' }
$evidencePrefix = [IO.Path]::GetFullPath((Join-Path (Get-Location) 'acceptance-evidence')).TrimEnd('\') + '\'
if (![IO.Path]::GetFullPath($ReportPath).StartsWith($evidencePrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Picker output must remain inside acceptance evidence' }
$report = @{ schema = 1; action = $Action; status = 'running'; app = $app; fixture = $fixture }
function SaveReport { $report | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $ReportPath -Encoding UTF8 }
try {
    Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, UIAutomationClientsideProviders, System.Drawing
    # Windows PowerShell can expose legacy HWND controls as patternless panes
    # unless its managed Win32 providers are explicitly registered. Keep the
    # Button/Edit and Invoke/Value assertions; load the documented providers.
    $providers = @([AppDomain]::CurrentDomain.GetAssemblies() | Where-Object { $_.GetName().Name -eq 'UIAutomationClientsideProviders' })
    if ($providers.Count -ne 1) { throw 'Expected one framework client-side provider assembly' }
    [System.Windows.Automation.ClientSettings]::RegisterClientSideProviderAssembly($providers[0].GetName())
    $report.clientSideProviders = $providers[0].FullName
    $report.clientSideProviderLocation = $providers[0].Location
    $report.clientSideProviderClasses = @([UIAutomationClientsideProviders.UIAutomationClientSideProviders]::ClientSideProviderDescriptionTable | Where-Object { $_.ClassName -in @('Button', 'Edit') } | ForEach-Object ClassName)
    if ('Button' -notin $report.clientSideProviderClasses -or 'Edit' -notin $report.clientSideProviderClasses) { throw 'Expected framework button and edit providers' }
    Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class PickerWindows {
  public delegate bool EnumProc(IntPtr hwnd, IntPtr data);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc callback, IntPtr data);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr hwnd, uint flags);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr hwnd, uint command);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int size);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hwnd, IntPtr dc, uint flags);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out Rect rect);
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  public static IntPtr[] Owned(uint pid) {
    var found = new List<IntPtr>();
    EnumWindows((hwnd, data) => { uint value; GetWindowThreadProcessId(hwnd, out value); if(value == pid && IsWindowVisible(hwnd)) found.Add(hwnd); return true; }, IntPtr.Zero);
    return found.ToArray();
  }
  public static string Title(IntPtr hwnd) { var text = new StringBuilder(512); GetWindowText(hwnd, text, text.Capacity); return text.ToString(); }
}
'@
    $owned = @(Get-CimInstance Win32_Process -Filter "Name='phonton-desktop.exe'" | Where-Object ExecutablePath -EQ $app)
    if ($owned.Count -ne 1) { throw 'Exactly one app at the accepted installed path required' }
    $appId = [uint32]$owned[0].ProcessId
    $main = (Get-Process -Id $appId).MainWindowHandle
    if ($main -eq [IntPtr]::Zero -or ![PickerWindows]::IsWindowVisible($main)) { throw 'Visible native app window required' }
    $report.appProcessId = $appId
    $report.mainWindow = $main.ToInt64()
    # Signal readiness before the WebDriver click; the modal request can block.
    @{ ready = $true; appProcessId = $appId; mainWindow = $main.ToInt64() } | ConvertTo-Json | Set-Content -LiteralPath "$ReportPath.ready.tmp" -Encoding UTF8
    Move-Item -LiteralPath "$ReportPath.ready.tmp" -Destination "$ReportPath.ready.json"
    $deadline = (Get-Date).AddSeconds(60)
    $dialog = [IntPtr]::Zero
    do {
        $dialogs = @([PickerWindows]::Owned($appId) | Where-Object { [PickerWindows]::Title($_) -eq 'Open repository' -and $_ -ne $main })
        if ($dialogs.Count -gt 1) { throw 'Ambiguous native repository dialogs' }
        if ($dialogs.Count -eq 1) { $dialog = $dialogs[0]; break }
        Start-Sleep -Milliseconds 200
    } while ((Get-Date) -lt $deadline)
    if ($dialog -eq [IntPtr]::Zero) { throw 'Owned repository dialog did not appear' }
    $owner = [PickerWindows]::GetWindow($dialog, 4)
    $rootOwner = [PickerWindows]::GetAncestor($dialog, 3)
    $dialogProcessId = [uint32]0
    [PickerWindows]::GetWindowThreadProcessId($dialog, [ref]$dialogProcessId) | Out-Null
    if ($dialogProcessId -ne $appId -or $rootOwner -ne $main -or $owner -eq [IntPtr]::Zero) { throw 'Dialog ownership mismatch' }
    $report.dialog = @{ hwnd = $dialog.ToInt64(); processId = $dialogProcessId; owner = $owner.ToInt64(); rootOwner = $rootOwner.ToInt64(); title = [PickerWindows]::Title($dialog) }
    $element = [System.Windows.Automation.AutomationElement]::FromHandle($dialog)
    $controls = @($element.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition))
    if ($controls.Count -gt 500) { throw 'Unexpectedly large native dialog tree' }
    $report.controls = @($controls | ForEach-Object { @{ name = $_.Current.Name; id = $_.Current.AutomationId; type = $_.Current.ControlType.ProgrammaticName; enabled = $_.Current.IsEnabled; offscreen = $_.Current.IsOffscreen; patterns = @($_.GetSupportedPatterns() | ForEach-Object ProgrammaticName) } })
    $rectangle = New-Object PickerWindows+Rect
    if (![PickerWindows]::GetWindowRect($dialog, [ref]$rectangle)) { throw 'Dialog bounds unavailable' }
    $width = $rectangle.Right - $rectangle.Left; $height = $rectangle.Bottom - $rectangle.Top
    if ($width -lt 100 -or $height -lt 100 -or $width -gt 4096 -or $height -gt 4096) { throw 'Unexpected dialog dimensions' }
    $bitmap = New-Object System.Drawing.Bitmap($width, $height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $dc = $graphics.GetHdc()
    try { if (![PickerWindows]::PrintWindow($dialog, $dc, 2)) { throw 'Owned native dialog capture failed' } }
    finally { $graphics.ReleaseHdc($dc); $graphics.Dispose() }
    try { $bitmap.Save("$ReportPath.png", [System.Drawing.Imaging.ImageFormat]::Png) }
    finally { $bitmap.Dispose() }
    SaveReport
    function OneControl([string]$Type, [string]$Name) {
        $found = @($controls | Where-Object { $_.Current.ControlType.ProgrammaticName -eq $Type -and $_.Current.Name -eq $Name -and $_.Current.IsEnabled -and !$_.Current.IsOffscreen })
        if ($found.Count -ne 1) { throw "Expected one visible enabled $Type named $Name; observed $($found.Count), see retained tree" }
        return $found[0]
    }
    if ($Action -eq 'select') {
        $edit = OneControl 'ControlType.Edit' 'Folder:'
        $value = [System.Windows.Automation.ValuePattern]$edit.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
        if ($value.Current.IsReadOnly) { throw 'Folder control must be editable' }
        $value.SetValue($fixture)
        if ($value.Current.Value -ne $fixture) { throw 'Native folder value did not match fixture' }
        $report.enteredDirectory = $value.Current.Value
        $button = OneControl 'ControlType.Button' 'Select Folder'
    } else { $button = OneControl 'ControlType.Button' 'Cancel' }
    $report.invokedControl = @{ name = $button.Current.Name; id = $button.Current.AutomationId; type = $button.Current.ControlType.ProgrammaticName }
    SaveReport
    # Revalidate identity immediately before the only native activation.
    if (![PickerWindows]::IsWindow($dialog) -or [PickerWindows]::GetAncestor($dialog, 3) -ne $main) { throw 'Dialog ownership changed' }
    ([System.Windows.Automation.InvokePattern]$button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)).Invoke()
    $deadline = (Get-Date).AddSeconds(15)
    while ([PickerWindows]::IsWindow($dialog) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 200 }
    if ([PickerWindows]::IsWindow($dialog)) { throw 'Native dialog did not close after invocation' }
    $report.status = 'passed'
    $report.dialogClosed = $true
} catch {
    $report.status = 'failed'
    $report.error = $_.Exception.Message
    throw
} finally {
    if ($report.status -eq 'failed' -and $null -ne $dialog -and $null -ne $element -and [PickerWindows]::IsWindow($dialog) -and [PickerWindows]::GetAncestor($dialog, 3) -eq $main) {
        try {
            # A failed inspection must not leave its verified owned modal blocking
            # the driver. Close is cancellation; never target another window.
            ([System.Windows.Automation.WindowPattern]$element.GetCurrentPattern([System.Windows.Automation.WindowPattern]::Pattern)).Close()
            $report.failureDialogCloseRequested = $true
        } catch { $report.failureDialogCloseError = $_.Exception.Message }
    }
    SaveReport
}
