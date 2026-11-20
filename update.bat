@echo off
setlocal

rem Update History - SK Aneke Hall of Fame from its configured GitHub branch.
cd /d "%~dp0"

where git >nul 2>&1
if errorlevel 1 (
  echo Git is not installed. Install it from https://git-scm.com and run this again.
  pause
  exit /b 1
)
if not exist ".git" (
  echo This folder is not a Git clone of the app, so it cannot be updated automatically.
  pause
  exit /b 1
)

echo Closing the kiosk if it is running...
taskkill /fi "WINDOWTITLE eq History - SK Aneke Hall of Fame*" /t /f >nul 2>&1
taskkill /fi "WINDOWTITLE eq Nigerian Air Force History*" /t /f >nul 2>&1
taskkill /fi "WINDOWTITLE eq SK Aneke Hall of Fame - Nigerian Air Force History*" /t /f >nul 2>&1
taskkill /fi "WINDOWTITLE eq Air Marshal S.K. Aneke Hall of Fame*" /t /f >nul 2>&1

for /f %%i in ('git rev-parse HEAD') do set "OLD=%%i"

echo Fetching the latest version...
git fetch --quiet origin
if errorlevel 1 (
  echo Could not reach GitHub. Check the internet connection and try again.
  pause
  exit /b 1
)

git pull --ff-only --quiet
if errorlevel 1 (
  echo.
  echo The update could not be applied automatically because this folder has
  echo local changes or its branch cannot be fast-forwarded. Nothing was overwritten.
  echo Ask the developer to look at it; the edits are:
  git status --short
  pause
  exit /b 1
)

for /f %%i in ('git rev-parse HEAD') do set "NEW=%%i"
if "%OLD%"=="%NEW%" (
  echo Already up to date.
) else (
  echo Updated to:
  git log -1 --format="  %%h  %%s  (%%cd)" --date=short
)

echo.
echo Starting the kiosk...
start "" "%COMSPEC%" /C "%~dp0run.bat"
endlocal
exit /b 0
