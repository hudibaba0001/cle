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

function PostJson($path, $json) {
  return Invoke-RestMethod -Uri ("$HostUrl" + $path) -Method POST -Headers @{ 'x-tenant-id'=$TenantId; 'Content-Type'='application/json' } -Body $json
}

function AssertInvariant($quote) {
  $subtotal = [int64]$quote.subtotal_ex_vat_minor
  if (-not $subtotal -and $quote.PSObject.Properties.Name -contains 'subtotal_minor') { $subtotal = [int64]$quote.subtotal_minor }
  $sum = $subtotal + [int64]$quote.vat_minor + [int64]$quote.rut_minor + [int64]$quote.discount_minor
  return ($sum -eq [int64]$quote.total_minor)
}

# 0) Health
try {
  $h = Invoke-WebRequest -UseBasicParsing -Uri "$HostUrl/api/health" -Method GET
  Show "/api/health reachable" ($h.StatusCode -eq 200) "Status=$($h.StatusCode)"
} catch {
  Show "/api/health reachable" $false $_.Exception.Message
  exit 1
}

# A) Fixed Tier
$fixed = @'
{
  "tenant": { "currency": "SEK", "vat_rate": 25, "rut_enabled": true },
  "service": {
    "model": "fixed_tier",
    "name": "Fixed Tier",
    "tiers": [ { "min": 1, "max": 50, "price": 3299 }, { "min": 91, "max": 100, "price": 4279 } ],
    "frequencyMultipliers": { "one_time": 1.0, "weekly": 1.0, "biweekly": 1.15, "monthly": 1.40 },
    "vatRate": 25, "rutEligible": true, "addons": [], "fees": [], "modifiers": [], "minimum": 0
  },
  "frequency": "one_time", "inputs": { "area": 95 }, "answers": {}, "applyRUT": true
}
'@
$resp = PostJson "/api/pricing/v2/quote" $fixed
Show "Fixed Tier invariant" (AssertInvariant $resp)

# B) Tiered Multiplier (per-m² rate)
$tiered = @'
{
  "tenant": { "currency": "SEK", "vat_rate": 25, "rut_enabled": true },
  "service": {
    "model": "tiered_multiplier",
    "name": "Tiered Multiplier",
    "tiers": [ { "min": 1, "max": 50, "ratePerSqm": 50 }, { "min": 91, "max": 100, "ratePerSqm": 45 } ],
    "frequencyMultipliers": { "one_time": 1.0, "weekly": 1.0, "biweekly": 1.15, "monthly": 1.40 },
    "vatRate": 25, "rutEligible": true, "addons": [], "fees": [],
    "modifiers": [{
      "key":"dogs","label":"Dogs present",
      "condition": { "type":"boolean", "when": true, "answerKey": "has_dogs" },
      "effect": { "target":"subtotal_before_modifiers", "mode":"fixed", "value": 100, "direction":"increase", "rutEligible": true, "label": "+100 SEK dogs" }
    }],
    "minimum": 0
  },
  "frequency": "one_time", "inputs": { "area": 95 }, "answers": { "has_dogs": true }, "applyRUT": true
}
'@
$resp = PostJson "/api/pricing/v2/quote" $tiered
Show "Tiered Multiplier invariant" (AssertInvariant $resp)
$hasModifier = ($resp.lines | Where-Object { $_.key -like 'modifier:*' -and [int]$_.amount_minor -eq 10000 }).Count -gt 0
Show "Tiered has +100 SEK modifier line" $hasModifier

# C) Universal Multiplier
$uni = @'
{
  "tenant": { "currency": "SEK", "vat_rate": 25, "rut_enabled": true },
  "service": {
    "model": "universal_multiplier",
    "name": "Universal",
    "ratePerSqm": 2.5,
    "frequencyMultipliers": { "one_time": 1.0, "weekly": 1.0, "biweekly": 1.15, "monthly": 1.40 },
    "vatRate": 25, "rutEligible": true, "addons": [],
    "fees": [{ "key":"travel","name":"Travel fee","amount":50,"rutEligible":false }],
    "modifiers": [],
    "minimum": 0
  },
  "frequency": "monthly", "inputs": { "area": 50 }, "answers": {}, "applyRUT": true
}
'@
$resp = PostJson "/api/pricing/v2/quote" $uni
Show "Universal Multiplier invariant" (AssertInvariant $resp)

# D) Windows (per-type counts)
$windows = @'
{
  "tenant": { "currency": "SEK", "vat_rate": 25, "rut_enabled": true },
  "service": {
    "model": "windows",
    "name": "Windows",
    "windowTypes": [
      { "key": "4pane", "name": "4-sidor", "pricePerUnit": 77 },
      { "key": "6pane", "name": "6-sidor", "pricePerUnit": 99 }
    ],
    "frequencyMultipliers": { "one_time": 1.0, "weekly": 1.0, "biweekly": 1.15, "monthly": 1.40 },
    "vatRate": 25, "rutEligible": true, "addons": [], "fees": [], "modifiers": [], "minimum": 1200
  },
  "frequency": "one_time", "inputs": { "windows": { "4pane": 5, "6pane": 2 } }, "applyRUT": true
}
'@
$resp = PostJson "/api/pricing/v2/quote" $windows
Show "Windows invariant" (AssertInvariant $resp)

# E) Per-room (per-type counts)
$perRoom = @'
{
  "tenant": { "currency": "SEK", "vat_rate": 25, "rut_enabled": true },
  "service": {
    "model": "per_room",
    "name": "Per Room",
    "roomTypes": [
      { "key": "bed", "name": "Bedroom", "pricePerRoom": 150 },
      { "key": "bath", "name": "Bathroom", "pricePerRoom": 200 }
    ],
    "frequencyMultipliers": { "one_time": 1.0, "weekly": 1.0, "biweekly": 1.15, "monthly": 1.40 },
    "vatRate": 25, "rutEligible": true, "addons": [], "fees": [], "modifiers": [], "minimum": 0
  },
  "frequency": "one_time", "inputs": { "rooms": { "bed": 2, "bath": 1 } }, "applyRUT": true
}
'@
$resp = PostJson "/api/pricing/v2/quote" $perRoom
Show "Per-room invariant" (AssertInvariant $resp)

Write-Host "--- Done ---" -ForegroundColor Cyan
