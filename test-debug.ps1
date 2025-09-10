try {
    $response = Invoke-RestMethod -Uri "https://cle-azure.vercel.app/api/debug/bookings" -Method GET
    Write-Host "Database verification - Recent bookings:"
    $response | ConvertTo-Json -Depth 10
} catch {
    Write-Host "ERROR: $($_.Exception.Message)"
    if ($_.Exception.Response) {
        $stream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response: $responseBody"
    }
}
