# PowerShell script to fix Git conflicts
Write-Host "Fixing Git conflicts..." -ForegroundColor Green

# Abort current rebase
Write-Host "Aborting current rebase..." -ForegroundColor Yellow
git rebase --abort

# Check status
Write-Host "`nChecking git status..." -ForegroundColor Yellow
git status

# Reset to clean state
Write-Host "`nResetting to clean state..." -ForegroundColor Yellow
git reset --hard HEAD

# Pull latest changes
Write-Host "`nPulling latest changes..." -ForegroundColor Yellow
git pull origin main

# Check status again
Write-Host "`nFinal status:" -ForegroundColor Yellow
git status

Write-Host "`nDone! Now you can make your changes and commit them." -ForegroundColor Green
Read-Host "Press Enter to continue"
