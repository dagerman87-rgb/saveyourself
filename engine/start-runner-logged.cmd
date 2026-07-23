@echo off
rem 미르한 이벤트 러너 기동 (로그 파일 기록판). 무음 사망 시 원인 추적용.
rem stdout/stderr가 engine\runner.out.log / runner.err.log 에 누적된다.
set "PATH=%USERPROFILE%\.mirhan\node;%PATH%"
cd /d "%~dp0.."
node engine\event-runner.mjs %* >> engine\runner.out.log 2>> engine\runner.err.log
