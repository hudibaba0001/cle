$headers = @{
    "Content-Type" = "application/json"
    "Idempotency-Key" = "test-booking-$(Get-Random)"
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

Write-Host "Creating booking with body:"
Write-Host $body

try {
    $response = Invoke-RestMethod -Uri "https://cle-azure.vercel.app/api/bookings" -Method POST -Headers $headers -Body $body
    Write-Host "SUCCESS - Booking created:"
    $response | ConvertTo-Json -Depth 10
} catch {
    Write-Host "ERROR:"
    Write-Host $_.Exception.Message
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response body: $responseBody"
    }
}
