@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install Node.js 18+ and run this file again.
  pause
  exit /b 1
)
if not exist package.json (
  echo package.json not found.
  pause
  exit /b 1
)
rem Pick a free local port so an older GeoNature process cannot keep serving stale promo code logic.
for /f "delims=" %%P in ('powershell -NoProfile -ExecutionPolicy Bypass -Command "$p=8787; while($p -le 8899){try{$l=[System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback,$p);$l.Start();$l.Stop();Write-Output $p;exit 0}catch{$p++}}; Write-Output 8900"') do set "PORT=%%P"
if not defined PORT set "PORT=8890"
set "PUBLIC_BASE_URL=http://127.0.0.1:%PORT%"
echo Starting GeoNature on http://127.0.0.1:%PORT%/
start "GeoNature Server" cmd /k "cd /d ""%~dp0"" && node server.js"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$u='http://127.0.0.1:%PORT%/api/health'; for($i=0;$i -lt 50;$i++){try{$r=Invoke-WebRequest -UseBasicParsing -Uri $u -TimeoutSec 1; if($r.StatusCode -eq 200){Start-Process 'http://127.0.0.1:%PORT%/'; exit 0}}catch{}; Start-Sleep -Milliseconds 300}; Start-Process 'http://127.0.0.1:%PORT%/'"
