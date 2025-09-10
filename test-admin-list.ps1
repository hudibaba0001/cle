Write-Host "===== A) LIST VIEW TEST ====="
try {
    $response = Invoke-RestMethod -Uri "https://cle-azure.vercel.app/api/admin/bookings" -Method GET
    Write-Host "SUCCESS - Admin bookings list:"
    Write-Host "Total bookings: $($response.total)"
    Write-Host "Items returned: $($response.items.Count)"
    Write-Host ""
    Write-Host "Recent bookings:"
    $response.items | ForEach-Object {
        Write-Host "- $($_.id) | $($_.status) | $($_.service_key) | $($_.email) | $(($_.amount_due_minor/100).ToString('F2')) SEK"
    }
} catch {
    Write-Host "ERROR: $($_.Exception.Message)"
}
