@echo off
echo Fixing Git conflicts...

echo Aborting current rebase...
git rebase --abort

echo.
echo Checking git status...
git status

echo.
echo Resetting to clean state...
git reset --hard HEAD

echo.
echo Pulling latest changes...
git pull origin main

echo.
echo Final status:
git status

echo.
echo Done! Now you can make your changes and commit them.
pause
