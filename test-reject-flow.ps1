# Create Booking B for Reject Test and Test Reject Flow
$timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()

Write-Host "=========================================="
Write-Host "CREATING BOOKING B FOR REJECT TEST"
Write-Host "=========================================="

# Create Booking B
$create_headers = @{
    "Content-Type" = "application/json"
    "Idempotency-Key" = "reject-test-booking-$timestamp"
}
$create_body = '{"quote":{"tenantId":"8f98ad87-3f30-432d-9b00-f2a7c1c76c63","serviceKey":"basic_cleaning","locale":"sv-SE","frequency":"monthly","inputs":{"area":75},"addons":[],"applyRUT":false},"customer":{"email":"test-reject@example.com","phone":"+1234567899"},"address":{"zip":"54321","street":"Reject Test St","city":"Stockholm"}}'

try {
    $create_response = Invoke-WebRequest -Uri "https://cle-azure.vercel.app/api/bookings" -Method POST -Headers $create_headers -Body $create_body -UseBasicParsing
    $create_data = $create_response.Content | ConvertFrom-Json
    $booking_b_id = $create_data.booking.id
    
    Write-Host "✅ SUCCESS: Booking B created: $booking_b_id"
    Write-Host "   Status: $($create_data.booking.status)"
    Write-Host "   Amount: $($create_data.booking.total_amount)"
} catch {
    Write-Host "❌ FAILED: Booking B creation"
    Write-Host "   HTTP Status: $($_.Exception.Response.StatusCode.value__)"
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "   Response: $responseBody"
    }
    exit 1
}

Write-Host ""
Write-Host "=========================================="
Write-Host "TESTING REJECT FLOW"  
Write-Host "Booking B ID: $booking_b_id"
Write-Host "=========================================="

# Test REJECT - First Call
Write-Host ""
Write-Host "1) Testing REJECT (first call)..."
$reject_headers = @{
    "Content-Type" = "application/json"
    "Idempotency-Key" = "reject-test-1-$timestamp"
}
$reject_body = '{"reason":"Out of coverage area - automated test"}'

try {
    $reject_response = Invoke-WebRequest -Uri "https://cle-azure.vercel.app/api/bookings/$booking_b_id/reject" -Method POST -Headers $reject_headers -Body $reject_body -UseBasicParsing
    $reject_data = $reject_response.Content | ConvertFrom-Json
    
    Write-Host "✅ SUCCESS: First reject call"
    Write-Host "   HTTP Status: $($reject_response.StatusCode)"
    Write-Host "   New Status: $($reject_data.booking.status)"
    Write-Host "   Reject Reason: $($reject_data.booking.reject_reason)"
} catch {
    Write-Host "❌ FAILED: First reject call"
    Write-Host "   HTTP Status: $($_.Exception.Response.StatusCode.value__)"
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "   Response: $responseBody"
    }
}

# Test REJECT - Second Call (Idempotency)
Write-Host ""
Write-Host "2) Testing REJECT IDEMPOTENCY (second call with different key)..."
$reject_headers_2 = @{
    "Content-Type" = "application/json"
    "Idempotency-Key" = "reject-test-2-$timestamp"
}

try {
    $reject_response_2 = Invoke-WebRequest -Uri "https://cle-azure.vercel.app/api/bookings/$booking_b_id/reject" -Method POST -Headers $reject_headers_2 -Body $reject_body -UseBasicParsing
    $reject_data_2 = $reject_response_2.Content | ConvertFrom-Json
    
    Write-Host "✅ SUCCESS: Second reject call (idempotent)"
    Write-Host "   HTTP Status: $($reject_response_2.StatusCode)"
    Write-Host "   Status Still: $($reject_data_2.booking.status)"
    Write-Host "   Reject Reason Still: $($reject_data_2.booking.reject_reason)"
} catch {
    Write-Host "❌ FAILED: Second reject call"
    Write-Host "   HTTP Status: $($_.Exception.Response.StatusCode.value__)"
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "   Response: $responseBody"
    }
}

Write-Host ""
Write-Host "=========================================="
Write-Host "REJECT FLOW TEST COMPLETED"
Write-Host "=========================================="
Write-Host ""
Write-Host "SUMMARY:"
Write-Host "Booking A (Accept): dca486f8-df49-4ac5-ad5e-c17b7938fc3e"
Write-Host "Booking B (Reject): $booking_b_id"
Write-Host ""
Write-Host "Verify in UI:"
Write-Host "https://cle-azure.vercel.app/admin/bookings/dca486f8-df49-4ac5-ad5e-c17b7938fc3e"
Write-Host "https://cle-azure.vercel.app/admin/bookings/$booking_b_id"
