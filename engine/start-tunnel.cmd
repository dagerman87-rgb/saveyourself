@echo off
rem 미르한 어항 터널 (Cloudflare Quick Tunnel).
rem 공개 https 주소를 발급받아 뷰어(4400)로 잇는다. 회사 등 외부에서 접속용.
rem 주소는 engine\tunnel.log 에 기록되고, publish-tunnel.cmd 가 접속 링크를 뽑아 준다.
set "CFD=C:\Program Files (x86)\cloudflared\cloudflared.exe"
cd /d "%~dp0.."
"%CFD%" tunnel --url http://localhost:4400 --no-autoupdate > engine\tunnel.log 2>&1
