param(
  [Parameter(Position=0)][ValidateSet('status','verify')][string]$Action = 'status',
  [Parameter(Position=1)][string]$Reason = 'مكتبة أبو بسام'
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
function Await-WinRt($operation, $resultType) {
  $asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1
  } | Select-Object -First 1).MakeGenericMethod($resultType)
  $task = $asTask.Invoke($null, @($operation))
  $task.Wait()
  return $task.Result
}
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $verifierType = [Windows.Security.Credentials.UI.UserConsentVerifier,Windows.Security.Credentials.UI,ContentType=WindowsRuntime]
  $availabilityType = [Windows.Security.Credentials.UI.UserConsentVerifierAvailability,Windows.Security.Credentials.UI,ContentType=WindowsRuntime]
  $resultType = [Windows.Security.Credentials.UI.UserConsentVerificationResult,Windows.Security.Credentials.UI,ContentType=WindowsRuntime]
  $availability = Await-WinRt ($verifierType::CheckAvailabilityAsync()) $availabilityType
  $available = ([string]$availability -eq 'Available')
  if ($Action -eq 'status') {
    [pscustomobject]@{ available=$available; enrolled=$available; status=[string]$availability } | ConvertTo-Json -Compress
    exit 0
  }
  if (-not $available) {
    [pscustomobject]@{ success=$false; error='not_available'; status=[string]$availability } | ConvertTo-Json -Compress
    exit 0
  }
  $verification = Await-WinRt ($verifierType::RequestVerificationAsync($Reason)) $resultType
  $ok = ([string]$verification -eq 'Verified')
  [pscustomobject]@{ success=$ok; error=($(if($ok){''}else{([string]$verification)})); status=[string]$verification } | ConvertTo-Json -Compress
} catch {
  if ($Action -eq 'status') {
    [pscustomobject]@{ available=$false; enrolled=$false; status='Unavailable'; error=$_.Exception.Message } | ConvertTo-Json -Compress
  } else {
    [pscustomobject]@{ success=$false; error='windows_hello_unavailable'; status='Unavailable' } | ConvertTo-Json -Compress
  }
}
