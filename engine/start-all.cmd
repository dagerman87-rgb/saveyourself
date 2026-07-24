@echo off
rem 미르한 전체 기동 (로그온 시 자동 시작용): 러너 + 뷰어 + 터널 + 링크 게시.
rem 중복 실행은 러너 lock / 포트 바인딩 / cloudflared 프로세스 검사가 막는다.
setlocal
set "CFD=C:\Program Files (x86)\cloudflared\cloudflared.exe"

start "" /min "%~dp0start-runner-logged.cmd"

netstat -an | findstr ":4400" | findstr "LISTENING" >nul 2>&1
if errorlevel 1 start "" /min "%~dp0start-viewer.cmd" --host lan

tasklist /FI "IMAGENAME eq cloudflared.exe" 2>nul | find "cloudflared.exe" >nul
if errorlevel 1 (
  if exist "%CFD%" (
    timeout /t 5 /nobreak >nul
    start "" /min "%~dp0start-tunnel.cmd"
    timeout /t 14 /nobreak >nul
    call "%~dp0publish-tunnel.cmd"
  )
)
endlocal
