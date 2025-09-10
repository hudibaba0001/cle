# Create Test Booking A
$timestamp_a = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$headers_a = @{
    "Content-Type" = "application/json"
    "Idempotency-Key" = "test-booking-a-$timestamp_a"
}
$body_a = @{
    tenantSlug = "demo-cleaning"
    serviceKey = "basic-cleaning"  
    area = 75
    addons = @("fridge")
    frequency = "monthly"
    rutEnabled = $false
    email = "test-a@example.com"
    phone = "+1234567890"
    address = "123 Test Street A"
    preferredDate = "2025-09-15"
    notes = "Test booking A for accept flow"
} | ConvertTo-Json

try {
    $response_a = Invoke-RestMethod -Uri "https://cle-azure.vercel.app/api/bookings" -Method POST -Headers $headers_a -Body $body_a
    Write-Host "Booking A Created: $($response_a.booking.id)"
    Write-Host "Booking A Status: $($response_a.booking.status)"
    Write-Host "Booking A Amount: $($response_a.booking.total_amount)"
} catch {
    Write-Host "Error creating Booking A: $($_.Exception.Message)"
    Write-Host "Response: $($_.Exception.Response)"
}

Start-Sleep -Seconds 2

# Create Test Booking B  
$timestamp_b = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$headers_b = @{
    "Content-Type" = "application/json"
    "Idempotency-Key" = "test-booking-b-$timestamp_b"
}
$body_b = @{
    tenantSlug = "demo-cleaning"
    serviceKey = "basic-cleaning"
    area = 75
    addons = @("fridge")
    frequency = "monthly" 
    rutEnabled = $false
    email = "test-b@example.com"
    phone = "+1234567891"
    address = "123 Test Street B"
    preferredDate = "2025-09-16"
    notes = "Test booking B for reject flow"
} | ConvertTo-Json

try {
    $response_b = Invoke-RestMethod -Uri "https://cle-azure.vercel.app/api/bookings" -Method POST -Headers $headers_b -Body $body_b
    Write-Host "Booking B Created: $($response_b.booking.id)"
    Write-Host "Booking B Status: $($response_b.booking.status)"
    Write-Host "Booking B Amount: $($response_b.booking.total_amount)"
} catch {
    Write-Host "Error creating Booking B: $($_.Exception.Message)"
}
