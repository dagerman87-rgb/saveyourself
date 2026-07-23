@echo off
rem 미르한 이벤트 러너 기동 (집컴). 더블클릭 또는 시작 프로그램 등록용.
rem Node는 %USERPROFILE%\.mirhan\node 의 포터블 배치를 사용한다.
set "PATH=%USERPROFILE%\.mirhan\node;%PATH%"
cd /d "%~dp0.."
node engine\event-runner.mjs %*
pause
