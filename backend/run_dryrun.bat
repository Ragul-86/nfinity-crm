@echo off
cd /d D:\DMAX\crm-dashboard\backend
echo Running pipeline migration DRY RUN...
echo Output will be saved to: dryrun_output.txt
echo.
set DRY_RUN=true
node scripts/migratePipelines.js 2>&1 | tee dryrun_output.txt
echo.
echo === Done. Output saved to backend\dryrun_output.txt ===
pause
