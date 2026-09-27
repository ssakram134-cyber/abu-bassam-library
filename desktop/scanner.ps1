param(
  [Parameter(Position=0)][ValidateSet('list','scan')][string]$Action = 'list',
  [Parameter(Position=1)][string]$DeviceId = '',
  [Parameter(Position=2)][string]$OutputPath = '',
  [Parameter(Position=3)][int]$Dpi = 300
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
function Get-PropValue($properties, $name, $fallback='') {
  try {
    foreach ($p in $properties) {
      if ($p.Name -eq $name) { return [string]$p.Value }
    }
  } catch {}
  return $fallback
}
function Get-ScannerInfos {
  $manager = New-Object -ComObject WIA.DeviceManager
  $items = @()
  foreach ($info in $manager.DeviceInfos) {
    if ([int]$info.Type -ne 1) { continue }
    $items += [pscustomobject]@{
      id = [string]$info.DeviceID
      name = (Get-PropValue $info.Properties 'Name' 'Scanner')
      manufacturer = (Get-PropValue $info.Properties 'Manufacturer' '')
      description = (Get-PropValue $info.Properties 'Description' '')
    }
  }
  return ,$items
}
if ($Action -eq 'list') {
  $rows = @(Get-ScannerInfos)
  if ($rows.Count -eq 0) { '[]'; exit 0 }
  $rows | ConvertTo-Json -Compress -Depth 4
  exit 0
}
if ([string]::IsNullOrWhiteSpace($DeviceId)) { throw 'SCANNER_ID_REQUIRED' }
if ([string]::IsNullOrWhiteSpace($OutputPath)) { throw 'OUTPUT_PATH_REQUIRED' }
$Dpi = [Math]::Max(75, [Math]::Min(1200, $Dpi))
$manager = New-Object -ComObject WIA.DeviceManager
$selected = $null
foreach ($info in $manager.DeviceInfos) {
  if ([int]$info.Type -eq 1 -and [string]$info.DeviceID -eq $DeviceId) { $selected = $info; break }
}
if ($null -eq $selected) { throw 'SCANNER_NOT_FOUND' }
$device = $selected.Connect()
if ($device.Items.Count -lt 1) { throw 'SCANNER_HAS_NO_ITEMS' }
$item = $device.Items.Item(1)
try { $item.Properties.Item('6147').Value = $Dpi } catch {}
try { $item.Properties.Item('6148').Value = $Dpi } catch {}
try { $item.Properties.Item('6146').Value = 1 } catch {}
$jpegFormat = '{B96B3CAE-0728-11D3-9D7B-0000F81EF32E}'
$image = $item.Transfer($jpegFormat)
if (Test-Path -LiteralPath $OutputPath) { Remove-Item -LiteralPath $OutputPath -Force }
$image.SaveFile($OutputPath)
if (-not (Test-Path -LiteralPath $OutputPath)) { throw 'SCAN_FILE_NOT_CREATED' }
$result = [pscustomobject]@{
  ok = $true
  path = $OutputPath
  dpi = $Dpi
  bytes = (Get-Item -LiteralPath $OutputPath).Length
}
$result | ConvertTo-Json -Compress
