Write-Host "===== DB VERIFICATION for idempotency_key: debug-123 ====="
try {
    $response = Invoke-RestMethod -Uri "https://cle-azure.vercel.app/api/debug/bookings?idempotencyKey=debug-123" -Method GET
    Write-Host "Database records for debug-123:"
    $response.bookings | ConvertTo-Json -Depth 10
    
    $bookings = $response.bookings
    if ($bookings.Count -eq 1) {
        Write-Host "`n✅ SUCCESS: Exactly 1 booking found for idempotency key 'debug-123'"
        Write-Host "   Booking ID: $($bookings[0].id)"
        Write-Host "   Status: $($bookings[0].status)"
        Write-Host "   Amount: $($bookings[0].amount_due_minor)"
        Write-Host "   Created: $($bookings[0].created_at)"
    } else {
        Write-Host "`n❌ FAILURE: Expected 1 booking, found $($bookings.Count)"
    }
} catch {
    Write-Host "ERROR: $($_.Exception.Message)"
}
