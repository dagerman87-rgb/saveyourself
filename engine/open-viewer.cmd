@echo off
rem 미르한 어항 열기: 뷰어·러너·터널이 꺼져 있으면 켜고, 브라우저로 연다.
rem 바탕화면 바로가기의 대상이다.
setlocal
set "PATH=%USERPROFILE%\.mirhan\node;%PATH%"
set "CFD=C:\Program Files (x86)\cloudflared\cloudflared.exe"
cd /d "%~dp0.."

rem --- 뷰어 (4400) ---
netstat -an | findstr ":4400" | findstr "LISTENING" >nul 2>&1
if errorlevel 1 (
  echo 뷰어를 켠다...
  start "" /min "%~dp0start-viewer.cmd" --host lan
  timeout /t 3 /nobreak >nul
)

rem --- 러너 (중복 가드는 lock이 막는다) ---
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

rem --- 터널 (집 밖에서 보기 위한 공개 주소) ---
tasklist /FI "IMAGENAME eq cloudflared.exe" 2>nul | find "cloudflared.exe" >nul
if errorlevel 1 (
  if exist "%CFD%" (
    echo 터널을 켠다...
    start "" /min "%~dp0start-tunnel.cmd"
    timeout /t 12 /nobreak >nul
    call "%~dp0publish-tunnel.cmd"
  )
)

start "" http://localhost:4400/
endlocal
