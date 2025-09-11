param(
  [switch]$DryRun
)
$ErrorActionPreference = 'Stop'
$cmd = 'supabase db push'
if ($DryRun) { $cmd = 'supabase db lint' }
Write-Host ("> " + $cmd) -ForegroundColor Cyan
& powershell -NoProfile -ExecutionPolicy Bypass -Command $cmd
if ($LASTEXITCODE -ne 0) { throw "Command failed with exit code $LASTEXITCODE" }
