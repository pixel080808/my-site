@echo off
chcp 65001
echo Starting deployment process...

echo Checking git status...
git status

echo.
echo Pulling latest changes from remote...
git pull origin main --rebase

echo.
echo Pushing changes to remote...
git push origin main

echo.
echo Deployment completed!
pause
