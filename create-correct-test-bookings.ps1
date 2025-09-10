# Create Test Bookings A and B with correct structure
$timestamp_a = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$headers_a = @{
    "Content-Type" = "application/json"
    "Idempotency-Key" = "test-booking-a-$timestamp_a"
}

# Get demo-cleaning tenant ID first
$tenant_response = Invoke-RestMethod -Uri "https://cle-azure.vercel.app/api/public/services?tenantSlug=demo-cleaning"
$tenant_id = $tenant_response.tenant.id

$body_a = @{
    quote = @{
        tenantId = $tenant_id
        serviceKey = "basic-cleaning"  
        locale = "sv-SE"
        frequency = "monthly"
        inputs = @{
            area = 75
        }
        addons = @(
            @{
                key = "fridge"
                quantity = 1
            }
        )
        applyRUT = $false
    }
    customer = @{
        email = "test-a@example.com"
        phone = "+1234567890"
    }
    address = @{
        zip = "12345"
        street = "123 Test Street A"
        city = "Stockholm"
    }
} | ConvertTo-Json -Depth 10

Write-Host "Creating Booking A..."
Write-Host "Tenant ID: $tenant_id"

try {
    $response_a = Invoke-RestMethod -Uri "https://cle-azure.vercel.app/api/bookings" -Method POST -Headers $headers_a -Body $body_a
    Write-Host "✅ Booking A Created: $($response_a.booking.id)"
    Write-Host "   Status: $($response_a.booking.status)"
    Write-Host "   Amount: $($response_a.booking.total_amount)"
    $booking_a_id = $response_a.booking.id
} catch {
    Write-Host "❌ Error creating Booking A: $($_.Exception.Message)"
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response Body: $responseBody"
    }
    exit 1
}

Start-Sleep -Seconds 2

# Create Test Booking B  
$timestamp_b = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$headers_b = @{
    "Content-Type" = "application/json"
    "Idempotency-Key" = "test-booking-b-$timestamp_b"
}

$body_b = @{
    quote = @{
        tenantId = $tenant_id
        serviceKey = "basic-cleaning"  
        locale = "sv-SE"
        frequency = "monthly"
        inputs = @{
            area = 75
        }
        addons = @(
            @{
                key = "fridge"
                quantity = 1
            }
        )
        applyRUT = $false
    }
    customer = @{
        email = "test-b@example.com"
        phone = "+1234567891"
    }
    address = @{
        zip = "12346"
        street = "123 Test Street B"
        city = "Stockholm"
    }
} | ConvertTo-Json -Depth 10

Write-Host "Creating Booking B..."

try {
    $response_b = Invoke-RestMethod -Uri "https://cle-azure.vercel.app/api/bookings" -Method POST -Headers $headers_b -Body $body_b
    Write-Host "✅ Booking B Created: $($response_b.booking.id)"
    Write-Host "   Status: $($response_b.booking.status)"
    Write-Host "   Amount: $($response_b.booking.total_amount)"
    $booking_b_id = $response_b.booking.id
} catch {
    Write-Host "❌ Error creating Booking B: $($_.Exception.Message)"
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response Body: $responseBody"
    }
    exit 1
}

Write-Host ""
Write-Host "========================================"
Write-Host "📝 TEST BOOKING IDS FOR VERIFICATION:"
Write-Host "Booking A ID: $booking_a_id (for ACCEPT test)"
Write-Host "Booking B ID: $booking_b_id (for REJECT test)"
Write-Host "========================================"
