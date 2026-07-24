@echo off
rem 미르한 어항 열기: 러너·뷰어·터널을 챙기고 브라우저로 연다. 바탕화면 바로가기의 대상.
rem 기동은 전부 start-all.cmd(무콘솔 런처 경유)에 위임한다.
cd /d "%~dp0.."
call "%~dp0start-all.cmd"
start "" http://localhost:4400/
