#!/usr/bin/env bash
set -euo pipefail
HOST="${1:-http://localhost:3000}"; TENANT="${2:-demo-tenant}"
ok(){ printf "[OK] %s\n" "$*"; } ; fail(){ printf "[FAIL] %s\n" "$*" >&2; exit 1; }
command -v jq >/dev/null || fail "Install jq"
code=$(curl -s -o /dev/null -w "%{http_code}" "$HOST/api/health") || true
[ "$code" = "200" ] && ok "health 200" || fail "health $code"
code=$(curl -s -o bad.json -w "%{http_code}" -X POST "$HOST/api/pricing/v2/quote" -H "Content-Type: application/json" -d '{}') || true
case "$code" in 400|401|422) ok "bad payload rejected ($code)";; *) cat bad.json; fail "bad=$code";; esac
cat > payload.json <<'JSON'
{ "tenant":{"currency":"SEK","vat_rate":25,"rut_enabled":true},
  "service":{"model":"universal_multiplier","name":"Per sqm","universal_multiplier":{"ratePerSqm":2.5},
  "frequencyMultipliers":{"one_time":1.0,"weekly":1.0,"biweekly":1.15,"monthly":1.4},
  "vatRate":25,"rutEligible":true,"addons":[],"fees":[{"key":"travel","name":"Travel fee","amount":50,"rutEligible":false}],
  "modifiers":[{"key":"pet","label":"Pets present","condition":{"type":"boolean","when":true,"answerKey":"has_pets"},
  "effect":{"target":"subtotal_before_modifiers","mode":"percent","value":10,"direction":"increase","rutEligible":true,"label":"+10% pets"}}],
  "minimum":0},
  "frequency":"monthly","inputs":{"area":50},"addons":[],"applyRUT":true,
  "coupon":{"code":"SAVE10","type":"percent","value":10},"answers":{"has_pets":true} }
JSON
code=$(curl -s -o good.json -w "%{http_code}" -X POST "$HOST/api/pricing/v2/quote" \
  -H "Content-Type: application/json" -H "x-tenant-id: $TENANT" --data-binary @payload.json) || true
[ "$code" = "200" ] || { cat good.json; fail "valid=$code"; }
SUBTOTAL=$(jq -r '.subtotal_ex_vat_minor // .subtotal_minor' good.json)
VAT=$(jq -r '.vat_minor' good.json); RUT=$(jq -r '.rut_minor' good.json); DISC=$(jq -r '.discount_minor' good.json); TOTAL=$(jq -r '.total_minor' good.json)
SUM=$((SUBTOTAL + VAT + RUT + DISC)); [ "$TOTAL" -eq "$SUM" ] && ok "invariant OK" || fail "invariant mismatch"
ok "SMOKE COMPLETE"
