$serviceRoleKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwcmtwbWpreHJ2dGtoaWhu cGZjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NzUwNTY4OCwiZXhwIjoyMDczMDgxNjg4fQ.E91K5lLprzPpxF2AjBtEnQYTdT17pZt8CbO_V3TqU6w"

$headers = @{
    "apikey" = $serviceRoleKey
    "Authorization" = "Bearer $serviceRoleKey"
    "Content-Profile" = "public"
}

$uri = "https://eprkpmjkxrvtkhihnpfc.supabase.co/rest/v1/bookings?tenant_id=eq.00000000-0000-0000-0000-000000000001&id=eq.735f0ead-cd48-4349-b7cb-4f1dd603043f&select=id,status,service_key,amount_due_minor,created_at"

try {
    $response = Invoke-RestMethod -Uri $uri -Method GET -Headers $headers
    Write-Host "SUCCESS - Found booking:"
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
