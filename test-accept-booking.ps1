# Test Accept Flow with Booking ID: dca486f8-df49-4ac5-ad5e-c17b7938fc3e
$booking_id = "dca486f8-df49-4ac5-ad5e-c17b7938fc3e"
$timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()

Write-Host "=========================================="
Write-Host "TESTING ACCEPT FLOW"
Write-Host "Booking ID: $booking_id"
Write-Host "=========================================="

# Test ACCEPT - First Call
Write-Host ""
Write-Host "1) Testing ACCEPT (first call)..."
$accept_headers = @{
    "Content-Type" = "application/json"
    "Idempotency-Key" = "accept-test-1-$timestamp"
}
$accept_body = '{"scheduledStart":"2025-09-15T10:00:00Z","scheduledEnd":"2025-09-15T13:00:00Z","estimatedHours":3}'

try {
    $accept_response = Invoke-WebRequest -Uri "https://cle-azure.vercel.app/api/bookings/$booking_id/accept" -Method POST -Headers $accept_headers -Body $accept_body -UseBasicParsing
    $accept_data = $accept_response.Content | ConvertFrom-Json
    
    Write-Host "✅ SUCCESS: First accept call"
    Write-Host "   HTTP Status: $($accept_response.StatusCode)"
    Write-Host "   New Status: $($accept_data.booking.status)"
    Write-Host "   Scheduled Start: $($accept_data.booking.scheduled_start)"
    Write-Host "   Scheduled End: $($accept_data.booking.scheduled_end)"
    Write-Host "   Estimated Hours: $($accept_data.booking.estimated_hours)"
} catch {
    Write-Host "❌ FAILED: First accept call"
    Write-Host "   HTTP Status: $($_.Exception.Response.StatusCode.value__)"
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "   Response: $responseBody"
    }
}

# Test ACCEPT - Second Call (Idempotency)
Write-Host ""
Write-Host "2) Testing ACCEPT IDEMPOTENCY (second call with different key)..."
$accept_headers_2 = @{
    "Content-Type" = "application/json"
    "Idempotency-Key" = "accept-test-2-$timestamp"
}

try {
    $accept_response_2 = Invoke-WebRequest -Uri "https://cle-azure.vercel.app/api/bookings/$booking_id/accept" -Method POST -Headers $accept_headers_2 -Body $accept_body -UseBasicParsing
    $accept_data_2 = $accept_response_2.Content | ConvertFrom-Json
    
    Write-Host "✅ SUCCESS: Second accept call (idempotent)"
    Write-Host "   HTTP Status: $($accept_response_2.StatusCode)"
    Write-Host "   Status Still: $($accept_data_2.booking.status)"
    Write-Host "   Scheduled Start Still: $($accept_data_2.booking.scheduled_start)"
} catch {
    Write-Host "❌ FAILED: Second accept call"
    Write-Host "   HTTP Status: $($_.Exception.Response.StatusCode.value__)"
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "   Response: $responseBody"
    }
}

Write-Host ""
Write-Host "=========================================="
Write-Host "ACCEPT FLOW TEST COMPLETED"
Write-Host "=========================================="
Write-Host ""
Write-Host "Next: Open https://cle-azure.vercel.app/admin/bookings/$booking_id to verify in UI"
