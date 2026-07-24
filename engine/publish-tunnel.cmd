@echo off
rem 터널 접속 링크를 뽑아 engine\tunnel-url.txt 에 적고, private 저장소에 올린다.
rem Quick Tunnel은 재시작마다 주소가 바뀌므로, 회사에서는 GitHub에서 이 파일을 열어 링크를 얻는다.
setlocal enabledelayedexpansion
cd /d "%~dp0.."

set "URL="
for /f "tokens=*" %%L in ('findstr /r /c:"https://[a-z0-9-]*\.trycloudflare\.com" engine\tunnel.log') do (
  for %%T in (%%L) do (
    echo %%T | findstr /r /c:"https://.*\.trycloudflare\.com" >nul && set "URL=%%T"
  )
)
if "%URL%"=="" (
  echo 터널 주소를 찾지 못했다. engine\start-tunnel.cmd 를 먼저 실행하라.
  exit /b 1
)
set /p TOKEN=<engine\.viewer-token

> docs\ops\viewer-link.md (
  echo # 어항 접속 링크
  echo.
  echo 집 밖에서 어항을 보는 주소다. Quick Tunnel은 재시작마다 바뀌므로 이 파일이 정본이다.
  echo.
  echo     %URL%/?t=%TOKEN%
  echo.
  echo - 한 번 열면 쿠키가 저장되어 다음부터는 토큰 없이 주소만으로 열린다.
  echo - 이 링크를 아는 사람은 세계의 모든 진실을 보고 신탁까지 내릴 수 있다. 공유 주의.
  echo - 토큰을 갈려면 engine\.viewer-token 을 지우고 뷰어를 재시작한 뒤 이 스크립트를 다시 실행하라.
)

git add docs/ops/viewer-link.md
git -c user.name=mirhan-ops -c user.email=ops@mirhan.invalid commit -m "ops: 어항 접속 링크 갱신 [skip ci]" >nul 2>&1
git push >nul 2>&1
echo 링크: %URL%/?t=%TOKEN%
echo docs\ops\viewer-link.md 에 기록하고 저장소에 올렸다.
endlocal
