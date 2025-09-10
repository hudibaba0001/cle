$headers = @{
    "Content-Type" = "application/json"
    "Idempotency-Key" = "debug-123"  # Fixed key for idempotency test
}

$body = @{
    quote = @{
        tenantId = "00000000-0000-0000-0000-000000000001"
        serviceKey = "basic_cleaning"
        locale = "sv-SE"
        frequency = "monthly"
        inputs = @{ sqm = 75 }
        addons = @( @{ key = "fridge_clean" } )
        applyRUT = $false
    }
    customer = @{ email = "test@example.com" }
    address = @{ zip = "11122" }
} | ConvertTo-Json -Depth 10

Write-Host "===== FIRST REQUEST with Idempotency-Key: debug-123 ====="
try {
    $response1 = Invoke-RestMethod -Uri "https://cle-azure.vercel.app/api/bookings" -Method POST -Headers $headers -Body $body
    Write-Host "First response:"
    $response1 | ConvertTo-Json -Depth 10
} catch {
    Write-Host "First request ERROR: $($_.Exception.Message)"
}

Write-Host "`n===== SECOND REQUEST with same Idempotency-Key: debug-123 ====="
try {
    $response2 = Invoke-RestMethod -Uri "https://cle-azure.vercel.app/api/bookings" -Method POST -Headers $headers -Body $body
    Write-Host "Second response:"
    $response2 | ConvertTo-Json -Depth 10
} catch {
    Write-Host "Second request ERROR: $($_.Exception.Message)"
}

Write-Host "`n===== COMPARISON ====="
if ($response1 -and $response2) {
    Write-Host "First ID:  $($response1.id)"
    Write-Host "Second ID: $($response2.id)"
    Write-Host "Same ID? $($response1.id -eq $response2.id)"
} else {
    Write-Host "One or both requests failed - cannot compare"
}
