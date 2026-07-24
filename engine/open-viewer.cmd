@echo off
rem 미르한 어항 열기: 뷰어가 꺼져 있으면 켜고(외부 접속 허용 모드), 브라우저로 연다.
rem 바탕화면 바로가기의 대상이다.
setlocal
set "PATH=%USERPROFILE%\.mirhan\node;%PATH%"
cd /d "%~dp0.."

netstat -an | findstr ":4400" | findstr "LISTENING" >nul 2>&1
if errorlevel 1 (
  echo 뷰어를 켠다...
  start "" /min "%~dp0start-viewer.cmd" --host lan
  timeout /t 3 /nobreak >nul
)

rem 러너가 죽어 있으면 같이 살린다 (중복 가드는 lock이 막는다)
if exist "%~dp0.runner.lock" (
  set /p RPID=<"%~dp0.runner.lock"
) else (
  set "RPID=0"
)
tasklist /FI "PID eq %RPID%" 2>nul | find "node.exe" >nul
if errorlevel 1 (
  echo 러너를 켠다...
  start "" /min "%~dp0start-runner-logged.cmd"
)

start "" http://localhost:4400/
endlocal
