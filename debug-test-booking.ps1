# Create Test Booking A with better error handling
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
} | ConvertTo-Json -Depth 10

Write-Host "Request Body: $body_a"
Write-Host "Headers: $($headers_a | ConvertTo-Json)"

try {
    $response_a = Invoke-WebRequest -Uri "https://cle-azure.vercel.app/api/bookings" -Method POST -Headers $headers_a -Body $body_a
    $content_a = $response_a.Content | ConvertFrom-Json
    Write-Host "Booking A Created: $($content_a.booking.id)"
    Write-Host "Booking A Status: $($content_a.booking.status)"
} catch {
    Write-Host "Error creating Booking A: $($_.Exception.Message)"
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response Body: $responseBody"
    }
}
