$headers = @{
    "Content-Type" = "application/json"
    "Idempotency-Key" = "quote-test"
}

$body = @{
    tenantId = "00000000-0000-0000-0000-000000000001"
    serviceKey = "basic_cleaning"
    locale = "sv-SE"
    frequency = "monthly"
    inputs = @{ sqm = 75 }
    addons = @( @{ key = "fridge_clean" } )
    applyRUT = $false
} | ConvertTo-Json -Depth 10

Write-Host "===== QUOTE CALCULATION (for amount verification) ====="
try {
    $quote = Invoke-RestMethod -Uri "https://cle-azure.vercel.app/api/pricing/quote" -Method POST -Headers $headers -Body $body
    Write-Host "Quote response:"
    $quote | ConvertTo-Json -Depth 10
    
    $expectedMinor = [math]::Round($quote.total * 100)
    Write-Host "`nExpected amount_due_minor: $expectedMinor"
    Write-Host "Actual from booking: 257813"
    Write-Host "Match? $($expectedMinor -eq 257813)"
} catch {
    Write-Host "Quote ERROR: $($_.Exception.Message)"
}
