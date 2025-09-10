$headers = @{
    "Content-Type" = "application/json"
    "Idempotency-Key" = "widget-test-$(Get-Random)"
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

Write-Host "Widget Flow Test with required idempotency"
try {
    $response = Invoke-RestMethod -Uri "https://cle-azure.vercel.app/api/bookings" -Method POST -Headers $headers -Body $body
    Write-Host "SUCCESS - Widget booking created:"
    $response | ConvertTo-Json -Depth 10
} catch {
    Write-Host "FAILED - Widget booking error:"
    Write-Host $_.Exception.Message
}
