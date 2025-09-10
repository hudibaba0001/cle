# Test Accept/Reject API endpoints directly

# First, let's create a minimal booking to test with
$timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$create_headers = @{
    "Content-Type" = "application/json"
    "Idempotency-Key" = "manual-test-$timestamp"
}

# Use correct tenant ID from database seed
$tenant_id = "8f98ad87-3f30-432d-9b00-f2a7c1c76c63"

$create_body = @{
    quote = @{
        tenantId = $tenant_id
        serviceKey = "basic_cleaning"  
        locale = "sv-SE"
        frequency = "monthly"
        inputs = @{
            area = 75
        }
        addons = @()
        applyRUT = $false
    }
    customer = @{
        email = "manual-test@example.com"
        phone = "+1234567890"
    }
    address = @{
        zip = "12345"
        street = "Test Street"
        city = "Stockholm"
    }
} | ConvertTo-Json -Depth 10

Write-Host "Creating test booking..."
Write-Host "Using tenant ID: $tenant_id"

try {
    $response = Invoke-RestMethod -Uri "https://cle-azure.vercel.app/api/bookings" -Method POST -Headers $create_headers -Body $create_body
    Write-Host "SUCCESS: Booking created: $($response.booking.id)"
    Write-Host "   Status: $($response.booking.status)"
    Write-Host "   Amount: $($response.booking.total_amount)"
    $booking_id = $response.booking.id
    
    # Test ACCEPT flow
    Write-Host ""
    Write-Host "Testing ACCEPT flow..."
    
    $accept_timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    $accept_headers = @{
        "Content-Type" = "application/json"
        "Idempotency-Key" = "accept-test-$accept_timestamp"
    }
    
    $accept_body = @{
        scheduledStart = "2025-09-15T10:00:00Z"
        scheduledEnd = "2025-09-15T13:00:00Z"
        estimatedHours = 3
    } | ConvertTo-Json
    
    try {
        $accept_response = Invoke-RestMethod -Uri "https://cle-azure.vercel.app/api/bookings/$booking_id/accept" -Method POST -Headers $accept_headers -Body $accept_body
        Write-Host "SUCCESS: Booking accepted"
        Write-Host "   New status: $($accept_response.booking.status)"
        Write-Host "   Scheduled: $($accept_response.booking.scheduled_start) to $($accept_response.booking.scheduled_end)"
        
        # Test idempotency by calling accept again
        Write-Host ""
        Write-Host "Testing ACCEPT idempotency (second call)..."
        $accept_headers2 = @{
            "Content-Type" = "application/json"
            "Idempotency-Key" = "accept-test-2-$accept_timestamp"
        }
        
        try {
            $accept_response2 = Invoke-RestMethod -Uri "https://cle-azure.vercel.app/api/bookings/$booking_id/accept" -Method POST -Headers $accept_headers2 -Body $accept_body
            Write-Host "SUCCESS: Second accept call (idempotent)"
            Write-Host "   Status still: $($accept_response2.booking.status)"
        } catch {
            Write-Host "Second accept call result: $($_.Exception.Message)"
        }
        
    } catch {
        Write-Host "Accept failed: $($_.Exception.Message)"
        if ($_.Exception.Response) {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $responseBody = $reader.ReadToEnd()
            Write-Host "Accept Response: $responseBody"
        }
    }
    
} catch {
    Write-Host "Booking creation failed: $($_.Exception.Message)"
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Create Response: $responseBody"
    }
}
