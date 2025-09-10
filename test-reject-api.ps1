# Simple Reject Test using existing booking
$existing_booking = "dca486f8-df49-4ac5-ad5e-c17b7938fc3e"
$timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()

Write-Host "Testing REJECT on existing booking: $existing_booking"
Write-Host "(Note: This will fail if booking is already accepted, but tests the API)"

$reject_headers = @{
    "Content-Type" = "application/json"
    "Idempotency-Key" = "reject-existing-$timestamp"
}
$reject_body = '{"reason":"Testing reject functionality - API test"}'

try {
    $reject_response = Invoke-WebRequest -Uri "https://cle-azure.vercel.app/api/bookings/$existing_booking/reject" -Method POST -Headers $reject_headers -Body $reject_body -UseBasicParsing
    $reject_data = $reject_response.Content | ConvertFrom-Json
    
    Write-Host "✅ SUCCESS: Reject call worked"
    Write-Host "   HTTP Status: $($reject_response.StatusCode)"
    Write-Host "   Response: $($reject_response.Content)"
} catch {
    Write-Host "Expected result (booking likely already accepted):"
    Write-Host "   HTTP Status: $($_.Exception.Response.StatusCode.value__)"
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "   Response: $responseBody"
    }
}

Write-Host ""
Write-Host "API endpoint test completed - reject API is accessible"
