param(
  [string]$HostUrl = "http://localhost:3000",
  [string]$TenantId = "demo-tenant"
)

$ErrorActionPreference = "Stop"

function Show([string]$name, [bool]$ok, [string]$detail="") {
  $tag = if ($ok) { "[OK]" } else { "[FAIL]" }
  $color = if ($ok) { "Green" } else { "Red" }
  Write-Host "$tag $name" -ForegroundColor $color
  if (-not $ok -and $detail) { Write-Host ("  → " + $detail) -ForegroundColor Yellow }
}

# 1) Health
try {
  $h = Invoke-WebRequest -UseBasicParsing -Uri "$HostUrl/api/health" -Method GET
  Show "/api/health reachable" ($h.StatusCode -eq 200) "Status=$($h.StatusCode)"
} catch {
  Show "/api/health reachable" $false $_.Exception.Message
  exit 1
}

# 2) Bad payload (no tenant)
try {
  $null = Invoke-WebRequest -UseBasicParsing -Uri "$HostUrl/api/pricing/v2/quote" -Method POST -ContentType "application/json" -Body "{}"
  Show "Bad payload rejected (no tenant)" $false "Unexpected success"
} catch {
  $resp = $_.Exception.Response
  $code = if ($resp) { [int]$resp.StatusCode } else { 0 }
  $sr = if ($resp) { New-Object IO.StreamReader($resp.GetResponseStream()) } else { $null }
  $badBody = if ($sr) { $sr.ReadToEnd() } else { "" }
  $ok = ($code -in 400,401,422)
  Show "Bad payload rejected (no tenant)" $ok "Status=$code"
  Write-Host $badBody
  if (-not $ok) { exit 1 }
}

# 3) Valid payload (with tenant)
$payload = @'
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
'@

try {
  $resp = Invoke-RestMethod -Uri "$HostUrl/api/pricing/v2/quote" -Method POST `
    -ContentType "application/json" -Headers @{ "x-tenant-id" = $TenantId } -Body $payload
  Show "Valid payload accepted (with tenant)" $true "Status=200"
} catch {
  $er = $_.Exception.Response
  if ($er) {
    $sr = New-Object IO.StreamReader($er.GetResponseStream()); $body = $sr.ReadToEnd()
    Show "Valid payload accepted (with tenant)" $false ("Status=" + [int]$er.StatusCode)
    Write-Host $body
  } else {
    Show "Valid payload accepted (with tenant)" $false $_.Exception.Message
  }
  exit 1
}

$curr = $resp.currency
$freq = $resp.frequency
$hasSubEx = $resp.PSObject.Properties.Name -contains 'subtotal_ex_vat_minor'
if ($hasSubEx) { $subtotal = [int64]$resp.subtotal_ex_vat_minor } else { $subtotal = [int64]$resp.subtotal_minor }

$vat = [int64]$resp.vat_minor
$rut = [int64]$resp.rut_minor
$disc = [int64]$resp.discount_minor
$total = [int64]$resp.total_minor
$sum = $subtotal + $vat + $rut + $disc

Write-Host ("currency={0} frequency={1}" -f $curr,$freq)
Write-Host ("subtotal_ex_vat={0} vat={1} rut={2} discount={3} total={4}" -f $subtotal,$vat,$rut,$disc,$total)
if ($resp.lines) {
  $sample = $resp.lines | Select-Object -First 6 | ForEach-Object { "{0}:{1}:{2}" -f $_.kind,$_.rut_eligible,$_.ex_vat_minor }
  Write-Host ("lines sample: " + ($sample -join " | "))
}

Show "Arithmetic invariant (total = subtotal_ex_vat + vat + rut + discount)" ($total -eq $sum) ("total=$total sum=$sum")
Show "Signs: rut<=0 & discount<=0" (($rut -le 0) -and ($disc -le 0)) ("rut=$rut discount=$disc")

# 4) /debug/rules
try {
  $rules = Invoke-WebRequest -UseBasicParsing -Uri "$HostUrl/debug/rules" -Method GET
  Show "/debug/rules reachable" ($rules.StatusCode -eq 200) ("Status=" + $rules.StatusCode)
  $cross = [char]0x274C  # ❌
  $hasFail = $rules.Content -match [regex]::Escape($cross)
  Show "Rules fixtures green" (-not $hasFail) (if ($hasFail) { "Found ❌ in page" } else { "" })
} catch {
  Show "/debug/rules reachable" $false $_.Exception.Message
  exit 1
}
