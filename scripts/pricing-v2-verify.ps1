param(
  [string]$HostUrl = "http://localhost:3000",
  [string]$TenantId = "demo-tenant",
  [string]$PayloadPath = "scripts/payload.valid.json",
  [switch]$AutoStart
)

$ErrorActionPreference = "SilentlyContinue"
$Failed = 0
$startedProc = $null

function Write-Result([string]$name, [bool]$ok, [string]$detail="") {
  $status = if ($ok) { "[OK]" } else { "[FAIL]" }
  $color  = if ($ok) { "Green" } else { "Red" }
  Write-Host ("{0} {1}" -f $status, $name) -ForegroundColor $color
  if (-not $ok -and $detail) { Write-Host ("  → " + $detail) -ForegroundColor Yellow }
  if (-not $ok) { $script:Failed++ }
}

function Start-Dev {
  if (-not $AutoStart) { return }
  Write-Host "Starting dev server (npm run dev)..." -ForegroundColor Cyan
  $startedProc = Start-Process -FilePath "npm" -ArgumentList "run","dev" -WorkingDirectory "$PSScriptRoot\.." -PassThru
}

function Wait-Health([int]$timeoutSec = 60) {
  $deadline = (Get-Date).AddSeconds($timeoutSec)
  while ((Get-Date) -lt $deadline) {
    try {
      $r = Invoke-WebRequest -Uri "$HostUrl/api/health" -Method GET -TimeoutSec 4
      if ($r.StatusCode -eq 200) { return $true }
    } catch { Start-Sleep -Milliseconds 500 }
  }
  return $false
}

function PostRaw([string]$url, [string]$json, [hashtable]$headers=@{}) {
  try {
    return Invoke-WebRequest -Uri $url -Method POST -ContentType "application/json" -Headers $headers -Body $json -TimeoutSec 15
  } catch {
    $resp = $_.Exception.Response
    if ($resp -ne $null) {
      try {
        $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
        $content = $reader.ReadToEnd()
        return [pscustomobject]@{ StatusCode = [int]$resp.StatusCode; Content = $content }
      } catch { return $null }
    }
    return $null
  }
}

function GetRaw([string]$url) {
  try { return Invoke-WebRequest -Uri $url -Method GET -TimeoutSec 10 } catch {
    $resp = $_.Exception.Response
    if ($resp -ne $null) {
      $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
      $content = $reader.ReadToEnd()
      return [pscustomobject]@{ StatusCode = [int]$resp.StatusCode; Content = $content }
    }
    return $null
  }
}

Write-Host '=== Pricing v2 verification ==='

# 0) Start + wait for health
Start-Dev
$ready = Wait-Health 60
Write-Result "/api/health reachable" $ready "Hit $HostUrl/api/health"
if (-not $ready) { Write-Host "Server not reachable - aborting."; exit 1 }

# 1) Bad request: {} WITHOUT tenant header
$bad = PostRaw "$HostUrl/api/pricing/v2/quote" '{}' @{}
$badOk = $bad -ne $null -and ($bad.StatusCode -in 400,401,422)
Write-Result "Bad payload rejected (no tenant)" $badOk ("Status=" + ($bad?.StatusCode))
if ($bad -and $bad.Content) { Write-Host "  body: $($bad.Content)" }

# 2) Valid request WITH tenant header
if (-not (Test-Path $PayloadPath)) {
  New-Item -ItemType Directory -Force -Path (Split-Path $PayloadPath) | Out-Null
  @'
{
  "tenant": { "currency": "SEK", "vat_rate": 25, "rut_enabled": true },
  "service": {
    "model": "universal_multiplier",
    "name": "Per sqm",
    "ratePerSqm": 2.5,
    "frequencyMultipliers": { "one_time": 1.0, "weekly": 1.0, "biweekly": 1.15, "monthly": 1.4 },
    "vatRate": 25,
    "rutEligible": true,
    "addons": [],
    "fees": [{ "key": "travel", "name": "Travel fee", "amount": 50, "rutEligible": false }],
    "modifiers": [{
      "key": "pet",
      "label": "Pets present",
      "condition": { "type": "boolean", "when": true, "answerKey": "has_pets" },
      "effect": { "target": "subtotal_before_modifiers", "mode": "percent", "value": 10, "direction": "increase", "rutEligible": true, "label": "+10% pets" }
    }],
    "minimum": 0
  },
  "frequency": "monthly",
  "inputs": { "area": 50 },
  "addons": [],
  "applyRUT": true,
  "coupon": { "code": "SAVE10", "type": "percent", "value": 10 },
  "answers": { "has_pets": true }
}
'@ | Set-Content -Path $PayloadPath -Encoding UTF8
}
$body = Get-Content -Raw $PayloadPath
$headers = @{ "x-tenant-id" = $TenantId }
$good = PostRaw "$HostUrl/api/pricing/v2/quote" $body $headers
$goodOk = $good -ne $null -and $good.StatusCode -eq 200
Write-Result "Valid payload accepted (with tenant)" $goodOk ("Status=" + ($good?.StatusCode))

if ($goodOk) {
  try {
    $j = $good.Content | ConvertFrom-Json
    # Expect fields: subtotal_ex_vat_minor, vat_minor, rut_minor, discount_minor, total_minor
    $sum = [int64]$j.subtotal_ex_vat_minor + [int64]$j.vat_minor + [int64]$j.rut_minor + [int64]$j.discount_minor
    $invOk = ([int64]$j.total_minor -eq $sum)
    $signOk = ([int64]$j.rut_minor -le 0) -and ([int64]$j.discount_minor -le 0)
    Write-Result "Arithmetic invariant" $invOk ("total=" + $j.total_minor + " sum=" + $sum)
  Write-Result "Signs: rut<=0 `& discount<=0" $signOk ("rut=" + $j.rut_minor + " discount=" + $j.discount_minor)
    Write-Host ("  currency={0}" -f $j.currency)
    Write-Host ("  subtotal_ex_vat={0} vat={1} rut={2} discount={3} total={4}" -f $j.subtotal_ex_vat_minor,$j.vat_minor,$j.rut_minor,$j.discount_minor,$j.total_minor)
  } catch {
    Write-Result "Response JSON parseable" $false "Body is not valid JSON"
  }
}

# 3) /debug/rules page must have no ❌
$rules = GetRaw "$HostUrl/debug/rules"
$rulesOk = $rules -ne $null -and $rules.StatusCode -eq 200
Write-Result "/debug/rules reachable" $rulesOk ("Status=" + ($rules?.StatusCode))
if ($rulesOk) {
  $hasFail = ($rules.Content -match "❌")
  Write-Result "Rules fixtures green" (-not $hasFail) (if ($hasFail) { "Found ❌ in page" } else { "" })
}

if ($Failed -gt 0) {
  Write-Host "`nSummary: $Failed failure(s)." -ForegroundColor Red
  exit 1
} else {
  Write-Host "`nSummary: all checks passed." -ForegroundColor Green
  exit 0
}
