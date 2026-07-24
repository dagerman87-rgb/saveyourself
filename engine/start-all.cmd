@echo off
rem 미르한 전체 기동 (로그온 시 자동 시작 / 수동 겸용): 러너 + 뷰어 + 터널 + 링크 게시.
rem 반드시 무콘솔 런처(launch-detached.vbs)를 거친다 — cmd 콘솔을 공유하면 Ctrl+C가
rem 그룹 전체에 전파되어 셋이 함께 죽는다 (2026-07-24 실제 사고).
rem 중복 실행은 러너 lock / 포트 바인딩 / cloudflared 프로세스 검사가 막는다.
setlocal
set "CFD=C:\Program Files (x86)\cloudflared\cloudflared.exe"
set "VBS=wscript //nologo "%~dp0launch-detached.vbs""

%VBS% "%~dp0start-runner-logged.cmd"

netstat -an | findstr ":4400" | findstr "LISTENING" >nul 2>&1
if errorlevel 1 %VBS% "%~dp0start-viewer.cmd" "--host lan"

tasklist /FI "IMAGENAME eq cloudflared.exe" 2>nul | find "cloudflared.exe" >nul
if errorlevel 1 (
  if exist "%CFD%" (
    timeout /t 5 /nobreak >nul
    %VBS% "%~dp0start-tunnel.cmd"
    timeout /t 14 /nobreak >nul
    call "%~dp0publish-tunnel.cmd"
  )
)
endlocal
