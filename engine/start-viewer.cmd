@echo off
rem 미르한 어항 뷰어 서버 기동. stdout/stderr는 engine\viewer.out.log / viewer.err.log 에 누적.
set "PATH=%USERPROFILE%\.mirhan\node;%PATH%"
cd /d "%~dp0.."
node engine\viewer-server.mjs %* >> engine\viewer.out.log 2>> engine\viewer.err.log
