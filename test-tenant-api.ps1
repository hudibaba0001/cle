# Test against local dev server
$headers = @{
    "Content-Type" = "application/json"  
}

# Test public services API locally first
Write-Host "Testing local public services API..."
try {
    $local_tenant_response = Invoke-RestMethod -Uri "http://localhost:3001/api/public/services?tenantSlug=demo-cleaning" -Headers $headers
    Write-Host "Local tenant response: $($local_tenant_response | ConvertTo-Json -Depth 3)"
} catch {
    Write-Host "Local API error: $($_.Exception.Message)"
}

Write-Host ""
Write-Host "Testing production public services API..."
try {
    $prod_tenant_response = Invoke-RestMethod -Uri "https://cle-azure.vercel.app/api/public/services?tenantSlug=demo-cleaning" -Headers $headers
    Write-Host "Production tenant response: $($prod_tenant_response | ConvertTo-Json -Depth 3)"
} catch {
    Write-Host "Production API error: $($_.Exception.Message)"
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response Body: $responseBody"
    }
}
