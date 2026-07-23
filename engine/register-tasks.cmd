@echo off
rem Mirhan autostart registration (WO-011). ASCII only - cmd.exe reads batch in cp949.
rem Usage: register-tasks.cmd [--with-viewer]
rem Tries Task Scheduler (needs admin); falls back to the Startup folder (no admin).
setlocal
set "REPO=%~dp0.."
for %%I in ("%REPO%") do set "REPO=%%~fI"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"

echo [1/2] runner...
schtasks /Create /F /TN "Mirhan Runner" /SC ONLOGON /RL LIMITED /TR "\"%REPO%\engine\start-runner-logged.cmd\"" >nul 2>&1
if %errorlevel%==0 (
  echo   Task Scheduler: "Mirhan Runner" registered
) else (
  echo   No admin rights - falling back to Startup folder
  > "%STARTUP%\mirhan-runner.cmd" (
    echo @echo off
    echo start "" /min "%REPO%\engine\start-runner-logged.cmd"
  )
  echo   Startup folder: mirhan-runner.cmd created
)

if /I not "%~1"=="--with-viewer" goto :done
echo [2/2] viewer...
schtasks /Create /F /TN "Mirhan Viewer" /SC ONLOGON /RL LIMITED /TR "\"%REPO%\engine\start-viewer.cmd\"" >nul 2>&1
if %errorlevel%==0 (
  echo   Task Scheduler: "Mirhan Viewer" registered
) else (
  echo   No admin rights - falling back to Startup folder
  > "%STARTUP%\mirhan-viewer.cmd" (
    echo @echo off
    echo start "" /min "%REPO%\engine\start-viewer.cmd"
  )
  echo   Startup folder: mirhan-viewer.cmd created
)

:done
echo Done. Duplicate starts are blocked by the runner lock / viewer port bind.
endlocal
