@echo off
setlocal

rem ============================================================
rem  Run this ONCE after copying the app folder onto the kiosk PC.
rem  It creates a Desktop shortcut that launches run.bat through
rem  cmd.exe, which is what lets Windows allow the shortcut to be
rem  pinned to the taskbar afterwards (Windows blocks pinning .bat
rem  files directly, but allows pinning a shortcut whose target is
rem  an .exe such as cmd.exe).
rem ============================================================

set "SCRIPT_DIR=%~dp0"
set "TARGET_BAT=%SCRIPT_DIR%run.bat"
set "SHORTCUT_NAME=NAF Hall of Fame.lnk"
set "SHORTCUT_PATH=%USERPROFILE%\Desktop\%SHORTCUT_NAME%"
set "VBS_PATH=%TEMP%\daw_make_shortcut.vbs"

set "APP_ICON=%SCRIPT_DIR%assets\icons\app.ico"

if not exist "%TARGET_BAT%" (
  echo.
  echo Could not find run.bat next to this script.
  echo Keep prepare.bat in the same folder as run.bat and try again.
  echo.
  pause
  exit /b 1
)

echo Creating a Desktop shortcut for the Air Marshal S.K. Aneke Hall of Fame...

> "%VBS_PATH%" echo Set oWS = WScript.CreateObject("WScript.Shell")
>> "%VBS_PATH%" echo Set oLink = oWS.CreateShortcut("%SHORTCUT_PATH%")
>> "%VBS_PATH%" echo oLink.TargetPath = "%COMSPEC%"
>> "%VBS_PATH%" echo oLink.Arguments = "/C ""%TARGET_BAT%"""
>> "%VBS_PATH%" echo oLink.WorkingDirectory = "%SCRIPT_DIR%"
>> "%VBS_PATH%" echo oLink.WindowStyle = 7
>> "%VBS_PATH%" echo oLink.IconLocation = "%APP_ICON%"
>> "%VBS_PATH%" echo oLink.Description = "Launch the Air Marshal S.K. Aneke Hall of Fame kiosk"
>> "%VBS_PATH%" echo oLink.Save

cscript //nologo "%VBS_PATH%"
del "%VBS_PATH%" >nul 2>&1

if exist "%SHORTCUT_PATH%" (
  echo.
  echo Done. A shortcut called "%SHORTCUT_NAME%" is now on the Desktop.
  echo.
  echo To keep it on the taskbar too, right-click that shortcut and choose
  echo "Pin to taskbar", or drag it onto the taskbar. Windows does not allow
  echo that last step to be done by a script, so it has to be one manual click.
) else (
  echo.
  echo Something went wrong and the shortcut was not created.
  echo You can still run the app directly by double-clicking run.bat.
)

echo.
pause
endlocal
