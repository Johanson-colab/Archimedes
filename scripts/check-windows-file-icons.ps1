param(
  [Parameter(Mandatory = $true)][string[]]$Files,
  [string]$ExpectedIcon = (Join-Path $PSScriptRoot '../electron/assets/app-icon.ico'),
  [string]$OutputPath
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$expectedPath = (Resolve-Path $ExpectedIcon).Path
$results = @()
foreach ($file in $Files) {
  $fullPath = (Resolve-Path $file).Path
  $extracted = [System.Drawing.Icon]::ExtractAssociatedIcon($fullPath)
  if (-not $extracted) { throw "No embedded icon: $fullPath" }
  $expected = [System.Drawing.Icon]::new($expectedPath, $extracted.Size)
  $actualBitmap = $extracted.ToBitmap()
  $expectedBitmap = $expected.ToBitmap()
  try {
    $different = 0
    for ($y = 0; $y -lt $actualBitmap.Height; $y++) {
      for ($x = 0; $x -lt $actualBitmap.Width; $x++) {
        $actual = $actualBitmap.GetPixel($x, $y)
        $wanted = $expectedBitmap.GetPixel($x, $y)
        if ($actual.A -eq 0 -and $wanted.A -eq 0) { continue }
        if ($actual.ToArgb() -ne $wanted.ToArgb()) { $different++ }
      }
    }
    $result = [pscustomobject]@{ file = [System.IO.Path]::GetFileName($fullPath); width = $actualBitmap.Width; height = $actualBitmap.Height; differentPixels = $different; matchesNewLogo = ($different -eq 0) }
    $results += $result
    if ($different -ne 0) { throw "Embedded file icon differs from the approved logo: $fullPath ($different pixels)" }
  } finally {
    $actualBitmap.Dispose()
    $expectedBitmap.Dispose()
    $expected.Dispose()
    $extracted.Dispose()
  }
}
$json = ConvertTo-Json -InputObject @($results) -Depth 4
Write-Output $json
if ($OutputPath) { [System.IO.File]::WriteAllText([System.IO.Path]::GetFullPath($OutputPath), $json + [Environment]::NewLine) }
