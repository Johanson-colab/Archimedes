@echo off
setlocal
cd /d "%~dp0"
set "ELECTRON_RUN_AS_NODE="
if not exist "node_modules\electron\dist\electron.exe" (
  echo Install dependencies first with npm.cmd ci.
  pause
  exit /b 1
)
rem Build every time so local source fixes are never hidden by an old dist folder.
call npm.cmd run build
if errorlevel 1 (
  pause
  exit /b 1
)
"node_modules\electron\dist\electron.exe" .
