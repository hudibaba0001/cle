# Simple Accept/Reject Test
$timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()

# Create booking with raw JSON
$createHeaders = @{"Content-Type" = "application/json"; "Idempotency-Key" = "test-$timestamp"}
$createBody = '{"quote":{"tenantId":"8f98ad87-3f30-432d-9b00-f2a7c1c76c63","serviceKey":"basic_cleaning","locale":"sv-SE","frequency":"monthly","inputs":{"area":75},"addons":[],"applyRUT":false},"customer":{"email":"test@example.com","phone":"+1234567890"},"address":{"zip":"12345","street":"Test St","city":"Stockholm"}}'

Write-Host "Creating test booking..."

try {
    $createResponse = Invoke-WebRequest -Uri "https://cle-azure.vercel.app/api/bookings" -Method POST -Headers $createHeaders -Body $createBody -UseBasicParsing
    $createData = $createResponse.Content | ConvertFrom-Json
    $bookingId = $createData.booking.id
    
    Write-Host "SUCCESS: Booking created: $bookingId"
    Write-Host "Status: $($createData.booking.status)"
    Write-Host "Amount: $($createData.booking.total_amount)"
    
    # Test Accept
    Write-Host ""
    Write-Host "Testing ACCEPT..."
    $acceptHeaders = @{"Content-Type" = "application/json"; "Idempotency-Key" = "accept-$timestamp"}
    $acceptBody = '{"scheduledStart":"2025-09-15T10:00:00Z","scheduledEnd":"2025-09-15T13:00:00Z","estimatedHours":3}'
    
    try {
        $acceptResponse = Invoke-WebRequest -Uri "https://cle-azure.vercel.app/api/bookings/$bookingId/accept" -Method POST -Headers $acceptHeaders -Body $acceptBody -UseBasicParsing
        $acceptData = $acceptResponse.Content | ConvertFrom-Json
        Write-Host "SUCCESS: Booking accepted"
        Write-Host "New status: $($acceptData.booking.status)"
        
        # Test idempotency
        Write-Host "Testing ACCEPT idempotency..."
        $acceptHeaders2 = @{"Content-Type" = "application/json"; "Idempotency-Key" = "accept-2-$timestamp"}
        
        try {
            $acceptResponse2 = Invoke-WebRequest -Uri "https://cle-azure.vercel.app/api/bookings/$bookingId/accept" -Method POST -Headers $acceptHeaders2 -Body $acceptBody -UseBasicParsing
            $acceptData2 = $acceptResponse2.Content | ConvertFrom-Json
            Write-Host "SUCCESS: Idempotent accept"
            Write-Host "Status unchanged: $($acceptData2.booking.status)"
        } catch {
            Write-Host "Idempotent accept result: HTTP $($_.Exception.Response.StatusCode)"
        }
        
    } catch {
        Write-Host "Accept failed: HTTP $($_.Exception.Response.StatusCode)"
        if ($_.Exception.Response) {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            Write-Host "Response: $($reader.ReadToEnd())"
        }
    }
    
} catch {
    Write-Host "Create failed: HTTP $($_.Exception.Response.StatusCode)"
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        Write-Host "Response: $($reader.ReadToEnd())"
    }
}

Write-Host "Test completed."
