@echo off
setlocal
pushd "%~dp0" || exit /b 1
if not exist "caddy.exe" (
    echo Place the Windows caddy.exe beside Start-Media.cmd and try again.
    pause
    exit /b 1
)
if not exist "photos\." mkdir "photos" || exit /b 1
echo.
echo Health check: http://127.0.0.1:8080/healthz
echo Photo URLs:   http://127.0.0.1:8080/media/your-photo.jpg
echo Photo folder: "%CD%\photos"
echo Press Ctrl+C to stop.
echo.
".\caddy.exe" run --config Caddyfile --adapter caddyfile
set "server_exit=%ERRORLEVEL%"
popd
if not "%server_exit%"=="0" pause
exit /b %server_exit%
