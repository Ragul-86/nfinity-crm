# Pipeline Migration - DRY RUN (no DB writes)
# Double-click this file or run: powershell -ExecutionPolicy Bypass -File run_dryrun.ps1

$backendPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $backendPath

$env:DRY_RUN = "true"
$outputFile = "$backendPath\dryrun_output.txt"

Write-Host "`nRunning DRY RUN - zero writes to database..." -ForegroundColor Cyan
Write-Host "Output → $outputFile`n" -ForegroundColor Gray

$output = node scripts/migratePipelines.js 2>&1
$output | Tee-Object -FilePath $outputFile

Write-Host "`n--- Saved to: $outputFile ---" -ForegroundColor Green
Write-Host "Press any key to close..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
