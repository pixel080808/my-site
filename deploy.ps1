# PowerShell script for deployment
Write-Host "Starting deployment process..." -ForegroundColor Green

Write-Host "Checking git status..." -ForegroundColor Yellow
git status

Write-Host "`nPulling latest changes from remote..." -ForegroundColor Yellow
git pull origin main --rebase

Write-Host "`nPushing changes to remote..." -ForegroundColor Yellow
git push origin main

Write-Host "`nDeployment completed!" -ForegroundColor Green
Read-Host "Press Enter to continue"
