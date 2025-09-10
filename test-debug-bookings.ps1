Write-Host "===== DEBUG - Check if bookings exist ====="
try {
    $response = Invoke-RestMethod -Uri "https://cle-azure.vercel.app/api/debug/bookings" -Method GET
    Write-Host "Debug bookings response:"
    $response | ConvertTo-Json -Depth 10
} catch {
    Write-Host "DEBUG ERROR: $($_.Exception.Message)"
}
