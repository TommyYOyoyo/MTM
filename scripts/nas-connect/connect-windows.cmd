@echo off
setlocal
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Connect-Nas.ps1" %*
set "NASA_CONNECT_RESULT=%ERRORLEVEL%"
if not "%NASA_CONNECT_RESULT%"=="0" echo Connection failed. See the message above.
pause
exit /b %NASA_CONNECT_RESULT%
