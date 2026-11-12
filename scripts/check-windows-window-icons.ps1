param(
  [Parameter(Mandatory = $true)][string]$Handle,
  [Parameter(Mandatory = $true)][string]$ExpectedIcon,
  [string]$OutputPath,
  [string]$PreviewPrefix,
  [switch]$InspectOnly,
  [switch]$RedactPaths
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
[StructLayout(LayoutKind.Sequential, Pack=4)] public struct WindowPropertyKey { public Guid format; public uint id; }
[StructLayout(LayoutKind.Explicit, Size=24)] public struct WindowPropertyValue {
  [FieldOffset(0)] public ushort type;
  [FieldOffset(8)] public IntPtr text;
}
[ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface WindowPropertyStore {
  [PreserveSig] int GetCount(out uint count);
  [PreserveSig] int GetAt(uint index, out WindowPropertyKey key);
  [PreserveSig] int GetValue(ref WindowPropertyKey key, out WindowPropertyValue value);
  [PreserveSig] int SetValue(ref WindowPropertyKey key, ref WindowPropertyValue value);
  [PreserveSig] int Commit();
}
public static class WindowIconProbe {
  [DllImport("user32.dll", SetLastError=true)] static extern bool DrawIconEx(IntPtr dc, int x, int y, IntPtr icon, int width, int height, uint step, IntPtr brush, uint flags);
  [DllImport("shell32.dll")] static extern int SHGetPropertyStoreForWindow(IntPtr window, ref Guid iid, out WindowPropertyStore store);
  [DllImport("ole32.dll")] static extern int PropVariantClear(ref WindowPropertyValue value);
  [DllImport("user32.dll", SetLastError=true)] static extern IntPtr SendMessageTimeout(IntPtr window, uint message, IntPtr wParam, IntPtr lParam, uint flags, uint timeout, out IntPtr result);
  public static string Read(IntPtr window, uint id) {
    var iid = new Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99");
    WindowPropertyStore store;
    Marshal.ThrowExceptionForHR(SHGetPropertyStoreForWindow(window, ref iid, out store));
    try {
      var key = new WindowPropertyKey { format = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), id = id };
      WindowPropertyValue value;
      Marshal.ThrowExceptionForHR(store.GetValue(ref key, out value));
      try { return value.type == 31 ? Marshal.PtrToStringUni(value.text) : value.type == 8 ? Marshal.PtrToStringBSTR(value.text) : ""; }
      finally { PropVariantClear(ref value); }
    } finally { Marshal.ReleaseComObject(store); }
  }
  public static IntPtr Icon(IntPtr window, int kind) {
    IntPtr result;
    if (SendMessageTimeout(window, 0x7f, new IntPtr(kind), IntPtr.Zero, 2, 2000, out result) == IntPtr.Zero) throw new Exception("WM_GETICON failed or timed out");
    return result;
  }
  public static void Draw(IntPtr dc, IntPtr icon, int size) {
    if (!DrawIconEx(dc, (64-size)/2, (64-size)/2, icon, size, size, 0, IntPtr.Zero, 3)) throw new Exception("DrawIconEx failed");
  }
}
'@
$window = [IntPtr]::new([long]$Handle)
$expectedPath = (Resolve-Path $ExpectedIcon).Path
$report = [ordered]@{
  appId = [WindowIconProbe]::Read($window, 5)
  taskbarIconResource = [WindowIconProbe]::Read($window, 3)
  relaunchCommand = [WindowIconProbe]::Read($window, 2)
  relaunchDisplayName = [WindowIconProbe]::Read($window, 4)
  icons = @()
}
foreach ($kind in @(0, 1)) {
  $iconHandle = [WindowIconProbe]::Icon($window, $kind)
  if ($iconHandle -eq [IntPtr]::Zero) {
    if ($InspectOnly) { $report.icons += [pscustomobject]@{ kind = $kind; explicitIconPresent = $false }; continue }
    throw "Window has no explicit icon of kind $kind"
  }
  if ($PreviewPrefix) {
    $preview = [System.Drawing.Bitmap]::new(64, 64)
    $graphics = [System.Drawing.Graphics]::FromImage($preview)
    try {
      $graphics.Clear([System.Drawing.Color]::FromArgb(246, 243, 236))
      $dc = $graphics.GetHdc()
      try { [WindowIconProbe]::Draw($dc, $iconHandle, $(if ($kind -eq 0) { 16 } else { 32 })) } finally { $graphics.ReleaseHdc($dc) }
      $suffix = $(if ($kind -eq 0) { 'small' } else { 'large' })
      $preview.Save([System.IO.Path]::GetFullPath("$PreviewPrefix-$suffix.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $graphics.Dispose(); $preview.Dispose() }
  }
  $wrapper = $actualIcon = $expected = $actual = $wanted = $null
  try {
    # Clone the window-owned handle; never destroy the original HICON.
    $wrapper = [System.Drawing.Icon]::FromHandle($iconHandle)
    $actualIcon = [System.Drawing.Icon]$wrapper.Clone()
    $expected = [System.Drawing.Icon]::new($expectedPath, $actualIcon.Size)
    $actual = $actualIcon.ToBitmap()
    $wanted = $expected.ToBitmap()
    $different = 0
    $errorSum = 0L
    for ($y = 0; $y -lt $actual.Height; $y++) {
      for ($x = 0; $x -lt $actual.Width; $x++) {
        $a = $actual.GetPixel($x, $y)
        $b = $wanted.GetPixel($x, $y)
        if ($a.A -eq 0 -and $b.A -eq 0) { continue }
        if ($a.ToArgb() -ne $b.ToArgb()) { $different++ }
        $errorSum += [Math]::Abs([int]$a.A - [int]$b.A) + [Math]::Abs([int]$a.R - [int]$b.R) + [Math]::Abs([int]$a.G - [int]$b.G) + [Math]::Abs([int]$a.B - [int]$b.B)
      }
    }
    $pixels = $actual.Width * $actual.Height
    $meanError = $errorSum / ($pixels * 4.0)
    $matches = $different -eq 0
    $report.icons += [pscustomobject]@{ kind = $(if ($kind -eq 0) { 'small-preview' } else { 'large-window' }); width = $actual.Width; height = $actual.Height; differentPixels = $different; meanChannelError = $meanError; matchesNewLogo = $matches }
    if (-not $InspectOnly -and -not $matches) { throw "Window icon kind $kind does not match the approved artwork" }
  } catch {
    if (-not $InspectOnly) { throw }
    # Some legacy PNG-derived handles cannot be decoded by System.Drawing.
    # Preserve that diagnostic; strict post-change checks never ignore errors.
    $report.icons += [pscustomobject]@{ kind = $kind; explicitIconPresent = $true; bitmapDecodeError = $_.Exception.Message }
  } finally {
    foreach ($resource in @($actual, $wanted, $actualIcon, $wrapper, $expected)) {
      if ($null -ne $resource) { $resource.Dispose() }
    }
  }
}
if (-not $InspectOnly) {
  if ($report.appId -ne 'com.archimedes.research') { throw 'Wrong window AppUserModelID' }
  if ($report.taskbarIconResource -notlike '*app-icon.ico*') { throw 'Taskbar still lacks the application ICO resource' }
  if (-not $report.relaunchCommand -or $report.relaunchDisplayName -ne 'Archimedes') { throw 'Incomplete taskbar relaunch metadata' }
  $resourcePath = (($report.taskbarIconResource -replace ',\s*0$', '').TrimStart('@')).Trim('"')
  if (-not [string]::Equals($resourcePath, $expectedPath, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Taskbar is not using the same ICO as the window' }
}
if ($RedactPaths) {
  $report['hasRelaunchCommand'] = [bool]$report.relaunchCommand
  $report['relaunchUsesExecutableAndAppPath'] = ($report.relaunchCommand -match '^"[^"]+"\s+"[^"]+"$')
  $report.Remove('relaunchCommand')
  if ($report.taskbarIconResource) { $report.taskbarIconResource = [System.IO.Path]::GetFileName($report.taskbarIconResource) }
}
$json = ConvertTo-Json -InputObject $report -Depth 5
Write-Output $json
if ($OutputPath) { [System.IO.File]::WriteAllText([System.IO.Path]::GetFullPath($OutputPath), $json + [Environment]::NewLine) }
