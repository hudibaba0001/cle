$headers = @{
    "apikey" = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwcmtwbWpreHJ2dGtoaWhu cGZjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NzUwNTY4OCwiZXhwIjoyMDczMDgxNjg4fQ.E91K5lLprzPpxF2AjBtEnQYTdT17pZt8CbO_V3TqU6w"
    "Authorization" = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwcmtwbWpreHJ2dGtoaWhu cGZjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NzUwNTY4OCwiZXhwIjoyMDczMDgxNjg4fQ.E91K5lLprzPpxF2AjBtEnQYTdT17pZt8CbO_V3TqU6w"
    "Content-Type" = "application/json"
}

try {
    $response = Invoke-RestMethod -Uri "https://eprkpmjkxrvtkhihnpfc.supabase.co/rest/v1/bookings?tenant_id=eq.00000000-0000-0000-0000-000000000001&order=created_at.desc&limit=3&select=id,status,service_key,subtotal_ex_vat_minor,vat_minor,rut_minor,amount_due_minor,created_at" -Method GET -Headers $headers
    Write-Host "Database verification - Recent bookings:"
    $response | ConvertTo-Json -Depth 10
} catch {
    Write-Host "ERROR:"
    Write-Host $_.Exception.Message
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response body: $responseBody"
    }
}
